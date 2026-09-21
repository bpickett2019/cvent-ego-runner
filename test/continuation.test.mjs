import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import { mountRR } from '../app/rr-connection.mjs';
import { resetRunBudget } from '../app/budget.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rr-fresh-upload-'));
  const launches = [];
  let nextId, messages = 0, runtime;
  class FakeRpc extends EventEmitter {
    constructor(workspace) { super(); this.workspace = workspace; this.id = nextId || randomUUID(); this.commands = []; this.stops = 0; this.cost = 0; }
    async freshSession() { return { sessionId: this.id, sessionFile: join(this.workspace, 'pi-sessions', this.id + '.jsonl'), messageCount: messages, model: { cost: { input: 1 } } }; }
    async request(command) { this.commands.push(command); return { data: command.type === 'get_session_stats' ? { cost: this.cost } : { text: 'Partial: saved verified event dates.' } }; }
    async stop(afterAbort) { this.stops++; await afterAbort(); return []; }
  }
  const app = express(); app.use(express.json());
  const connection = mountRR(app, { root,
    provisionBrowser: async record => (runtime = { jobId: record.id, runtimeId: record.id, freshProfile: true, ownership: 'USER', identityVerified: true, steelSessionId: randomUUID(), activeTargetId: randomUUID() }),
    prepareTarget: async (name, options) => {
      const target = { name, evtstub: 'selected', apiEventId: 'selected', url: 'https://app.cvent.com/?evtstub=selected' };
      await options.beforeBrowser(target);
      runtime = { ...runtime, ownership: 'AGENT', apiPreflight: { eventId: 'selected' } };
      return { target, runtime };
    },
    verifyLogin: async () => runtime, stopBrowser: async () => {},
    rpcFactory: ({workspace}) => { const rpc = new FakeRpc(workspace); launches.push(rpc); return rpc; },
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => { await connection.shutdown(); await new Promise(r => server.close(r)); await rm(root, {recursive:true, force:true}); });
  const request = async (path, body) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {method:body === undefined ? 'GET' : 'POST', headers:body instanceof FormData ? {} : {'content-type':'application/json'}, ...(body === undefined ? {} : {body:body instanceof FormData ? body : JSON.stringify(body)})}); return {status:r.status, body:await r.json()}; };
  const upload = async (bytes = 'workbook') => { const form = new FormData(); form.append('rr', new Blob([bytes]), 'RR.xlsx'); form.append('eventName', 'Selected Event'); return request('/api/jobs', form); };
  const job = (await upload()).body;
  const back = id => request(`/api/jobs/${id}/answer`, { returnControl: true });
  const start = async id => { const result = await request(`/api/jobs/${id}/read`, {}); return result.status === 200 ? back(id) : result; };
  const get = async id => (await request(`/api/jobs/${id}`)).body;
  const settle = async id => { launches.at(-1).emit('event', {type:'agent_settled'}); for(let i=0;i<100;i++){ if ((await get(id)).status === 'INCOMPLETE') return; await new Promise(r=>setTimeout(r,5)); } throw new Error('did not settle'); };
  return {root, job, launches, request, upload, start, back, get, settle, connection, nextId:id=>{nextId=id;}, messages:n=>{messages=n;}};
}
const prompts = rpc => rpc.commands.filter(c => c.type === 'prompt');

test('identical uploads stay isolated and start no native process until Return', async t => {
  const f = await fixture(t), next = (await f.upload()).body;
  assert.notEqual(next.id, f.job.id); assert.notEqual(next.workspace, f.job.workspace);
  assert.equal(next.sha256, f.job.sha256); assert.equal(next.sessionId, undefined);
  assert.equal(f.launches.length, 0); assert.equal(await readFile(f.job.workbook,'utf8'),'workbook');
  assert.equal((await f.start(next.id)).body.aiStarted, true); assert.equal(f.launches.length, 1);
  assert.equal(prompts(f.launches[0]).length, 1);
  assert.equal((await f.upload()).status, 409, 'upload cannot interrupt execution');
});

