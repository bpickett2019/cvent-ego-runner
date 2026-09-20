import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import { mountRR } from '../app/rr-connection.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rr-fresh-upload-'));
  await mkdir(join(root, 'app'));
  await writeFile(join(root, 'app/runner-prompt.md'), 'Native Pi owns planning and recovery.');
  const launches = [];
  let beforeVerify = async () => {}, nextId;
  class FakeRpc extends EventEmitter {
    constructor(workspace) { super(); this.workspace = workspace; this.id = nextId || randomUUID(); this.commands = []; this.stops = 0; this.cost = 0; this.messages = 0; }
    state() { return { sessionId: this.id, sessionFile: join(this.workspace, 'pi-sessions', this.id + '.jsonl'), isStreaming: false, isCompacting: false, pendingMessageCount: 0, messageCount: this.messages, model: { cost: { input: 1 } } }; }
    async freshSession() { this.commands.push({ type: 'new_session' }); return this.state(); }
    async request(command) { this.commands.push(command); return { data: command.type === 'get_state' ? this.state() : command.type === 'get_session_stats' ? { cost: this.cost } : { text: 'Partial: saved verified event dates.' } }; }
    async stop(afterAbort) { this.stops++; await afterAbort(); return []; }
  }
  const app = express(); app.use(express.json());
  const connection = mountRR(app, { root, resolveTarget: async name => ({ name, evtstub: 'selected', apiEventId: 'selected', url: 'https://app.cvent.com/?evtstub=selected' }), verifyLogin: async target => {
    await beforeVerify();
    return { identityVerified: true, ownership: 'AGENT', apiPreflight: { eventId: target.apiEventId } };
  }, rpcFactory: ({workspace}) => { const rpc = new FakeRpc(workspace); launches.push(rpc); return rpc; } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => { await connection.shutdown(); await new Promise(r => server.close(r)); await rm(root, {recursive:true, force:true}); });
  const request = async (path, body) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {method:body === undefined ? 'GET' : 'POST', headers:body instanceof FormData ? {} : {'content-type':'application/json'}, ...(body === undefined ? {} : {body:body instanceof FormData ? body : JSON.stringify(body)})}); return {status:r.status, body:await r.json()}; };
  const upload = async (bytes = 'workbook') => { const form = new FormData(); form.append('rr', new Blob([bytes]), 'RR.xlsx'); form.append('eventName', 'Selected Event'); return request('/api/jobs', form); };
  const job = (await upload()).body;
  const approval = {authorizedEventName:'Selected Event'};
  const settle = async id => { launches.at(-1).emit('event', {type:'agent_settled'}); for(let i=0;i<100;i++){ if ((await request(`/api/jobs/${id}`)).body.status === 'REVIEW_REQUIRED') return; await new Promise(r=>setTimeout(r,5)); } throw new Error('did not settle'); };
  return {job, approval, launches, request, upload, settle, connection, beforeVerify:fn=>{beforeVerify=fn;}, nextId:id=>{nextId=id;}};
}
const prompts = rpc => rpc.commands.filter(c => c.type === 'prompt');

test('upload immediately creates an empty native session; Execute uses it without reset', async t => {
  const f = await fixture(t), rpc = f.launches[0];
  assert.ok(f.job.sessionId); assert.equal(f.job.sessionMode, 'fresh-on-upload');
  assert.equal(prompts(rpc).length, 0);
  assert.equal(f.job.piCostUSD, 0);
  assert.equal((await f.request(`/api/jobs/${f.job.id}/start`, f.approval)).status, 200);
  assert.equal(f.launches.length, 1);
  assert.equal(rpc.commands.filter(c=>c.type==='new_session').length, 1);
  assert.equal(prompts(rpc).length, 1);
  assert.equal((await f.request(`/api/jobs/${f.job.id}`)).body.sessionId, f.job.sessionId);
  assert.equal((await f.upload()).status,409,'upload must not interrupt active execution');
});

test('identical upload gets a new process/session; idle prior session is closed without prompts', async t => {
  const f = await fixture(t), next = (await f.upload()).body;
  assert.notEqual(next.id, f.job.id); assert.notEqual(next.workspace, f.job.workspace);
  assert.equal(next.sha256, f.job.sha256); assert.notEqual(next.sessionId, f.job.sessionId);
  assert.equal(f.launches.length,2); assert.equal(f.launches[0].stops,1);
  assert.equal(prompts(f.launches[0]).length,0); assert.equal(prompts(f.launches[1]).length,0);
  assert.equal(await readFile(f.job.workbook,'utf8'),'workbook');
});

