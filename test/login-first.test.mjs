import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mountRR } from '../app/rr-connection.mjs';
import { resetRunBudget } from '../app/budget.mjs';
import { provisionCleanBrowser, steelOrigin } from '../app/clean-browser.mjs';
import { SteelEgoHost } from '../ego-bridge/host.mjs';
import { transitionBrowser } from '../app/browser-ownership.mjs';
import { acquireApiLease } from '../app/api-operation-lease.mjs';
import { createExecutionSlot } from '../deploy/azure/execution-slot.mjs';
import { createSharedEventSafety } from '../app/shared-event-safety.mjs';
import { collectEventSafety } from '../deploy/azure/event-safety.mjs';

async function fixture(t, { cleanupFails = false, launchFails = false, promptFails = false, verifyEventSafety, selectedEventId = 'selected', contextBound = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'login-first-')); await mkdir(join(root, 'app'));
  await writeFile(join(root, 'app/runner-prompt.md'), 'Read incrementally; preserve existing items.');
  await mkdir(join(root, 'data/current'), {recursive:true});
  if (contextBound) await writeFile(join(root, 'data/rr-context.json'), JSON.stringify({ id: randomUUID(), jobId: null, workbookId: null }));
  const sharedPath=join(root,'data/current/runtime.json');
  const shared=async()=>JSON.parse(await readFile(sharedPath,'utf8'));
  const saveShared=value=>writeFile(sharedPath,JSON.stringify(value));
  const launches = [], browsers = [], posts = [], cleanups = [], fences = [];
  let deny = false, gate = async () => {}, provisionGate = async () => {}, sessionGate = async () => {}, fenceGate = async () => {}, mismatch = false;
  class Rpc extends EventEmitter {
    constructor(workspace) { super(); this.workspace = workspace; this.id = randomUUID(); this.commands = []; }
    state() { return { sessionId: this.id, sessionFile: join(this.workspace, 'pi-sessions', this.id+'.jsonl'), messageCount: 0, isStreaming: false, isCompacting: false, pendingMessageCount: 0, model: { cost: { input: 1 } } }; }
    async freshSession() { await sessionGate(); return this.state(); }
    async request(c) { this.commands.push(c); if (promptFails && c.type === 'prompt') throw new Error('Prompt response uncertain'); return { data: c.type === 'get_state' ? this.state() : c.type === 'get_session_stats' ? {cost:0} : { text: 'Report' } }; }
    async pause(sessionId) {
      assert.equal(sessionId, this.id); this.commands.push({type:'pause'});
      this.emit('event', {type:'message_end', message:{role:'assistant',stopReason:'aborted'}});
      this.emit('event', {type:'agent_settled'});
      return this.state();
    }
    async stop(after) { await after(); return []; }
  }
  const app = express(); app.use(express.json());
  const connection = mountRR(app, {root, verifyEventSafety,
    fenceBrowser: async (_runtime, onFailure) => {
      await fenceGate();
      const fence = { enabled: true, releases: 0, healthy() { return this.enabled; }, async release() { this.releases++; this.enabled = false; }, closeAfterBrowserStopped() { this.enabled = false; }, fail() { this.enabled = false; onFailure(new Error('Fence disconnected')); } };
      fences.push(fence); return fence;
    },
    stopBrowser: async ({record}) => { cleanups.push(record.id); if(cleanupFails)throw new Error('Docker unavailable'); await writeFile(join(record.workspace,'receipts/steel-cleanup.json'),JSON.stringify({status:'STOPPED'})); },
    provisionBrowser: async (record, cancelled) => {
      await provisionGate();
      if (cancelled()) throw new Error('Cancelled');
      const runtime = {runtimeId:record.id,jobId:record.id,freshProfile:true,ownership:'USER',identityVerified:true,steelSessionId:randomUUID(),activeTargetId:randomUUID()};
      await saveShared(runtime); browsers.push(runtime); return runtime;
    },
    prepareTarget: async (name, options) => {
      posts.push({name,options}); await gate();
      if (deny) throw new Error('Security or login not confirmed');
      const target = {name,evtstub:selectedEventId,apiEventId:selectedEventId,url:`https://app.cvent.com/?evtstub=${selectedEventId}`};
      await options.beforeBrowser(target);
      const runtime=transitionBrowser(sharedPath,browsers.at(-1),['USER','AGENT'],{ownership:'AGENT',apiPreflight:{eventId:selectedEventId}},options.cancelled);
      return {target, runtime:{...runtime,...(mismatch ? {activeTargetId:'wrong'} : {})}};
    },
    verifyLogin: async () => ({...browsers.at(-1),ownership:'AGENT',apiPreflight:{eventId:selectedEventId}}),
    rpcFactory: ({workspace}) => {if (launchFails) throw new Error('Launch configuration unavailable'); const rpc=new Rpc(workspace);launches.push(rpc);return rpc;},
  });
  app.post('/api/take-control', async (req,res) => {
    try { res.json(await connection.takeControl(req.body)); }
    catch(error) { res.status(409).json({error:error.message}); }
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await connection.shutdown();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
  const request=async(path,body,headers={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,body===undefined?{}:{method:'POST',...(body instanceof FormData?{body}:{headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
  const upload=async()=>{const form=new FormData();form.append('rr',new Blob(['immutable RR']),'RR.xlsx');form.append('eventName','User Target');if(connection.context().id)form.append('contextId',connection.context().id);return (await request('/api/jobs',form)).body;};
  const job=await upload();
  return {root,job,launches,browsers,posts,cleanups,fences,connection,request,upload,shared,saveShared,get:async()=> (await request(`/api/jobs/${job.id}`)).body,start:()=>request(`/api/jobs/${job.id}/read`,{}),back:()=>request(`/api/jobs/${job.id}/answer`,{message:'Return',returnControl:true}),deny:v=>deny=v,gate:fn=>gate=fn,provisionGate:fn=>provisionGate=fn,sessionGate:fn=>sessionGate=fn,fenceGate:fn=>fenceGate=fn,mismatch:()=>mismatch=true};
}
const pauseLive = f => f.request('/api/take-control', {jobId:f.job.id, contextId:f.connection.context().id});
const returnPaused = async (f, extra = {}) => f.request(`/api/jobs/${f.job.id}/resume`, {returnControl:true, pauseId:(await f.get()).pauseId, ...extra});

const sharedProof = (f, operation = 'answer', holds = [], options = {}) => collectEventSafety({ ports: [18781, 18782, 18783], workspace: 1, jobId: f.job.id, operation,
  fetchImpl: async url => new Response(JSON.stringify({ protocol: 'shared-event-safety-v1', workspace: Number(new URL(url).port) - 18780, enforced: true, complete: true,
    holds: Number(new URL(url).port) === 18783 ? holds : [] })), ...options });
const proofHeaders = value => ({ 'x-cvent-event-safety': value });

test('concurrent preflight reads only the live setup binding and never changes the target or starts AI', async t => {
  const f = await fixture(t, { contextBound: true, selectedEventId: randomUUID() });
  assert.throws(() => f.connection.admissionTarget({ jobId: f.job.id, operation: 'answer' }));
  await f.start(); const before = await f.get();
  const binding = f.connection.admissionTarget({ jobId: f.job.id, operation: 'answer', eventName: 'Corrected Candidate' });
  assert.equal(binding.name, 'Corrected Candidate'); assert.equal(binding.eventId, null); assert.equal(binding.canRebind, true); assert.equal(binding.contextId, before.contextId);
  assert.deepEqual(await f.get(), before); assert.equal(f.launches.length, 0);
  assert.throws(() => f.connection.admissionTarget({ jobId: randomUUID(), operation: 'answer' }));
  await f.connection.stop(); assert.throws(() => f.connection.admissionTarget({ jobId: f.job.id, operation: 'answer' }));
});
test('concurrent preflight cannot race an in-progress Return or retarget an executing job', async t => {
  const f = await fixture(t, { contextBound: true, selectedEventId: randomUUID() }); await f.start();
  let enter, release; const started = new Promise(r => enter = r), wait = new Promise(r => release = r);
  f.gate(async () => { enter(); await wait; }); const returning = f.back(); await started;
  assert.throws(() => f.connection.admissionTarget({ jobId: f.job.id, operation: 'answer' }));
  release(); await returning;
  assert.throws(() => f.connection.admissionTarget({ jobId: f.job.id, operation: 'answer', eventName: 'Other' }));
  const b = f.connection.admissionTarget({ jobId: f.job.id, operation: 'rpc' }); assert.equal(b.canRebind, false); assert.equal(b.eventId, (await f.get()).target.apiEventId);
  assert.throws(() => f.connection.admissionTarget({ jobId: f.job.id, operation: 'rpc', eventName: 'Other' }));
});
test('concurrent lease is mandatory at actual native launch and disables shared type creation in prompt/browser across pause Return', async t => {
  const eventId = randomUUID(), f = await fixture(t, { contextBound: true, selectedEventId: eventId, verifyEventSafety: createSharedEventSafety({ workspaceId: 1, requireEventLease: true }) });
  await f.start(); assert.equal((await f.back()).body.aiStarted, false); assert.equal(f.launches.length, 0);
  const header = async operation => { const p = JSON.parse(Buffer.from(await sharedProof(f, operation), 'base64')); p.inventories.forEach(i => i.eventLeasesEnforced = true); p.lease = { protocol: 'workspace-event-lease-v1', claimId: randomUUID(), contextId: f.connection.context().id, eventId, sharedContactTypeCreation: false }; return Buffer.from(JSON.stringify(p)).toString('base64'); };
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`, { returnControl: true }, proofHeaders(await header('answer')))).body.aiStarted, true);
  const prompt = f.launches[0].commands.find(c => c.type === 'prompt').message;
  assert.match(prompt, /"concurrentWorkspaces":3,"sharedContactTypeCreation":false/);
  const runtimePath = join(f.job.workspace, 'runtime.json'); assert.equal(JSON.parse(await readFile(runtimePath, 'utf8')).executionCapabilities.sharedContactTypeCreation, false);
  const host = new SteelEgoHost({ setExternalSink() {}, request() { throw Error('Must deny before dispatch'); } }, runtimePath);
  await assert.rejects(host.assertOperationAllowed({ method: 'Runtime.evaluate', params: { expression: "document.querySelector('button').click(); /* Create New Contact Type */" } }), /concurrent builds cannot create shared contact types/);
  await pauseLive(f);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/resume`, { returnControl: true, pauseId: (await f.get()).pauseId }, proofHeaders(await header('resume')))).status, 200);
  assert.equal(JSON.parse(await readFile(runtimePath, 'utf8')).executionCapabilities.sharedContactTypeCreation, false);
});

test('shared handoff blocks another workspace hold before native preparation, including pre-AI event-name correction', async t => {
  const selectedEventId = randomUUID(), prior = randomUUID();
  const f = await fixture(t, { selectedEventId, verifyEventSafety: createSharedEventSafety({ workspaceId: 1 }) });
  await f.start();
  assert.equal((await f.back()).body.aiStarted, false, 'shared backend rejects old gateway without proof');
  for (const eventName of ['User Target', 'Explicitly corrected event name']) {
    const header = await sharedProof(f, 'answer', [{ jobId: prior, eventId: selectedEventId }]);
    const result = await f.request(`/api/jobs/${f.job.id}/answer`, { returnControl: true, eventName }, proofHeaders(header));
    assert.equal(result.body.aiStarted, false); assert.match((await f.get()).lastAssistantText, /Workspace 3/);
    assert.equal(f.launches.length, 0); assert.equal((await f.shared()).ownership, 'USER');
  }
  const header = await sharedProof(f, 'answer', [{ jobId: prior, eventId: randomUUID() }]);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`, { returnControl: true }, proofHeaders(header))).body.aiStarted, true);
  assert.equal(f.launches.length, 1);
  assert.doesNotMatch(f.launches[0].commands.find(c => c.type === 'prompt').message, new RegExp(prior));
});
test('same-session Return and queued instructions recheck cross-workspace holds without replay', async t => {
  const selectedEventId = randomUUID(), f = await fixture(t, { selectedEventId, verifyEventSafety: createSharedEventSafety({ workspaceId: 1 }) });
  await f.start(); await f.request(`/api/jobs/${f.job.id}/answer`, { returnControl: true }, proofHeaders(await sharedProof(f)));
  await pauseLive(f); const pauseId = (await f.get()).pauseId;
  const holds = [{ jobId: randomUUID(), eventId: selectedEventId }];
  const denied = await f.request(`/api/jobs/${f.job.id}/resume`, { returnControl: true, pauseId }, proofHeaders(await sharedProof(f, 'resume', holds)));
  assert.equal(denied.status, 409); assert.equal(f.launches.length, 1); assert.equal((await f.get()).waitingFor, 'operator');
  assert.equal(f.launches[0].commands.filter(c => c.type === 'prompt').length, 1);
  const resumed = await f.request(`/api/jobs/${f.job.id}/resume`, { returnControl: true, pauseId }, proofHeaders(await sharedProof(f, 'resume')));
  assert.equal(resumed.status, 200); assert.equal(f.launches[0].commands.filter(c => c.type === 'prompt').length, 2);
  const deniedSteer = await f.request(`/api/jobs/${f.job.id}/rpc`, { type: 'steer', message: 'Fixture only' }, proofHeaders(await sharedProof(f, 'rpc', holds)));
  assert.equal(deniedSteer.status, 409); assert.equal(f.launches[0].commands.filter(c => c.type === 'steer').length, 0);
});
test('Stop wins a pending cross-workspace check without starting native Pi', async t => {
  let release, entered, checks = 0; const waiting = new Promise(r => entered = r), delay = new Promise(r => release = r);
  const gate = createSharedEventSafety({ workspaceId: 1 });
  const f = await fixture(t, { selectedEventId: randomUUID(), verifyEventSafety: async args => { gate(args); if (++checks === 2) { entered(); await delay; } } });
  await f.start(); const pending = f.request(`/api/jobs/${f.job.id}/answer`, { returnControl: true }, proofHeaders(await sharedProof(f)));
  await waiting; await f.connection.stop(); release(); await pending;
  assert.equal(f.launches.length, 0); assert.equal((await f.get()).status, 'STOPPED');
});
test('proof expiry after native preparation still prevents the paid prompt and cleans up', async t => {
  let time = Date.now(), checks = 0; const gate = createSharedEventSafety({ workspaceId: 1, now: () => time });
  const f = await fixture(t, { selectedEventId: randomUUID(), verifyEventSafety: args => { if (++checks === 3) time += 120000; gate(args); } });
  await f.start(); const result = await f.request(`/api/jobs/${f.job.id}/answer`, { returnControl: true }, proofHeaders(await sharedProof(f, 'answer', [], { now: () => time })));
  assert.equal(result.status, 409); assert.equal(f.launches.length, 1);
  assert.equal(f.launches[0].commands.filter(c => c.type === 'prompt').length, 0); assert.equal((await f.get()).status, 'STOPPED');
});

test('Take Control preserves Pi/browser/progress and Return continues exactly that session', async t => {
  const f=await fixture(t);await f.start();await f.back();
  const before=await f.get(), browser=await f.shared(), rpc=f.launches[0];
  const requirements=[{id:'source:A1',status:'verified_existing'}];
  await writeFile(join(f.job.workspace,'state.json'),JSON.stringify({requirements,completed:['verified'],pending:['remaining']}));
  assert.equal((await pauseLive(f)).body.browserRetained,true);
  const paused=await f.get();assert.equal(paused.phase,'AWAITING_INPUT');assert.equal(paused.waitingFor,'operator');assert.ok(paused.pauseId);
  assert.equal(paused.sessionId,before.sessionId);assert.equal(paused.sessionPrepared,true);assert.equal(paused.modelFailure,undefined);
  assert.equal((await f.shared()).ownership,'USER');assert.deepEqual(f.cleanups,[]);
  assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,1);
  assert.deepEqual(JSON.parse(await readFile(join(f.job.workspace,'state.json'),'utf8')).requirements,requirements);
  for(const type of ['steer','follow_up','prompt','new_session']) assert.equal((await f.request(`/api/jobs/${f.job.id}/rpc`,{type,message:'continue'})).status,409);
  assert.equal((await f.back()).status,409,'setup Return cannot resume paused execution');
  assert.equal((await returnPaused(f)).body.resumed,true);
  const after=await f.get();assert.equal(after.phase,'EXECUTING');assert.equal(after.pauseId,null);
  assert.equal(after.sessionId,before.sessionId);assert.equal(after.sessionFile,before.sessionFile);assert.equal(after.sha256,before.sha256);
  assert.equal((await f.shared()).steelSessionId,browser.steelSessionId);
  assert.equal(f.launches.length,1);assert.equal(f.browsers.length,1);assert.deepEqual(f.cleanups,[]);
  assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,2);
  assert.match(rpc.commands.filter(c=>c.type==='prompt')[1].message,/same RR task/);
  assert.doesNotMatch(rpc.commands.filter(c=>c.type==='prompt')[1].message,/new_session|final-report|historical|stage 1/);
});

test('paused Return is explicit, target-locked, token-bound and cannot be replayed', async t => {
  const f=await fixture(t);await f.start();await f.back();await pauseLive(f);
  const first=(await f.get()).pauseId;
  for(const extra of [{returnControl:false},{pauseId:'old'},{eventName:'Another event'},{message:'replace the RR'}]) assert.equal((await returnPaused(f,extra)).status,409);
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);
  assert.equal((await returnPaused(f)).status,200);
  assert.equal((await returnPaused(f,{pauseId:first})).status,409);
  await pauseLive(f);assert.notEqual((await f.get()).pauseId,first);
  assert.equal((await returnPaused(f,{pauseId:first})).status,409);
  assert.equal((await returnPaused(f)).status,200);
});

test('old or unknown job protocols cannot start a browser under the new controller',async t=>{
  const f=await fixture(t);assert.equal(f.job.apiOperationLocking,'kernel-flock-v1');
  for(const apiOperationLocking of [undefined,'unknown']){
    await writeFile(join(f.job.workspace,'job.json'),JSON.stringify({...f.job,apiOperationLocking}));
    const result=await f.start();assert.equal(result.status,409);assert.match(result.body.error,/compatible API ownership/);
  }
  assert.equal(f.browsers.length,0);assert.equal(f.launches.length,0);
});

test('stale/foreign Take Control cannot pause another job or alter login setup', async t => {
  const f=await fixture(t);await f.start();assert.equal((await pauseLive(f)).status,409);assert.deepEqual(f.cleanups,[]);
  await f.back();
  for(const body of [{},{jobId:randomUUID()},{jobId:f.job.id,contextId:randomUUID()},{jobId:f.job.id,unknown:true}]) assert.equal((await f.request('/api/take-control',body)).status,409);
  assert.equal((await f.get()).phase,'EXECUTING');assert.deepEqual(f.cleanups,[]);
});

test('failed human login verification retains the live pause and permits a later explicit Return', async t => {
  const f=await fixture(t);await f.start();await f.back();await pauseLive(f);
  const token=(await f.get()).pauseId;f.deny(true);
  assert.equal((await returnPaused(f)).status,409);
  assert.equal((await f.get()).waitingFor,'operator');assert.equal((await f.get()).pauseId,token);
  assert.equal((await f.shared()).ownership,'USER');assert.deepEqual(f.cleanups,[]);
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);
  f.deny(false);assert.equal((await returnPaused(f)).status,200);
});

for(const marker of ['api-operation.lock','operation.lock','api-write-uncertain.json','browser-save-uncertain.json','unresolved-changes.json']) test(`pause does not clear or resume through ${marker}`, async t => {
  const f=await fixture(t);await f.start();await f.back();
  const path=join(f.job.workspace,marker);await writeFile(path,'{"uncertainWrites":["possible effect"]}');
  assert.equal((await pauseLive(f)).status,409);assert.equal((await f.get()).status,'STOPPED');
  assert.equal(await readFile(path,'utf8'),'{"uncertainWrites":["possible effect"]}');assert.deepEqual(f.cleanups,[f.job.id]);
  assert.equal((await returnPaused(f)).status,409);
});

for(const held of [true,false])test(`operator pause checks kernel ownership, not guard-file presence (held=${held})`,async t=>{
  const f=await fixture(t);await f.start();await f.back();const lease=acquireApiLease(f.job.workspace);
  if(!held)lease.release();
  try{const result=await pauseLive(f);assert.equal(result.status,held?409:200);assert.equal((await f.get()).phase,held?'SETTLED':'AWAITING_INPUT');}
  finally{lease.release();}
});

test('Take Control during a tool leaves execution untouched instead of aborting into an unresolved hold', async t => {
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0];
  rpc.emit('event',{type:'tool_execution_start',toolCallId:'in-flight',toolName:'bash'});
  const before=await f.get(),browser=await f.shared(),commands=rpc.commands.length;
  const result=await pauseLive(f);assert.equal(result.status,409);assert.match(result.body.error,/Nothing was paused or stopped/);
  assert.deepEqual(await f.get(),before);assert.deepEqual(await f.shared(),browser);assert.deepEqual(f.cleanups,[]);
  assert.equal(rpc.commands.length,commands);assert.deepEqual((await f.get()).unresolvedChanges,[]);
  rpc.emit('event',{type:'tool_execution_end',toolCallId:'in-flight',toolName:'bash',isError:false});
  assert.equal((await pauseLive(f)).status,200);assert.equal((await f.get()).waitingFor,'operator');assert.deepEqual(f.cleanups,[]);
});

test('same-slot setup retry keeps its reservation and starts at most one native session',async t=>{
  const f=await fixture(t);await f.start();f.deny(true);
  const directory=join(f.root,'slot'),slot=createExecutionSlot({directory,clearance:async()=>false});
  const route=`/api/jobs/${f.job.id}/answer`;
  await slot.authorize(1,route,'POST');assert.equal((await f.back()).body.aiStarted,false);
  const claim=await readFile(join(directory,'active.json'),'utf8');
  await slot.authorize(1,route,'POST');f.deny(false);assert.equal((await f.back()).body.aiStarted,true);
  await slot.authorize(1,route,'POST');assert.equal((await f.back()).status,409,'backend forbids duplicate execution');
  assert.equal(f.launches.length,1);assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);
  assert.equal(await readFile(join(directory,'active.json'),'utf8'),claim);
  await assert.rejects(slot.authorize(2,`/api/jobs/${f.job.id}/answer`,'POST'));
});

for(const mode of ['pause-failure','stats-failure','session-change','browser-change','shared-hold']) test(`unsafe ${mode} cannot become a confirmed pause`, async t => {
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0], request=rpc.request.bind(rpc);
  if(mode==='pause-failure')rpc.pause=async()=>{throw new Error('abort failed');};
  if(mode==='stats-failure')rpc.request=async c=>{if(c.type==='get_session_stats')throw new Error('unknown cost');return request(c);};
  if(mode==='session-change')rpc.id=randomUUID();
  if(mode==='browser-change')await f.saveShared({...await f.shared(),activeTargetId:randomUUID()});
  if(mode==='shared-hold')await writeFile(join(f.root,'data/current/api-operation.lock'),'retained');
  assert.equal((await pauseLive(f)).status,409);assert.equal((await f.get()).status,'STOPPED');assert.deepEqual(f.cleanups,[f.job.id]);
  if(mode==='stats-failure')assert.equal((await f.get()).spendingUnreconciled,true);
});

for(const mode of ['uncertainty','changed-session','changed-browser','native-busy','cost-unavailable','changed-workbook','prompt-ack-failure']) test(`Return blocks ${mode} without another session or replay`, async t => {
  const f=await fixture(t);await f.start();await f.back();await pauseLive(f);const rpc=f.launches[0], request=rpc.request.bind(rpc);
  if(mode==='uncertainty')await writeFile(join(f.job.workspace,'api-write-uncertain.json'),'{}');
  if(mode==='changed-session')rpc.id=randomUUID();
  if(mode==='changed-browser')await f.saveShared({...await f.shared(),steelSessionId:randomUUID()});
  if(mode==='native-busy')rpc.request=async c=>c.type==='get_state'?{data:{...rpc.state(),isStreaming:true}}:request(c);
  if(mode==='cost-unavailable')rpc.request=async c=>{if(c.type==='get_session_stats')throw new Error('unknown');return request(c);};
  if(mode==='changed-workbook'){await chmod(f.job.workbook,0o600);await writeFile(f.job.workbook,'changed fixture');}
  if(mode==='prompt-ack-failure')rpc.request=async c=>{const result=await request(c);if(c.type==='prompt')throw new Error('ack lost');return result;};
  assert.equal((await returnPaused(f)).status,409);assert.equal((await f.get()).status,'STOPPED');
  assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,mode==='prompt-ack-failure'?2:1);
  assert.equal(f.launches.length,1);assert.equal(f.browsers.length,1);assert.equal((await returnPaused(f)).status,409);
});

for(const mode of ['pause','return']) test(`Stop wins a delayed ${mode} and duplicate handoff cannot dispatch`, async t => {
  const f=await fixture(t);await f.start();await f.back();let release,entered;
  const gate=new Promise(r=>release=r),entry=new Promise(r=>entered=r);
  if(mode==='pause')f.launches[0].pause=async()=>{entered();await gate;};
  else {await pauseLive(f);f.gate(async()=>{entered();await gate;});}
  const pending=mode==='pause'?pauseLive(f):returnPaused(f);await entry;
  assert.equal((await (mode==='pause'?pauseLive(f):returnPaused(f))).status,409);
  await f.connection.stop();release();assert.equal((await pending).status,409);
  assert.equal((await f.get()).status,'STOPPED');assert.equal((await f.shared()).ownership,'USER');
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);assert.deepEqual(f.cleanups,[f.job.id]);
});

for(const mode of ['stop','clear','shutdown','native-exit','unexpected-work']) test(`paused ${mode} retains explicit shutdown and no automatic continuation`, async t => {
  const f=await fixture(t);await f.start();await f.back();await pauseLive(f);
  if(mode==='stop')await f.connection.stop();
  if(mode==='clear')assert.equal((await f.request('/api/new-rr',{jobId:f.job.id})).status,200);
  if(mode==='shutdown')await f.connection.shutdown();
  if(mode==='native-exit')f.launches[0].emit('fault',new Error('Pi exited'));
  if(mode==='unexpected-work')f.launches[0].emit('event',{type:'agent_start'});
  for(let i=0;i<100&&(await f.get()).status!=='STOPPED';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal((await f.get()).status,'STOPPED');assert.deepEqual(f.cleanups,[f.job.id]);
  assert.equal((await returnPaused(f)).status,409);assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);
});

test('native settlement after explicit Return still closes Steel and never counts the pause abort as failure',async t=>{
  const f=await fixture(t);await f.start();await f.back();await pauseLive(f);await returnPaused(f);
  f.launches[0].emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&(await f.get()).phase!=='SETTLED';i++)await new Promise(r=>setTimeout(r,5));
  const record=await f.get();assert.equal(record.status,'INCOMPLETE');assert.equal(record.modelFailure,undefined);assert.deepEqual(f.cleanups,[f.job.id]);
});

test('a late uncertainty hold during Return prevents the continuation prompt',async t=>{
  const f=await fixture(t);await f.start();await f.back();await pauseLive(f);
  f.gate(async()=>{await writeFile(join(f.job.workspace,'browser-save-uncertain.json'),'{}');});
  assert.equal((await returnPaused(f)).status,409);assert.equal((await f.get()).status,'STOPPED');
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);
});

test('a restarted controller cannot restore a durable paused job or launch a replacement native session',async t=>{
  const f=await fixture(t);await f.start();await f.back();await pauseLive(f);const record=await f.get();
  const app=express();app.use(express.json());let launches=0;
  const unavailable=async()=>{throw new Error('No runtime should be started');};
  const restarted=mountRR(app,{root:f.root,prepareTarget:unavailable,verifyLogin:unavailable,provisionBrowser:unavailable,rpcFactory:()=>{launches++;throw new Error('No restoration');}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await restarted.shutdown();await new Promise(r=>server.close(r));});
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/jobs/${record.id}/resume`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnControl:true,pauseId:record.pauseId})});
  assert.equal(response.status,409);assert.equal(launches,0);assert.equal((await f.get()).pauseId,record.pauseId);
});

