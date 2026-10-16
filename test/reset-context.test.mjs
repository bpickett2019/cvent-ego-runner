import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mountRR } from '../app/rr-connection.mjs';
import { mountWorkbooks } from '../app/workbooks.mjs';
import { acquireApiLease, API_GUARD_FILE } from '../app/api-operation-lease.mjs';
import { eventHoldInventory } from '../app/shared-event-safety.mjs';
import { executionSafety } from '../app/execution-clearance.mjs';

const preview = () => ({ sheet: 0, offset: 0, rows: [], columns: ['A'], sheets: [{ name: 'Fixture', rows: 0, columns: 1 }] });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(t, { root: existing, runWorkbook = preview } = {}) {
  const root = existing || await mkdtemp(join(tmpdir(), 'rr-reset-'));
  let launches = 0, browsers = 0;
  const app = express(); app.use(express.json());
  const connection = mountRR(app, { root,
    verifyLogin: async () => { throw new Error('No live login in this test'); },
    prepareTarget: async () => { throw new Error('No target calls in this test'); },
    provisionBrowser: async () => { browsers++; throw new Error('No browser in this test'); },
    stopBrowser: async () => {},
    rpcFactory: () => { launches++; throw new Error('No native process in this test'); },
  });
  mountWorkbooks(app, { root, isBusy: connection.isBusy, withUpload: connection.withWorkbookUpload, withSave: connection.withWorkbookSave, runWorkbook });
  app.get('/api/runtime', (_req, res) => res.json({ rrContext: connection.uiContext() }));
  app.use((error, _req, res, _next) => res.status(409).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => {
    await connection.shutdown(); await new Promise(r => server.close(r));
    if (!existing) await rm(root, { recursive: true, force: true });
  });
  const request = async (path, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, body === undefined ? {} : {
      method: 'POST', ...(body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  };
  const upload = (route = '/api/jobs', contextId = connection.context().id) => {
    const body = new FormData(); body.append('rr', new Blob(['fixture RR']), 'same.xlsx');
    if (route === '/api/jobs') body.append('eventName', 'Explicit Target');
    if (contextId !== null) body.append('contextId', contextId);
    return request(route, body);
  };
  return { root, request, upload, connection, launches: () => launches, browsers: () => browsers,
    clear: body => request('/api/new-rr', { contextId: connection.context().id, ...body }) };
}

async function editFixture(_root, input) {
  if(input.action==='edit')await writeFile(input.destination,JSON.stringify(input.edits));
  return preview();
}
const saveDraft=(f,book,extra={})=>f.request(`/api/workbooks/${book.id}/save`,{contextId:f.connection.context().id,sha256:book.sha256,sheet:0,edits:[{cell:'A1',value:'Fixture edit'}],...extra});
const manifestPath=(f,book)=>join(f.root,'data/workbooks',book.id,'manifest.json');

test('only the selected workbook/current generation can save; original, prior versions and context remain intact',async t=>{
  const f=await fixture(t,{runWorkbook:editFixture}),book=(await f.upload('/api/workbooks')).body;
  const context=f.connection.context(),original=await readFile(join(f.root,'data/workbooks',book.id,'original.xlsx'));
  const result=await saveDraft(f,book);assert.equal(result.status,200);assert.equal(result.body.revision,1);
  assert.deepEqual(f.connection.context(),context);assert.notEqual(result.body.sha256,book.sha256);
  assert.deepEqual(await readFile(join(f.root,'data/workbooks',book.id,'original.xlsx')),original);
  const firstVersion=join(f.root,'data/workbooks',book.id,result.body.file),firstBytes=await readFile(firstVersion);
  assert.equal((await saveDraft(f,book)).status,409,'same-generation stale checksum still fails');
  assert.equal((await saveDraft(f,result.body,{edits:[{cell:'A1',value:'Second edit'}]})).status,200);
  assert.deepEqual(await readFile(firstVersion),firstBytes);assert.equal(f.launches(),0);assert.equal(f.browsers(),0);
});

test('Clear or replacement makes old saves invalid even with the latest context token',async t=>{
  let edits=0;const f=await fixture(t,{runWorkbook:async(...args)=>{if(args[1].action==='edit')edits++;return editFixture(...args);}});
  const book=(await f.upload('/api/workbooks')).body,oldContext=f.connection.context().id,before=await readFile(manifestPath(f,book));
  await f.clear({});
  assert.equal((await saveDraft(f,book,{contextId:oldContext})).status,409);
  assert.equal((await saveDraft(f,book)).status,409,'current generation cannot authorize a different/unselected workbook');
  const replacement=(await f.upload('/api/workbooks')).body;
  assert.equal((await saveDraft(f,book)).status,409);assert.equal(edits,0);
  assert.deepEqual(await readFile(manifestPath(f,book)),before);
  assert.equal((await saveDraft(f,replacement)).status,200);assert.equal(edits,1);
});

test('missing, malformed and legacy-null generations never silently adopt a cached workbook for saving',async t=>{
  const f=await fixture(t,{runWorkbook:editFixture}),book=(await f.upload('/api/workbooks')).body,before=await readFile(manifestPath(f,book));
  for(const contextId of [null,'',{},7,'stale'])assert.equal((await saveDraft(f,book,{contextId})).status,409);
  assert.equal((await f.request(`/api/workbooks/${book.id}/save`,{sha256:book.sha256,sheet:0,edits:[]})).status,409);
  await rm(join(f.root,'data/rr-context.json'));
  assert.equal((await saveDraft(f,book,{contextId:null})).status,409,'activation cannot guess an old cached selection');
  assert.deepEqual(await readFile(manifestPath(f,book)),before);
});

test('a workbook already bound to an unstarted job cannot change beneath its immutable execution copy',async t=>{
  const f=await fixture(t,{runWorkbook:editFixture}),book=(await f.upload('/api/workbooks')).body;
  const job=(await f.upload()).body,before=await readFile(manifestPath(f,book));
  const result=await saveDraft(f,book);assert.equal(result.status,409);assert.match(result.body.error,/prepared build/);
  assert.deepEqual(await readFile(manifestPath(f,book)),before);assert.equal(await readFile(job.workbook,'utf8'),'fixture RR');
  assert.equal(f.launches(),0);assert.equal(f.browsers(),0);
});

test('pending save serializes Clear, replacement, job creation and another save',async t=>{
  const entered=deferred(),release=deferred();
  const f=await fixture(t,{runWorkbook:async(...args)=>{if(args[1].action==='edit'){entered.resolve();await release.promise;}return editFixture(...args);}});
  const book=(await f.upload('/api/workbooks')).body,context=f.connection.context();
  const pending=saveDraft(f,book);await entered.promise;assert.equal(f.connection.isBusy(),true);
  assert.equal((await f.clear({})).status,409);assert.equal((await f.upload('/api/workbooks')).status,409);
  assert.equal((await f.upload()).status,409);assert.equal((await saveDraft(f,book)).status,409);
  release.resolve();assert.equal((await pending).status,200);assert.equal(f.connection.isBusy(),false);
  assert.deepEqual(f.connection.context(),context);assert.equal(f.launches(),0);assert.equal(f.browsers(),0);
});

for(const cancellation of ['stop','shutdown','context-change'])test(`${cancellation} during draft preparation cannot commit a late manifest`,async t=>{
  const entered=deferred(),release=deferred();
  const f=await fixture(t,{runWorkbook:async(...args)=>{if(args[1].action==='edit'){entered.resolve();await release.promise;}return editFixture(...args);}});
  const book=(await f.upload('/api/workbooks')).body,before=await readFile(manifestPath(f,book)),context=f.connection.context();
  const pending=saveDraft(f,book);await entered.promise;
  if(cancellation==='stop')await f.connection.stop();
  if(cancellation==='shutdown')await f.connection.shutdown();
  if(cancellation==='context-change')await writeFile(join(f.root,'data/rr-context.json'),JSON.stringify({...context,id:'11111111-1111-4111-8111-111111111111'}));
  release.resolve();assert.equal((await pending).status,409);assert.equal(f.connection.isBusy(),false);
  assert.deepEqual(await readFile(manifestPath(f,book)),before);
  assert.equal((await readdir(join(f.root,'data/workbooks',book.id))).filter(name=>name.endsWith('.xlsx')).length,2,'cancelled private version retained, not selected');
  assert.equal((await f.request(`/api/workbooks/${book.id}`)).body.revision,0);
  assert.equal(f.launches(),0);assert.equal(f.browsers(),0);
});

test('a failed edit keeps the selected version and releases the save guard for a corrected request',async t=>{
  let fail=true;const f=await fixture(t,{runWorkbook:async(...args)=>{if(args[1].action==='edit'&&fail)throw new Error('Invalid edit');return editFixture(...args);}});
  const book=(await f.upload('/api/workbooks')).body,before=await readFile(manifestPath(f,book)),context=f.connection.context();
  assert.equal((await saveDraft(f,book)).status,409);assert.deepEqual(await readFile(manifestPath(f,book)),before);assert.deepEqual(f.connection.context(),context);
  assert.equal(f.connection.isBusy(),false);fail=false;assert.equal((await saveDraft(f,book)).status,200);
});

test('current save binding survives controller recreation and does not affect another workspace',async t=>{
  const a=await fixture(t,{runWorkbook:editFixture}),b=await fixture(t,{runWorkbook:editFixture});
  const bookA=(await a.upload('/api/workbooks')).body,bookB=(await b.upload('/api/workbooks')).body,before=await readFile(manifestPath(b,bookB));
  const reopened=await fixture(t,{root:a.root,runWorkbook:editFixture});
  assert.equal((await saveDraft(reopened,bookA)).status,200);assert.deepEqual(await readFile(manifestPath(b,bookB)),before);
  assert.equal((await saveDraft(b,bookB,{contextId:a.connection.context().id})).status,409);
});

test('Clear commits a durable empty context; repeated Clear is fresh and starts no services', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/runtime')).body.rrContext, null, 'feature activation alone is not a reset');
  const old = (await f.upload()).body;
  assert.equal(f.connection.context().jobId, old.id);
  const original = await readFile(old.workbook);
  const a = await f.clear({ jobId: old.id }); assert.equal(a.status, 200);
  assert.equal(a.body.cleared, true); assert.equal(a.body.aiStarted, false);
  assert.equal(a.body.clearScope, 'CURRENT_RR_CONTEXT'); assert.equal(a.body.executionHoldsCleared, false); assert.equal(a.body.sharedSlotReleased, false);
  assert.equal(a.body.historyPreserved, true); assert.equal(a.body.spendingPreserved, true);
  assert.deepEqual(a.body.rrContext, { id: a.body.rrContext.id, workbookId: null, jobId: null, freshResetId: a.body.rrContext.freshResetId });
  assert.match(a.body.rrContext.freshResetId, /^[0-9a-f-]{36}$/);
  assert.match(a.body.rrContext.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(JSON.parse(await readFile(join(f.root, 'data/rr-context.json'))), a.body.rrContext);
  const b = await f.clear({}); assert.equal(b.status, 200); assert.notEqual(b.body.rrContext.id, a.body.rrContext.id);
  assert.deepEqual(await readFile(old.workbook), original);
  assert.equal((await f.request('/api/jobs/'+old.id)).body.status, 'CLEARED');
  assert.equal(f.launches(), 0); assert.equal(f.browsers(), 0);
  const reopened = await fixture(t, { root: f.root });
  assert.deepEqual((await reopened.request('/api/runtime')).body.rrContext, b.body.rrContext);
});

async function settledUncertain(f, patch = {}) {
  const job = (await f.upload()).body;
  const eventId = '11111111-1111-4111-8111-111111111111';
  const record = { ...job, status: 'STOPPED', phase: 'SETTLED', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    sessionPrepared: false, ownedPid: null, piCostUSD: 2.5, stopFailures: [], unresolvedChanges: ['save-tool', 'browser-save-uncertain'],
    browserFailureGuard: { executionUncertain: true }, target: { apiEventId: eventId, evtstub: eventId }, ...patch };
  await writeFile(join(job.workspace, 'job.json'), JSON.stringify(record));
  await writeFile(join(job.workspace, 'receipts/steel-cleanup.json'), '{"status":"STOPPED"}');
  await writeFile(join(job.workspace, 'browser-save-uncertain.json'), JSON.stringify({ eventId, outcome: 'UNVERIFIED' }));
  return record;
}

for (const action of ['clear', 'replace']) test(`${action} preserves a settled uncertain run, costs and cross-workspace hold while creating a fresh context`, async t => {
  const f = await fixture(t), old = await settledUncertain(f), before = f.connection.context();
  const other=await fixture(t);await settledUncertain(other);
  const otherInventory=eventHoldInventory(other.root,2);assert.equal(otherInventory.holds.length,1);
  const paths = ['job.json', 'browser-save-uncertain.json', 'original.xlsx'];
  const bytes = await Promise.all(paths.map(p => readFile(join(old.workspace, p))));
  assert.equal(executionSafety(f.root, old.id).resourcesCleared, true);
  const inventory = eventHoldInventory(f.root, 1); assert.equal(inventory.holds.length, 1);
  const result = await f.clear({ jobId: old.id, prepareUpload: action === 'replace' });
  assert.equal(result.status, 200); assert.equal(result.body.executionHoldsCleared, false);
  if (action === 'replace') {
    assert.deepEqual(f.connection.context(), before, 'upload preparation does not commit replacement');
    assert.equal((await f.upload('/api/workbooks')).status, 201);
  }
  const after = f.connection.context(); assert.notEqual(after.id, before.id); assert.equal(after.jobId, null);
  assert.equal(f.connection.budget().spentUSD, 2.5);
  assert.deepEqual(eventHoldInventory(f.root, 1), {...inventory,holds:[]}, 'explicit reset retires only unchanged settled own-workspace holds');
  assert.deepEqual(eventHoldInventory(other.root,2),otherInventory,'another workspace hold is unaffected');
  const safety=executionSafety(f.root,old.id);
  assert.equal(safety.cleared,false,'reset is not reconciliation');assert.equal(safety.uncertaintyBlocked,true);
  assert.equal(safety.historicalHoldRetired,true);
  const receiptPath=join(f.root,'data/fresh-resets',`${after.freshResetId}.json`),receiptBytes=await readFile(receiptPath);
  const receipt=JSON.parse(receiptBytes);assert.equal(receipt.savedResultVerified,false);assert.equal(receipt.oldSessionResumable,false);
  assert.ok(receipt.holds.some(h=>h.jobId===old.id));
  for (let i = 0; i < paths.length; i++) assert.deepEqual(await readFile(join(old.workspace, paths[i])), bytes[i]);
  assert.equal(f.launches(), 0); assert.equal(f.browsers(), 0);
  const reopened = await fixture(t, { root: f.root });
  assert.deepEqual(reopened.connection.context(), after, 'restart does not resurrect old selection');
  assert.deepEqual(eventHoldInventory(f.root, 1), {...inventory,holds:[]});
  assert.equal((await f.request('/api/new-rr', { jobId: old.id, contextId: before.id })).status, 409);
  await writeFile(join(old.workspace,'browser-save-uncertain.json'),JSON.stringify({eventId:old.target.apiEventId,outcome:'NEW_UNVERIFIED_EVIDENCE'}));
  assert.equal(executionSafety(f.root,old.id).historicalHoldRetired,false,'changed evidence reactivates protection');
  assert.deepEqual(eventHoldInventory(f.root,1),inventory);
  assert.deepEqual(await readFile(receiptPath),receiptBytes,'the acknowledgement is immutable');
});

test('failed replacement preview after uncertain-run cleanup retains selection and all history', async t => {
  const f = await fixture(t, { runWorkbook: () => { throw Error('Invalid workbook'); } });
  const old = await settledUncertain(f), before = f.connection.context(), bytes = await readFile(join(old.workspace, 'job.json'));
  assert.equal((await f.clear({ jobId: old.id, prepareUpload: true })).status, 200);
  assert.equal((await f.upload('/api/workbooks')).status, 409);
  assert.deepEqual(f.connection.context(), before);
  assert.deepEqual(await readFile(join(old.workspace, 'job.json')), bytes);
  assert.equal(f.launches(), 0); assert.equal(f.browsers(), 0);
});

for (const blocker of ['native', 'spending', 'browser', 'cleanup', 'session', 'missing-runtime', 'api-owner', 'browser-owner']) test(`context reset still refuses ${blocker} resource uncertainty`, async t => {
  const f = await fixture(t);
  const patch = blocker === 'native' ? { ownedPid: process.pid } : blocker === 'spending' ? { spendingUnreconciled: true }
    : blocker === 'cleanup' ? { stopFailures: ['cleanup failed'] } : blocker === 'session' ? { sessionPrepared: true } : {};
  const old = await settledUncertain(f, patch), before = f.connection.context();
  if (blocker === 'browser') await writeFile(join(old.workspace, 'receipts/steel-cleanup.json'), '{"status":"UNKNOWN"}');
  if (blocker === 'missing-runtime') await rm(join(old.workspace, 'runtime.json'));
  if (blocker === 'browser-owner') await writeFile(join(old.workspace, 'operation.lock'), '{}');
  const lease = blocker === 'api-owner' ? acquireApiLease(old.workspace) : null;
  try {
    const result = await f.clear({ jobId: old.id }); assert.equal(result.status, 409); assert.match(result.body.error, /reconciliation/);
    assert.equal((await f.upload('/api/workbooks')).status, 409);
    assert.deepEqual(f.connection.context(), before);
  } finally { lease?.release(); }
  assert.equal(f.launches(), 0); assert.equal(f.browsers(), 0);
});

test('stale reset and upload requests cannot replace the current context', async t => {
  const f = await fixture(t); const old = f.connection.context().id;
  await f.clear({}); const current = f.connection.context();
  assert.equal((await f.request('/api/new-rr', { contextId: old })).status, 409);
  assert.equal((await f.upload('/api/jobs', old)).status, 409);
  assert.equal((await f.upload('/api/workbooks', old)).status, 409);
  assert.deepEqual(f.connection.context(), current);
  assert.deepEqual(await readdir(join(f.root, 'data/jobs')), []);
});

test('an older unstarted upload cannot create a browser after Clear', async t => {
  const f = await fixture(t); const first = (await f.upload()).body; const second = (await f.upload()).body;
  await f.clear({ jobId: second.id });
  assert.equal((await f.request('/api/jobs/'+first.id+'/read', {})).status, 409);
  assert.equal(f.browsers(), 0); assert.equal(f.launches(), 0);
  const next = (await f.upload()).body;
  assert.equal(next.contextId, f.connection.context().id); assert.notEqual(next.id, first.id);
});

for (const marker of ['api-operation.lock', 'operation.lock', 'api-write-uncertain.json', 'browser-save-uncertain.json']) {
  test(`Clear retains ${marker} and does not falsely acknowledge reset`, async t => {
    const f = await fixture(t); const job = (await f.upload()).body;
    const before = f.connection.context(); const path = join(job.workspace, marker);
    await writeFile(path, '{"evidence":"retain"}');
    const result = await f.clear({ jobId: job.id }); assert.equal(result.status, 409);
    assert.match(result.body.error, /requires reconciliation/);
    assert.equal((await f.upload('/api/workbooks')).status, 409, 'direct preview upload cannot bypass cleanup');
    assert.deepEqual(f.connection.context(), before); assert.equal(await readFile(path, 'utf8'), '{"evidence":"retain"}');
  });
}

test('Clear waits for actual API ownership but preserves an unheld guard without treating it as an orphan',async t=>{
  const f=await fixture(t),job=(await f.upload()).body,lease=acquireApiLease(job.workspace);
  try{assert.equal((await f.clear({jobId:job.id})).status,409);}finally{lease.release();}
  assert.equal((await f.clear({jobId:job.id})).status,200);
  assert.equal(await readFile(join(job.workspace,API_GUARD_FILE),'utf8'),'');
  assert.equal(f.launches(),0);assert.equal(f.browsers(),0);
});

test('Clear checks shared holds even without a selected job and never kills an existing process', async t => {
  const f = await fixture(t); await mkdir(join(f.root, 'data/current'), { recursive: true });
  const marker = join(f.root, 'data/current/api-operation.lock'); await writeFile(marker, '{}');
  assert.equal((await f.clear({})).status, 409); assert.equal(f.connection.context().id, null);
  await rm(marker);
  const job = (await f.upload()).body;
  await writeFile(join(job.workspace, 'job.json'), JSON.stringify({ ...job, ownedPid: process.pid }));
  assert.equal((await f.clear({ jobId: job.id })).status, 409);
  assert.equal(f.connection.context().id, null);
});

test('invalid preview retains the previous context; only a successful upload commits replacement', async t => {
  let fail = true;
  const f = await fixture(t, { runWorkbook: () => { if (fail) throw new Error('Invalid workbook'); return preview(); } });
  const old = (await f.upload()).body;
  const before = f.connection.context();
  const prepared = await f.clear({ jobId: old.id, prepareUpload: true }); assert.equal(prepared.status, 200);
  assert.deepEqual(prepared.body.rrContext, before);
  assert.equal((await f.upload('/api/workbooks')).status, 409); assert.deepEqual(f.connection.context(), before);
  fail = false;
  const uploaded = await f.upload('/api/workbooks'); assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.rrContext.workbookId, uploaded.body.id); assert.equal(uploaded.body.rrContext.jobId, null);
  assert.notEqual(uploaded.body.rrContext.id, before.id);
  assert.equal((await f.request('/api/jobs/'+old.id)).body.status, 'CLEARED');
  const second = await f.upload('/api/workbooks'); assert.equal(second.status, 201);
  assert.notEqual(second.body.rrContext.id, uploaded.body.rrContext.id);
  assert.notEqual(second.body.id, uploaded.body.id, 'same filename/bytes still get a new context');
});

test('workbook preparation serializes resets and job creation; Stop cancels its context commit', async t => {
  const entered = deferred(), release = deferred();
  const f = await fixture(t, { runWorkbook: async () => { entered.resolve(); await release.promise; return preview(); } });
  const pending = f.upload('/api/workbooks'); await entered.promise;
  assert.equal(f.connection.isBusy(), true);
  assert.equal((await f.clear({})).status, 409);
  assert.equal((await f.upload()).status, 409);
  assert.equal((await f.upload('/api/workbooks')).status, 409);
  await f.connection.stop(); release.resolve();
  assert.equal((await pending).status, 409);
  assert.equal(f.connection.context().id, null); assert.equal(f.connection.isBusy(), false);
});

test('reset affects only its own workspace; corrupt reset metadata fails closed', async t => {
  const a = await fixture(t), b = await fixture(t);
  const other = (await b.upload()).body; const before = b.connection.context();
  await a.clear({}); assert.deepEqual(b.connection.context(), before);
  assert.equal((await b.request('/api/jobs/'+other.id)).body.status, 'UPLOADED');
  await writeFile(join(a.root, 'data/rr-context.json'), '{"id":"invalid"}');
  assert.equal((await a.request('/api/new-rr', {})).status, 409);
  assert.equal(await readFile(join(a.root, 'data/rr-context.json'), 'utf8'), '{"id":"invalid"}');
});
