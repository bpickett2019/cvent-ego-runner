import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { eventHoldInventory, createSharedEventSafety, EVENT_SAFETY_PROTOCOL } from '../app/shared-event-safety.mjs';
import { collectEventSafety } from '../deploy/azure/event-safety.mjs';

const ports = [18781, 18782, 18783], targetId = randomUUID(), jobId = randomUUID();
const inventories = () => [1, 2, 3].map(workspace => ({ protocol: EVENT_SAFETY_PROTOCOL, workspace, enforced: true, complete: true, holds: [] }));
const fetchFor = rows => async url => new Response(JSON.stringify(rows[Number(new URL(url).port) - 18781]));
const headerFor = (rows = inventories(), options = {}) => collectEventSafety({ ports, workspace: 1, jobId, operation: 'answer', fetchImpl: fetchFor(rows), ...options });
const request = (header, id = jobId, operation = 'answer') => ({ method: 'POST', originalUrl: `/api/jobs/${id}/${operation}`, headers: { 'x-cvent-event-safety': header } });
const check = (gate, req, id = targetId) => gate({ req, record: { id: jobId }, target: { apiEventId: id, evtstub: id } });
function rootFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'shared-safety-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'data/jobs'), { recursive: true }); mkdirSync(join(root, 'data/current'));
  const add = (id, record, marker) => {
    const dir = join(root, 'data/jobs', id); mkdirSync(dir); mkdirSync(join(dir, 'reports'));
    if (record) writeFileSync(join(dir, 'job.json'), JSON.stringify({ id, status: 'STOPPED', ...record }));
    if (marker) writeFileSync(join(dir, marker), '{"secret":"PRIVATE_VALUE"}');
    return dir;
  };
  return { root, add };
}
test('inventory is complete, bounded, sanitized and preserves original hold bytes', t => {
  const f = rootFixture(t), id = randomUUID();
  const dir = f.add(id, { target: { apiEventId: targetId, evtstub: targetId, name: 'PRIVATE_NAME' }, unresolvedChanges: ['PRIVATE_TOOL'] }, 'browser-save-uncertain.json');
  const bytes = readFileSync(join(dir, 'browser-save-uncertain.json'), 'utf8');
  f.add(randomUUID(), { status: 'INCOMPLETE', unresolvedChanges: [], target: { evtstub: randomUUID() } });
  const result = eventHoldInventory(f.root, 2);
  assert.equal(result.complete, true); assert.equal(result.enforced, true);
  assert.deepEqual(result.holds, [{ jobId: id, eventId: targetId }]); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  assert.equal(readFileSync(join(dir, 'browser-save-uncertain.json'), 'utf8'), bytes);
  assert.equal(eventHoldInventory(f.root).enforced, false);
});
for (const mode of ['missing-record', 'missing-target', 'conflicting-target', 'invalid-target', 'shared-marker']) test(`inventory keeps ${mode} uncertainty globally blocking`, t => {
  const f = rootFixture(t);
  if (mode === 'shared-marker') writeFileSync(join(f.root, 'data/current/api-write-uncertain.json'), '{}');
  else f.add(randomUUID(), mode === 'missing-record' ? null : { target: mode === 'missing-target' ? undefined : mode === 'conflicting-target' ? { evtstub: targetId, apiEventId: randomUUID() } : { evtstub: 'not-a-uuid' } }, 'browser-save-uncertain.json');
  const result = eventHoldInventory(f.root, 1); assert.equal(result.complete, true); assert.equal(result.holds.length, 1); assert.equal(result.holds[0].eventId, null);
});
for (const mode of ['malformed-record', 'linked-job', 'invalid-job-directory']) test(`unavailable inventory (${mode}) cannot claim all-clear`, t => {
  const f = rootFixture(t), id = randomUUID();
  if (mode === 'linked-job') symlinkSync(join(f.root, 'missing'), join(f.root, 'data/jobs', id));
  else if (mode === 'invalid-job-directory') mkdirSync(join(f.root, 'data/jobs/not-a-job'));
  else { const dir = f.add(id, { unresolvedChanges: [] }); writeFileSync(join(dir, 'job.json'), '{PRIVATE_INVALID'); }
  const result = eventHoldInventory(f.root, 3); assert.equal(result.complete, false); assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});