test('pausing one workspace does not change another workspace session, browser or spend',async t=>{
  const a=await fixture(t),b=await fixture(t);await a.start();await a.back();await b.start();await b.back();const before=await b.get();
  await pauseLive(a);assert.deepEqual(await b.get(),before);assert.equal((await b.shared()).ownership,'AGENT');assert.deepEqual(b.cleanups,[]);
});

test('operator can correct a waiting target before AI without reprovisioning or replacing the RR', async t => {
  const f=await fixture(t);await f.start();
  const before=await f.get(), browser=await f.shared();
  const result=await f.request(`/api/jobs/${f.job.id}/answer`,{returnControl:true,eventName:'  Annual   Summit 2027  '});
  assert.equal(result.body.aiStarted,true);
  const after=await f.get();
  assert.equal(after.requestedEventName,'Annual Summit 2027');assert.equal(after.target.name,'Annual Summit 2027');
  assert.equal(after.targetChanges.length,1);assert.equal(after.targetChanges[0].from,'User Target');assert.equal(after.targetChanges[0].to,'Annual Summit 2027');
  assert.equal(after.workbook,before.workbook);assert.equal(after.sha256,before.sha256);
  assert.equal(f.browsers.length,1);assert.deepEqual(f.cleanups,[]);
  assert.equal((await f.shared()).steelSessionId,browser.steelSessionId);
  assert.equal(f.posts[0].name,'Annual Summit 2027');assert.equal(f.launches.length,1);
  const prompt=f.launches[0].commands.find(c=>c.type==='prompt').message;
  assert.match(prompt,/Annual Summit 2027/);assert.doesNotMatch(prompt,/User Target/);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`,{returnControl:true,eventName:'Another event'})).status,409);
  assert.equal((await f.get()).requestedEventName,'Annual Summit 2027');
});

test('failed target lookup can be corrected on the same waiting job without a new browser or paid retry', async t => {
  const f=await fixture(t);await f.start();const browser=await f.shared();
  f.gate(async()=>{throw new Error('No exact event-name match');});
  const failed=await f.request(`/api/jobs/${f.job.id}/answer`,{returnControl:true,eventName:'Not an existing event'});
  assert.equal(failed.body.aiStarted,false);assert.equal(f.launches.length,0);
  assert.equal((await f.get()).requestedEventName,'Not an existing event');assert.equal((await f.shared()).ownership,'USER');
  assert.equal((await f.shared()).steelSessionId,browser.steelSessionId);assert.deepEqual(f.cleanups,[]);
  f.gate(async()=>{});
  const corrected=await f.request(`/api/jobs/${f.job.id}/answer`,{returnControl:true,eventName:'Real Existing Event'});
  assert.equal(corrected.body.aiStarted,true);assert.equal(f.browsers.length,1);assert.equal(f.launches.length,1);
  assert.equal((await f.get()).targetChanges.length,2);
});

test('invalid or unconfirmed target edits cannot alter the waiting job', async t => {
  const f=await fixture(t);await f.start();
  for(const eventName of ['', ' ', null, 7, {}, 'https://app.cvent.com/events', 'x'.repeat(301)]){
    assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`,{returnControl:true,eventName})).status,409);
    assert.equal((await f.get()).requestedEventName,'User Target');
  }
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`,{eventName:'Other Event'})).status,409);
  assert.equal((await f.get()).targetChanges,undefined);assert.equal(f.launches.length,0);assert.equal(f.posts.length,0);
});

test('Stop during a target correction prevents late handoff or native launch', async t => {
  const f=await fixture(t);await f.start();let release;const gate=new Promise(r=>release=r);f.gate(()=>gate);
  const returning=f.request(`/api/jobs/${f.job.id}/answer`,{returnControl:true,eventName:'Corrected Event'});
  for(let i=0;i<100&&!f.posts.length;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(f.posts.length,1);await f.connection.stop();release();
  await returning;assert.equal(f.launches.length,0);assert.equal((await f.get()).status,'STOPPED');
  assert.equal((await f.shared()).ownership,'USER');
});

test('three isolated controllers keep mocked native sessions, Stop and spending independent', async t => {
  const users = await Promise.all([fixture(t), fixture(t), fixture(t)]);
  await Promise.all(users.map(f => f.start()));
  await Promise.all(users.map(f => f.back()));
  const records = await Promise.all(users.map(f => f.get()));
  assert.equal(new Set(records.map(r => r.sessionId)).size, 3);
  assert.equal(new Set(records.map(r => r.workspace)).size, 3);
  for (const [index, f] of users.entries()) {
    assert.equal(records[index].phase, 'EXECUTING');
    const rpc = f.launches[0], request = rpc.request.bind(rpc);
    assert.equal(rpc.commands.filter(c => c.type === 'prompt').length, 1);
    rpc.request = c => c.type === 'get_session_stats' ? Promise.resolve({ data: { cost: index + 1 } }) : request(c);
    for (const other of users.filter(u => u !== f)) {
      assert.equal((await f.request(`/api/jobs/${other.job.id}/stop`, {})).status, 409);
    }
  }
  await users[1].connection.stop();
  assert.equal((await users[1].get()).status, 'STOPPED');
  for (const f of [users[0], users[2]]) {
    assert.equal((await f.get()).phase, 'EXECUTING');
    assert.equal((await f.shared()).ownership, 'AGENT');
    assert.deepEqual(f.cleanups, []);
  }
  await Promise.all([users[0].connection.stop(), users[2].connection.stop()]);
  for (const [index, f] of users.entries()) {
    const record = await f.get();
    assert.equal(record.piCostUSD, index + 1);
    assert.equal(f.connection.budget().spentUSD, index + 1);
    assert.equal(record.spendingUnreconciled, false);
    assert.deepEqual(f.cleanups, [f.job.id]);
    assert.equal((await f.shared()).ownership, 'USER');
  }
});
test('login-first tracks historical costs above the former threshold without a reset or spending gate', async t => {
  const f = await fixture(t), jobsRoot = join(f.root, 'data/jobs'), priorPath = join(jobsRoot, 'prior');
  await mkdir(priorPath);
  const prior = { id: 'prior', status: 'INCOMPLETE', piCostUSD: 50, target: { evtstub: 'selected' } };
  await writeFile(join(priorPath, 'job.json'), JSON.stringify(prior));
  assert.equal((await f.start()).status, 200);
  assert.equal(f.launches.length, 0, 'login still precedes any native session');
  assert.equal((await f.get()).priorEventCostUSD, 50);
  assert.equal((await f.back()).status, 200);
  assert.equal(f.launches.length, 1);
  assert.equal((await f.get()).totalEventCostUSD, 50);
  assert.equal(JSON.parse(await readFile(join(priorPath, 'job.json'))).piCostUSD, 50);
});
test('fresh upload preserves history but same-event uncertainty blocks Return before any native session', async t => {
  for (const uncertainty of ['{"changes":[{"object":"old footer","before":"original-url"}]}', '{"uncertainWrites":[{"object":"old footer"}]}', '[{"object":"old footer"}]', '{"changes":"malformed"}']) {
    const f = await fixture(t), id = randomUUID(), dir = join(f.root, 'data/jobs', id);
    await mkdir(dir);
    const prior = JSON.stringify({ id, status: 'INCOMPLETE', piCostUSD: 1, target: { evtstub: 'selected' }, unresolvedChanges: ['old-tool'], apiUnresolved: { status: 'UNCERTAIN' } });
    await writeFile(join(dir, 'job.json'), prior);
    await writeFile(join(dir, 'unresolved-changes.json'), uncertainty);
    await writeFile(join(dir, 'api-write-uncertain.json'), '{"oldIntent":true}');
    await writeFile(join(f.root, 'data/reconciliations.json'), 'retired registry, not execution input');
    await f.start(); const result = await f.back(), record = await f.get();
    assert.equal(result.status, 200); assert.equal(result.body.aiStarted, false);
    assert.equal(record.status, 'RUNNING'); assert.equal(record.phase, 'AWAITING_INPUT');
    assert.match(record.lastAssistantText, /Read-only reconciliation is required/);
    assert.ok(record.lastAssistantText.includes(id));
    assert.doesNotMatch(record.lastAssistantText, /old footer|old-tool|original-url/);
    assert.equal(record.sessionId, undefined); assert.equal(f.launches.length, 0); assert.equal(f.fences.length, 0);
    assert.equal(record.apiUnresolved, undefined); assert.deepEqual(record.unresolvedChanges, []);
    await assert.rejects(readFile(join(f.job.workspace, 'api-write-uncertain.json')), /ENOENT/);
    await assert.rejects(readFile(join(f.job.workspace, 'unresolved-changes.json')), /ENOENT/);
    await f.connection.stop();
    assert.equal((await f.shared()).ownership, 'USER'); assert.deepEqual(f.cleanups, [f.job.id]);
    assert.equal((await f.back()).status, 409, 'settled jobs never resume');
    assert.equal(await readFile(join(dir, 'api-write-uncertain.json'), 'utf8'), '{"oldIntent":true}');
    assert.equal(await readFile(join(dir, 'job.json'), 'utf8'), prior);
    assert.equal(await readFile(join(dir, 'unresolved-changes.json'), 'utf8'), uncertainty);
    assert.equal(await readFile(join(f.root, 'data/reconciliations.json'), 'utf8'), 'retired registry, not execution input');
    assert.equal(await readFile(f.job.workbook, 'utf8'), 'immutable RR');
  }
});
test('historical plans stay evidence only: each permitted upload executes its own workbook in a distinct empty session', async t => {
  const f = await fixture(t), id = randomUUID(), dir = join(f.root, 'data/jobs', id);
  await mkdir(join(dir, 'reports'), { recursive: true });
  const prior = JSON.stringify({ id, status: 'INCOMPLETE', piCostUSD: 1, target: { evtstub: 'selected' } });
  const report = '{"unfinishedTask":"GO BACK TO OLD FOOTER","status":"INCOMPLETE"}';
  await writeFile(join(dir, 'job.json'), prior);
  await writeFile(join(dir, 'reports/final-report.json'), report);
  await f.start(); await f.back(); const first = await f.get(); await f.connection.stop();
  const next = await f.upload(); await f.request(`/api/jobs/${next.id}/read`, {});
  await f.request(`/api/jobs/${next.id}/answer`, { message: 'Return', returnControl: true });
  const second = (await f.request(`/api/jobs/${next.id}`)).body;
  assert.notEqual(first.sessionId, second.sessionId); assert.equal(f.fences.length, 0);
  for (const [index, record] of [first, second].entries()) {
    assert.equal(record.phase, 'EXECUTING'); assert.equal(record.contextIsolation.initialMessageCount, 0);
    assert.equal(record.priorEventCostUSD, 1); assert.equal(record.reconciliation, undefined);
    const prompts = f.launches[index].commands.filter(c => c.type === 'prompt'); assert.equal(prompts.length, 1);
    assert.ok(prompts[0].message.includes(record.workbook));
    assert.doesNotMatch(prompts[0].message, /priorEventEvidence|prior-event-evidence|RECONCILING|rr-reconcile|GO BACK TO OLD FOOTER/);
    assert.ok(!prompts[0].message.includes(id));
    assert.match(prompts[0].message, /The RR defines the target configuration; live Cvent is the starting state/);
    assert.equal(JSON.parse(await readFile(join(record.workspace, 'runtime.json'))).reconciliationPending, undefined);
  }
  assert.ok(!f.launches[1].commands.find(c => c.type === 'prompt').message.includes(first.workbook));
  assert.equal(await readFile(join(dir, 'job.json'), 'utf8'), prior);
  assert.equal(await readFile(join(dir, 'reports/final-report.json'), 'utf8'), report);
});
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
for (const boundary of ['tool_execution_end', 'tool_execution_start', 'agent_settled', 'monitor', 'settlement-read', 'cleanup']) test(`current-run save uncertainty stops at ${boundary}, regardless of shell success`, async t => {
  const f = await fixture(t); await f.start(); await f.back();
  const record = await f.get(), rpc = f.launches[0];
  const marker = '{"reason":"PRIVATE_CAUSE retained only in workspace"}';
  const path = join(record.workspace, 'browser-save-uncertain.json');
  if (boundary === 'cleanup') {
    const original = rpc.stop.bind(rpc);
    rpc.stop = async (...args) => { await writeFile(path, marker); return original(...args); };
  } else if (boundary === 'settlement-read') {
    const original = rpc.request.bind(rpc);
    rpc.request = async command => { if (command.type === 'get_last_assistant_text') await writeFile(path, marker); return original(command); };
  } else await writeFile(path, marker);
  if (boundary !== 'monitor') rpc.emit('event', { type: ['cleanup', 'settlement-read'].includes(boundary) ? 'agent_settled' : boundary, toolName: 'bash', toolCallId: 'masked-save', isError: false, result: { content: [{ type: 'text', text: 'BrowserSaveUncertainError: failed; subsequent API read succeeded' }] } });
  for (let i = 0; i < 300 && (await f.get()).status !== 'STOPPED'; i++) await new Promise(r => setTimeout(r, 10));
  const after = await f.get(); assert.equal(after.status, 'STOPPED'); assert.match(after.stopReason, /save outcome is uncertain/);
  assert.equal(after.browserFailureGuard.executionUncertain, true); assert.equal(after.spendingUnreconciled, false);
  assert.equal((await f.shared()).ownership, 'USER'); assert.equal(f.cleanups.length, 1);
  assert.equal(await readFile(path, 'utf8'), marker); assert(!JSON.stringify(after).includes('PRIVATE_CAUSE'));
  assert.equal(f.launches.length, 1); assert.equal((await f.back()).status, 409);
});
test('quoted save errors on a successful tool do not stop without a current-run marker', async t => {
  const f = await fixture(t); await f.start(); await f.back();
  f.launches[0].emit('event', { type: 'tool_execution_end', toolName: 'bash', toolCallId: 'docs', isError: false, result: { content: [{ type: 'text', text: 'Documentation: BrowserSaveUncertainError: sample' }] } });
  assert.equal((await f.get()).status, 'RUNNING'); assert.equal((await f.get()).browserFailureGuard, undefined);
});

test('pre-dispatch prohibited-action denials do not stop Pi or add write uncertainty', async t => {
  const f = await fixture(t); await f.start(); await f.back();
  for (const [i, action] of ['Delete', 'Publish'].entries()) {
    f.launches[0].emit('event', { type: 'tool_execution_end', toolName: 'bash', toolCallId: 'denied-'+i, isError: true,
      result: { content: [{ type: 'text', text: `GuardrailViolation: prohibited Cvent action detected (${action})` }] } });
  }
  const record = await f.get();
  assert.equal(record.status, 'RUNNING'); assert.equal(record.browserFailureGuard, undefined);
  assert.equal((await f.shared()).ownership, 'AGENT'); assert.equal(record.toolErrors.length, 2);
  assert.equal(f.launches.length, 1); assert.equal(f.cleanups.length, 0);
  await f.connection.stop(); assert.deepEqual((await f.get()).unresolvedChanges, []);
});

test('ordinary selector failures stay recoverable without stopping or adding uncertainty',async t=>{
  const f=await fixture(t);await f.start();await f.back();
  for(let i=0;i<6;i++)f.launches[0].emit('event',{type:'tool_execution_end',toolName:'bash',toolCallId:'selector-'+i,isError:true,result:{content:[{type:'text',text:'ElementResolutionError: PRIVATE_LOCATOR'}]}});
  const record=await f.get();assert.equal(record.status,'RUNNING');assert.equal(record.browserFailureGuard,undefined);
  assert.equal((await f.shared()).ownership,'AGENT');assert.equal(record.toolErrors.length,6);
  assert(!JSON.stringify(record).includes('PRIVATE_LOCATOR'));
  await f.connection.stop();assert.deepEqual((await f.get()).unresolvedChanges,[]);
});
test('unconfirmed page execution stays bound to its old record and blocks same-event paid continuation',async t=>{
  const f=await fixture(t);await f.start();await f.back();
  f.launches[0].emit('event',{type:'tool_execution_end',toolName:'bash',toolCallId:'late-page-execution',isError:true,result:{content:[{type:'text',text:'PageEvaluationTimeoutError: Execution could not be confirmed stopped; reload or close the Page before continuing.'}]}});
  for(let i=0;i<50&&(await f.get()).status!=='STOPPED';i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();assert.equal(record.status,'STOPPED');assert.deepEqual(record.unresolvedChanges,['late-page-execution']);
  assert.equal((await f.shared()).ownership,'USER');assert.equal(record.browserFailureGuard.executionUncertain,true);
  const next=await f.upload();await f.request(`/api/jobs/${next.id}/read`,{});
  await f.request(`/api/jobs/${next.id}/answer`,{message:'Return',returnControl:true});
  const fresh=(await f.request(`/api/jobs/${next.id}`)).body;
  assert.equal(fresh.phase,'AWAITING_INPUT');assert.equal(f.launches.length,1);
  assert.equal(fresh.sessionId,undefined);assert.match(fresh.lastAssistantText,/Read-only reconciliation/);assert.deepEqual(fresh.unresolvedChanges,[]);
  assert.equal(fresh.browserFailureGuard,undefined);assert.deepEqual((await f.get()).unresolvedChanges,['late-page-execution']);
});

test('legacy direct-start and continuation cannot launch Pi, before or after handoff',async t=>{
  const f=await fixture(t);
  for(const phase of ['uploaded','login','execution']) {
    if(phase==='login') await f.start();
    if(phase==='execution') await f.back();
    for(const route of ['start','continue']) assert.equal((await f.request(`/api/jobs/${f.job.id}/${route}`,{})).status,409);
    assert.equal(f.launches.length,phase==='execution'?1:0);
  }
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);
});
test('New RR clears an unstarted selection idempotently without Pi, browser creation or deleting its workbook',async t=>{
  const f=await fixture(t);
  for(let i=0;i<2;i++)assert.equal((await f.request('/api/new-rr',{jobId:f.job.id,contextId:f.connection.context().id})).status,200);
  assert.equal((await f.get()).status,'CLEARED');assert.equal((await f.start()).status,409);
  assert.equal(f.launches.length,0);assert.equal(f.browsers.length,0);
  assert.equal(await readFile(f.job.workbook,'utf8'),'immutable RR');
  assert.equal((await f.request('/api/new-rr',{contextId:f.connection.context().id})).body.aiStarted,false);
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
for (const file of ['unresolved-changes.json','reports/final-report.json','browser-save-uncertain.json','api-write-uncertain.json']) test(`New RR resets settled context while ${file} still blocks same-event execution`, async t => {
  const f=await fixture(t);await f.start();await f.back();
  const before=f.connection.context();const path=join(f.job.workspace,file);
  const contents=JSON.stringify({uncertainWrites:[{object:'unverified saved effect'}]});await writeFile(path,contents);
  const result=await f.request('/api/new-rr',{jobId:f.job.id});
  assert.equal(result.status,200);assert.equal(result.body.executionHoldsCleared,false);
  assert.equal(result.body.sharedSlotReleased,false);assert.equal(result.body.aiStarted,false);
  assert.notEqual(f.connection.context().id,before.id);assert.equal(f.connection.context().jobId,null);
  assert.equal(await readFile(path,'utf8'),contents);
  assert.equal((await f.get()).status,'STOPPED');assert.equal(f.launches.length,1);
  const stoppedBytes=await readFile(join(f.job.workspace,'job.json'));
  const next=await f.upload();assert.notEqual(next.id,f.job.id);
  assert.equal((await f.request(`/api/jobs/${next.id}/read`,{})).status,200);
  assert.equal((await f.request(`/api/jobs/${next.id}/answer`,{returnControl:true})).body.aiStarted,false);
  assert.equal(f.launches.length,1,'reset must not bypass same-event uncertainty');
  assert.match((await f.request(`/api/jobs/${next.id}`)).body.lastAssistantText,/unresolved write\/operation evidence/);
  assert.deepEqual(await readFile(join(f.job.workspace,'job.json')),stoppedBytes);
  assert.equal(await readFile(path,'utf8'),contents);
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
test('explicit same-workspace replacement stops its canonical owner despite an obsolete selection, not another workspace',async t=>{
  const a=await fixture(t),b=await fixture(t);await a.start();await a.back();await b.start();await b.back();
  const otherBefore=await b.get(),otherBrowser=await b.shared(),oldSession=(await a.get()).sessionId;
  const reset=await a.request('/api/new-rr',{replaceWorkspace:true,jobId:b.job.id,contextId:a.connection.context().id});
  assert.equal(reset.status,200);assert.equal(reset.body.resetScope,'WORKSPACE');assert.equal(reset.body.stoppedJobId,a.job.id);
  assert.equal((await a.get()).status,'STOPPED');assert.equal(a.connection.context().jobId,null);assert.deepEqual(a.cleanups,[a.job.id]);
  assert.deepEqual(await b.get(),otherBefore);assert.deepEqual(await b.shared(),otherBrowser);assert.deepEqual(b.cleanups,[]);
  assert.equal((await a.back()).status,409);
  const next=await a.upload();await a.request(`/api/jobs/${next.id}/read`,{});await a.request(`/api/jobs/${next.id}/answer`,{returnControl:true});
  const fresh=(await a.request(`/api/jobs/${next.id}`)).body;assert.notEqual(fresh.sessionId,oldSession);assert.equal(fresh.contextIsolation.initialMessageCount,0);
});
test('same-workspace reset cancels and drains a pending Return before committing an empty context',async t=>{
  const f=await fixture(t);await f.start();let enter,release;const entered=new Promise(r=>enter=r),delay=new Promise(r=>release=r);
  f.gate(async()=>{enter();await delay;});const pending=f.back();await entered;
  let resetFinished=false;
  const reset=f.request('/api/new-rr',{replaceWorkspace:true,contextId:f.connection.context().id}).then(r=>{resetFinished=true;return r;});
  for(let i=0;i<100&&!f.cleanups.length;i++)await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(f.cleanups,[f.job.id]);assert.equal(resetFinished,false);assert.equal(f.connection.isBusy(),true);
  assert.equal((await f.request('/api/new-rr',{replaceWorkspace:true,contextId:f.connection.context().id})).status,409);
  assert.equal((await f.start()).status,409);
  release();assert.equal((await pending).status,409);assert.equal((await reset).status,200);
  assert.equal(f.launches.length,0);assert.equal(f.connection.context().jobId,null);assert.equal(f.connection.isBusy(),false);
});
test('stale generation cannot replace a newer workspace owner even with explicit replacement enabled',async t=>{
  const f=await fixture(t),oldContext=f.connection.context().id;
  await f.request('/api/new-rr',{replaceWorkspace:true,contextId:oldContext});const next=await f.upload();await f.request(`/api/jobs/${next.id}/read`,{});
  const denied=await f.request('/api/new-rr',{replaceWorkspace:true,jobId:f.job.id,contextId:oldContext});
  assert.equal(denied.status,409);assert.match(denied.body.error,/context changed/);assert.equal(f.connection.context().jobId,next.id);assert.deepEqual(f.cleanups,[]);
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
test('pre-process launch failure returns to human ownership without a prepared-session pool',async t=>{
  const f=await fixture(t,{launchFails:true}); await f.start();
  const result=await f.back(); assert.equal(result.body.aiStarted,false);
  assert.equal(f.launches.length,0); assert.equal((await f.shared()).ownership,'USER');
  assert.equal((await f.get()).status,'RUNNING'); assert.equal((await f.get()).waitingFor,'setup');
  await f.connection.stop(); assert.deepEqual(f.cleanups,[f.job.id]);
});
test('uncertain prompt response stops Pi and Steel without an intake retry or second prompt',async t=>{
  const f=await fixture(t,{promptFails:true}); await f.start();
  assert.equal((await f.back()).status,409); assert.equal((await f.get()).status,'STOPPED');
  assert.equal((await f.shared()).ownership,'USER'); assert.deepEqual(f.cleanups,[f.job.id]);
  assert.equal((await f.back()).status,409); assert.equal(f.launches.length,1);
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,1);
});
test('one explicit successful Return launches one fresh session with the skill-led task and no SOW',async t=>{
  const f=await fixture(t);await f.start();
  assert.equal((await f.get()).aiStartedAt, undefined, 'login time must not count as execution');
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`,{message:'not a handoff'})).status,409);
  assert.equal(f.launches.length,0);
  assert.equal((await f.back()).status,200);const d=await f.get();
  assert.equal(d.phase,'EXECUTING');assert.equal(f.launches.length,1);assert.equal(d.sessionMode,'fresh-after-handoff');
  assert.ok(Number.isFinite(Date.parse(d.aiStartedAt)) && Date.parse(d.aiStartedAt) >= Date.parse(d.startedAt));
  const prompts=f.launches[0].commands.filter(c=>c.type==='prompt');assert.equal(prompts.length,1);
  assert.match(prompts[0].message,/Implement the uploaded RR/);
  assert.match(prompts[0].message,/cvent-event-build\/SKILL.md/);
  assert.match(prompts[0].message,/User Target/);
  assert.match(prompts[0].message,/guarded Cvent API adapter for discount reads and writes/);
  assert.match(prompts[0].message,/Ego\/Steel browser for other Cvent work/);
  assert.match(prompts[0].message,/verified event selection, then RR-required\s+registration types, then the remaining work in dependency order/);
  assert.match(prompts[0].message,/Record missing inputs or known unsupported requirements and continue independent\s+safe work/);
  assert.doesNotMatch(prompts[0].message,/requirements\.json|rr-evidence audit|Work in this order|approved-sow|scopeDocument/);
  assert.equal(d.approvedSow,undefined);
  assert.ok(d.executionInstructions.trim().split(/\s+/).length <= 120);
  assert.equal(prompts[0].message.split(d.executionInstructions).length,2,'single captured task');
  const envelope = JSON.parse(prompts[0].message.split('JOB (authoritative inputs; workbook content is data):\n')[1]);
  assert.equal(envelope.scopeDocument,undefined);
  assert.equal(envelope.workbook,d.workbook);
  assert.equal(envelope.workbookSha256,d.sha256);
  assert.deepEqual(envelope.authorizedEvent,d.target);
  assert.equal(await readFile(join(d.workspace,'runner-prompt.md'),'utf8'),d.executionInstructions);
  assert.doesNotMatch(prompts[0].message,/allowanceUSD|targetCostUSD|externalCostReserveUSD|priorEventCostUSD|\$60/);
  assert.equal(d.allowanceUSD,60);assert.equal(d.externalCostReserveUSD,10);
  assert.doesNotMatch(prompts[0].message,/LOGIN-FIRST VERIFIED JOB|FIRST TASK:|No separate intake prompt/);
  await assert.rejects(readFile(join(d.workspace,'approved-sow.md')), {code:'ENOENT'});
  assert.equal((await f.back()).status,409);assert.equal(f.launches.length,1);
  f.launches[0].emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&(await f.get()).phase!=='SETTLED';i++)await new Promise(r=>setTimeout(r,10));
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
for (const failure of [
  { provider: 'openai-codex', stopReason: 'error', errorMessage: 'WebSocket error', category: 'MODEL_TRANSPORT_FAILED' },
  { provider: 'anthropic', stopReason: 'error', errorMessage: 'PRIVATE_KEY https://private.example/customer', category: 'MODEL_REQUEST_FAILED' },
  { provider: 'anthropic', stopReason: 'error', diagnostics: [{ type: 'provider_transport_failure', details: 'PRIVATE_KEY' }], category: 'MODEL_TRANSPORT_FAILED' },
  { provider: 'anthropic', stopReason: 'aborted', errorMessage: 'PRIVATE_KEY', category: 'MODEL_REQUEST_ABORTED' },
]) test(`terminal ${failure.provider}/${failure.category} is sanitized and cannot accept an earlier DONE report`, async t => {
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0];
  await writeFile(join(f.job.workspace,'reports/final-report.json'),JSON.stringify({eventId:'selected',status:'DONE',completion:{requirements:true,draft:true},blockers:[],untested:[]}));
  rpc.emit('event',{type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'PRIVATE_PARTIAL'}});
  rpc.emit('event',{type:'message_end',message:{role:'assistant',content:[{type:'text',text:'PRIVATE_PARTIAL'}],...failure}});
  rpc.emit('event',{type:'agent_end',willRetry:false});
  assert.equal((await f.get()).status,'RUNNING','wait for native settlement, not message_end');
  rpc.emit('event',{type:'agent_settled'});
  rpc.emit('event',{type:'agent_settled'});
  const retained=failure.stopReason==='error', phase=retained?'AWAITING_INPUT':'SETTLED';
  for(let i=0;i<100&&(await f.get()).phase!==phase;i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();
  assert.equal(record.status,retained?'RUNNING':'INCOMPLETE',record.stopReason);assert.equal(record.modelFailure.category,failure.category);
  assert.equal(record.modelFailureHistory.length,1);assert.equal(record.spendingUnreconciled,false);
  assert.equal((await f.shared()).ownership,'USER');assert.deepEqual(f.cleanups,retained?[]:[f.job.id]);
  const state=JSON.parse(await readFile(join(f.job.workspace,'state.json')));
  assert.equal(state.status,record.status);assert.match(state.currentAction,/Native model request/);
  let result;
  if(retained){
    assert.equal(record.pauseReason,'model_failure');assert.equal(record.waitingFor,'operator');assert.ok(record.pauseId);
    assert.equal(record.sessionPrepared,true);assert.equal(record.finishedAt,undefined);assert.match(record.lastAssistantText,/No automatic retry/);
    await assert.rejects(readFile(join(f.job.workspace,'result.json')), {code:'ENOENT'}, 'a pause is not a terminal result');
  }else{
    assert.match(record.stopReason,/Native model request/);assert.match(record.executionSummary,/No automatic build replay/);
    assert.deepEqual(record.stopFailures,[]);result=JSON.parse(await readFile(join(f.job.workspace,'result.json')));
    assert.equal(result.status,'INCOMPLETE');assert.deepEqual(result.modelFailure,record.modelFailure);
  }
  assert.doesNotMatch(JSON.stringify({record,result,state}),/PRIVATE_|private\.example/);
  assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,1);
  assert.equal(rpc.commands.filter(c=>c.type==='get_last_assistant_text').length,0);
  assert.equal(f.launches.length,1);assert.equal((await f.back()).status,409);
});

