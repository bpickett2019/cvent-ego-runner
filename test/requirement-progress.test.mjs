import test from 'node:test';
import assert from 'node:assert/strict';
import { requirementProgress } from '../public/requirement-progress.js';

test('only explicit verified statuses complete; blockers and exclusions stay distinct', () => {
  const state = { requirements: [
    { id: 'price', label: 'Admission price', status: 'verified_changed', verification: 'Read back $25' },
    { id: 'venue', status: 'verified_existing', evidence: 'Venue matches RR' },
    { id: 'theme', status: 'blocked', reason: 'FT5 mapping missing' },
    { id: 'hours', status: 'partially_verified', evidence: 'Daily hours remain unverified' },
    { id: 'questions', status: 'unverified' },
    { id: 'CRM', status: 'excluded', reason: 'Outside event configuration scope' },
    ...['DONE', 'saved', 'attempted', 'verified', 'completed', 'in_progress', ''].map(status => ({ id: status || 'unknown', status })),
  ] };
  const before = JSON.stringify(state), result = requirementProgress(state);
  assert.equal(result.mode, 'requirements');
  assert.equal(result.changedCount, 1); assert.equal(result.existingCount, 1);
  assert.equal(result.completed.length, 2); assert.equal(result.pending.length, 10); assert.equal(result.excluded.length, 1);
  assert.match(result.completed[0], /Changed · price — Admission price — Read back \$25/);
  assert.match(result.completed[1], /Existing match · venue — Venue matches RR/);
  assert.match(result.pending[0], /Blocked · theme — FT5 mapping missing/);
  assert.match(result.pending[1], /Partially verified · hours/);
  assert.match(result.excluded[0], /Excluded · CRM/);
  assert.equal(JSON.stringify(state), before, 'display must not rewrite evidence');
});

test('requirement arrays supersede stale legacy completion even when empty', () => {
  for (const requirements of [[], [{ id: 'price', status: 'blocked' }]]) {
    const result = requirementProgress({ requirements, completed: ['Everything done'], pending: ['Old list'] });
    assert.deepEqual(result.completed, []); assert.equal(result.pending.length, requirements.length);
    assert.equal(result.mode, 'requirements');
  }
});

test('historical completed/pending lists remain legacy checkpoints, not verified requirements', () => {
  const result = requirementProgress({ completed: ['target-verified'], pending: { message: 'Need login' } });
  assert.equal(result.mode, 'legacy'); assert.deepEqual(result.completed, ['target-verified']);
  assert.deepEqual(result.pending, [{ message: 'Need login' }]); assert.deepEqual(result.excluded, []);
  assert.equal(result.changedCount, 0); assert.equal(result.existingCount, 0);
});

test('missing, malformed and unknown entries never become completed or disappear', () => {
  for (const state of [null, undefined, {}, { requirements: null }]) {
    assert.deepEqual(requirementProgress(state).completed, []);
  }
  const result = requirementProgress({ requirements: [null, 12, [], 'Still needs checking', { status: { completed: true } }] });
  assert.equal(result.completed.length, 0); assert.equal(result.pending.length, 5);
  assert.match(result.pending[3], /Still needs checking/);
});

test('legacy requirement evidence/blocker fields are readable without dumping workbook objects', () => {
  const result = requirementProgress({ requirements: [
    { id: 'Event Details:10', status: 'verified_existing', source: { D10: 'private workbook field' }, evidence: 'Verified venue' },
    { id: 'theme', status: 'blocked', blocker: 'Mapping needed' },
  ] });
  assert.match(result.completed[0], /Event Details:10 — Verified venue/);
  assert.match(result.pending[0], /Mapping needed/);
  assert.doesNotMatch(result.completed[0], /private workbook field/);
});

test('progress updates can revoke prior completion without mutating either snapshot', () => {
  const before = Object.freeze({ requirements: Object.freeze([Object.freeze({ id: 'price', status: 'verified_changed' })]) });
  const after = Object.freeze({ requirements: Object.freeze([Object.freeze({ id: 'price', status: 'unverified' })]) });
  assert.equal(requirementProgress(before).completed.length, 1);
  assert.equal(requirementProgress(after).completed.length, 0);
  assert.equal(requirementProgress(after).pending.length, 1);
});
