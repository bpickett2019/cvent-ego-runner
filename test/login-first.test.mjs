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
import { transitionBrowser } from '../app/browser-ownership.mjs';

async function fixture(t, { loginFirst = true, cleanupFails = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'login-first-')); await mkdir(join(root, 'app'));
  await writeFile(join(root, 'app/runner-prompt.md'), 'Read incrementally; preserve existing items.');
  await mkdir(join(root, 'data/current'), {recursive:true});
  const sharedPath=join(root,'data/current/runtime.json');
  const shared=async()=>JSON.parse(await readFile(sharedPath,'utf8'));
  const saveShared=value=>writeFile(sharedPath,JSON.stringify(value));
  const launches = [], browsers = [], posts = [], cleanups = [];
  let deny = false, gate = async () => {}, provisionGate = async () => {}, sessionGate = async () => {}, mismatch = false;
  class Rpc extends EventEmitter {
    constructor(workspace) { super(); this.workspace = workspace; this.id = randomUUID(); this.commands = []; }
    state() { return { sessionId: this.id, sessionFile: join(this.workspace, 'pi-sessions', this.id+'.jsonl'), messageCount: 0, isStreaming: false, isCompacting: false, pendingMessageCount: 0, model: { cost: { input: 1 } } }; }
    async freshSession() { await sessionGate(); return this.state(); }
    async request(c) { this.commands.push(c); return { data: c.type === 'get_state' ? this.state() : c.type === 'get_session_stats' ? {cost:0} : { text: 'Report' } }; }
    async stop(after) { await after(); return []; }
  }
  const app = express(); app.use(express.json());
  const connection = mountRR(app, {root,
    stopBrowser: async ({record}) => { cleanups.push(record.id); if(cleanupFails)throw new Error('Docker unavailable'); },
    provisionBrowser: loginFirst ? async (record, cancelled) => {
      await provisionGate();
      if (cancelled()) throw new Error('Cancelled');
      const runtime = {runtimeId:record.id,jobId:record.id,freshProfile:true,ownership:'USER',identityVerified:true,steelSessionId:randomUUID(),activeTargetId:randomUUID()};
      await saveShared(runtime); browsers.push(runtime); return runtime;
    } : undefined,
    prepareTarget: async (name, options) => {
      posts.push({name,options}); await gate();
      if (deny) throw new Error('Security or login not confirmed');
      const target = {name,evtstub:'selected',apiEventId:'selected',url:'https://app.cvent.com/?evtstub=selected'};
      await options.beforeBrowser(target);
      const runtime=transitionBrowser(sharedPath,browsers.at(-1),['USER','AGENT'],{ownership:'AGENT',apiPreflight:{eventId:'selected'}},options.cancelled);
      return {target, runtime:{...runtime,...(mismatch ? {activeTargetId:'wrong'} : {})}};
    },
    verifyLogin: async () => ({...browsers.at(-1),ownership:'AGENT',apiPreflight:{eventId:'selected'}}),
    rpcFactory: ({workspace}) => {const rpc=new Rpc(workspace);launches.push(rpc);return rpc;},
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await connection.shutdown();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
  const request=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,body===undefined?{}:{method:'POST',...(body instanceof FormData?{body}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
  const upload=async()=>{const form=new FormData();form.append('rr',new Blob(['immutable RR']),'RR.xlsx');form.append('eventName','User Target');return (await request('/api/jobs',form)).body;};
  const job=await upload();
  return {root,job,launches,browsers,posts,cleanups,connection,request,upload,shared,saveShared,get:async()=> (await request(`/api/jobs/${job.id}`)).body,start:()=>request(`/api/jobs/${job.id}/read`,{}),back:()=>request(`/api/jobs/${job.id}/answer`,{message:'Return',returnControl:true}),deny:v=>deny=v,gate:fn=>gate=fn,provisionGate:fn=>provisionGate=fn,sessionGate:fn=>sessionGate=fn,mismatch:()=>mismatch=true};
}
test('browser failure circuit breaker stops after three unresponsive errors despite successful intervening reads',async t=>{
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0];
  const fail=i=>rpc.emit('event',{type:'tool_execution_end',toolName:'bash',toolCallId:'bad-'+i,isError:true,result:{content:[{type:'text',text:'Error: snapshot: CDP request timed out: PRIVATE_LOCATOR'}]}});
  fail(1);rpc.emit('event',{type:'tool_execution_end',toolName:'bash',toolCallId:'ok',isError:false});fail(2);
  assert.equal((await f.get()).status,'RUNNING');fail(3);
  for(let i=0;i<50&&(await f.get()).status!=='STOPPED';i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();assert.equal(record.status,'STOPPED');assert.match(record.stopReason,/circuit breaker/);
  assert.equal(record.browserFailureGuard.tripped,true);assert.equal((await f.shared()).ownership,'USER');assert.equal(record.spendingUnreconciled,false);
  assert(!JSON.stringify(record).includes('PRIVATE_LOCATOR'));assert.equal((await f.back()).status,409);assert.equal(f.launches.length,1);
});
test('ordinary selector failures stay recoverable without stopping or adding uncertainty',async t=>{
  const f=await fixture(t);await f.start();await f.back();
  for(let i=0;i<6;i++)f.launches[0].emit('event',{type:'tool_execution_end',toolName:'bash',toolCallId:'selector-'+i,isError:true,result:{content:[{type:'text',text:'ElementResolutionError: PRIVATE_LOCATOR'}]}});
  const record=await f.get();assert.equal(record.status,'RUNNING');assert.equal(record.browserFailureGuard,undefined);
  assert.equal((await f.shared()).ownership,'AGENT');assert.equal(record.toolErrors.length,6);
  assert(!JSON.stringify(record).includes('PRIVATE_LOCATOR'));
  await f.connection.stop();assert.deepEqual((await f.get()).unresolvedChanges,[]);
});
test('unconfirmed page execution stops immediately and blocks a fresh run through retained uncertainty',async t=>{
  const f=await fixture(t);await f.start();await f.back();
  f.launches[0].emit('event',{type:'tool_execution_end',toolName:'bash',toolCallId:'late-page-execution',isError:true,result:{content:[{type:'text',text:'PageEvaluationTimeoutError: Execution could not be confirmed stopped; reload or close the Page before continuing.'}]}});
  for(let i=0;i<50&&(await f.get()).status!=='STOPPED';i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();assert.equal(record.status,'STOPPED');assert.deepEqual(record.unresolvedChanges,['late-page-execution']);
  assert.equal((await f.shared()).ownership,'USER');assert.equal(record.browserFailureGuard.executionUncertain,true);
  const next=await f.upload();await f.request(`/api/jobs/${next.id}/read`,{});
  await f.request(`/api/jobs/${next.id}/answer`,{message:'Return',returnControl:true});
  const blocked=(await f.request(`/api/jobs/${next.id}`)).body;assert.match(blocked.lastAssistantText,/uncertain/);assert.equal(f.launches.length,1);
});

test('New RR releases a legacy never-prompted prepared Pi session without replacing it',async t=>{
  const f=await fixture(t,{loginFirst:false});assert.equal(f.launches.length,1);let stops=0;
  f.launches[0].stop=async after=>{stops++;await after();return [];};
  assert.equal((await f.request('/api/new-rr',{jobId:f.job.id})).status,200);
  assert.equal(stops,1);assert.equal(f.launches.length,1);assert.equal((await f.get()).sessionPrepared,false);
  assert.equal((await f.get()).status,'CLEARED');assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,0);
});
test('New RR clears an unstarted selection idempotently without Pi, browser creation or deleting its workbook',async t=>{
  const f=await fixture(t);
  for(let i=0;i<2;i++)assert.equal((await f.request('/api/new-rr',{jobId:f.job.id})).status,200);
  assert.equal((await f.get()).status,'CLEARED');assert.equal((await f.start()).status,409);
  assert.equal(f.launches.length,0);assert.equal(f.browsers.length,0);
  assert.equal(await readFile(f.job.workbook,'utf8'),'immutable RR');
  assert.equal((await f.request('/api/new-rr',{})).body.aiStarted,false);
});
test('New RR stops execution, retains evidence and costs, and next handoff uses a distinct empty session',async t=>{
  const f=await fixture(t);await f.start();await f.back();const old=await f.get(),rpc=f.launches[0];
  const request=rpc.request.bind(rpc);let stopped=0;
  rpc.request=c=>c.type==='get_session_stats'?Promise.resolve({data:{cost:2.5}}):request(c);
  rpc.stop=async after=>{stopped++;await after();return [];};
  const receipt=join(f.job.workspace,'receipts/kept.json');await writeFile(receipt,'{"saved":true}');
  const result=await f.request('/api/new-rr',{jobId:f.job.id});assert.equal(result.status,200);assert.equal(stopped,1);
  assert.equal((await f.get()).piCostUSD,2.5);assert.equal((await f.shared()).ownership,'USER');
  assert.equal(await readFile(receipt,'utf8'),'{"saved":true}');assert.equal(await readFile(f.job.workbook,'utf8'),'immutable RR');
  assert.equal((await f.back()).status,409);assert.equal(f.launches.length,1);
  const next=await f.upload();assert.equal(f.launches.length,1);
  await f.request(`/api/jobs/${next.id}/read`,{});assert.equal(f.launches.length,1);
  await f.request(`/api/jobs/${next.id}/answer`,{message:'Return',returnControl:true});
  const current=(await f.request(`/api/jobs/${next.id}`)).body;
  assert.notEqual(current.sessionId,old.sessionId);assert.equal(current.contextIsolation.initialMessageCount,0);
  assert.equal(current.priorEventCostUSD,2.5);assert.equal(f.launches.length,2);
});
test('New RR does not hide cleanup failures or erase uncertain writes',async t=>{
  const f=await fixture(t);await f.start();await f.back();
  const marker=join(f.job.workspace,'api-write-uncertain.json');await writeFile(marker,'{"uncertain":true}');
  f.launches[0].stop=async()=>{throw new Error('cleanup failed');};
  const result=await f.request('/api/new-rr',{jobId:f.job.id});assert.equal(result.status,409);assert.match(result.body.error,/reconciliation/);
  assert.equal((await f.get()).spendingUnreconciled,true);assert.equal(await readFile(marker,'utf8'),'{"uncertain":true}');
  assert.equal((await f.request('/api/new-rr',{jobId:f.job.id})).status,409);
});
test('New RR is exclusive while stopping and cannot stop an unselected job from another tab',async t=>{
  const f=await fixture(t);await f.start();await f.back();
  assert.equal((await f.request('/api/new-rr',{})).status,409);assert.equal((await f.get()).status,'RUNNING');
  let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  f.launches[0].stop=async after=>{enter();await gate;await after();return [];};
  const pending=f.request('/api/new-rr',{jobId:f.job.id});await entered;
  assert.equal((await f.request('/api/new-rr',{jobId:f.job.id})).status,409);
  assert.match((await f.upload()).error,/active job/);
  release();assert.equal((await pending).status,200);assert.equal(f.launches.length,1);
});
test('New RR refuses an in-flight Return; explicit Stop still cancels it without prompting',async t=>{
  const f=await fixture(t);await f.start();let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  f.gate(async()=>{enter();await gate;});const pending=f.back();await entered;
  assert.equal((await f.request('/api/new-rr',{jobId:f.job.id})).status,409);
  await f.connection.stop();release();await pending;
  assert.equal((await f.request('/api/new-rr',{jobId:f.job.id})).status,200);assert.equal(f.launches.length,0);
});
test('New RR cannot clear an unsettled durable job left by another connection',async t=>{
  const f=await fixture(t),id=randomUUID(),dir=join(f.root,'data/jobs',id);await mkdir(dir);
  const text=JSON.stringify({id,status:'RUNNING',piCostUSD:3});await writeFile(join(dir,'job.json'),text);
  assert.equal((await f.request('/api/new-rr',{jobId:f.job.id})).status,409);
  assert.equal(await readFile(join(dir,'job.json'),'utf8'),text);assert.equal((await f.get()).status,'UPLOADED');assert.equal(f.launches.length,0);
});

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
  assert.match(prompts[0].message,/Execute—not review—the uploaded RR/);assert.match(prompts[0].message,/choose your own plan/);assert.match(prompts[0].message,/User Target/);
  assert.doesNotMatch(prompts[0].message,/requirements\.json|rr-evidence audit/);
  assert.equal(prompts[0].message.split(d.approvedSow).length,2,'single captured SOW, no repeated JSON policy');
  assert.doesNotMatch(prompts[0].message,/allowanceUSD|targetCostUSD|externalCostReserveUSD|priorEventCostUSD|\$60/);
  assert.equal(d.allowanceUSD,60);assert.equal(d.externalCostReserveUSD,10);
  assert.doesNotMatch(prompts[0].message,/LOGIN-FIRST VERIFIED JOB|FIRST TASK:|No separate intake prompt/);
  assert.equal(await readFile(join(d.workspace,'approved-sow.md'),'utf8'),d.approvedSow);
  assert.equal((await f.back()).status,409);assert.equal(f.launches.length,1);
  f.launches[0].emit('event',{type:'agent_settled'});
  for(let i=0;i<50&&(await f.get()).status==='RUNNING';i++)await new Promise(r=>setTimeout(r,10));
  assert.equal((await f.get()).status,'INCOMPLETE');
});
test('Pi controls continuation until agent_settled; no ledger or audit is needed to return results',async t=>{
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0];
  for(const event of [{type:'agent_end',willRetry:true},{type:'compaction_start',reason:'overflow'},{type:'compaction_end',willRetry:true},{type:'agent_end',willRetry:false}]){
    rpc.emit('event',event);assert.equal((await f.get()).status,'RUNNING');
  }
  rpc.emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&(await f.get()).status!=='INCOMPLETE';i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();assert.equal(record.status,'INCOMPLETE');assert.equal(record.completionAudit,undefined);assert.equal(record.reviewRequired,undefined);
  assert.equal((await f.shared()).ownership,'USER');assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,1);assert.equal(f.launches.length,1);
  const result=JSON.parse(await readFile(join(f.job.workspace,'result.json')));assert.equal(result.completionAudit,undefined);assert.equal(result.text,'Report');assert.equal(result.status,'INCOMPLETE');
  await assert.rejects(readFile(join(f.job.workspace,'requirements.json')), {code:'ENOENT'});
  assert.equal(await readFile(f.job.workbook,'utf8'),'immutable RR');
});
test('verified website, registration, dependencies and Draft end as DONE without any review or second prompt',async t=>{
  const f=await fixture(t);await f.start();await f.back();
  await writeFile(join(f.job.workspace,'reports/final-report.json'),JSON.stringify({
    eventId:'selected',status:'DONE',completion:{website:true,registration:true,dependencies:true,draft:true},blockers:[],untested:[]
  }));
  f.launches[0].emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&(await f.get()).status!=='DONE';i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();assert.equal(record.status,'DONE');assert.equal(record.reviewRequired,undefined);
  assert.match(record.executionSummary,/website, registration and dependencies/);
  assert.equal(JSON.parse(await readFile(join(f.job.workspace,'result.json'))).status,'DONE');
  assert.equal(JSON.parse(await readFile(join(f.job.workspace,'state.json'))).status,'DONE');
  assert.equal((await f.shared()).ownership,'USER');
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);
  assert.equal((await f.back()).status,409);
});
test('natural settlement retains genuine uncertainty and cleanup failures as STOPPED, never a successful finish',async t=>{
  for(const mode of ['write-uncertain','cleanup-failed','malformed-state']){
    const f=await fixture(t);await f.start();await f.back();
    await writeFile(join(f.job.workspace,'reports/final-report.json'),JSON.stringify({eventId:'selected',status:'DONE',completion:{website:true,registration:true,dependencies:true,draft:true},blockers:[],untested:[]}));
    if(mode==='write-uncertain')await writeFile(join(f.job.workspace,'api-write-uncertain.json'),'{}');
    if(mode==='cleanup-failed')f.launches[0].stop=async()=>{throw new Error('cleanup failed');};
    if(mode==='malformed-state')await writeFile(join(f.job.workspace,'state.json'),'broken');
    f.launches[0].emit('event',{type:'agent_settled'});
    for(let i=0;i<100&&(await f.get()).status!=='STOPPED';i++)await new Promise(r=>setTimeout(r,10));
    const record=await f.get();assert.equal(record.status,'STOPPED');assert.equal(record.reviewRequired,undefined);
    assert.equal((await f.shared()).ownership,'USER');
    const result=JSON.parse(await readFile(join(f.job.workspace,'result.json')));assert.equal(result.status,'STOPPED');
    assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);
  }
});
test('concurrent Return clicks and Stop during verification cannot launch Pi',async t=>{
  const f=await fixture(t);await f.start();let enter,release;
  const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  f.gate(async()=>{enter();await gate;});const pending=f.back();await entered;
  assert.equal((await f.back()).status,409);await f.connection.stop();release();await pending;
  assert.equal(f.launches.length,0);assert.equal((await f.get()).status,'STOPPED');
});
test('Stop during browser provisioning remains zero AI and cannot publish a ready browser',async t=>{
  const f=await fixture(t);let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  f.provisionGate(async()=>{enter();await gate;});const pending=f.start();await entered;const stopping=f.connection.stop();
  assert.equal(f.cleanups.length,0);release();await stopping;await pending;
  assert.equal(f.launches.length,0);assert.equal(f.browsers.length,0);assert.equal((await f.get()).status,'STOPPED');
  assert.deepEqual(f.cleanups,[f.job.id]);
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

test('job Stop revokes both runtimes before native abort and retains safe bounded activity and uncertainty',async t=>{
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0];
  for(let i=0;i<105;i++)rpc.emit('event',{type:'tool_execution_end',toolName:'bash',toolCallId:'done',result:'PRIVATE_TOOL_PAYLOAD'});
  let record=await f.get();assert.equal(record.activity.length,100);assert.equal(record.lastAssistantText,null);
  assert.match(record.executionActivity.message,/not saved-result verification/);assert.ok(!JSON.stringify(record.activity).includes('PRIVATE_TOOL_PAYLOAD'));
  rpc.emit('event',{type:'tool_execution_start',toolName:'bash',toolCallId:'uncertain',args:{command:'PRIVATE_COMMAND'}});
  await writeFile(join(f.job.workspace,'api-write-uncertain.json'),'{}');
  rpc.stop=async after=>{
    assert.equal((await f.shared()).ownership,'USER');
    assert.equal(JSON.parse(await readFile(join(f.job.workspace,'runtime.json'),'utf8')).ownership,'USER');
    await after();return [];
  };
  assert.equal((await f.request(`/api/jobs/${f.job.id}/stop`,{})).status,200);
  record=await f.get();assert.equal(record.status,'STOPPED');assert.equal(record.phase,'SETTLED');assert.ok(record.finishedAt);
  assert.deepEqual(record.unresolvedChanges,['uncertain']);assert.deepEqual(record.apiUnresolved,{});
  assert.equal(await readFile(join(f.job.workspace,'api-write-uncertain.json'),'utf8'),'{}');
  assert.equal(JSON.parse(await readFile(join(f.job.workspace,'state.json'),'utf8')).status,record.status);
});
test('successful handoff clears old setup messages and settlement returns shared USER ownership',async t=>{
  const f=await fixture(t);await f.start();f.deny(true);await f.back();assert.match((await f.get()).lastAssistantText,/Security/);
  f.deny(false);await f.back();assert.equal((await f.get()).lastAssistantText,null);assert.equal((await f.shared()).ownership,'AGENT');
  f.launches[0].emit('event',{type:'agent_settled'});
  for(let i=0;i<50&&(await f.get()).status==='RUNNING';i++)await new Promise(r=>setTimeout(r,10));
  assert.equal((await f.get()).status,'INCOMPLETE');assert.equal((await f.shared()).ownership,'USER');
});
test('native cleanup error still revokes ownership and flags reconciliation',async t=>{
  const f=await fixture(t);await f.start();await f.back();f.launches[0].stop=async()=>{throw new Error('failed');};
  await f.connection.stop();assert.equal((await f.shared()).ownership,'USER');
  const record=await f.get();assert.equal(record.status,'STOPPED');assert.equal(record.spendingUnreconciled,true);assert.ok(record.stopFailures.length);
});
test('Stop during native preparation cannot regrant ownership, prompt, or overwrite stopped status',async t=>{
  const f=await fixture(t);await f.start();let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  f.sessionGate(async()=>{enter();await gate;});const pending=f.back();await entered;
  await f.connection.stop();release();await pending;
  assert.equal((await f.get()).status,'STOPPED');assert.equal((await f.shared()).ownership,'USER');
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,0);
});