async function settleModelError(f) {
  const rpc=f.launches[0];
  rpc.emit('event',{type:'message_end',message:{role:'assistant',stopReason:'error',errorMessage:'WebSocket error'}});
  rpc.emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&!['AWAITING_INPUT','SETTLED'].includes((await f.get()).phase);i++)await new Promise(r=>setTimeout(r,5));
  return f.get();
}

test('a settled model error retains the same idle session/browser without cancellation or automatic prompting',async t=>{
  const f=await fixture(t);await f.start();await f.back();const before=await f.get(), rpc=f.launches[0];
  const paused=await settleModelError(f);assert.equal(paused.pauseReason,'model_failure');assert.equal(paused.sessionId,before.sessionId);
  assert.equal(rpc.commands.filter(c=>c.type==='pause').length,0);assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,1);
  assert.deepEqual(f.cleanups,[]);assert.equal((await f.shared()).ownership,'USER');
  for(const type of ['steer','follow_up'])assert.equal((await f.request(`/api/jobs/${f.job.id}/rpc`,{type,message:'go'})).status,409);
  for(let i=0;i<5;i++)await f.get();assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,1);
  assert.equal((await returnPaused(f)).status,200);assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,2);
  assert.equal((await f.get()).modelFailure.category,'MODEL_TRANSPORT_FAILED','Return alone does not erase the failure');
  rpc.emit('event',{type:'message_start',message:{role:'assistant'}});assert.ok((await f.get()).modelFailure);
  rpc.emit('event',{type:'message_end',message:{role:'assistant',stopReason:'stop'}});
  const recovered=await f.get();assert.equal(recovered.modelFailure,null);assert.equal(recovered.modelFailureHistory.length,1);
  assert.equal(recovered.sessionId,before.sessionId);assert.equal(f.launches.length,1);assert.equal(f.browsers.length,1);
});

