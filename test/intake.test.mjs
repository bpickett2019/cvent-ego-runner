import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import { mountRR } from '../app/rr-connection.mjs';
import { RUN_POLICY } from '../app/run-policy.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rr-intake-'));
  await mkdir(join(root, 'app'));
  for (const file of ['intake-prompt.md', 'runner-prompt.md']) await writeFile(join(root, 'app', file), file);
  const launches = [], setups = [];
  let login = true, setupGate = async () => {}, browserChecks = 0;
  class Rpc extends EventEmitter {
    constructor(workspace) { super(); this.workspace = workspace; this.id = randomUUID(); this.cost = 0; this.messages = 0; this.commands = []; this.stops = 0; }
    state() { return { sessionId: this.id, sessionFile: join(this.workspace, 'pi-sessions', this.id + '.jsonl'), messageCount: this.messages, isStreaming: false, isCompacting: false, pendingMessageCount: 0, model: { cost: { input: 1 } } }; }
    async freshSession() { this.commands.push({ type: 'new_session' }); return this.state(); }
    async request(c) { this.commands.push(c); if (c.type === 'prompt') this.messages++; return { data: c.type === 'get_state' ? this.state() : c.type === 'get_session_stats' ? { cost: this.cost } : { text: 'Saved-result report' } }; }
    async stop(after) { this.stops++; await after(); return []; }
  }
  const app = express(); app.use(express.json());
  const connection = mountRR(app, { root,
    resolveTarget: async () => { throw new Error('manual selection must not be needed'); },
    verifyLogin: async () => { throw new Error('legacy start not used'); },
    prepareTarget: async (name, options) => {
      setups.push({ name, options });
      const target = { name, evtstub: 'selected', apiEventId: 'selected', url: 'https://app.cvent.com/?evtstub=selected' };
      await options.beforeBrowser(target);
      browserChecks++;
      await setupGate();
      if (!login && !options.returnControl) throw new Error('Sign in, then confirm');
      return { target, runtime: { identityVerified: true, ownership: 'AGENT', apiPreflight: { eventId: 'selected' } } };
    }, rpcFactory: ({ workspace }) => { const rpc = new Rpc(workspace); launches.push(rpc); return rpc; },
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => { await connection.shutdown(); await new Promise(r => server.close(r)); await rm(root, { recursive: true, force: true }); });
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, body === undefined ? {} : { method: 'POST', ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const upload = async () => { const form = new FormData(); form.append('rr', new Blob(['different RR workbook']), 'Example.xlsx'); form.append('eventName', 'Selected Event'); return (await request('/api/jobs', form)).body; };
  const job = await upload();
  const get = async (id = job.id) => (await request(`/api/jobs/${id}`)).body;
  const wait = async predicate => { for (let i = 0; i < 200; i++) { const d = await get(); if (predicate(d)) return d; await new Promise(r => setTimeout(r, 5)); } throw new Error('state not reached'); };
  const settle = async value => { await writeFile(join(job.workspace, 'intake.json'), JSON.stringify(value)); launches[0].emit('event', { type: 'agent_settled' }); };
  return { root, job, launches, setups, request, get, upload, wait, settle, connection, login: value => { login = value; }, setupGate: fn => { setupGate = fn; }, browserChecks: () => browserChecks };
}
const prompts = rpc => rpc.commands.filter(c => c.type === 'prompt');
const ready = { eventName: 'Selected Event', summary: 'RR understood with source references', questions: [] };

test('RR and explicit target upload gets fixed instructions; read starts without browser permission', async t => {
  const f = await fixture(t);
  assert.equal(prompts(f.launches[0]).length, 0);
  assert.equal(f.job.instruction, RUN_POLICY.instruction);
  assert.equal(f.job.requestedEventName, 'Selected Event');
  assert.match(f.job.instruction, /approved-sow.md/);
  assert.match(RUN_POLICY.approvedSow, /Never delete\/archive/);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/read`, {})).status, 200);
  assert.equal(f.setups.length, 0);
  assert.equal((await f.get()).phase, 'READING');
  assert.equal(JSON.parse(await readFile(join(f.job.workspace, 'runtime.json'), 'utf8')).ownership, 'USER');
  assert.equal((await f.get()).target, undefined);
  assert.match(prompts(f.launches[0])[0].message, /original.xlsx/);
  assert.match(prompts(f.launches[0])[0].message, /Reuse only exact RR matches in values, relationships/);
  assert.match(prompts(f.launches[0])[0].message, /Never change the event name/);
  assert.equal(await readFile(f.job.workbook, 'utf8'), 'different RR workbook');
  assert.equal((await f.request(`/api/jobs/${f.job.id}/read`, {})).status, 409);
});

test('upload rejects missing target before creating another session', async t => {
  const f = await fixture(t), form = new FormData();
  form.append('rr', new Blob(['workbook']), 'RR.xlsx');
  const result = await f.request('/api/jobs', form);
  assert.equal(result.status, 409); assert.match(result.body.error, /event name required/);
  assert.equal(f.launches.length, 1);
});

test('workbook/model event names cannot redirect the upload-bound target', async t => {
  for (const eventName of ['Coconut Grove Jewelry & Watch Show 2026', null]) {
    const f = await fixture(t);
    await f.request(`/api/jobs/${f.job.id}/read`, {});
    assert.match(prompts(f.launches[0])[0].message, /"requestedEventName":"Selected Event"/);
    await f.settle({ ...ready, eventName });
    const running = await f.wait(d => d.phase === 'EXECUTING');
    assert.equal(f.setups[0].name, 'Selected Event');
    assert.equal(running.target.name, 'Selected Event');
    assert.equal(running.requestedEventName, 'Selected Event');
    await f.connection.stop();
  }
});

test('upload cannot override the fixed execution instructions', async t => {
  const f = await fixture(t);
  const form = new FormData();
  form.append('rr', new Blob(['workbook']), 'RR.xlsx');
  form.append('instruction', 'Publish everything');
  const result = await f.request('/api/jobs', form);
  assert.equal(result.status, 409);
  assert.match(result.body.error, /instructions are fixed/);
  assert.equal(f.launches.length, 1, 'rejected override must not create another session');
  assert.equal(prompts(f.launches[0]).length, 0);
});

test('genuine clarification then automatic setup uses one live session, no restoration', async t => {
  const f = await fixture(t), rpc = f.launches[0];
  await f.request(`/api/jobs/${f.job.id}/read`, {});
  await f.settle({ ...ready, questions: ['Mock-only warning: apply concrete values to the existing test clone?'] });
  await f.wait(d => d.phase === 'AWAITING_INPUT');
  assert.equal(f.setups.length, 0);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`, { message: 'Yes; skip placeholders and keep its name.' })).status, 200);
  assert.equal(prompts(rpc).length, 2);
  assert.ok((await readdir(join(f.job.workspace, 'receipts'))).some(x => x.startsWith('intake-')));
  rpc.cost = 0.5;
  await f.settle(ready);
  const running = await f.wait(d => d.phase === 'EXECUTING');
  assert.equal(running.target.name, ready.eventName);
  assert.equal(running.totalEventCostUSD, 0.5);
  assert.equal(running.sessionId, f.job.sessionId);
  assert.equal(prompts(rpc).length, 3);
  assert.equal(f.launches.length, 1);
  assert.equal(rpc.commands.filter(c => c.type === 'new_session').length, 1);
  assert.ok(!rpc.commands.some(c => c.type === 'switch_session'));
  assert.match(prompts(rpc).at(-1).message, /do not restart analysis unnecessarily/);
  assert.match(prompts(rpc).at(-1).message, /Reuse only exact RR matches in values, relationships/);
  assert.match(prompts(rpc).at(-1).message, /Never change the event name/);
  assert.match(await readFile(join(f.job.workspace, 'approved-sow.md'), 'utf8'), /Reuse only exact RR matches in values, relationships/);
  rpc.emit('event', { type: 'agent_settled' });
  await f.wait(d => d.status === 'INCOMPLETE');
  assert.equal(rpc.stops, 1);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`, { message: 'again' })).status, 409);
});

test('human login blocks execution; explicit live answer retries setup without another reading prompt', async t => {
  const f = await fixture(t); f.login(false);
  await f.request(`/api/jobs/${f.job.id}/read`, {}); await f.settle(ready);
  const waiting = await f.wait(d => d.waitingFor === 'setup');
  assert.equal(waiting.status, 'RUNNING');
  assert.equal(prompts(f.launches[0]).length, 1);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`, { message: 'Signed in', returnControl: true, sessionInvalidated: true })).status, 200);
  assert.equal(f.setups.at(-1).options.returnControl, true);
  assert.equal(f.setups.at(-1).options.sessionInvalidated, true);
  assert.equal((await f.get()).phase, 'EXECUTING');
  assert.equal(prompts(f.launches[0]).length, 2);
});