test('ordinary Clear of an unstarted upload does not manufacture a global inventory blocker', t => {
  const f = rootFixture(t); f.add(randomUUID(), { status: 'CLEARED', unresolvedChanges: [], piCostUSD: 0 });
  const inventory = eventHoldInventory(f.root, 1);
  assert.equal(inventory.complete, true); assert.deepEqual(inventory.holds, []);
});
test('missing record without any recovered marker is globally blocking, not clean', t => {
  const f = rootFixture(t), id = randomUUID(); f.add(id, null);
  const inventory = eventHoldInventory(f.root, 1);
  assert.equal(inventory.complete, true); assert.deepEqual(inventory.holds, [{ jobId: id, eventId: null }]);
});
test('collector uses only the three fixed loopback inventory endpoints with bounded/no-redirect reads', async () => {
  const seen = [], rows = inventories(); rows[1].privateSecret = 'PRIVATE';
  const encoded = await headerFor(rows, { fetchImpl: async (url, options) => {
    seen.push(url); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return fetchFor(rows)(url);
  } });
  assert.deepEqual(seen, ports.map(port => `http://127.0.0.1:${port}/api/internal/event-holds`));
  const proof = JSON.parse(Buffer.from(encoded, 'base64'));
  assert.equal(proof.jobId, jobId); assert.equal(proof.workspace, 1); assert.equal(proof.operation, 'answer');
  assert.equal(proof.expiresAt - proof.issuedAt, 120000); assert.doesNotMatch(JSON.stringify(proof), /PRIVATE/);
});
for (const patch of [{ protocol: 'old' }, { enforced: false }, { complete: false }, { workspace: 1 }, { holds: [{ eventId: targetId }] }, { holds: [{ jobId, eventId: 'bad' }] }]) {
  test(`one peer ${JSON.stringify(patch)} blocks all shared handoffs`, async () => {
    const rows = inventories(); Object.assign(rows[2], patch);
    await assert.rejects(headerFor(rows), error => error.publicResult.code === 'SHARED_EVENT_SAFETY_UNAVAILABLE');
  });
}
for (const kind of ['offline', 'http-error', 'bad-json', 'oversize', 'too-many-holds']) test(`collector fails closed on ${kind}`, async () => {
  const rows = inventories();
  const fetchImpl = async () => {
    if (kind === 'offline') throw Error('PRIVATE_BACKEND_FAILURE');
    if (kind === 'http-error') return new Response('PRIVATE', { status: 503 });
    if (kind === 'bad-json') return new Response('{PRIVATE');
    if (kind === 'oversize') return new Response('x'.repeat(16001));
    return new Response(JSON.stringify({ ...rows[0], holds: Array.from({ length: 101 }, () => ({ jobId, eventId: targetId })) }));
  };
  await assert.rejects(headerFor(rows, { fetchImpl }), error => { assert.doesNotMatch(error.message, /PRIVATE/); return error.publicResult.code === 'SHARED_EVENT_SAFETY_UNAVAILABLE'; });
});
test('a hold in any workspace blocks the real verified event, but not another event', async () => {
  for (const workspace of [1, 2, 3]) {
    const rows = inventories(); rows[workspace - 1].holds.push({ jobId: randomUUID(), eventId: targetId });
    const gate = createSharedEventSafety({ workspaceId: 1 });
    const encoded = await headerFor(rows);
    assert.throws(() => check(gate, request(encoded)), new RegExp(`Workspace ${workspace}`));
    const unrelated = await headerFor(rows);
    assert.doesNotThrow(() => check(gate, request(unrelated), randomUUID()));
    rows[workspace - 1].holds[0].eventId = null;
    const unknown = await headerFor(rows);
    assert.throws(() => check(gate, request(unknown), randomUUID()), /unknown event/);
  }
});
test('proof is job/workspace/operation-bound, expires, cannot replay and cannot change event within a request', async () => {
  let time = 1000000;
  const gate = createSharedEventSafety({ workspaceId: 1, now: () => time });
  const encoded = await headerFor(undefined, { now: () => time });
  const req = request(encoded);
  check(gate, req); check(gate, req);
  assert.throws(() => check(gate, request(encoded)), /could not be verified/);
  assert.throws(() => check(gate, req, randomUUID()), /could not be verified/);
  assert.throws(() => check(createSharedEventSafety({ workspaceId: 2, now: () => time }), request(encoded)), /could not be verified/);
  assert.throws(() => check(gate, request(encoded, randomUUID())), /could not be verified/);
  assert.throws(() => check(gate, request(encoded, jobId, 'resume')), /could not be verified/);
  time += 120000; assert.throws(() => check(gate, req), /could not be verified/);
});
test('missing, forged-shape, future, corrupt, oversized and incomplete proofs cannot authorize shared execution', async () => {
  const encoded = await headerFor();
  for (const raw of [undefined, '', 'not base64', 'a'.repeat(8001), Buffer.from('{PRIVATE').toString('base64')]) {
    assert.throws(() => check(createSharedEventSafety({ workspaceId: 1 }), request(raw)), /could not be verified/);
  }
  const original = JSON.parse(Buffer.from(encoded, 'base64'));
  for (const modify of [p => p.inventories.pop(), p => p.inventories[2].enforced = false, p => p.inventories[1].workspace = 1,
    p => p.inventories[0].holds = [{ eventId: targetId }], p => p.expiresAt++, p => { p.issuedAt += 60000; p.expiresAt += 60000; }]) {
    const value = structuredClone(original); modify(value);
    assert.throws(() => check(createSharedEventSafety({ workspaceId: 1 }), request(Buffer.from(JSON.stringify(value)).toString('base64'))), /could not be verified/);
  }
});
test('standalone cannot silently accept a shared assertion; misconfigured identity fails startup', async () => {
  const gate = createSharedEventSafety();
  assert.doesNotThrow(() => check(gate, request(undefined)));
  const header = await headerFor(); assert.throws(() => check(gate, request(header)), /could not be verified/);
  for (const workspaceId of [0, 4, '1', null]) assert.throws(() => createSharedEventSafety({ workspaceId }), /Invalid shared workspace/);
});