for(const mode of ['stale-report','refreshed-report','no-successful-response'])test(`model recovery requires both a successful response and refreshed completion evidence: ${mode}`,async t=>{
  const f=await fixture(t);await f.start();await f.back();
  const path=join(f.job.workspace,'reports/final-report.json'), report={eventId:'selected',status:'DONE',completion:{requirements:true,draft:true},blockers:[],untested:[]};
  await writeFile(path,JSON.stringify(report));await settleModelError(f);assert.equal((await returnPaused(f)).status,200);
  if(mode!=='stale-report')await writeFile(path,JSON.stringify({...report,verifiedAfterHumanReturn:true}));
  if(mode!=='no-successful-response')f.launches[0].emit('event',{type:'message_end',message:{role:'assistant',stopReason:'stop'}});
  f.launches[0].emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&(await f.get()).phase!=='SETTLED';i++)await new Promise(r=>setTimeout(r,5));
  const record=await f.get();assert.equal(record.status,mode==='refreshed-report'?'DONE':'INCOMPLETE');
  assert.equal(record.modelFailureHistory.length,1);assert.deepEqual(f.cleanups,[f.job.id]);
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,2);
});

test('repeated model failures need a new explicit Return each time and retain sanitized history',async t=>{
  const f=await fixture(t);await f.start();await f.back();const first=await settleModelError(f);
  await returnPaused(f);const second=await settleModelError(f);
  assert.notEqual(second.pauseId,first.pauseId);assert.equal(second.modelFailureHistory.length,2);
  assert.equal((await returnPaused(f,{pauseId:first.pauseId})).status,409);
  assert.equal(f.launches[0].commands.filter(c=>c.type==='prompt').length,2);assert.deepEqual(f.cleanups,[]);
});

