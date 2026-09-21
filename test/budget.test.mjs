import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { budgetTotals, resetRunBudget } from '../app/budget.mjs';
import { eventHistory } from '../app/event-history.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'rr-budget-')), jobs = join(root, 'jobs');
  mkdirSync(jobs); t.after(() => rmSync(root, { recursive: true, force: true }));
  const record = { id: 'old', status: 'INCOMPLETE', piCostUSD: 49.9, target: { evtstub: 'event' } };
  mkdirSync(join(jobs, record.id));
  const save = value => writeFileSync(join(jobs, record.id, 'job.json'), JSON.stringify(value));
  save(record);
  return { root, jobs, record, save, history: () => eventHistory(jobs, 'new', { evtstub: 'event' }, { allowanceUSD: 60, externalCostReserveUSD: 10 }) };
}
test('authorized reset preserves historical records/evidence and credits only captured costs', t => {
  const f = fixture(t), path = join(f.jobs, 'old/job.json'), before = readFileSync(path);
  assert.equal(f.history().priorEventCostUSD, 49.9);
  const reset = resetRunBudget(f.jobs, 'User explicitly requested clearing run costs');
  assert.equal(reset.spentUSD, 0); assert.equal(reset.historicalUSD, 49.9);
  assert.deepEqual(readFileSync(path), before);
  const history = f.history();
  assert.equal(history.priorEventCostUSD, 0); assert.equal(history.evidence[0].sessionCostUSD, 49.9);
  assert.equal(history.budgetResetId, reset.resetId);
  assert.equal(history.allowanceUSD, 60); assert.equal(history.externalCostReserveUSD, 10);
  assert.equal(budgetTotals(f.jobs, [f.record, { id: 'new', piCostUSD: 3 }]).spentUSD, 3);
  assert.ok(Math.abs(budgetTotals(f.jobs, [{ ...f.record, piCostUSD: 50.9 }]).spentUSD - 1) < 1e-8);
  assert.throws(() => budgetTotals(f.jobs, [{ ...f.record, piCostUSD: 1 }]), /Historical cost changed/);
  const again = resetRunBudget(f.jobs, 'Second explicit authorization');
  assert.notEqual(reset.resetId, again.resetId);
  assert.ok(readFileSync(join(f.root, `budget-reset-${reset.resetId}.json`)).length);
});
test('historical write evidence is retained without gating new RRs; cleanup and locks still gate', t => {
  const f = fixture(t); resetRunBudget(f.jobs, 'Authorized accounting-only reset');
  const marker = join(f.jobs, 'old/unresolved-changes.json');
  writeFileSync(marker, JSON.stringify({ changes: [{ state: 'unknown' }] }));
  assert.equal(f.history().priorEventCostUSD, 0); assert.ok(readFileSync(marker).length);
  for (const patch of [{ unresolvedChanges: ['save'] }, { apiUnresolved: true }]) {
    f.save({ ...f.record, ...patch }); assert.equal(f.history().priorEventCostUSD, 0);
  }
  f.save({ ...f.record, stopFailures: ['cleanup failed'] }); assert.throws(f.history, /cleanup/);
  f.save(f.record);
  writeFileSync(join(f.jobs, 'old/operation.lock'), '{}');
  assert.throws(f.history, /operation locks/);
});
test('reset refuses live jobs, live native processes and unknown spending', t => {
  const f = fixture(t);
  for (const patch of [{ status: 'RUNNING' }, { status: 'PREPARING' }, { status: 'STOPPING' }, { ownedPid: process.pid }, { piCostUSD: null }, { piCostUSD: -1 }, { spendingUnreconciled: true }]) {
    f.save({ ...f.record, ...patch }); assert.throws(() => resetRunBudget(f.jobs, 'User request'));
  }
  f.save(f.record); assert.throws(() => resetRunBudget(f.jobs, ''), /authorization/);
});
test('malformed or linked credit files fail closed; no automatic reset on exhaustion', t => {
  const f = fixture(t), path = join(f.root, 'budget-reset.json');
  f.save({ ...f.record, piCostUSD: 50 }); assert.throws(f.history, /Cumulative event spending/);
  for (const value of ['bad JSON', JSON.stringify({ version: 1, id: 'x', credits: { old: -1 } }), JSON.stringify({ version: 1, id: 'x', credits: [] })]) {
    writeFileSync(path, value); assert.throws(f.history);
  }
  rmSync(path); symlinkSync(join(f.jobs, 'old/job.json'), path); assert.throws(f.history, /reconciliation/);
});
