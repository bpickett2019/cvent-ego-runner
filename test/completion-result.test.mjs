import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reportedCompletion } from '../app/rr-connection.mjs';

const complete = () => ({ eventId: 'selected', status: 'DONE', completion: { website: true, registration: true, dependencies: true, draft: true }, blockers: [], untested: [] });
function fixture(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'rr-completion-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  mkdirSync(join(workspace, 'reports'));
  const path = join(workspace, 'reports/final-report.json');
  return { workspace, path, save: value => writeFileSync(path, JSON.stringify(value)), result: () => reportedCompletion(workspace, 'selected') };
}

test('DONE requires explicit verified website, registration, dependencies and Draft for this event', t => {
  const f = fixture(t); f.save(complete()); assert.equal(f.result(), 'DONE');
  for (const key of ['website', 'registration', 'dependencies', 'draft']) {
    for (const value of [undefined, false, 'true', 'VERIFIED', 1]) {
      const report = complete(); report.completion[key] = value;
      f.save(report); assert.equal(f.result(), 'INCOMPLETE', `${key}:${value}`);
    }
  }
  for (const change of [{ eventId: 'other' }, { eventId: undefined }, { status: 'FINISHED' }, { status: 'INCOMPLETE' }, { status: undefined }, { completion: null }, { completion: [] }]) {
    f.save({ ...complete(), ...change }); assert.equal(f.result(), 'INCOMPLETE');
  }
  f.save(complete()); assert.equal(reportedCompletion(f.workspace, undefined), 'INCOMPLETE');
});

test('event-build DONE needs no project acceptance fields; exclusions never override an in-scope gap', t => {
  const f = fixture(t);
  writeFileSync(join(f.workspace, 'reports/final-report.md'), '# Exclusions\nAzure deployment, M365 sign-in and a stand-alone onsite scanner request are outside this event-build SOW.\n');
  // Pi makes the semantic scope decision. The wrapper does not parse Markdown,
  // filter blockers, demand project-delivery flags or add a continuation prompt.
  f.save(complete()); assert.equal(f.result(), 'DONE');
  for (const key of ['blockers', 'untested']) {
    f.save({ ...complete(), [key]: ['RR-required registration path not connected'] });
    assert.equal(f.result(), 'INCOMPLETE');
  }
  f.save({ ...complete(), completion: { ...complete().completion, draft: false } });
  assert.equal(f.result(), 'INCOMPLETE');
});

test('blockers, untested work and explicit uncertainty cannot be labeled DONE', t => {
  const f = fixture(t);
  for (const key of ['blockers', 'untested']) {
    for (const value of [undefined, null, {}, '', ['one remaining requirement']]) {
      f.save({ ...complete(), [key]: value }); assert.equal(f.result(), 'INCOMPLETE');
    }
  }
  for (const uncertainWrites of [['unverified save'], 'unknown', {}]) {
    f.save({ ...complete(), uncertainWrites }); assert.equal(f.result(), 'INCOMPLETE');
  }
  f.save(complete());
  for (const name of ['api-write-uncertain.json', 'browser-save-uncertain.json', 'api-operation.lock', 'operation.lock']) {
    const p = join(f.workspace, name); writeFileSync(p, '{}'); assert.equal(f.result(), 'INCOMPLETE'); rmSync(p);
  }
  const p = join(f.workspace, 'unresolved-changes.json');
  for (const value of [[{ verification: 'UNVERIFIED' }], { uncertainWrites: ['save'] }, { changes: ['save'] }, { uncertainWrites: [], changes: ['save'] }, { uncertainWrites: ['save'], changes: [] }, {}, null]) {
    writeFileSync(p, JSON.stringify(value)); assert.equal(f.result(), 'INCOMPLETE');
  }
  for (const value of [[], { uncertainWrites: [] }, { changes: [] }]) {
    writeFileSync(p, JSON.stringify(value)); assert.equal(f.result(), 'DONE');
  }
});

test('missing, malformed, oversized or linked final reports fail to INCOMPLETE without throwing', t => {
  const f = fixture(t); assert.equal(f.result(), 'INCOMPLETE');
  for (const text of ['broken', 'null', '[]', '{}', JSON.stringify(complete()) + ' '.repeat(1_000_000)]) {
    writeFileSync(f.path, text); assert.equal(f.result(), 'INCOMPLETE');
  }
  rmSync(f.path); const other = join(f.workspace, 'other.json'); writeFileSync(other, JSON.stringify(complete()));
  symlinkSync(other, f.path); assert.equal(f.result(), 'INCOMPLETE');
});