for(const mode of ['changed-session','native-busy','idle-read-failed','shared-browser-changed','shared-lock'])test(`model error cannot retain an unsafe browser/session: ${mode}`,async t=>{
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0],request=rpc.request.bind(rpc);
  if(mode==='changed-session')rpc.id=randomUUID();
  if(mode==='native-busy')rpc.request=async c=>c.type==='get_state'?{data:{...rpc.state(),isStreaming:true}}:request(c);
  if(mode==='idle-read-failed')rpc.request=async c=>{if(c.type==='get_state')throw new Error('unavailable');return request(c);};
  if(mode==='shared-browser-changed')await f.saveShared({...await f.shared(),activeTargetId:randomUUID()});
  if(mode==='shared-lock')await writeFile(join(f.root,'data/current/operation.lock'),'retained');
  const record=await settleModelError(f);assert.equal(record.status,'STOPPED');assert.equal(record.pauseId,null);assert.deepEqual(f.cleanups,[f.job.id]);
  assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,1);
});

for(const mode of ['stop','unexpected-native-work'])test(`model-error retention cannot outlive ${mode} during its idle check`,async t=>{
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0],request=rpc.request.bind(rpc);
  let release,enter;const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r);
  rpc.request=async c=>{if(c.type==='get_state'){enter();await gate;}return request(c);};
  const failure=settleModelError(f);await entered;
  if(mode==='stop')await f.connection.stop();else rpc.emit('event',{type:'agent_start'});
  release();await failure;
  for(let i=0;i<100&&(await f.get()).phase!=='SETTLED';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal((await f.get()).status,'STOPPED');assert.equal((await f.get()).pauseId,null);assert.deepEqual(f.cleanups,[f.job.id]);
  assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,1);
});