test('settlement closes Pi; fresh same-event upload keeps spending and evidence, not conversation', async t => {
  const f = await fixture(t), path = `/api/jobs/${f.job.id}`, rpc=f.launches[0];
  assert.equal((await f.request(path+'/start',f.approval)).status,200);
  rpc.cost=2.5;
  rpc.emit('event',{type:'tool_execution_start',toolCallId:'read-failed'});
  rpc.emit('event',{type:'tool_execution_end',toolCallId:'read-failed',isError:true});
  await f.settle(f.job.id);
  assert.equal(rpc.stops,1);
  const before = await readFile(join(f.job.workspace,'job.json'),'utf8');
  assert.deepEqual(JSON.parse(before).unresolvedChanges,[]);
  assert.equal((await f.request(path+'/continue',f.approval)).status,409);
  assert.equal((await f.request(path+'/rpc',{type:'follow_up',message:'resume'})).status,409);
  const second = (await f.upload('different RR bytes')).body;
  const started = await f.request(`/api/jobs/${second.id}/start`,f.approval);
  assert.equal(started.status,200,JSON.stringify(started.body));
  const current=(await f.request(`/api/jobs/${second.id}`)).body;
  assert.equal(current.priorEventCostUSD,2.5); assert.equal(current.piCostUSD,0);
  assert.equal(current.totalEventCostUSD,2.5); assert.equal(current.allowanceUSD,60);
  assert.notEqual(current.sessionId,f.job.sessionId);
  assert.ok(!f.launches[1].commands.some(c=>c.type==='switch_session'));
  assert.match(prompts(f.launches[1])[0].message,/Do not load prior Pi transcripts or workbooks/);
  assert.equal(await readFile(join(f.job.workspace,'job.json'),'utf8'),before);
  const history=JSON.parse(await readFile(join(second.workspace,'receipts/prior-event-evidence.json'),'utf8'));
  assert.equal(history.evidence[0].jobId,f.job.id);
  f.launches[1].cost=1.25;await f.settle(second.id);
  const third=(await f.upload()).body;
  assert.equal((await f.request(`/api/jobs/${third.id}/start`,f.approval)).status,200);
  assert.equal((await f.request(`/api/jobs/${third.id}`)).body.priorEventCostUSD,3.75,'native costs summed once, not accumulated totals');
});

test('fresh same-event runs block genuine uncertainty and spending exhaustion before any prompt', async t => {
  const f=await fixture(t);
  await f.request(`/api/jobs/${f.job.id}/start`,f.approval); f.launches[0].cost=2.5; await f.settle(f.job.id);
  const next=(await f.upload()).body, path=`/api/jobs/${next.id}/start`;
  for(const [file,value] of [['api-write-uncertain.json',{}],['api-operation.lock',{}],['operation.lock',{}],['unresolved-changes.json',{uncertainWrites:[{}]}],['unresolved-changes.json',[{verification:'UNVERIFIED'}]],['unresolved-changes.json',{changes:[{}]}],['unresolved-changes.json',{uncertainWrites:'malformed'}]]) {
    await writeFile(join(f.job.workspace,file),JSON.stringify(value));
    assert.equal((await f.request(path,f.approval)).status,409,file);
    await rm(join(f.job.workspace,file));
  }
  const ledger=join(f.job.workspace,'job.json'), prior=JSON.parse(await readFile(ledger,'utf8'));
  for(const patch of [{spendingUnreconciled:true},{stopFailures:['failed abort']},{unresolvedChanges:['tool']},{ownedPid:process.pid},{piCostUSD:null},{piCostUSD:50}]) {
    await writeFile(ledger,JSON.stringify({...prior,...patch}));
    assert.equal((await f.request(path,f.approval)).status,409,JSON.stringify(patch));
  }
  assert.equal(prompts(f.launches[1]).length,0);
  assert.match((await f.request(`/api/jobs/${next.id}`)).body.lastStartError,/Cumulative event spending/);
});

test('Take Control during preflight cancels launch; concurrent launches are rejected', async t => {
  const f=await fixture(t);let entered,release;
  const entry=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
  f.beforeVerify(async()=>{entered();await gate;});
  const starting=f.request(`/api/jobs/${f.job.id}/start`,f.approval);
  await entry;
  assert.equal((await f.request(`/api/jobs/${f.job.id}/start`,f.approval)).status,409);
  assert.equal((await f.upload()).status,409);
  await f.connection.stop();release();
  const result=await starting;
  assert.equal(result.status,409);assert.match(result.body.error,/cancelled during preflight/);
  assert.equal(prompts(f.launches[0]).length,0);
  assert.equal((await f.request(`/api/jobs/${f.job.id}`)).body.status,'UPLOADED');
});

test('duplicate native session ID across uploads is refused', async t => {
  const f=await fixture(t);f.nextId(f.job.sessionId);
  const result=await f.upload();
  assert.equal(result.status,409);assert.match(result.body.error,/cannot reuse another job/);
  assert.equal(prompts(f.launches[1]).length,0);
});

test('changed original or nonempty session cannot execute',async t=>{
  const f=await fixture(t),path=`/api/jobs/${f.job.id}/start`;
  await chmod(f.job.workbook,0o600); // Alter only the disposable fixture.
  await writeFile(f.job.workbook,'changed');
  assert.match((await f.request(path,f.approval)).body.error,/Original workbook changed/);
  await writeFile(f.job.workbook,'workbook');
  f.launches[0].messages=1;
  assert.match((await f.request(path,f.approval)).body.error,/no longer empty/);
  assert.equal(prompts(f.launches[0]).length,0);
});