test('Steel is stopped once on settlement, Stop, New RR, native failure and shutdown',async t=>{
  for(const mode of ['settle','stop','new','fault','shutdown','native-cleanup-failure'])await t.test(mode,async t=>{
    const f=await fixture(t);await f.start();await f.back();
    if(mode==='settle'){
      f.launches[0].emit('event',{type:'agent_settled'});
      for(let i=0;i<100&&!['INCOMPLETE','STOPPED'].includes((await f.get()).status);i++)await new Promise(r=>setTimeout(r,10));
    }else if(mode==='fault'){
      f.launches[0].emit('fault',new Error('native failure'));
      for(let i=0;i<100&&(await f.get()).status!=='STOPPED';i++)await new Promise(r=>setTimeout(r,10));
    }else if(mode==='new')await f.request('/api/new-rr',{jobId:f.job.id});
    else if(mode==='shutdown')await f.connection.shutdown();
    else {if(mode==='native-cleanup-failure')f.launches[0].stop=async()=>{throw new Error('failed');};await f.connection.stop();}
    assert.deepEqual(f.cleanups,[f.job.id]);await f.connection.stop();assert.equal(f.cleanups.length,1);
    assert.equal(await readFile(f.job.workbook,'utf8'),'immutable RR');
  });
});
test('Steel cleanup failures override natural completion and remain durable',async t=>{
  const f=await fixture(t,{cleanupFails:true});await f.start();await f.back();
  await writeFile(join(f.job.workspace,'reports/final-report.json'),JSON.stringify({eventId:'selected',status:'DONE',completion:{website:true,registration:true,dependencies:true,draft:true},blockers:[],untested:[]}));
  f.launches[0].emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&(await f.get()).status!=='STOPPED';i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();assert.equal(record.status,'STOPPED');assert.match(record.stopFailures.join(' '),/Steel browser cleanup/);
  assert.equal((await f.request('/api/new-rr',{jobId:f.job.id})).status,409);
});
test('Steel cleanup follows failed provisioning and shutdown during login wait without a Pi launch',async t=>{
  for(const mode of ['failure','shutdown'])await t.test(mode,async t=>{
    const f=await fixture(t);
    if(mode==='failure')f.provisionGate(async()=>{throw new Error('launch timeout');});
    await f.start();if(mode==='shutdown')await f.connection.shutdown();
    assert.deepEqual(f.cleanups,[f.job.id]);assert.equal(f.launches.length,0);assert.equal((await f.get()).status,'STOPPED');
  });
});