test('model-error retention rejects linked report evidence without reading it as in-workspace proof',async t=>{
  const f=await fixture(t);await f.start();await f.back();
  const external=join(f.root,'other-fixture-report.json');await writeFile(external,JSON.stringify({uncertainWrites:[]}));
  await symlink(external,join(f.job.workspace,'reports/final-report.json'));
  const record=await settleModelError(f);assert.equal(record.status,'STOPPED');assert.deepEqual(f.cleanups,[f.job.id]);
  assert.equal(await readFile(external,'utf8'),'{"uncertainWrites":[]}');
});

test('model error retains a safe browser above legacy budget amounts without a dollar cutoff',async t=>{
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0],request=rpc.request.bind(rpc);
  rpc.request=async c=>c.type==='get_session_stats'?{data:{cost:200}}:request(c);
  const record=await settleModelError(f);assert.equal(record.phase,'AWAITING_INPUT');assert.equal(record.piCostUSD,200);
  assert.equal(record.spendingLimitEnabled,false);assert.deepEqual(f.cleanups,[]);
});

test('native recovery clears the failed outcome only after a completed assistant response', async t => {
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0];
  rpc.emit('event',{type:'message_end',message:{role:'assistant',stopReason:'error',errorMessage:'WebSocket error'}});
  rpc.emit('event',{type:'auto_retry_start',attempt:1});
  rpc.emit('event',{type:'agent_end',willRetry:true});
  rpc.emit('event',{type:'message_start',message:{role:'assistant',stopReason:'pending'}});
  assert.equal((await f.get()).status,'RUNNING');assert.deepEqual(f.cleanups,[]);
  rpc.emit('event',{type:'message_end',message:{role:'assistant',stopReason:'stop'}});
  rpc.emit('event',{type:'auto_retry_end',success:true,attempt:1});
  await writeFile(join(f.job.workspace,'reports/final-report.json'),JSON.stringify({eventId:'selected',status:'DONE',completion:{requirements:true,draft:true},blockers:[],untested:[]}));
  rpc.emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&(await f.get()).phase!=='SETTLED';i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();assert.equal(record.status,'DONE');assert.equal(record.modelFailure,undefined);
  assert.equal(rpc.commands.filter(c=>c.type==='prompt').length,1);assert.deepEqual(f.cleanups,[f.job.id]);
});

