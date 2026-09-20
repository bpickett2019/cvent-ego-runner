import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mountRR } from '../app/rr-connection.mjs';
import { provisionCleanBrowser, steelOrigin } from '../app/clean-browser.mjs';
import { SteelEgoHost } from '../ego-bridge/host.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'login-first-')); await mkdir(join(root, 'app'));
  await writeFile(join(root, 'app/runner-prompt.md'), 'Read incrementally; preserve existing items.');
  const launches = [], browsers = [], posts = [];
  let deny = false, gate = async () => {}, provisionGate = async () => {}, mismatch = false;
  class Rpc extends EventEmitter {
    constructor(workspace) { super(); this.workspace = workspace; this.id = randomUUID(); this.commands = []; }
    state() { return { sessionId: this.id, sessionFile: join(this.workspace, 'pi-sessions', this.id+'.jsonl'), messageCount: 0, isStreaming: false, isCompacting: false, pendingMessageCount: 0, model: { cost: { input: 1 } } }; }
    async freshSession() { return this.state(); }
    async request(c) { this.commands.push(c); return { data: c.type === 'get_state' ? this.state() : c.type === 'get_session_stats' ? {cost:0} : { text: 'Report' } }; }
    async stop(after) { await after(); return []; }
  }
  const app = express(); app.use(express.json());
  const connection = mountRR(app, {root,
    provisionBrowser: async (record, cancelled) => {
      await provisionGate();
      if (cancelled()) throw new Error('Cancelled');
      const runtime = {runtimeId:record.id,jobId:record.id,freshProfile:true,ownership:'USER',identityVerified:true,steelSessionId:randomUUID(),activeTargetId:randomUUID()};
      browsers.push(runtime); return runtime;
    },
    prepareTarget: async (name, options) => {
      posts.push({name,options}); await gate();
      if (deny) throw new Error('Security or login not confirmed');
      const target = {name,evtstub:'selected',apiEventId:'selected',url:'https://app.cvent.com/?evtstub=selected'};
      await options.beforeBrowser(target);
      return {target, runtime:{...browsers.at(-1),ownership:'AGENT',apiPreflight:{eventId:'selected'},...(mismatch ? {activeTargetId:'wrong'} : {})}};
    },
    verifyLogin: async () => ({...browsers.at(-1),ownership:'AGENT',apiPreflight:{eventId:'selected'}}),
    rpcFactory: ({workspace}) => {const rpc=new Rpc(workspace);launches.push(rpc);return rpc;},
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await connection.shutdown();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
  const request=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,body===undefined?{}:{method:'POST',...(body instanceof FormData?{body}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
  const upload=async()=>{const form=new FormData();form.append('rr',new Blob(['immutable RR']),'RR.xlsx');form.append('eventName','User Target');return (await request('/api/jobs',form)).body;};
  const job=await upload();
  return {root,job,launches,browsers,posts,connection,request,upload,get:async()=> (await request(`/api/jobs/${job.id}`)).body,start:()=>request(`/api/jobs/${job.id}/read`,{}),back:()=>request(`/api/jobs/${job.id}/answer`,{message:'Return',returnControl:true}),deny:v=>deny=v,gate:fn=>gate=fn,provisionGate:fn=>provisionGate=fn,mismatch:()=>mismatch=true};
}
test('upload, browser startup, login wait and failed returns never launch or poll Pi',async t=>{
  const f=await fixture(t);assert.equal(f.launches.length,0);assert.equal(f.job.sessionId,undefined);
  assert.equal((await f.start()).status,200);f.deny(true);
  for(let i=0;i<3;i++){assert.equal((await f.back()).status,200);assert.equal((await f.get()).piCostUSD,0);}
  await new Promise(r=>setTimeout(r,2100));
  assert.equal(f.launches.length,0);assert.equal(f.browsers.length,1);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/rpc`,{type:'get_session_stats'})).status,409);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/start`,{authorizedEventName:'User Target'})).status,409);
  assert.equal((await f.get()).waitingFor,'setup');
});
test('one explicit successful Return launches one fresh session with scoped incremental prompt',async t=>{
  const f=await fixture(t);await f.start();
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`,{message:'not a handoff'})).status,409);
  assert.equal(f.launches.length,0);
  assert.equal((await f.back()).status,200);const d=await f.get();
  assert.equal(d.phase,'EXECUTING');assert.equal(f.launches.length,1);assert.equal(d.sessionMode,'fresh-after-handoff');
  const prompts=f.launches[0].commands.filter(c=>c.type==='prompt');assert.equal(prompts.length,1);
  assert.match(prompts[0].message,/read relevant ranges incrementally/);assert.match(prompts[0].message,/User Target/);
  assert.equal((await f.back()).status,409);assert.equal(f.launches.length,1);
  f.launches[0].emit('event',{type:'agent_settled'});
  for(let i=0;i<50&&(await f.get()).status==='RUNNING';i++)await new Promise(r=>setTimeout(r,10));
  assert.equal((await f.get()).status,'REVIEW_REQUIRED');
});
test('concurrent Return clicks and Stop during verification cannot launch Pi',async t=>{
  const f=await fixture(t);await f.start();let enter,release;
  const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  f.gate(async()=>{enter();await gate;});const pending=f.back();await entered;
  assert.equal((await f.back()).status,409);await f.connection.stop();release();await pending;
  assert.equal(f.launches.length,0);assert.equal((await f.get()).status,'STOPPED_REQUIRES_REVIEW');
});
test('Stop during browser provisioning remains zero AI and cannot publish a ready browser',async t=>{
  const f=await fixture(t);let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  f.provisionGate(async()=>{enter();await gate;});const pending=f.start();await entered;await f.connection.stop();release();await pending;
  assert.equal(f.launches.length,0);assert.equal(f.browsers.length,0);assert.equal((await f.get()).status,'STOPPED_REQUIRES_REVIEW');
});
test('wrong assigned browser and previous write uncertainty block before any Pi launch',async t=>{
  const f=await fixture(t);await f.start();f.mismatch();await f.back();assert.equal(f.launches.length,0);
  const id=randomUUID(),p=join(f.root,'data/jobs',id);await mkdir(p);
  await writeFile(join(p,'job.json'),JSON.stringify({id,status:'REVIEW_REQUIRED',target:{evtstub:'selected'},piCostUSD:2}));
  await writeFile(join(p,'unresolved-changes.json'),'[{"verification":"UNVERIFIED"}]');
  await f.back();assert.equal(f.launches.length,0);assert.match((await f.get()).lastAssistantText,/uncertain/);
});
test('stopped login-wait job cannot resume and next upload has no session reuse',async t=>{
  const f=await fixture(t);await f.start();await f.connection.stop();assert.equal((await f.back()).status,409);
  const next=await f.upload();assert.notEqual(next.id,f.job.id);await f.request(`/api/jobs/${next.id}/read`,{});
  assert.equal(f.launches.length,0);assert.notEqual(f.browsers[0].steelSessionId,f.browsers[1].steelSessionId);
  assert.equal(await readFile(f.job.workbook,'utf8'),'immutable RR');
});
test('clean provisioning uses new empty profiles and loopback ports, never copies or removes old data',async t=>{
  const root=await mkdtemp(join(tmpdir(),'clean-steel-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const calls=[];let current;
  const run=async args=>{calls.push(args);if(args[0]==='run')return 'container';return JSON.stringify([{Image:'sha256:21cf2a5785aa9478d0f7933c04bce96ca79f3d7a93d9824ea184800d29d3cd02',Config:{Labels:{'cvent.runner.job':current.id}},NetworkSettings:{Ports:{'3000/tcp':[{HostIp:'127.0.0.1',HostPort:'45000'}],'9223/tcp':[{HostIp:'127.0.0.1',HostPort:'45001'}]}}}]);};
  const fetchJson=async url=>url.endsWith('/v1/sessions')?{sessions:[{id:current.id}]}:url.endsWith('/json/version')?{webSocketDebuggerUrl:'ws://localhost:9223/devtools/browser/abc'}:[{type:'page',url:'about:blank',id:'page'}];
  const profiles=[];
  for(let i=0;i<2;i++){
    current={id:randomUUID(),workspace:join(root,String(i))};await mkdir(join(current.workspace,'receipts'),{recursive:true});
    const runtime=await provisionCleanBrowser({root,record:current,run,fetchJson});profiles.push(runtime.profile);
    assert.equal(runtime.ownership,'USER');assert.equal(runtime.freshProfile,true);
    assert.equal(runtime.cdpEndpoint,'ws://127.0.0.1:45001/devtools/browser/abc');
    await assert.rejects(provisionCleanBrowser({root,record:current,run,fetchJson}),/EEXIST/);
  }
  assert.notEqual(...profiles);assert.equal(calls.filter(c=>c[0]==='run').length,2);
  assert.ok(calls.every(c=>['run','inspect'].includes(c[0])));
  for(const url of ['http://example.com:3000','https://127.0.0.1:3000','http://user:pass@127.0.0.1:3000','http://127.0.0.1:3000/path'])assert.throws(()=>steelOrigin(url));
});
test('bootstrap permits only the fresh assigned blank page to open Cvent, never input or other navigation',async t=>{
  const root=await mkdtemp(join(tmpdir(),'bootstrap-'));t.after(()=>rm(root,{recursive:true,force:true}));const path=join(root,'runtime.json');
  await writeFile(path,JSON.stringify({ownership:'BOOTSTRAPPING',freshProfile:true,jobId:'job',activeTargetId:'assigned'}));
  let url='about:blank';
  const host=new SteelEgoHost({setExternalSink(){},async request(){return {targetInfos:[{type:'page',targetId:'assigned',url}]};}},path);
  await host.useTaskSpace(1246080070);
  const navigation={method:'Page.navigate',params:{url:'https://app.cvent.com/Subscribers/Events2/EventSelection'}};
  await host.assertOperationAllowed(navigation);
  for(const e of [{method:'Input.insertText',params:{text:'login'}},{method:'Page.reload'},{method:'Page.navigate',params:{url:'https://example.com'}}])await assert.rejects(host.assertOperationAllowed(e),/bootstrap/);
  url=navigation.params.url;await assert.rejects(host.assertOperationAllowed(navigation),/bootstrap/);
});
