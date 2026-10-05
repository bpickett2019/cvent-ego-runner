import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { executionSafety, executionCleared } from '../app/execution-clearance.mjs';
import { eventHistory } from '../app/event-history.mjs';
import { writeUncertainty } from '../app/write-uncertainty.mjs';
import { createExecutionSlot, slotErrorResponse } from '../deploy/azure/execution-slot.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'execution-safety-')), id = randomUUID(), workspace = join(root, 'data/jobs', id);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(workspace, 'receipts'), { recursive: true }); mkdirSync(join(workspace, 'reports')); mkdirSync(join(root, 'data/current'));
  const record = { id, status: 'STOPPED', phase: 'SETTLED', finishedAt: new Date().toISOString(), sessionPrepared: false,
    spendingUnreconciled: false, piCostUSD: 2, stopFailures: [], unresolvedChanges: [], ownedPid: null,
    target: { apiEventId: 'event-a', evtstub: 'event-a', name: 'PRIVATE_EVENT_NAME' } };
  const save = (name, value) => writeFileSync(join(workspace, name), JSON.stringify(value));
  save('job.json', record); save('runtime.json', { ownership: 'USER' }); save('receipts/steel-cleanup.json', { status: 'STOPPED' });
  return { root, id, workspace, record, save, safety: () => executionSafety(root, id, () => {}),
    history: (target = { apiEventId: 'event-a', evtstub: 'event-a' }) => eventHistory(join(root, 'data/jobs'), randomUUID(), target, { allowanceUSD: 60, externalCostReserveUSD: 10 }) };
}
test('resource proof and write uncertainty are distinct, but strict clearance still requires both', t => {
  const f = fixture(t); assert.equal(f.safety().cleared, true);
  f.save('browser-save-uncertain.json', { privateField: 'PRIVATE_VALUE' });
  f.save('job.json', { ...f.record, unresolvedChanges: ['PRIVATE_TOOL_ARGUMENT'], browserFailureGuard: { executionUncertain: true } });
  const before = ['job.json', 'browser-save-uncertain.json'].map(p => readFileSync(join(f.workspace, p), 'utf8'));
  const state = f.safety();
  assert.equal(state.resourcesCleared, true); assert.equal(state.uncertaintyBlocked, true); assert.equal(state.cleared, false);
  assert.equal(executionCleared(f.root, f.id, () => {}), false);
  assert.deepEqual(state.resourceBlockers, []); assert.ok(state.uncertaintyBlockers.includes('BROWSER_SAVE_UNCERTAIN'));
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE/);
  assert.deepEqual(['job.json', 'browser-save-uncertain.json'].map(p => readFileSync(join(f.workspace, p), 'utf8')), before);
});
for (const [name, value] of [
  ['api-write-uncertain.json', {}], ['browser-save-uncertain.json', {}],
  ['unresolved-changes.json', { changes: ['PRIVATE'] }], ['reports/final-report.json', { uncertainWrites: ['PRIVATE'] }],
  ['unresolved-changes.json', { changes: 'PRIVATE_MALFORMED' }], ['reports/final-report.json', null],
]) test(`retained ${name}/${JSON.stringify(value)} gates event work independently of resources`, t => {
  const f = fixture(t); f.save(name, value);
  assert.equal(f.safety().resourcesCleared, true); assert.equal(f.safety().cleared, false);
  assert.throws(f.history, /reconciliation/);
  assert.equal(f.history({ apiEventId: 'event-b', evtstub: 'event-b' }).priorEventCostUSD, 0);
});
for (const patch of [{ spendingUnreconciled: true }, { piCostUSD: null }, { sessionPrepared: true }, { status: 'RUNNING' }, { stopFailures: ['PRIVATE'] }, { ownedPid: 'invalid' }]) {
  test(`resource failure ${Object.keys(patch)[0]} cannot become release permission`, t => {
    const f = fixture(t); f.save('job.json', { ...f.record, ...patch });
    assert.equal(f.safety().resourcesCleared, false); assert.equal(f.safety().cleared, false);
    assert.doesNotMatch(JSON.stringify(f.safety()), /PRIVATE/);
  });
}
test('a surviving native process group blocks even after its leader exits', t => {
  const f = fixture(t); f.save('job.json', { ...f.record, ownedPid: 12345 }); const checked = [];
  const safety = executionSafety(f.root, f.id, pid => { checked.push(pid); if (pid === -12345) throw Error('group alive'); });
  assert.deepEqual(checked, [12345, -12345]); assert.equal(safety.resourcesCleared, false);
  assert.deepEqual(safety.resourceBlockers, ['NATIVE_PROCESS_OR_GROUP_PRESENT']);
});
for (const marker of ['operation.lock', 'api-operation.lock']) test(`${marker} ownership remains a resource hold`, t => {
  const f = fixture(t); f.save(marker, {}); assert.equal(f.safety().resourcesCleared, false);
});
test('missing, malformed and symlinked safety evidence fails closed without exposing contents', t => {
  const f = fixture(t);
  writeFileSync(join(f.workspace, 'job.json'), '{PRIVATE_INVALID_JSON');
  assert.equal(f.safety().resourcesCleared, false); assert.doesNotMatch(JSON.stringify(f.safety()), /PRIVATE/);
  f.save('job.json', f.record); rmSync(join(f.workspace, 'runtime.json'));
  symlinkSync(join(f.workspace, 'job.json'), join(f.workspace, 'runtime.json'));
  assert.equal(f.safety().resourcesCleared, false);
  symlinkSync(join(f.root, 'missing-private-evidence'), join(f.workspace, 'browser-save-uncertain.json'));
  assert.equal(writeUncertainty(f.workspace).blocked, true); assert.throws(f.history, /reconciliation/);
});
test('malformed record uncertainty and dangling report directories fail closed', t => {
  const f = fixture(t);
  for (const patch of [{ unresolvedChanges: null }, { browserFailureGuard: {} }, { browserFailureGuard: 'PRIVATE' }]) {
    f.save('job.json', { ...f.record, ...patch });
    assert.equal(f.safety().uncertaintyBlocked, true); assert.throws(f.history, /reconciliation/);
  }
  f.save('job.json', f.record); rmSync(join(f.workspace, 'reports'), { recursive: true });
  symlinkSync(join(f.root, 'missing-private-directory'), join(f.workspace, 'reports'));
  assert.equal(f.safety().cleared, false); assert.throws(f.history, /reconciliation/);
});
test('same-event identity is ID-bound; unknown or conflicting identity cannot evade a hold', t => {
  const f = fixture(t); f.save('browser-save-uncertain.json', {});
  for (const target of [undefined, {}, { apiEventId: 'event-a', evtstub: 'event-b' }, { apiEventId: 123, evtstub: 'event-b' }]) {
    f.save('job.json', { ...f.record, target });
    assert.throws(() => f.history({ apiEventId: 'event-z', evtstub: 'event-z' }), /unconfirmed event identity/);
  }
  f.save('job.json', { ...f.record, target: { ...f.record.target, name: 'RENAMED_EVENT' } });
  assert.throws(f.history, /reconciliation/);
  assert.equal(f.history({ apiEventId: 'event-b', name: 'PRIVATE_EVENT_NAME' }).evidence.length, 0);
});
test('an orphan uncertainty record cannot disappear just because job.json is missing', t => {
  const f = fixture(t); f.save('api-write-uncertain.json', {}); rmSync(join(f.workspace, 'job.json'));
  assert.throws(() => f.history({ evtstub: 'event-z' }), /unconfirmed event identity/);
});
test('ordinary incomplete reports do not become execution instructions or event holds', t => {
  const f = fixture(t); f.save('reports/final-report.json', { status: 'INCOMPLETE', unfinishedTask: 'PRIVATE_OLD_TASK', uncertainWrites: [] });
  assert.equal(f.safety().cleared, true); assert.equal(f.history().priorEventCostUSD, 2);
  assert.doesNotMatch(JSON.stringify(f.history()), /PRIVATE_OLD_TASK/);
});
test('gateway names a sanitized blocking owner and never releases on resource proof alone', async t => {
  const f = fixture(t), directory = join(f.root, 'slot'), next = randomUUID();
  f.save('browser-save-uncertain.json', { secret: 'PRIVATE' });
  const gate = createExecutionSlot({ directory, clearance: async () => f.safety() });
  await gate.authorize(1, `/api/jobs/${f.id}/answer`, 'POST');
  const before = readFileSync(join(directory, 'active.json'), 'utf8');
  for (const workspace of [1, 2, 3]) {
    await assert.rejects(gate.authorize(workspace, `/api/jobs/${next}/answer`, 'POST'), error => {
      const body = slotErrorResponse(error);
      assert.equal(body.code, 'EVENT_RECONCILIATION_REQUIRED'); assert.deepEqual(body.blockingRun, { workspace: 1, jobId: f.id });
      assert.match(body.error, /Resource\/spending checks pass/); assert.doesNotMatch(JSON.stringify(body), /PRIVATE/); return true;
    });
  }
  assert.equal(readFileSync(join(directory, 'active.json'), 'utf8'), before);
});
test('malformed, foreign-job, contradictory or offline proofs never release a claim', async t => {
  const f = fixture(t), directory = join(f.root, 'slot'); let value = null;
  const gate = createExecutionSlot({ directory, clearance: async () => { if (value instanceof Error) throw value; return value; } });
  await gate.authorize(1, `/api/jobs/${f.id}/answer`, 'POST');
  const before = readFileSync(join(directory, 'active.json'), 'utf8');
  for (value of [{ cleared: true }, { ...f.safety(), jobId: randomUUID() }, { ...f.safety(), uncertaintyBlocked: true }, { ...f.safety(), version: 99 }, new Error('PRIVATE_BACKEND_DETAIL')]) {
    await assert.rejects(gate.authorize(2, `/api/jobs/${randomUUID()}/answer`, 'POST'), error => {
      const body = slotErrorResponse(error); assert.equal(body.code, 'CLEARANCE_UNAVAILABLE'); assert.doesNotMatch(JSON.stringify(body), /PRIVATE/); return true;
    });
    assert.equal(readFileSync(join(directory, 'active.json'), 'utf8'), before);
  }
  value = f.safety(); await gate.authorize(2, `/api/jobs/${randomUUID()}/answer`, 'POST');
});
test('route denials and unexpected errors cannot leak arbitrary exception content', async t => {
  const f = fixture(t), gate = createExecutionSlot({ directory: join(f.root, 'slot'), clearance: async () => true });
  await assert.rejects(gate.authorize(1, '/api/target?PRIVATE', 'POST'), error => {
    assert.equal(slotErrorResponse(error).code, 'ROUTE_DENIED'); assert.doesNotMatch(JSON.stringify(slotErrorResponse(error)), /PRIVATE/); return true;
  });
  assert.equal(slotErrorResponse(new Error('PRIVATE_URL_PASSWORD')).code, 'SLOT_STATE_INVALID');
  assert.doesNotMatch(JSON.stringify(slotErrorResponse(new Error('PRIVATE_URL_PASSWORD'))), /PRIVATE/);
});