for(const mode of ['api-uncertainty','browser-uncertainty','cleanup-failure','spending-failure','unfinished-tool']) test(`model failure preserves ${mode} and STOPPED precedence`, async t => {
  const f=await fixture(t,{cleanupFails:mode==='cleanup-failure'});await f.start();await f.back();const rpc=f.launches[0];
  rpc.emit('event',{type:'message_end',message:{role:'assistant',stopReason:'error',errorMessage:'WebSocket error'}});
  // Non-assistant completions and a started retry must not erase an error.
  rpc.emit('event',{type:'message_end',message:{role:'toolResult',stopReason:'stop'}});
  rpc.emit('event',{type:'message_start',message:{role:'assistant',stopReason:'pending'}});
  let marker;
  if(mode==='api-uncertainty') { marker=join(f.job.workspace,'api-write-uncertain.json');await writeFile(marker,'{}'); }
  if(mode==='browser-uncertainty') {
    marker=join(f.job.workspace,'browser-save-uncertain.json');
    const request=rpc.request.bind(rpc);
    rpc.request=async c=>{if(c.type==='get_state')await writeFile(marker,'{}');return request(c);};
  }
  if(mode==='cleanup-failure'){
    const request=rpc.request.bind(rpc);
    rpc.request=async c=>c.type==='get_state'?{data:{...rpc.state(),isStreaming:true}}:request(c);
  }
  if(mode==='spending-failure') rpc.request=async()=>{throw new Error('Stats unavailable');};
  if(mode==='unfinished-tool') rpc.emit('event',{type:'tool_execution_start',toolName:'bash',toolCallId:'uncertain'});
  rpc.emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&(await f.get()).phase!=='SETTLED';i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();assert.equal(record.status,'STOPPED');assert.equal(record.modelFailure.category,'MODEL_TRANSPORT_FAILED');
  if(marker)assert.equal(await readFile(marker,'utf8'),'{}');
  if(mode==='spending-failure')assert.equal(record.spendingUnreconciled,true);
  if(mode==='unfinished-tool')assert.deepEqual(record.unresolvedChanges,['uncertain']);
  assert.equal((await f.shared()).ownership,'USER');assert.deepEqual(f.cleanups,[f.job.id]);
});