test('settlement closes Pi; fresh uploads retain costs and evidence, never conversations', async t => {
  const f = await fixture(t); await f.start(f.job.id); const first = await f.get(f.job.id);
  f.launches[0].cost = 2.5; await f.settle(f.job.id);
  const before = await readFile(join(f.job.workspace, 'job.json'), 'utf8');
  assert.equal(f.launches[0].stops, 1);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/continue`, {})).status, 409);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/rpc`, {type:'follow_up',message:'resume'})).status, 409);
  const next = (await f.upload('new RR')).body;
  assert.equal((await f.start(next.id)).body.aiStarted, true);
  const current = await f.get(next.id);
  assert.equal(current.priorEventCostUSD, 2.5); assert.equal(current.piCostUSD, 0);
  assert.notEqual(current.sessionId, first.sessionId);
  assert.ok(!f.launches[1].commands.some(c => c.type === 'switch_session'));
  assert.ok(!prompts(f.launches[1])[0].message.includes(f.job.workspace));
  assert.equal(await readFile(join(f.job.workspace,'job.json'),'utf8'), before);
  f.launches[1].cost = 1.25; await f.settle(next.id);
  const third = (await f.upload()).body; await f.start(third.id);
  assert.equal((await f.get(third.id)).priorEventCostUSD, 3.75);
});

test('explicit budget credits preserve history and future charges in the only launch path', async t => {
  const f = await fixture(t); await f.start(f.job.id);
  f.launches[0].cost = 49.9; await f.settle(f.job.id);
  const path = join(f.job.workspace, 'job.json'), before = await readFile(path, 'utf8');
  resetRunBudget(join(f.root, 'data/jobs'), 'User requested clearing run costs');
  const next = (await f.upload()).body; await f.start(next.id);
  assert.equal((await f.get(next.id)).priorEventCostUSD, 0);
  assert.equal(await readFile(path, 'utf8'), before);
  f.launches[1].cost = 1; await f.settle(next.id);
  assert.equal(f.connection.budget().spentUSD, 1);
});

test('fresh handoff still blocks operation locks, live processes, cleanup failures and unknown spending', async t => {
  const f = await fixture(t); await f.start(f.job.id); await f.settle(f.job.id);
  const next = (await f.upload()).body; await f.request(`/api/jobs/${next.id}/read`, {});
  for (const file of ['api-operation.lock', 'operation.lock']) {
    await writeFile(join(f.job.workspace, file), '{}');
    assert.equal((await f.back(next.id)).body.aiStarted, false);
    await rm(join(f.job.workspace, file));
  }
  const path = join(f.job.workspace, 'job.json'), prior = await readFile(path, 'utf8');
  for (const patch of [{spendingUnreconciled:true}, {stopFailures:['failed abort']}, {ownedPid:process.pid}, {piCostUSD:null}]) {
    await writeFile(path, JSON.stringify({...JSON.parse(prior), ...patch}));
    assert.equal((await f.back(next.id)).body.aiStarted, false, JSON.stringify(patch));
  }
  assert.equal(f.launches.length, 1);
  await writeFile(path, prior);
  assert.equal((await f.back(next.id)).body.aiStarted, true);
});

test('duplicate native session identity is refused at Return, with no execution prompt', async t => {
  const f = await fixture(t); await f.start(f.job.id); const first = await f.get(f.job.id); await f.settle(f.job.id);
  f.nextId(first.sessionId); const next = (await f.upload()).body;
  const result = await f.start(next.id);
  assert.equal(result.status, 409); assert.match(result.body.error, /cannot reuse another job/);
  assert.equal(prompts(f.launches[1]).length, 0); assert.equal(f.launches[1].stops, 1);
});

test('changed workbook or nonempty native session cannot execute', async t => {
  const f = await fixture(t);
  await chmod(f.job.workbook, 0o600); await writeFile(f.job.workbook, 'changed');
  assert.match((await f.start(f.job.id)).body.error, /Original workbook changed/);
  assert.equal(f.launches.length, 0);
  await writeFile(f.job.workbook, 'workbook'); f.messages(1);
  assert.match((await f.start(f.job.id)).body.error, /empty session/);
  assert.equal(prompts(f.launches[0]).length, 0); assert.equal(f.launches[0].stops, 1);
});
