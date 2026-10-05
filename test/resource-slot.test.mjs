import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createExecutionSlot } from '../deploy/azure/execution-slot.mjs';
import { collectEventSafety } from '../deploy/azure/event-safety.mjs';
import { executionSafety } from '../app/execution-clearance.mjs';
import { eventHoldInventory, createSharedEventSafety } from '../app/shared-event-safety.mjs';
import { acquireApiLease } from '../app/api-operation-lease.mjs';

const answer = id => `/api/jobs/${id}/answer`;
async function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'resource-slot-')); t.after(() => rmSync(base, { recursive: true, force: true }));
  const roots = [1, 2, 3].map(n => {
    const root = join(base, String(n)); mkdirSync(join(root, 'data/jobs'), { recursive: true }); mkdirSync(join(root, 'data/current')); return root;
  });
  const old = randomUUID(), next = randomUUID(), eventId = randomUUID(), workspace = join(roots[2], 'data/jobs', old);
  mkdirSync(join(workspace, 'receipts'), { recursive: true });
  const record = { id: old, status: 'STOPPED', phase: 'SETTLED', finishedAt: new Date().toISOString(), sessionPrepared: false,
    spendingUnreconciled: false, piCostUSD: 2.5, stopFailures: [], unresolvedChanges: ['PRIVATE_TOOL', 'browser-save-uncertain'], ownedPid: null,
    browserFailureGuard: { executionUncertain: true }, target: { apiEventId: eventId, evtstub: eventId } };
  const save = (name, value) => writeFileSync(join(workspace, name), JSON.stringify(value));
  save('job.json', record); save('runtime.json', { ownership: 'USER' }); save('receipts/steel-cleanup.json', { status: 'STOPPED' });
  save('browser-save-uncertain.json', { private: 'PRIVATE_EFFECT', eventId }); save('receipts/api-original.json', { status: 'PASS', private: 'PRIVATE_RECEIPT' });
  const directory = join(base, 'slot');
  await createExecutionSlot({ directory, clearance: async () => false }).authorize(3, answer(old), 'POST');
  const claim = readFileSync(join(directory, 'active.json'), 'utf8');
  const safety = () => executionSafety(roots[2], old, () => {});
  const clearance = async held => held.jobId === old ? safety() : false;
  const inventories = () => roots.map((root, i) => eventHoldInventory(root, i + 1));
  const prepare = (handoff, options = {}) => collectEventSafety({ ports: [18781, 18782, 18783], ...handoff,
    fetchImpl: async url => new Response(JSON.stringify(inventories()[Number(new URL(url).port) - 18781])), ...options });
  const gate = options => createExecutionSlot({ directory, clearance, prepareHandoff: prepare, ...options });
  const archives = () => readdirSync(directory).filter(n => n.endsWith('.released.json'));
  const unchanged = () => { assert.equal(readFileSync(join(directory, 'active.json'), 'utf8'), claim); assert.deepEqual(archives(), []); };
  return { base, roots, workspace, directory, old, next, eventId, record, save, claim, safety, clearance, inventories, prepare, gate, archives, unchanged };
}
test('proven stopped resources release capacity but preserve original claim, holds, receipts and costs', async t => {
  const f = await fixture(t), files = ['job.json', 'runtime.json', 'browser-save-uncertain.json', 'receipts/steel-cleanup.json', 'receipts/api-original.json'];
  const before = files.map(p => readFileSync(join(f.workspace, p), 'utf8'));
  assert.equal(f.safety().resourcesCleared, true); assert.equal(f.safety().cleared, false);
  const header = await f.gate().authorize(1, answer(f.next), 'POST');
  const held = JSON.parse(readFileSync(join(f.directory, 'active.json')));
  assert.equal(held.jobId, f.next); assert.equal(held.workspace, 1);
  assert.equal(f.archives().length, 1); assert.equal(readFileSync(join(f.directory, f.archives()[0]), 'utf8'), f.claim);
  assert.deepEqual(files.map(p => readFileSync(join(f.workspace, p), 'utf8')), before);
  assert.equal(f.safety().cleared, false); assert.equal(f.inventories()[2].holds[0].eventId, f.eventId);
  const verify = createSharedEventSafety({ workspaceId: 1 });
  const req = { method: 'POST', originalUrl: answer(f.next), headers: { 'x-cvent-event-safety': header } };
  assert.throws(() => verify({ req, record: { id: f.next }, target: { apiEventId: f.eventId, evtstub: f.eventId } }), /Workspace 3/);
  // A fresh explicit same-holder retry gets another assertion, not another claim.
  const retry = await f.gate().authorize(1, answer(f.next), 'POST');
  const unrelated = randomUUID();
  assert.doesNotThrow(() => verify({ req: { ...req, headers: { 'x-cvent-event-safety': retry } }, record: { id: f.next }, target: { apiEventId: unrelated, evtstub: unrelated } }));
  assert.deepEqual(JSON.parse(readFileSync(join(f.directory, 'active.json'))), held);
});
for (const patch of [{ status: 'RUNNING' }, { sessionPrepared: true }, { spendingUnreconciled: true }, { piCostUSD: null }, { stopFailures: ['failed'] }, { ownedPid: 'invalid' }]) {
  test(`resource-only mode still refuses ${Object.keys(patch)[0]}`, async t => {
    const f = await fixture(t); f.save('job.json', { ...f.record, ...patch }); let prepared = false;
    await assert.rejects(f.gate({ prepareHandoff: async () => { prepared = true; } }).authorize(1, answer(f.next), 'POST'));
    assert.equal(prepared, false); f.unchanged();
  });
}
test('actual kernel ownership and unconfirmed browser cleanup still block resource release', async t => {
  const f = await fixture(t), lease = acquireApiLease(f.workspace);
  try { await assert.rejects(f.gate().authorize(1, answer(f.next), 'POST')); f.unchanged(); }
  finally { lease.release(); }
  f.save('receipts/steel-cleanup.json', { status: 'FAILED' });
  await assert.rejects(f.gate().authorize(1, answer(f.next), 'POST')); f.unchanged();
});
test('resource proof without mandatory global enforcement retains the strict legacy hold', async t => {
  const f = await fixture(t);
  await assert.rejects(createExecutionSlot({ directory: f.directory, clearance: f.clearance }).authorize(1, answer(f.next), 'POST'), e => e.publicResult.code === 'EVENT_RECONCILIATION_REQUIRED');
  f.unchanged();
});
for (const mode of ['offline', 'missing', 'wrong-job', 'old-peer', 'expired', 'hold-omitted', 'unscoped']) test(`global safety ${mode} prevents any claim mutation`, async t => {
  const f = await fixture(t);
  const prepareHandoff = async handoff => {
    if (mode === 'offline') throw Error('PRIVATE_UPSTREAM');
    if (mode === 'missing') return undefined;
    const value = JSON.parse(Buffer.from(await f.prepare(handoff), 'base64'));
    if (mode === 'wrong-job') value.jobId = randomUUID();
    if (mode === 'old-peer') value.inventories[1].enforced = false;
    if (mode === 'expired') { value.issuedAt -= 120001; value.expiresAt -= 120001; }
    if (mode === 'hold-omitted') value.inventories[2].holds = [];
    if (mode === 'unscoped') value.inventories[2].holds[0].eventId = null;
    return Buffer.from(JSON.stringify(value)).toString('base64');
  };
  await assert.rejects(f.gate({ prepareHandoff }).authorize(1, answer(f.next), 'POST'), e => {
    assert.equal(e.publicResult.code, mode === 'unscoped' ? 'UNSCOPED_EVENT_HOLD' : 'SHARED_EVENT_SAFETY_UNAVAILABLE');
    assert.doesNotMatch(e.message, /PRIVATE/); return true;
  });
  f.unchanged();
});
test('cleanup is checked again after inventory collection and expiry is checked again at commit', async t => {
  const f = await fixture(t); let calls = 0;
  await assert.rejects(f.gate({ clearance: async () => ++calls === 1 ? f.safety() : false }).authorize(1, answer(f.next), 'POST'));
  assert.equal(calls, 2); f.unchanged();
  let time = Date.now(); calls = 0;
  await assert.rejects(f.gate({ now: () => time,
    prepareHandoff: handoff => f.prepare(handoff, { now: () => time }),
    clearance: async () => { if (++calls === 2) time += 120000; return f.safety(); }
  }).authorize(1, answer(f.next), 'POST'), e => e.publicResult.code === 'SHARED_EVENT_SAFETY_UNAVAILABLE');
  f.unchanged();
});
test('contradictory cleanup reason lists never permit resource release', async t => {
  const f = await fixture(t);
  for (const patch of [{ resourceBlockers: ['NATIVE_PROCESS_PRESENT'] }, { resourceBlockers: undefined }, { uncertaintyBlockers: [] }]) {
    await assert.rejects(f.gate({ clearance: async () => ({ ...f.safety(), ...patch }) }).authorize(1, answer(f.next), 'POST'), e => e.publicResult.code === 'CLEARANCE_UNAVAILABLE');
    f.unchanged();
  }
});
test('concurrent handoffs admit one candidate and a restarted gateway cannot steal its new reservation', async t => {
  const f = await fixture(t), gate = f.gate();
  const attempts = await Promise.allSettled([1, 2, 3].map(w => gate.authorize(w, answer(randomUUID()), 'POST')));
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.archives().length, 1);
  const after = readFileSync(join(f.directory, 'active.json'), 'utf8');
  await assert.rejects(f.gate().authorize(2, answer(randomUUID()), 'POST'));
  assert.equal(readFileSync(join(f.directory, 'active.json'), 'utf8'), after);
});
test('existing release archive is never overwritten', async t => {
  const f = await fixture(t), archive = join(f.directory, `${JSON.parse(f.claim).claimId}.released.json`);
  writeFileSync(archive, 'PRIVATE_RETAINED_ARCHIVE');
  await assert.rejects(f.gate().authorize(1, answer(f.next), 'POST'), e => e.publicResult.code === 'SLOT_STATE_INVALID');
  assert.equal(readFileSync(archive, 'utf8'), 'PRIVATE_RETAINED_ARCHIVE'); assert.equal(readFileSync(join(f.directory, 'active.json'), 'utf8'), f.claim);
});
for (const field of ['claimId', 'jobId']) test(`claim ${field} changes during asynchronous checks are not overwritten`, async t => {
  const f = await fixture(t), replacement = { ...JSON.parse(f.claim), [field]: randomUUID() };
  await assert.rejects(f.gate({ prepareHandoff: async handoff => {
    const encoded = await f.prepare(handoff); writeFileSync(join(f.directory, 'active.json'), JSON.stringify(replacement)); return encoded;
  } }).authorize(1, answer(f.next), 'POST'), e => e.publicResult.code === 'SLOT_STATE_INVALID');
  assert.deepEqual(JSON.parse(readFileSync(join(f.directory, 'active.json'))), replacement); assert.deepEqual(f.archives(), []);
});
test('Stop, preview and metadata never wait behind slow global event verification', async t => {
  const f = await fixture(t); let enter, release, timer;
  const entered = new Promise(r => enter = r), delay = new Promise(r => release = r);
  const gate = f.gate({ prepareHandoff: async handoff => { enter(); await delay; return f.prepare(handoff); } });
  const pending = gate.authorize(1, answer(f.next), 'POST'); await entered;
  const immediate = Promise.all([
    gate.authorize(1, `/api/jobs/${f.next}/stop`, 'POST'), gate.authorize(2, `/api/jobs/${randomUUID()}/read`, 'POST'), gate.authorize(3, '/api/runtime', 'GET')
  ]).then(() => true);
  const bypassed = await Promise.race([immediate, new Promise(r => timer = setTimeout(() => r(false), 100))]);
  clearTimeout(timer); release(); await pending;
  assert.equal(bypassed, true); assert.equal(f.archives().length, 1);
});
const resetReceipt = () => ({ cleared:true, resetScope:'WORKSPACE', clearScope:'CURRENT_RR_CONTEXT', executionHoldsCleared:false, aiStarted:false, rrContext:{id:randomUUID(),jobId:null,workbookId:null} });
test('successful Clear archives only its own idle reservation, retains uncertainty, and is idempotent',async t=>{
  const f=await fixture(t),g=f.gate(),before=readFileSync(join(f.workspace,'job.json'),'utf8');
  const result=await g.resetWorkspace(3,async()=>resetReceipt());assert.equal(result.sharedSlotReleased,true);assert.equal(result.sharedSlotStatus,'RELEASED');
  assert.equal(existsSync(join(f.directory,'active.json')),false);assert.equal(f.archives().length,1);assert.equal(readFileSync(join(f.directory,f.archives()[0]),'utf8'),f.claim);
  assert.equal(readFileSync(join(f.workspace,'job.json'),'utf8'),before);assert.equal(f.safety().uncertaintyBlocked,true);
  assert.equal((await g.resetWorkspace(3,async()=>resetReceipt())).sharedSlotStatus,'EMPTY');assert.equal(f.archives().length,1);
  const header=await g.authorize(1,answer(f.next),'POST');const gate=createSharedEventSafety({workspaceId:1});
  assert.throws(()=>gate({req:{method:'POST',originalUrl:answer(f.next),headers:{'x-cvent-event-safety':header}},record:{id:f.next},target:{apiEventId:f.eventId,evtstub:f.eventId}}),/Workspace 3/);
});
test('Clear in another workspace never probes, stops or releases the reservation owner',async t=>{
  const f=await fixture(t);let called=0;
  const result=await f.gate({clearance:async()=>{throw Error('Must not probe another owner');},prepareHandoff:async()=>{throw Error('Must not collect');}}).resetWorkspace(1,async()=>{called++;return resetReceipt();});
  assert.equal(called,1);assert.equal(result.sharedSlotReleased,false);assert.equal(result.sharedSlotStatus,'OTHER_WORKSPACE');f.unchanged();
});
for(const mode of ['rejected','malformed','resource-failure','offline-peer','owner-hold-omitted'])test(`reset ${mode} cannot falsely release a claim`,async t=>{
  const f=await fixture(t);const options={};
  if(mode==='resource-failure')options.clearance=async()=>false;
  if(mode==='offline-peer')options.prepareHandoff=async()=>{throw Error('offline');};
  if(mode==='owner-hold-omitted')options.prepareHandoff=async handoff=>{const p=JSON.parse(Buffer.from(await f.prepare(handoff),'base64'));p.inventories[2].holds=[];return Buffer.from(JSON.stringify(p)).toString('base64');};
  const action=()=>f.gate(options).resetWorkspace(3,async()=>{if(mode==='rejected')throw Error('Stop failed');return mode==='malformed'?{cleared:true}:resetReceipt();});
  if(['rejected','malformed'].includes(mode))await assert.rejects(action());
  else {const result=await action();assert.equal(result.cleared,true);assert.equal(result.sharedSlotStatus,'REVIEW_REQUIRED');assert.equal(result.sharedSlotReleased,false);}
  f.unchanged();
});
test('new and already queued handoffs in a resetting workspace cannot escape after Clear finishes; Stop stays responsive',async t=>{
  const f=await fixture(t);let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);let first=true;
  const g=f.gate({prepareHandoff:async h=>{if(first){first=false;enter();await wait;}return f.prepare(h);}});
  const handoff=g.authorize(3,answer(f.old),'POST');const rejected=assert.rejects(handoff,e=>e.publicResult.code==='WORKSPACE_RESETTING');await entered;
  let resetEnter,resetRelease;const resetEntered=new Promise(r=>resetEnter=r),resetWait=new Promise(r=>resetRelease=r);
  const resetting=g.resetWorkspace(3,async()=>{resetEnter();await resetWait;return resetReceipt();});await resetEntered;
  await assert.rejects(g.authorize(3,answer(f.next),'POST'),e=>e.publicResult.code==='WORKSPACE_RESETTING');
  await g.authorize(3,`/api/jobs/${f.old}/stop`,'POST');await g.authorize(1,'/api/jobs','POST');
  await assert.rejects(g.resetWorkspace(3,async()=>resetReceipt()));
  resetRelease();release();await rejected;assert.equal((await resetting).sharedSlotStatus,'RELEASED');assert.equal(existsSync(join(f.directory,'active.json')),false);
});
test('unknown event scope remains enforced after releasing cleanly stopped capacity',async t=>{
  const f=await fixture(t);f.save('job.json',{...f.record,target:{}});const g=f.gate();
  const result=await g.resetWorkspace(3,async()=>resetReceipt());assert.equal(result.sharedSlotStatus,'RELEASED');
  await assert.rejects(g.authorize(1,answer(f.next),'POST'),e=>e.publicResult.code==='UNSCOPED_EVENT_HOLD');
  assert.equal(existsSync(join(f.directory,'active.json')),false);
});
test('reset rechecks cleanup after peer reads and never overwrites an existing archive',async t=>{
  const f=await fixture(t);let calls=0;
  const result=await f.gate({clearance:async()=>++calls===1?f.safety():false}).resetWorkspace(3,async()=>resetReceipt());
  assert.equal(calls,2);assert.equal(result.sharedSlotStatus,'REVIEW_REQUIRED');f.unchanged();
  const archive=join(f.directory,`${JSON.parse(f.claim).claimId}.released.json`);writeFileSync(archive,'original archive');
  assert.equal((await f.gate().resetWorkspace(3,async()=>resetReceipt())).sharedSlotStatus,'REVIEW_REQUIRED');
  assert.equal(readFileSync(archive,'utf8'),'original archive');assert.equal(readFileSync(join(f.directory,'active.json'),'utf8'),f.claim);
});
test('no initial reservation is manufactured when shared event verification fails', async t => {
  const f = await fixture(t), directory = join(f.base, 'empty-slot');
  const gate = createExecutionSlot({ directory, clearance: async () => true, prepareHandoff: async () => { throw Error('offline'); } });
  await assert.rejects(gate.authorize(1, answer(f.next), 'POST'));
  assert.deepEqual(readdirSync(directory), []);
});