test('operator Stop keeps its reason when native cancellation emits an aborted message', async t => {
  const f=await fixture(t);await f.start();await f.back();const rpc=f.launches[0];
  rpc.stop=async after=>{
    rpc.emit('event',{type:'message_end',message:{role:'assistant',stopReason:'aborted',errorMessage:'PRIVATE_KEY'}});
    rpc.emit('event',{type:'agent_settled'});await after();return [];
  };
  await f.connection.stop();const record=await f.get();
  assert.equal(record.status,'STOPPED');assert.equal(record.stopReason,'Control returned to operator');assert.equal(record.modelFailure,undefined);
  assert.deepEqual(f.cleanups,[f.job.id]);
});

test('verified website, registration, dependencies and Draft end as DONE without any review or second prompt',async t=>{
  const f=await fixture(t);await f.start();await f.back();
  await writeFile(join(f.job.workspace,'reports/final-report.json'),JSON.stringify({
    eventId:'selected',status:'DONE',completion:{requirements:true,draft:true},blockers:[],untested:[]
  }));
  f.launches[0].emit('event',{type:'agent_settled'});
  for(let i=0;i<100&&(await f.get()).status!=='DONE';i++)await new Promise(r=>setTimeout(r,10));
  const record=await f.get();assert.equal(record.status,'DONE');assert.equal(record.reviewRequired,undefined);
  assert.match(record.executionSummary,/all applicable RR requirements saved and connected/);
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
test('wrong assigned browser and prior same-event API uncertainty independently block Pi',async t=>{
  const f=await fixture(t);await f.start();f.mismatch();await f.back();assert.equal(f.launches.length,0);
  assert.match((await f.get()).lastAssistantText,/assigned browser/);
  const id=randomUUID(),p=join(f.root,'data/jobs',id);await mkdir(p);
  await writeFile(join(p,'job.json'),JSON.stringify({id,status:'REVIEW_REQUIRED',target:{evtstub:'selected'},piCostUSD:2}));
  await writeFile(join(p,'api-write-uncertain.json'),'{"verification":"UNVERIFIED"}');
  await f.back();assert.equal(f.launches.length,0);assert.match((await f.get()).lastAssistantText,/Read-only reconciliation/);
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
  for(let i=0;i<100&&(await f.get()).phase!=='SETTLED';i++)await new Promise(r=>setTimeout(r,10));
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
