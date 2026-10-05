import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { apiOperationBlocked, API_GUARD_FILE } from '../app/api-operation-lease.mjs';

const eventId = "11111111-1111-1111-1111-111111111111", discountId = "22222222-2222-2222-2222-222222222222";
const row = { id: discountId, level: "EVENT", type: "DISCOUNT_CODE", name: "Test", code: "EXISTING", active: false, stackable: false, method: { type: "BY_PERCENTAGE", value: 10 }, note: "Original", audienceType: "ALL", includeGuestsTowardsCapacity: false, autoApply: false, applyToAllAgendaItems: false, capacity: { total: 100, used: 0 } };
const event = { id: eventId, title: "Discount CLI Test", status: "Pending" };
const request = { rrReferences: ["Discounts!B2"], data: { code: "EXISTING", patch: { note: "Requested" } } };
const createRequest = { rrReferences: ["Discounts!B3"], data: { code: "NEW", createIfMissing: true, patch: { name: "New test", active: false, stackable: false, method: { type: "BY_PERCENTAGE", value: 10 }, note: "Requested", audienceType: "ALL", includeGuestsTowardsCapacity: false, autoApply: false, capacity: { total: 100 } } } };
async function setup(t, existing = false) {
  const dir = await mkdtemp(join(tmpdir(), "discount-cli-")), children = [];
  t.after(async()=>{
    for(const {child,done} of children){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await done;}
    await rm(dir,{recursive:true,force:true});
  });
  await writeFile(join(dir, "job.json"), JSON.stringify({ status: "RUNNING", apiOperationLocking: 'kernel-flock-v1', target: { apiEventId: eventId, name: event.title } }));
  await writeFile(join(dir, "runtime.json"), JSON.stringify({ ownership: "AGENT" }));
  await writeFile(join(dir, "remote.json"), JSON.stringify(existing ? row : null));
  await writeFile(join(dir, "links.json"), '[]');
  // Every fetch is intercepted. No credentials or live network are used.
  const preload = join(dir, "mock-fetch.mjs");
  await writeFile(preload, `
import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const dir=${JSON.stringify(dir)}, event=${JSON.stringify(event)};
const timer=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>timer(fn,Math.min(ms,1),...args);
const json=v=>new Response(JSON.stringify(v),{status:200});let scans=0;
if(process.env.TEST_STOP_ON_LOCK){
 const spawn=childProcess.spawnSync;
 childProcess.spawnSync=(...args)=>{if(args[0]==='python3'){const path=dir+'/job.json';fs.writeFileSync(path,JSON.stringify({...JSON.parse(fs.readFileSync(path,'utf8')),status:'STOPPED'}));}return spawn(...args);};
 syncBuiltinESMExports();
}
globalThis.fetch=async(input,init={})=>{
 const u=new URL(input),m=init.method||'GET';
 assert.equal(u.origin,'https://api-platform.cvent.com');
 await appendFile(dir+'/requests.log',m+' '+u.pathname+'\\n');
 if(u.pathname==='/ea/oauth2/token')return json({access_token:'dummy-token',expires_in:3600});
 if(u.pathname==='/ea/events/${eventId}'){
  assert.equal(m,'GET');
  if(process.env.TEST_HOLD_READ){await writeFile(dir+'/held.json','READ');await new Promise(()=>setInterval(()=>{},1000));}
  return json(event);
 }
 const base='/ea/events/${eventId}/discounts';
 const original=JSON.parse(await readFile(dir+'/remote.json'));
 const itemId='33333333-3333-3333-3333-333333333333';
 if(u.pathname==='/ea/admission-items'){assert.equal(m,'GET');assert.equal(u.searchParams.get('filter'),"event.id eq '${eventId}'");return json({data:[{id:itemId,event:{id:'${eventId}'}}]})}
 const links=JSON.parse(await readFile(dir+'/links.json'));
 if(u.pathname===base+'/agenda-items'){
  assert.equal(m,'GET');
  if(original && !links.length && process.env.TEST_LINK_TAKEOVER)await writeFile(dir+'/runtime.json',JSON.stringify({ownership:'USER'}));
  if(original && !links.length && process.env.TEST_FOREIGN_INTENT)await writeFile(dir+'/api-write-uncertain.json',JSON.stringify({receiptId:'foreign',eventId:'${eventId}',operation:'configureDiscount'}));
  return json({data:process.env.TEST_LINK_STALE?[]:links});
 }
 if(u.pathname===base+'/${discountId}/agenda-items/'+itemId){
  assert.equal(m,'PUT');assert.equal(original.active,false);assert.equal(links.length,0);
  await appendFile(dir+'/writes.log','LINK\\n');
  if(process.env.TEST_LINK_DENIED)return new Response(JSON.stringify({message:'Denied'}),{status:403});
  await writeFile(dir+'/links.json',JSON.stringify([{id:itemId,type:'AdmissionItem',discount:{id:'${discountId}'}}]));
  return new Response(null,{status:204});
 }
 if(u.pathname===base+'/${discountId}'){
  assert.equal(m,'PUT');
  await appendFile(dir+'/writes.log','FINALIZE\\n');
  const body=JSON.parse(init.body),saved={...original,...body,...(body.type==='VOLUME_DISCOUNT'?{}:{capacity:{...body.capacity,used:0}})};
  if(!process.env.TEST_FINAL_STALE)await writeFile(dir+'/remote.json',JSON.stringify(saved));
  return json(saved);
 }
 assert.equal(u.pathname,base);
 if(m==='POST'){
  assert.equal(original,null,'never create over an existing code');
  await appendFile(dir+'/writes.log','POST\\n');
  if(process.env.TEST_HOLD_WRITE){await writeFile(dir+'/held.json','WRITE');await new Promise(()=>setInterval(()=>{},1000));}
  const body=JSON.parse(init.body);
  const saved={...body,id:'${discountId}',level:'EVENT',...(body.type==='VOLUME_DISCOUNT'?{}:{capacity:{...body.capacity,used:0}})};
  if(!process.env.TEST_STALE)await writeFile(dir+'/remote.json',JSON.stringify(saved));
  return new Response(JSON.stringify(saved),{status:201});
 }
 assert.equal(m,'GET','no existing-item updates allowed');
 if(!u.searchParams.has('filter') && ++scans===2 && process.env.TEST_TAKEOVER)await writeFile(dir+'/runtime.json',JSON.stringify({ownership:'USER'}));
 return json({data:process.env.TEST_HIDE||!original?[]:[original]});
};
`);
  function launch(operation = "configureDiscount", input = createRequest, flags = {}) {
    let child;
    const done = new Promise((resolve, reject) => {
      child = spawn(process.execPath, ["--import", preload, new URL("../app/cvent-api-cli.mjs", import.meta.url).pathname, operation], { env: { ...process.env, CVENT_CREDENTIALS_FILE: "", CVENT_API_BASE_URL: "https://api-platform.cvent.com/ea", CVENT_CLIENT_ID: "dummy-id", CVENT_CLIENT_SECRET: "dummy-secret", RR_WORKSPACE: dir, TEST_STALE: "", TEST_HIDE: "", TEST_TAKEOVER: "", TEST_LINK_TAKEOVER: "", TEST_FOREIGN_INTENT: "", TEST_LINK_STALE: "", TEST_LINK_DENIED: "", TEST_FINAL_STALE: "", TEST_HOLD_READ: "", TEST_HOLD_WRITE: "", TEST_STOP_ON_LOCK: "", ...flags }, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "", stderr = ""; child.stdout.on("data", c => stdout += c); child.stderr.on("data", c => stderr += c);
      child.on("error", reject); child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr })); child.stdin.end(JSON.stringify(input));
    });
    children.push({child,done}); // Children settle before disposable files are removed.
    return {child,done};
  }
  const run = (...args) => launch(...args).done;
  const receipts = async () => Promise.all((await readdir(join(dir, "receipts"))).filter(f => f.endsWith(".json")).map(async f => JSON.parse(await readFile(join(dir, "receipts", f)))));
  return { dir, run, launch, receipts };
}
async function waitHeld(f) {
  for(let i=0;i<200&&!existsSync(join(f.dir,'held.json'));i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(existsSync(join(f.dir,'held.json')),true,'mock network request reached its barrier');
}

test('forced read termination leaves read evidence, not an orphan ownership blocker',async t=>{
  const f=await setup(t),running=f.launch('listDiscounts',{}, {TEST_HOLD_READ:'1'});await waitHeld(f);
  assert.equal(apiOperationBlocked(f.dir),true);
  const before=await readFile(join(f.dir,'requests.log'),'utf8');
  const conflict=await f.run('listDiscounts',{});assert.equal(conflict.code,1);assert.equal(await readFile(join(f.dir,'requests.log'),'utf8'),before);
  const started=(await f.receipts())[0];assert.equal(started.status,'READ_STARTED');assert.equal(started.access,'api-read');assert.equal(started.ownership.mechanism,'kernel-flock-v1');
  running.child.kill('SIGKILL');assert.equal((await running.done).signal,'SIGKILL');
  assert.equal(apiOperationBlocked(f.dir),false);assert.equal(existsSync(join(f.dir,API_GUARD_FILE)),true);
  assert.deepEqual((await f.receipts())[0],started,'interrupted read is not promoted to PASS or erased');
  assert.equal(existsSync(join(f.dir,'api-operation.lock')),false);assert.equal(existsSync(join(f.dir,'api-write-uncertain.json')),false);
  assert.equal((await f.run('listDiscounts',{})).code,0,'explicit later read can acquire the free guard');
});

test('forced write termination releases OS ownership but preserves uncertainty and blocks replay',async t=>{
  const f=await setup(t),running=f.launch('configureDiscount',createRequest,{TEST_HOLD_WRITE:'1'});await waitHeld(f);
  const marker=await readFile(join(f.dir,'api-write-uncertain.json'),'utf8');assert.equal(apiOperationBlocked(f.dir),true);
  const receipt=(await f.receipts())[0];assert.equal(receipt.status,'INTENT_REQUIRES_RECONCILIATION');
  running.child.kill('SIGKILL');await running.done;assert.equal(apiOperationBlocked(f.dir),false);
  const requests=await readFile(join(f.dir,'requests.log'),'utf8');
  assert.equal((await f.run()).code,1);assert.equal(await readFile(join(f.dir,'requests.log'),'utf8'),requests);
  assert.equal(await readFile(join(f.dir,'api-write-uncertain.json'),'utf8'),marker);assert.deepEqual((await f.receipts())[0],receipt);
});

test('Stop between initial validation and kernel acquisition prevents any authentication or API request',async t=>{
  const f=await setup(t),result=await f.run('listDiscounts',{}, {TEST_STOP_ON_LOCK:'1'});
  assert.equal(result.code,1);assert.match(result.stderr,/Stop, takeover/);assert.equal(existsSync(join(f.dir,'requests.log')),false);
  assert.equal(apiOperationBlocked(f.dir),false);assert.equal((await f.receipts())[0].status,'BLOCKED');
});

test('new CLI refuses old or unknown job protocols before authentication or guard creation',async t=>{
  const f=await setup(t),path=join(f.dir,'job.json'),job=JSON.parse(await readFile(path,'utf8'));
  for(const apiOperationLocking of [undefined,'unknown']){
    const before=JSON.stringify({...job,apiOperationLocking});await writeFile(path,before);
    const result=await f.run('listDiscounts',{});assert.equal(result.code,1);assert.match(result.stderr,/compatible API ownership/);
    assert.equal(await readFile(path,'utf8'),before);
  }
  assert.equal(existsSync(join(f.dir,'requests.log')),false);assert.equal(existsSync(join(f.dir,API_GUARD_FILE)),false);
});

test('legacy API locks are never migrated, deleted or bypassed by the new CLI',async t=>{
  const f=await setup(t),path=join(f.dir,'api-operation.lock');await writeFile(path,'legacy evidence');
  const result=await f.run('listDiscounts',{});assert.equal(result.code,1);assert.match(result.stderr,/Legacy/);
  assert.equal(await readFile(path,'utf8'),'legacy evidence');assert.equal(existsSync(join(f.dir,'requests.log')),false);
  assert.equal(existsSync(join(f.dir,API_GUARD_FILE)),false);
});

test('current-run uncertain API writes still block mutation before network access and permit reads', async t => {
  const f = await setup(t);
  const marker = '{"status":"UNCERTAIN","intent":"this-run"}';
  await writeFile(join(f.dir, 'api-write-uncertain.json'), marker);
  const denied = await f.run(); assert.equal(denied.code, 1); assert.match(denied.stderr, /This run's API write is uncertain/);
  assert.equal(existsSync(join(f.dir, 'requests.log')), false);
  const read = await f.run('listDiscounts', {}); assert.equal(read.code, 0, read.stderr);
  assert.equal(existsSync(join(f.dir, 'writes.log')), false);
  assert.equal(await readFile(join(f.dir, 'api-write-uncertain.json'), 'utf8'), marker);
});

test('browser save uncertainty blocks API writes before network but permits reads', async t => {
  const f = await setup(t); const marker = '{"reason":"unknown save"}';
  await writeFile(join(f.dir, 'browser-save-uncertain.json'), marker);
  const denied = await f.run(); assert.equal(denied.code, 1); assert.match(denied.stderr, /browser save is uncertain/);
  assert.equal(existsSync(join(f.dir, 'requests.log')), false);
  assert.equal((await f.run('listDiscounts', {})).code, 0);
  assert.equal(await readFile(join(f.dir, 'browser-save-uncertain.json'), 'utf8'), marker);
});

test("RR CLI advertises only discount writes and explains its narrower route policy", async t => {
  const f = await setup(t), result = await f.run("capabilities");
  assert.equal(result.code, 0, result.stderr);
  const capabilities = JSON.parse(result.stdout);
  assert.equal(capabilities.operations.configureDiscount, "api-write");
  assert.equal(capabilities.operations.configureVolumeDiscount, "api-write");
  assert.equal(capabilities.writeCapabilities.configureVolumeDiscount.mode, "event-only-create-or-update");
  assert.equal(capabilities.operations.listDiscounts, "api-read");
  assert.equal(capabilities.operations.listQuantityItems, "api-read");
  assert.match(capabilities.writeCapabilities.configureDiscount.supports.join(' '), /item-scoped/);
  assert.deepEqual(Object.entries(capabilities.operations).filter(([,mode])=>mode==='api-write').map(([name])=>name), ['configureDiscount','configureVolumeDiscount']);
  assert.deepEqual(Object.keys(capabilities.writeCapabilities), ['configureDiscount','configureVolumeDiscount']);
  for (const operation of ["updateEvent", "updateEventBasics", "updateRegistrationType", "enableEventFeature"]) {
    assert.equal(capabilities.operations[operation], undefined);assert.equal(capabilities.writeCapabilities[operation], undefined);
    assert.match(capabilities.blockedOperations[operation], /RR jobs permit only discount API writes/);
  }
  for (const operation of ['updateEventCustomFieldAnswers', 'createContactType', 'createCustomField', 'listSessions']) {
    assert.equal(capabilities.operations[operation], undefined); assert.ok(capabilities.blockedOperations[operation]);
  }
  assert.equal(existsSync(join(f.dir, "requests.log")), false);
});
test("RR CLI blocks shared/integration and non-discount writes before network or receipt creation", async t => {
  const f = await setup(t, true);
  for (const operation of ['updateEventCustomFieldAnswers', 'createCustomField', 'createContactType', 'listSessions']) assert.equal((await f.run(operation, {})).code, 1);
  assert.equal(existsSync(join(f.dir, 'requests.log')), false);
  for (const operation of ['updateEvent', 'updateEventBasics', 'updateRegistrationType']) assert.equal((await f.run(operation, { rrReferences: ['Event!B2'], data: { title: 'Renamed' } })).code, 1);
  assert.equal(existsSync(join(f.dir, 'receipts')), false);
  assert.equal(existsSync(join(f.dir, 'requests.log')), false);
  assert.deepEqual(JSON.parse(await readFile(join(f.dir, 'remote.json'))), row);
  for (const file of ['writes.log', 'api-write-uncertain.json', 'api-operation.lock']) assert.equal(existsSync(join(f.dir, file)), false);
});
test('non-discount route denial precedes workspace/credential access and ignores caller permission overrides', async t => {
  const f=await setup(t);
  for(const operation of ['updateEvent','updateEventBasics','updateRegistrationType','enableEventFeature']){
    for(const RR_WORKSPACE of ['',join(f.dir,'absent-job'),f.dir]){
      const result=await f.run(operation,{authorizedOperations:[operation],scope:'all',rrReferences:['RR!A1'],data:{note:'not a grant'}},
        {RR_WORKSPACE,CVENT_CREDENTIALS_FILE:join(f.dir,'absent-credentials'),CVENT_API_WRITE_SCOPE:'all',CVENT_API_ADMIN:'true'});
      assert.equal(result.code,1);assert.match(result.stderr,/RR jobs permit only discount API writes/);
      assert.equal(result.stdout,'');
    }
  }
  for(const file of ['requests.log','writes.log','receipts','api-operation.lock','api-write-uncertain.json'])assert.equal(existsSync(join(f.dir,file)),false,file);
});

test('unknown, case-altered and prototype operation names cannot widen the RR write policy',async t=>{
  const f=await setup(t);
  for(const operation of ['UpdateEvent','updateEvent ','configureEverything','constructor','__proto__','configureDiscount/../updateEvent']){
    const result=await f.run(operation,{});assert.equal(result.code,1);assert.equal(result.stdout,'');
  }
  assert.equal(existsSync(join(f.dir,'requests.log')),false);assert.equal(existsSync(join(f.dir,'receipts')),false);
});

test("CLI updates an existing event code with durable intent, saved verification and no duplicate creation", async t => {
  const f = await setup(t, true), result = await f.run('configureDiscount', request);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout), receipt = (await f.receipts())[0];
  assert.equal(output.action, 'updated'); assert.equal(output.requirementsSatisfied, true);
  assert.equal(receipt.status, 'PASS'); assert.deepEqual(receipt.prepared.baseline, row);
  assert.deepEqual(receipt.result.saved, { ...row, note: 'Requested' });
  assert.equal(receipt.writeEvidence[0].phase, 'ACKNOWLEDGED_NOT_VERIFIED'); assert.equal(receipt.writeEvidence.at(-1).matched, true);
  assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), false);
  assert.deepEqual(JSON.parse(await readFile(join(f.dir, 'api-discounts.json'))), { eventId, discounts: { EXISTING: discountId } });
  const repeat = await f.run('configureDiscount', request); assert.equal(repeat.code, 0, repeat.stderr);
  assert.equal(JSON.parse(repeat.stdout).action, 'unchanged'); assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), 'FINALIZE\n');
});
test('existing discount update uncertainty blocks replay and keeps the original ID', async t => {
  const f = await setup(t, true), result = await f.run('configureDiscount', request, { TEST_FINAL_STALE: '1' });
  assert.equal(result.code, 1); const receipt = (await f.receipts())[0]; assert.equal(receipt.status, 'UNCERTAIN');
  assert.equal(receipt.prepared.discountId, discountId); assert.equal(receipt.prepared.baseline.id, discountId);
  assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), true);
  const writes = await readFile(join(f.dir, 'writes.log'), 'utf8'); assert.equal(writes, 'FINALIZE\n');
  assert.equal((await f.run('configureDiscount', request)).code, 1); assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), writes);
  assert.equal((await f.run('listDiscounts', {})).code, 0);
});
test("CLI persists creation evidence/identity; retries reuse and stale later lookup cannot recreate it", async t => {
  const f = await setup(t); const result = await f.run(); assert.equal(result.code, 0, result.stderr);
  const receipt = (await f.receipts())[0]; assert.equal(receipt.status, "PASS");
  assert.equal(receipt.prepared.baseline, null); assert.equal(receipt.prepared.body.note, "Requested");
  assert.equal(receipt.writeEvidence[0].discountId, discountId); assert.equal(receipt.writeEvidence.at(-1).matched, true);
  assert.deepEqual(JSON.parse(await readFile(join(f.dir, "api-discounts.json"))), { eventId, discounts: { NEW: discountId } });
  assert.equal(existsSync(join(f.dir, "api-write-uncertain.json")), false);
  const repeat = await f.run(); assert.equal(repeat.code, 0, repeat.stderr); assert.equal(JSON.parse(repeat.stdout).action, "unchanged");
  const hidden = await f.run("configureDiscount", createRequest, { TEST_HIDE: "1" });
  assert.equal(hidden.code, 1); assert.match(hidden.stderr, /does not match/);
  assert.equal(await readFile(join(f.dir, "writes.log"), "utf8"), "POST\n");
  assert.equal(existsSync(join(f.dir, "api-operation.lock")), false);
});
test("CLI refuses missing RR evidence and takeover during preparation without creating uncertainty or dispatching", async t => {
  for (const takeover of [false, true]) {
    const f = await setup(t);
    const result = await f.run("configureDiscount", takeover ? createRequest : { data: createRequest.data }, takeover ? { TEST_TAKEOVER: "1" } : {});
    assert.equal(result.code, 1);
    assert.match(result.stderr, takeover ? /takeover/ : /RR source references/);
    assert.equal((await f.receipts())[0].status, "BLOCKED");
    for (const file of ["writes.log", "api-write-uncertain.json", "api-operation.lock"]) assert.equal(existsSync(join(f.dir, file)), false, file);
  }
});
const itemRequest = () => ({ ...createRequest, data: { ...createRequest.data, patch: { ...createRequest.data.patch, active: true }, agendaItems: [{ id: '33333333-3333-3333-3333-333333333333', type: 'AdmissionItem' }] } });
test("production CLI allows new item-discount POST/link/finalize, retaining each intent until complete verification", async t => {
  const f = await setup(t), result = await f.run('configureDiscount', itemRequest());
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).action, 'created');
  const receipt = (await f.receipts())[0];
  assert.equal(receipt.status, 'PASS'); assert.equal(receipt.result.initialConfigurationComplete, true);
  assert.deepEqual(receipt.preparedWrites.map(x => x.phase ?? 'CREATE'), ['CREATE', 'LINK_NEW_DISCOUNT_ITEM', 'FINALIZE_NEW_DISCOUNT']);
  assert.equal(receipt.prepared.body.active, false); assert.equal(receipt.result.saved.active, true);
  assert.equal(receipt.writeEvidence.at(-1).phase, 'FINAL_READBACK');
  assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), 'POST\nLINK\nFINALIZE\n');
  assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), false);
  const repeat = await f.run('configureDiscount', itemRequest()); assert.equal(repeat.code, 0, repeat.stderr);
  assert.equal(JSON.parse(repeat.stdout).action, 'unchanged');
  assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), 'POST\nLINK\nFINALIZE\n');
  const changed = itemRequest(); changed.data.agendaItems[0].id = '44444444-4444-4444-4444-444444444444';
  const preserved = await f.run('configureDiscount', changed); assert.equal(preserved.code, 1); assert.match(preserved.stderr, /Removing\/replacing/);
  assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), 'POST\nLINK\nFINALIZE\n');
});
test("production item-discount failures retain the entire uncertain creation and never replay", async t => {
  for (const flags of [{ TEST_LINK_DENIED: '1' }, { TEST_LINK_STALE: '1' }, { TEST_FINAL_STALE: '1' }, { TEST_LINK_TAKEOVER: '1' }]) {
    const f = await setup(t), result = await f.run('configureDiscount', itemRequest(), flags);
    assert.equal(result.code, 1); const receipt = (await f.receipts())[0]; assert.equal(receipt.status, 'UNCERTAIN');
    assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), true);
    assert.equal(existsSync(join(f.dir, 'api-discounts.json')), false);
    const before = await readFile(join(f.dir, 'writes.log'), 'utf8'); assert.equal(before.split('POST').length, 2);
    assert.equal((await f.run('configureDiscount', itemRequest())).code, 1);
    assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), before);
    assert.equal(existsSync(join(f.dir, 'api-operation.lock')), false);
  }
});
const volumeRequest = (linked = false) => ({ rrReferences: ['Discounts!B4'], data: { name: 'Group rate', createIfMissing: true, patch: { active: true, stackable: false, method: { type: 'BY_PERCENTAGE', value: 10 }, thresholdType: 'AFTER_THRESHOLD_LIMIT', thresholdLimit: 5, interval: 1, includePrimaryRegistrant: false }, ...(linked ? { agendaItems: itemRequest().data.agendaItems } : {}) } });
test('production volume CLI records durable identity and verifies new-only finalization', async t => {
  for (const linked of [false, true]) {
    const f = await setup(t), request = volumeRequest(linked), result = await f.run('configureVolumeDiscount', request);
    assert.equal(result.code, 0, result.stderr); const receipt = (await f.receipts())[0];
    assert.equal(receipt.status, 'PASS'); assert.equal(receipt.prepared.body.type, 'VOLUME_DISCOUNT');
    assert.equal(receipt.prepared.body.active, !linked); assert.equal(receipt.result.saved.active, true);
    assert.equal(receipt.writeEvidence.at(-1).matched, true);
    assert.deepEqual(JSON.parse(await readFile(join(f.dir, 'api-volume-discounts.json'))), { eventId, discounts: { 'Group rate': discountId } });
    assert.equal(existsSync(join(f.dir, 'api-discounts.json')), false); assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), false);
    const writes = await readFile(join(f.dir, 'writes.log'), 'utf8'); assert.equal(writes, linked ? 'POST\nLINK\nFINALIZE\n' : 'POST\n');
    const repeat = await f.run('configureVolumeDiscount', request); assert.equal(repeat.code, 0, repeat.stderr); assert.equal(JSON.parse(repeat.stdout).action, 'unchanged');
    const changed = structuredClone(request); changed.data.patch.thresholdLimit = 8;
    const preserve = await f.run('configureVolumeDiscount', changed); assert.equal(preserve.code, 0, preserve.stderr); assert.equal(JSON.parse(preserve.stdout).requirementsSatisfied, true);
    assert.equal((await f.run('configureVolumeDiscount', request, { TEST_HIDE: '1' })).code, 1);
    assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), writes + 'FINALIZE\n');
  }
});
test('volume CLI blocks absent evidence/takeover and retains uncertainty across all partial failures', async t => {
  for (const flags of [{ TEST_STALE: '1' }, { TEST_LINK_DENIED: '1' }, { TEST_LINK_STALE: '1' }, { TEST_FINAL_STALE: '1' }, { TEST_LINK_TAKEOVER: '1' }, { TEST_FOREIGN_INTENT: '1' }]) {
    const f = await setup(t), request = volumeRequest(true), result = await f.run('configureVolumeDiscount', request, flags);
    assert.equal(result.code, 1); assert.equal((await f.receipts())[0].status, 'UNCERTAIN');
    assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), true); assert.equal(existsSync(join(f.dir, 'api-volume-discounts.json')), false);
    const before = await readFile(join(f.dir, 'writes.log'), 'utf8'); assert.equal(before.split('POST').length, 2);
    for (const op of ['configureVolumeDiscount', 'configureDiscount']) assert.equal((await f.run(op, request)).code, 1);
    assert.equal((await f.run('listDiscounts', {})).code, flags.TEST_LINK_TAKEOVER ? 1 : 0); assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), before);
  }
  for (const takeover of [false, true]) {
    const f = await setup(t), request = volumeRequest(); if (!takeover) delete request.rrReferences;
    const result = await f.run('configureVolumeDiscount', request, takeover ? { TEST_TAKEOVER: '1' } : {});
    assert.equal(result.code, 1); assert.equal(existsSync(join(f.dir, 'writes.log')), false); assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), false);
  }
});
test("multi-step creation cannot overwrite another command's uncertainty marker", async t => {
  const f = await setup(t), result = await f.run('configureDiscount', itemRequest(), { TEST_FOREIGN_INTENT: '1' });
  assert.equal(result.code, 1); assert.match(result.stderr, /unresolved API write/);
  assert.equal(JSON.parse(await readFile(join(f.dir, 'api-write-uncertain.json'))).receiptId, 'foreign');
  assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), 'POST\n');
});
test("CLI keeps uncertainty, input and acknowledged ID after exhausted polling; blocks replay but permits reads", async t => {
  const f = await setup(t); const result = await f.run("configureDiscount", createRequest, { TEST_STALE: "1" });
  assert.equal(result.code, 1); assert.match(result.stderr, /bounded polling/);
  const receipt = (await f.receipts())[0]; assert.equal(receipt.status, "UNCERTAIN");
  assert.equal(receipt.requested.code, "NEW"); assert.equal(receipt.prepared.baseline, null);
  assert.equal(receipt.writeEvidence[0].discountId, discountId); assert.equal(receipt.writeEvidence.filter(e => e.phase === "READBACK").length, 7);
  assert.equal(existsSync(join(f.dir, "api-write-uncertain.json")), true);
  assert.equal(existsSync(join(f.dir, "api-discounts.json")), false);
  const repeat = await f.run(); assert.equal(repeat.code, 1); assert.match(repeat.stderr, /This run's API write is uncertain/);
  const read = await f.run("listDiscounts", {}); assert.equal(read.code, 0, read.stderr);
  assert.equal(existsSync(join(f.dir, "api-write-uncertain.json")), true);
  assert.equal(await readFile(join(f.dir, "writes.log"), "utf8"), "POST\n");
});
