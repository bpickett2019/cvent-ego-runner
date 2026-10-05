import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWorkspaceSlots } from '../deploy/azure/workspace-slots.mjs';
import { createSharedEventSafety } from '../app/shared-event-safety.mjs';
import { readExecutionStatus } from '../deploy/azure/event-safety.mjs';
import { executionReadiness } from '../public/execution-readiness.js';

const answer = id => `/api/jobs/${id}/answer`;
const resetReceipt = () => ({ cleared: true, resetScope: 'WORKSPACE', clearScope: 'CURRENT_RR_CONTEXT', aiStarted: false, executionHoldsCleared: false });
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'concurrent-builds-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const targets = [1, 2, 3].map(workspace => ({ protocol: 'workspace-event-target-v1', workspace, jobId: randomUUID(), contextId: randomUUID(), eventId: randomUUID(), canRebind: true }));
  const rows = [1, 2, 3].map(workspace => ({ protocol: 'shared-event-safety-v1', workspace, enforced: true, complete: true, eventLeasesEnforced: true, holds: [] }));
  const cleaned = new Set(), uncertain = new Set();
  const clearance = async owner => ({ version: 1, jobId: owner.jobId, cleared: cleaned.has(owner.jobId) && !uncertain.has(owner.jobId), resourcesCleared: cleaned.has(owner.jobId), uncertaintyBlocked: uncertain.has(owner.jobId), resourceBlockers: cleaned.has(owner.jobId) ? [] : ['JOB_NOT_SETTLED'], uncertaintyBlockers: uncertain.has(owner.jobId) ? ['BROWSER_SAVE_UNCERTAIN'] : [] });
  const options = { directory, clearance, resolveTarget: async ({ workspace, jobId }) => { const r = targets[workspace - 1]; if (r.jobId !== jobId) throw Error('Wrong job'); return structuredClone(r); }, collectInventories: async () => structuredClone(rows) };
  const gate = createWorkspaceSlots(options);
  const state = () => JSON.parse(readFileSync(join(directory, 'workspace-active.json'), 'utf8'));
  const enter = async (workspace, g = gate) => { const a = await g.authorize(workspace, answer(targets[workspace - 1].jobId), 'POST'); a.finish(); return a; };
  return { directory, targets, rows, cleaned, uncertain, options, gate, state, enter };
}
test('three distinct events are admitted concurrently; each backend independently validates its lease and capability boundary', async t => {
  const f = fixture(t), entries = await Promise.all([1, 2, 3].map(w => f.enter(w)));
  assert.equal(f.state().claims.length, 3);
  for (const [i, entry] of entries.entries()) {
    const target = f.targets[i], record = { id: target.jobId, contextId: target.contextId };
    const verify = createSharedEventSafety({ workspaceId: i + 1, requireEventLease: true });
    verify({ req: { method: 'POST', originalUrl: answer(target.jobId), headers: { 'x-cvent-event-safety': entry.header } }, record, target: { apiEventId: target.eventId, evtstub: target.eventId } });
    assert.deepEqual(record.executionCapabilities, { concurrentWorkspaces: 3, sharedContactTypeCreation: false });
  }
});
test('two simultaneous claims for the same event admit exactly one, without changing the other workspace', async t => {
  const f = fixture(t); f.targets[1].eventId = f.targets[0].eventId;
  const results = await Promise.allSettled([f.enter(1), f.enter(2)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.publicResult.code, 'EVENT_ALREADY_RUNNING');
  assert.equal(f.state().claims.length, 1);
  await f.enter(3); assert.equal(f.state().claims.length, 2);
});
test('only one handoff per workspace is in flight, and Stop/preview remain unqueued', async t => {
  const f = fixture(t), first = await f.gate.authorize(1, answer(f.targets[0].jobId), 'POST');
  await assert.rejects(f.enter(1), e => e.publicResult.code === 'WORKSPACE_HANDOFF_BUSY');
  await f.gate.authorize(1, `/api/jobs/${f.targets[0].jobId}/stop`, 'POST');
  await f.gate.authorize(2, `/api/jobs/${f.targets[1].jobId}/read`, 'POST');
  await f.enter(2); first.finish(); await f.enter(1);
});
test('a restart retains all three live reservations and cannot admit a replacement owner', async t => {
  const f = fixture(t); await Promise.all([1, 2, 3].map(w => f.enter(w)));
  const before = readFileSync(join(f.directory, 'workspace-active.json'), 'utf8');
  const restarted = createWorkspaceSlots(f.options); f.targets[0] = { ...f.targets[0], jobId: randomUUID(), contextId: randomUUID() };
  await assert.rejects(f.enter(1, restarted), e => e.publicResult.code === 'EXECUTION_SLOT_HELD');
  assert.equal(readFileSync(join(f.directory, 'workspace-active.json'), 'utf8'), before);
});
test('clearing one workspace archives its exact state and leaves other live claims untouched', async t => {
  const f = fixture(t); await Promise.all([1, 2, 3].map(w => f.enter(w)));
  const before = f.state(), originalBytes = readFileSync(join(f.directory, 'workspace-active.json'), 'utf8');
  f.cleaned.add(f.targets[0].jobId);
  const result = await f.gate.resetWorkspace(1, async () => resetReceipt());
  assert.equal(result.sharedSlotStatus, 'RELEASED');
  assert.deepEqual(f.state().claims, before.claims.filter(c => c.workspace !== 1));
  assert.equal(readFileSync(join(f.directory, 'workspace-history', `${before.revision}.json`), 'utf8'), originalBytes);
  assert.equal((await f.gate.resetWorkspace(1, async () => resetReceipt())).sharedSlotStatus, 'OTHER_WORKSPACE');
});
test('failed or unproven cleanup never releases a workspace reservation', async t => {
  const f = fixture(t); await f.enter(1); const before = f.state();
  const result = await f.gate.resetWorkspace(1, async () => resetReceipt());
  assert.equal(result.sharedSlotStatus, 'REVIEW_REQUIRED'); assert.deepEqual(f.state(), before);
  await assert.rejects(f.gate.resetWorkspace(1, async () => { throw Error('Backend refused'); })); assert.deepEqual(f.state(), before);
});
test('scoped write uncertainty blocks only its event; other event builds still start and evidence is retained', async t => {
  const f = fixture(t); f.rows[0].holds.push({ jobId: randomUUID(), eventId: f.targets[0].eventId });
  await assert.rejects(f.enter(1), e => e.publicResult.code === 'EVENT_RECONCILIATION_REQUIRED');
  await Promise.all([f.enter(2), f.enter(3)]); assert.equal(f.state().claims.length, 2); assert.equal(f.rows[0].holds.length, 1);
});
test('unknown scope and old/incomplete peers refuse a new grant without erasing or creating claims', async t => {
  for (const mode of ['unknown', 'old', 'incomplete']) {
    const f = fixture(t);
    if (mode === 'unknown') f.rows[2].holds.push({ jobId: null, eventId: null });
    if (mode === 'old') delete f.rows[1].eventLeasesEnforced;
    if (mode === 'incomplete') f.rows[1].complete = false;
    await assert.rejects(f.enter(1), e => e.publicResult.code === (mode === 'unknown' ? 'UNSCOPED_EVENT_HOLD' : 'SHARED_EVENT_SAFETY_UNAVAILABLE'));
    assert.equal(existsSync(join(f.directory, 'workspace-active.json')), false);
  }
});
test('settled uncertain resources may release their workspace but do not clear the event hold', async t => {
  const f = fixture(t); await f.enter(1); f.cleaned.add(f.targets[0].jobId); f.uncertain.add(f.targets[0].jobId);
  f.rows[0].holds.push({ jobId: f.targets[0].jobId, eventId: f.targets[0].eventId });
  assert.equal((await f.gate.resetWorkspace(1, async () => resetReceipt())).sharedSlotStatus, 'RELEASED');
  f.targets[1].eventId = f.targets[0].eventId;
  await assert.rejects(f.enter(2), e => e.publicResult.code === 'EVENT_RECONCILIATION_REQUIRED');
  await f.enter(3);
});
test('a completed event reservation does not indefinitely block a new workspace after cleanup proof', async t => {
  const f = fixture(t); await f.enter(1); f.cleaned.add(f.targets[0].jobId); f.targets[1].eventId = f.targets[0].eventId;
  await f.enter(2); assert.equal(f.state().claims.length, 2); // Old exact claim is preserved, not silently deleted.
});
test('legacy single-slot evidence migrates only after proven cleanup and is archived byte-for-byte', async t => {
  const f = fixture(t), old = { version: 1, workspace: 3, jobId: randomUUID(), claimId: randomUUID(), acquiredAt: new Date().toISOString() };
  const bytes = JSON.stringify(old) + '\n'; writeFileSync(join(f.directory, 'active.json'), bytes);
  await assert.rejects(f.enter(1), e => e.publicResult.code === 'EXECUTION_SLOT_HELD');
  assert.equal(readFileSync(join(f.directory, 'active.json'), 'utf8'), bytes);
  f.cleaned.add(old.jobId); await f.enter(1);
  assert.equal(existsSync(join(f.directory, 'active.json')), false);
  assert.equal(readFileSync(join(f.directory, `${old.claimId}.released.json`), 'utf8'), bytes);
});
test('legacy archive collision and malformed concurrent state fail closed', async t => {
  const f = fixture(t), old = { workspace: 1, jobId: randomUUID(), claimId: randomUUID() };
  writeFileSync(join(f.directory, 'active.json'), JSON.stringify(old)); writeFileSync(join(f.directory, `${old.claimId}.released.json`), 'retained'); f.cleaned.add(old.jobId);
  await assert.rejects(f.enter(1), e => e.publicResult.code === 'SLOT_STATE_INVALID'); assert.equal(readFileSync(join(f.directory, `${old.claimId}.released.json`), 'utf8'), 'retained');
  const g = fixture(t); writeFileSync(join(g.directory, 'workspace-active.json'), '{bad');
  await assert.rejects(g.enter(1), e => e.publicResult.code === 'SLOT_STATE_INVALID');
});
test('same-job event correction is allowed only in verified setup, never for a bound running target', async t => {
  const f = fixture(t); await f.enter(1); const old = f.state().claims[0];
  f.targets[0].eventId = randomUUID(); f.targets[0].canRebind = false;
  await assert.rejects(f.enter(1), e => e.publicResult.code === 'TARGET_BINDING_CHANGED'); assert.deepEqual(f.state().claims[0], old);
  f.targets[0].canRebind = true; await f.enter(1); assert.notEqual(f.state().claims[0].claimId, old.claimId);
  f.targets[0].contextId = randomUUID(); await assert.rejects(f.enter(1), e => e.publicResult.code === 'TARGET_BINDING_CHANGED');
});
test('event identity change during preflight yields no reservation', async t => {
  const f = fixture(t); let calls = 0;
  const gate = createWorkspaceSlots({ ...f.options, resolveTarget: async x => { const value = await f.options.resolveTarget(x); if (++calls === 2) value.eventId = randomUUID(); return value; } });
  await assert.rejects(f.enter(1, gate), e => e.publicResult.code === 'TARGET_BINDING_CHANGED'); assert.equal(existsSync(join(f.directory, 'workspace-active.json')), false);
});
test('reset fences an already pending handoff while other workspaces remain usable', async t => {
  const f = fixture(t); let entered, release; const started = new Promise(r => entered = r), wait = new Promise(r => release = r);
  const gate = createWorkspaceSlots({ ...f.options, resolveTarget: async x => { if (x.workspace === 1) { entered(); await wait; } return f.options.resolveTarget(x); } });
  const pending = f.enter(1, gate); const denied = assert.rejects(pending, e => e.publicResult.code === 'WORKSPACE_RESETTING'); await started;
  await gate.resetWorkspace(1, async () => resetReceipt()); await f.enter(2, gate); release(); await denied;
  assert.deepEqual(f.state().claims.map(c => c.workspace), [2]);
});
test('abandoned requests, unavailable proof and forbidden canonical aliases cannot dispatch', async t => {
  const f = fixture(t); await assert.rejects(f.gate.authorize(1, answer(f.targets[0].jobId), 'POST', { cancelled: () => true }));
  for (const route of [answer(f.targets[0].jobId) + '/', answer(f.targets[0].jobId) + '?x=1', '/api/target', `/api/jobs/${f.targets[0].jobId}/start`]) await assert.rejects(f.gate.authorize(1, route, 'POST'));
  assert.equal(existsSync(join(f.directory, 'workspace-active.json')), false);
});
for (const mode of ['wrong-event', 'wrong-context', 'no-lease', 'old-peer', 'allows-shared-create']) test(`backend refuses ${mode} before execution`, async t => {
  const f = fixture(t), entry = await f.enter(1), target = f.targets[0], grant = JSON.parse(Buffer.from(entry.header, 'base64'));
  if (mode === 'wrong-event') grant.lease.eventId = randomUUID();
  if (mode === 'wrong-context') grant.lease.contextId = randomUUID();
  if (mode === 'no-lease') delete grant.lease;
  if (mode === 'old-peer') delete grant.inventories[2].eventLeasesEnforced;
  if (mode === 'allows-shared-create') grant.lease.sharedContactTypeCreation = true;
  const verify = createSharedEventSafety({ workspaceId: 1, requireEventLease: true });
  assert.throws(() => verify({ req: { method: 'POST', originalUrl: answer(target.jobId), headers: { 'x-cvent-event-safety': Buffer.from(JSON.stringify(grant)).toString('base64') } }, record: { id: target.jobId, contextId: target.contextId }, target: { apiEventId: target.eventId, evtstub: target.eventId } }));
});
test('workspace readiness reports independent capacity and never labels another live workspace as this one held', async t => {
  const f = fixture(t); await f.enter(1); await f.enter(2); const ports = [18781, 18782, 18783];
  const fetchImpl = async url => new Response(JSON.stringify(f.rows[Number(new URL(url).port) - 18781]));
  const idle = await readExecutionStatus({ slot: f.gate, ports, workspace: 3, concurrent: true, fetchImpl });
  assert.equal(idle.capacity, 'AVAILABLE'); assert.equal(idle.availableWorkspaces, 1); assert.equal(idle.holder, null);
  assert.match(executionReadiness(idle).capacity, /WORKSPACE 3 AVAILABLE/);
  assert.match(executionReadiness(idle).detail, /1\/3 workspace reservations available/);
  const busy = await readExecutionStatus({ slot: f.gate, ports, workspace: 1, concurrent: true, fetchImpl });
  assert.equal(busy.capacity, 'HELD'); assert.match(executionReadiness(busy).capacity, /other workspaces have independent capacity/);
  assert.doesNotMatch(JSON.stringify(idle), /eventId|contextId|claimId/);
});
