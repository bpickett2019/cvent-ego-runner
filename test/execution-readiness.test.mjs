import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createExecutionSlot } from '../deploy/azure/execution-slot.mjs';
import { readExecutionStatus } from '../deploy/azure/event-safety.mjs';
import { executionReadiness } from '../public/execution-readiness.js';
import { executionSafety } from '../app/execution-clearance.mjs';
import { mkdirSync } from 'node:fs';
const protocol = 'shared-event-safety-v1', ports = [18781, 18782, 18783];
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'readiness-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const jobId = randomUUID(), eventId = randomUUID();
  let proof = { version: 1, jobId, cleared: false, resourcesCleared: true, uncertaintyBlocked: true, resourceBlockers: [], uncertaintyBlockers: ['BROWSER_SAVE_UNCERTAIN'] };
  const slot = createExecutionSlot({ directory, clearance: async () => proof, prepareHandoff: undefined });
  await slot.authorize(3, `/api/jobs/${jobId}/answer`, 'POST');
  const rows = [1, 2, 3].map(workspace => ({ protocol, workspace, enforced: true, complete: true, holds: workspace === 3 ? [{ jobId, eventId }] : [] }));
  const before = readFileSync(join(directory, 'active.json'), 'utf8');
  const fetchImpl = async url => { assert.match(url, /^http:\/\/127\.0\.0\.1:1878[123]\/api\/internal\/event-holds$/); return new Response(JSON.stringify(rows[Number(new URL(url).port) - 18781])); };
  return { directory, jobId, rows, slot, before, proof: value => proof = value, read: () => readExecutionStatus({ slot, ports, fetchImpl }), fetchImpl };
}
test('readiness distinguishes available capacity from retained event hold without changing a claim', async t => {
  const f = await fixture(t), status = await f.read();
  assert.equal(status.capacity, 'AVAILABLE'); assert.equal(status.eventSafety, 'SCOPED_HOLDS'); assert.equal(status.holdCount, 1);
  assert.deepEqual(status.owners, [{ workspace: 3, jobId: f.jobId, scope: 'event' }]);
  assert.equal(readFileSync(join(f.directory, 'active.json'), 'utf8'), f.before); assert.deepEqual(readdirSync(f.directory), ['active.json']);
  const view = executionReadiness(status); assert.match(view.capacity, /CAPACITY AVAILABLE/); assert.match(view.eventSafety, /require reconciliation/);
  assert.ok(view.owners[0].includes(f.jobId)); assert.match(view.detail, /does not clear these holds or start AI/);
  assert.equal(Object.hasOwn(status, 'nonce'), false); assert.equal(Object.hasOwn(status, 'inventories'), false);
});
test('an unsettled owner is denied without probing live native processes or operation ownership', t => {
  const root = mkdtempSync(join(tmpdir(), 'live-readiness-')), id = randomUUID(), workspace = join(root, 'data/jobs', id);
  t.after(() => rmSync(root, { recursive: true, force: true })); mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, 'job.json'), JSON.stringify({ id, status: 'RUNNING', phase: 'EXECUTING', ownedPid: process.pid, unresolvedChanges: [] }));
  let processProbes = 0; const status = executionSafety(root, id, () => { processProbes++; });
  assert.equal(status.resourcesCleared, false); assert.deepEqual(status.resourceBlockers, ['JOB_NOT_SETTLED']); assert.equal(processProbes, 0);
});
test('live resources stay reserved; unavailable proof never claims capacity available', async t => {
  const f = await fixture(t);
  f.proof({ version: 1, jobId: f.jobId, cleared: false, resourcesCleared: false, uncertaintyBlocked: false, resourceBlockers: ['JOB_NOT_SETTLED'], uncertaintyBlockers: [] });
  assert.equal((await f.read()).capacity, 'HELD'); assert.match(executionReadiness(await f.read()).capacity, /CAPACITY RESERVED/);
  f.proof(false); assert.equal((await f.read()).capacity, 'UNKNOWN');
});
test('unscoped uncertainty prevents readiness even when resources are clear', async t => {
  const f = await fixture(t); f.rows[2].holds = [{ jobId: null, eventId: null }];
  const status = await f.read(); assert.equal(status.capacity, 'REVIEW_BLOCKED'); assert.equal(status.eventSafety, 'UNSCOPED_HOLDS');
  assert.match(executionReadiness(status).eventSafety, /before any event can run/);
});
test('offline, old, incomplete or inconsistent inventories yield unknown, not all-clear', async t => {
  for (const mode of ['old', 'incomplete', 'omitted-holder', 'offline']) {
    const f = await fixture(t);
    if (mode === 'old') f.rows[1].enforced = false;
    if (mode === 'incomplete') f.rows[0].complete = false;
    if (mode === 'omitted-holder') f.rows[2].holds = [];
    const status = mode === 'offline' ? await readExecutionStatus({ slot: f.slot, ports, fetchImpl: async () => { throw Error('PRIVATE_SECRET'); } }) : await f.read();
    assert.equal(status.capacity, 'UNKNOWN'); assert.equal(status.eventSafety, 'UNKNOWN'); assert.equal(status.holdCount, null);
    assert.doesNotMatch(JSON.stringify(status), /PRIVATE/); assert.equal(readFileSync(join(f.directory, 'active.json'), 'utf8'), f.before);
  }
});
test('a changing claim cannot leave an available observation from the previous owner', async t => {
  const f = await fixture(t), replacement = { ...JSON.parse(f.before), jobId: randomUUID() };
  const status = await readExecutionStatus({ slot: f.slot, ports, fetchImpl: async url => {
    writeFileSync(join(f.directory, 'active.json'), JSON.stringify(replacement)); return f.fetchImpl(url);
  } });
  assert.equal(status.capacity, 'UNKNOWN'); assert.deepEqual(JSON.parse(readFileSync(join(f.directory, 'active.json'))), replacement);
});
test('bounded owner display retains total count and omits event identities and private fields', async t => {
  const f = await fixture(t);
  f.rows[0].holds = Array.from({ length: 15 }, () => ({ jobId: randomUUID(), eventId: randomUUID(), private: 'PRIVATE_NAME' }));
  const status = await f.read(); assert.equal(status.holdCount, 16); assert.equal(status.owners.length, 10);
  assert.doesNotMatch(JSON.stringify(status), /PRIVATE|eventId/); assert.match(executionReadiness(status).owners.at(-1), /6 more retained holds/);
});
test('old backend, stale responses, malformed fields and unsafe owner text never render ready', () => {
  const valid = { version: 1, scope: 'shared', checkedAt: new Date().toISOString(), capacity: 'AVAILABLE', holder: null, eventSafety: 'CLEAR', holdCount: 0, owners: [] };
  assert.match(executionReadiness(valid).eventSafety, /target\/login still require verification/);
  for (const value of [null, {}, { ...valid, scope: 'workspace' }, { ...valid, checkedAt: new Date(Date.now() - 31000).toISOString() },
    { ...valid, checkedAt: new Date(Date.now() + 60000).toISOString() }, { ...valid, holder: { workspace: 3, jobId: '<script>PRIVATE</script>' } },
    { ...valid, eventSafety: 'UNKNOWN', holdCount: null }, { ...valid, eventSafety: 'SCOPED_HOLDS', holdCount: 1 }]) {
    const view = executionReadiness(value); assert.equal(view.capacity, 'CAPACITY UNKNOWN'); assert.doesNotMatch(JSON.stringify(view), /PRIVATE/);
  }
});