test('prior uncertainty blocks before browser setup and never sends authoring prompt', async t => {
  const f = await fixture(t);
  const id = randomUUID(), p = join(f.root, 'data/jobs', id); await mkdir(p);
  await writeFile(join(p, 'job.json'), JSON.stringify({ id, status: 'REVIEW_REQUIRED', target: { evtstub: 'selected' }, piCostUSD: 2 }));
  await writeFile(join(p, 'unresolved-changes.json'), '[{"verification":"UNVERIFIED"}]');
  await f.request(`/api/jobs/${f.job.id}/read`, {}); await f.settle(ready);
  const d = await f.wait(d => d.waitingFor === 'setup');
  assert.match(d.lastAssistantText, /uncertain operations/);
  assert.equal(f.browserChecks(), 0);
  assert.equal(prompts(f.launches[0]).length, 1);
});

test('paid intake stopped before target remains in cumulative spending on the next upload', async t => {
  const f = await fixture(t);
  await f.request(`/api/jobs/${f.job.id}/read`, {}); f.launches[0].cost = 1.25;
  await f.request(`/api/jobs/${f.job.id}/stop`, {});
  const next = await f.upload();
  assert.equal((await f.request(`/api/jobs/${next.id}/read`, {})).status, 200);
  assert.equal((await f.get(next.id)).priorEventCostUSD, 1.25);
  await writeFile(join(next.workspace, 'intake.json'), JSON.stringify(ready));
  f.launches[1].emit('event', { type: 'agent_settled' });
  for (let i = 0; i < 100 && (await f.get(next.id)).phase !== 'EXECUTING'; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal((await f.get(next.id)).phase, 'EXECUTING');
  assert.equal((await f.get(next.id)).priorEventCostUSD, 1.25);
});

test('Stop during automatic setup prevents execution prompt and cannot be answered later', async t => {
  const f = await fixture(t); let release, entered;
  const gate = new Promise(r => { release = r; }), entry = new Promise(r => { entered = r; });
  f.setupGate(async () => { entered(); await gate; });
  await f.request(`/api/jobs/${f.job.id}/read`, {}); await f.settle(ready); await entry;
  await f.connection.stop(); release();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(prompts(f.launches[0]).length, 1);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`, { message: 'resume' })).status, 409);
});

test('malformed intake fails closed; original live session and budget are checked before replies', async t => {
  const f = await fixture(t);
  await f.request(`/api/jobs/${f.job.id}/read`, {});
  await f.settle({ ...ready, questions: 'not an array' });
  await f.wait(d => d.status === 'STOPPED');
  assert.equal(f.setups.length, 0);
  assert.equal(prompts(f.launches[0]).length, 1);
});

test('plain-text answers only; changed session never silently resumes', async t => {
  const f = await fixture(t);
  await f.request(`/api/jobs/${f.job.id}/read`, {}); await f.settle({ ...ready, questions: ['Which value?'] });
  await f.wait(d => d.waitingFor === 'clarification');
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`, { message: '/new' })).status, 409);
  f.launches[0].id = randomUUID();
  assert.equal((await f.request(`/api/jobs/${f.job.id}/answer`, { message: 'Confirmed' })).status, 409);
  assert.equal(prompts(f.launches[0]).length, 1);
});
