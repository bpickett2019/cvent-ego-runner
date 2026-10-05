import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createExecutionSlot } from '../deploy/azure/execution-slot.mjs';
import { executionCleared } from '../app/execution-clearance.mjs';
import { acquireApiLease, API_GUARD_FILE } from '../app/api-operation-lease.mjs';
import { eventHistory } from '../app/event-history.mjs';
import { reportedCompletion } from '../app/rr-connection.mjs';
const dir = () => mkdtempSync(join(tmpdir(), 'execution-slot-'));
const answer = id => `/api/jobs/${id}/answer`;

test('three simultaneous handoffs admit exactly one; restart and failed dispatch retain it', async () => {
  const directory = dir(), ids = [randomUUID(), randomUUID(), randomUUID()];
  const gate = createExecutionSlot({ directory, clearance: async () => false });
  const results = await Promise.allSettled(ids.map((id, i) => gate.authorize(i + 1, answer(id), 'POST')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const before = readFileSync(join(directory, 'active.json'), 'utf8');
  const restarted = createExecutionSlot({ directory, clearance: async () => { throw Error('offline'); } });
  await assert.rejects(restarted.authorize(2, answer(ids[1]), 'POST'));
  await restarted.authorize(1, answer(ids[0]), 'POST'); // Same reservation; backend decides whether a setup handoff is still eligible.
  assert.equal(readFileSync(join(directory, 'active.json'), 'utf8'), before);
  await restarted.authorize(1, `/api/jobs/${ids[0]}/rpc`, 'POST');
  await assert.rejects(restarted.authorize(2, `/api/jobs/${ids[1]}/rpc`, 'POST'));
  for (const op of ['stop', 'read']) await restarted.authorize(2, `/api/jobs/${ids[1]}/${op}`, 'POST');
});
test('same-job resume retains the exact paid claim and never acquires an empty slot', async () => {
  const directory=dir(), id=randomUUID(), other=randomUUID();let checks=0;
  const gate=createExecutionSlot({directory,clearance:async()=>{checks++;return false;}});
  const resume=`/api/jobs/${id}/resume`;
  await assert.rejects(gate.authorize(1,resume,'POST'));
  await gate.authorize(1,answer(id),'POST');const before=readFileSync(join(directory,'active.json'),'utf8');
  await gate.authorize(1,resume,'POST');await gate.authorize(1,resume,'POST');
  assert.equal(checks,0);assert.equal(readFileSync(join(directory,'active.json'),'utf8'),before);
  for(const [workspace,path] of [[2,resume],[1,`/api/jobs/${other}/resume`],[1,resume+'/'],[1,resume+'?x=1']])await assert.rejects(gate.authorize(workspace,path,'POST'));
  await assert.rejects(gate.authorize(2,answer(other),'POST'));
  assert.equal(readFileSync(join(directory,'active.json'),'utf8'),before);
  assert.equal(readdirSync(directory).filter(n=>n.endsWith('.released.json')).length,0);
  // A restarted gateway may forward to the holder; backend active/native proof is still required.
  await createExecutionSlot({directory,clearance:async()=>false}).authorize(1,resume,'POST');
});

test('only positive clearance releases slot, preserving durable previous claim', async () => {
  const directory = dir(), first = randomUUID(), second = randomUUID(); let clear = false;
  const gate = createExecutionSlot({ directory, clearance: async held => { assert.equal(held.jobId, first); return clear; } });
  await gate.authorize(1, answer(first), 'POST');
  await assert.rejects(gate.authorize(2, answer(second), 'POST'));
  clear = true; await gate.authorize(2, answer(second), 'POST');
  assert.equal(JSON.parse(readFileSync(join(directory, 'active.json'))).jobId, second);
  assert.equal(readdirSync(directory).filter(n => n.endsWith('.released.json')).length, 1);
});
test('alternate Express route spellings and legacy execution cannot bypass slot', async () => {
  const gate = createExecutionSlot({ directory: dir(), clearance: async () => false });
  const id = randomUUID();
  for (const path of [answer(id) + '/', answer(id) + '?x=1', answer(id).replace('api', 'API'), answer(id).replace('answer', '%61nswer'), '/api/target', '/api/return-agent', `/api/jobs/${id}/start`, `/api/jobs/${id}/continue`]) await assert.rejects(gate.authorize(1, path, 'POST'));
  await assert.rejects(gate.authorize(1, answer(id), 'PUT'));
  await gate.authorize(2, '/api/jobs', 'POST');
});
test('corrupt slot fails closed', async () => {
  const directory = dir(); writeFileSync(join(directory, 'active.json'), '{');
  await assert.rejects(createExecutionSlot({ directory, clearance: async () => true }).authorize(1, answer(randomUUID()), 'POST'));
});
function fixture() {
  const root = dir(), id = randomUUID(), workspace = join(root, 'data/jobs', id);
  mkdirSync(join(workspace, 'receipts'), { recursive: true }); mkdirSync(join(workspace, 'reports')); mkdirSync(join(root, 'data/current'), { recursive: true });
  const record = { id, status: 'INCOMPLETE', phase: 'SETTLED', finishedAt: new Date().toISOString(), sessionPrepared: false, spendingUnreconciled: false, piCostUSD: 1, stopFailures: [], unresolvedChanges: [], ownedPid: 123 };
  const save = (file, data) => writeFileSync(join(workspace, file), JSON.stringify(data));
  save('job.json', record); save('runtime.json', { ownership: 'USER' }); save('receipts/steel-cleanup.json', { status: 'STOPPED' });
  return { root, id, workspace, record, save };
}
test('clearance requires terminal job, gone process and stopped browser', () => {
  const f = fixture(); assert.equal(executionCleared(f.root, f.id, () => {}), true);
  assert.equal(executionCleared(f.root, f.id, () => { throw Error('alive'); }), false);
  for (const patch of [{ status: 'RUNNING' }, { stopFailures: ['failed'] }, { unresolvedChanges: ['write'] }, { spendingUnreconciled: true }, { sessionPrepared: true }, { apiUnresolved: {} }, { browserFailureGuard: { executionUncertain: true } }]) {
    f.save('job.json', { ...f.record, ...patch }); assert.equal(executionCleared(f.root, f.id, () => {}), false);
  }
  f.save('job.json', f.record); f.save('receipts/steel-cleanup.json', { status: 'UNKNOWN' });
  assert.equal(executionCleared(f.root, f.id, () => {}), false);
});
test('kernel ownership gates clearance, history and completion; free guard files do not certify uncertain writes', () => {
  const f=fixture();f.record.ownedPid=null;f.record.target={evtstub:'fixture'};f.save('job.json',f.record);
  f.save('reports/final-report.json',{eventId:'fixture',status:'DONE',completion:{requirements:true,draft:true},blockers:[],untested:[]});
  const history=()=>eventHistory(join(f.root,'data/jobs'),randomUUID(),{evtstub:'fixture'},{allowanceUSD:60,externalCostReserveUSD:10});
  const lease=acquireApiLease(f.workspace);
  try{
    assert.equal(executionCleared(f.root,f.id,()=>{}),false);assert.equal(reportedCompletion(f.workspace,'fixture'),'INCOMPLETE');
    assert.throws(history,/locks/);
  }finally{lease.release();}
  assert.equal(executionCleared(f.root,f.id,()=>{}),true);assert.equal(reportedCompletion(f.workspace,'fixture'),'DONE');
  assert.equal(history().evidence.length,1);assert.equal(readFileSync(join(f.workspace,API_GUARD_FILE),'utf8'),'');
  f.save('api-write-uncertain.json',{intent:'retain'});
  assert.equal(executionCleared(f.root,f.id,()=>{}),false);assert.equal(reportedCompletion(f.workspace,'fixture'),'INCOMPLETE');
});

test('uncertainty, operation locks and malformed reports never clear automatically', () => {
  for (const file of ['browser-save-uncertain.json', 'api-write-uncertain.json', 'operation.lock', 'api-operation.lock', 'unresolved-changes.json']) {
    const f = fixture(); f.save(file, {}); assert.equal(executionCleared(f.root, f.id, () => {}), false);
  }
  const f = fixture(); f.save('reports/final-report.json', { uncertainWrites: ['unverified save'] });
  assert.equal(executionCleared(f.root, f.id, () => {}), false);
});
