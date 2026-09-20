import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const eventId = "11111111-1111-1111-1111-111111111111", discountId = "22222222-2222-2222-2222-222222222222";
const row = { id: discountId, level: "EVENT", type: "DISCOUNT_CODE", name: "Test", code: "EXISTING", active: false, stackable: false, method: { type: "BY_PERCENTAGE", value: 10 }, note: "Original", audienceType: "ALL", includeGuestsTowardsCapacity: false, autoApply: false, applyToAllAgendaItems: false, capacity: { total: 100, used: 0 } };
const event = { id: eventId, title: "(C+D) Test", status: "Pending" };
const request = { rrReferences: ["Discounts!B2"], data: { code: "EXISTING", patch: { note: "Requested" } } };
const createRequest = { rrReferences: ["Discounts!B3"], data: { code: "NEW", createIfMissing: true, patch: { name: "New test", active: false, stackable: false, method: { type: "BY_PERCENTAGE", value: 10 }, note: "Requested", audienceType: "ALL", includeGuestsTowardsCapacity: false, autoApply: false, capacity: { total: 100 } } } };
async function setup(t, existing = false) {
  const dir = await mkdtemp(join(tmpdir(), "discount-cli-")); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "job.json"), JSON.stringify({ status: "RUNNING", target: { apiEventId: eventId, name: event.title } }));
  await writeFile(join(dir, "runtime.json"), JSON.stringify({ ownership: "AGENT" }));
  await writeFile(join(dir, "remote.json"), JSON.stringify(existing ? row : null));
  await writeFile(join(dir, "links.json"), '[]');
  // Every fetch is intercepted. No credentials or live network are used.
  const preload = join(dir, "mock-fetch.mjs");
  await writeFile(preload, `
import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
const dir=${JSON.stringify(dir)}, event=${JSON.stringify(event)};
const timer=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>timer(fn,Math.min(ms,1),...args);
const json=v=>new Response(JSON.stringify(v),{status:200});let scans=0;
globalThis.fetch=async(input,init={})=>{
 const u=new URL(input),m=init.method||'GET';
 assert.equal(u.origin,'https://api-platform.cvent.com');
 await appendFile(dir+'/requests.log',m+' '+u.pathname+'\\n');
 if(u.pathname==='/ea/oauth2/token')return json({access_token:'dummy-token',expires_in:3600});
 if(u.pathname==='/ea/events/${eventId}'){assert.equal(m,'GET');return json(event)}
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
  assert.equal(m,'PUT');assert.equal(original.active,false);assert.equal(links.length,1);
  await appendFile(dir+'/writes.log','FINALIZE\\n');
  const body=JSON.parse(init.body),saved={...original,...body,capacity:{...body.capacity,used:0}};
  if(!process.env.TEST_FINAL_STALE)await writeFile(dir+'/remote.json',JSON.stringify(saved));
  return json(saved);
 }
 assert.equal(u.pathname,base);
 if(m==='POST'){
  assert.equal(original,null,'never create over an existing code');
  await appendFile(dir+'/writes.log','POST\\n');
  const body=JSON.parse(init.body);
  const saved={...body,id:'${discountId}',level:'EVENT',capacity:{...body.capacity,used:0}};
  if(!process.env.TEST_STALE)await writeFile(dir+'/remote.json',JSON.stringify(saved));
  return new Response(JSON.stringify(saved),{status:201});
 }
 assert.equal(m,'GET','no existing-item updates allowed');
 if(!u.searchParams.has('filter') && ++scans===2 && process.env.TEST_TAKEOVER)await writeFile(dir+'/runtime.json',JSON.stringify({ownership:'USER'}));
 return json({data:process.env.TEST_HIDE||!original?[]:[original]});
};
`);
  async function run(operation = "configureDiscount", input = createRequest, flags = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", preload, new URL("../app/cvent-api-cli.mjs", import.meta.url).pathname, operation], { env: { ...process.env, CVENT_CREDENTIALS_FILE: "", CVENT_API_BASE_URL: "https://api-platform.cvent.com/ea", CVENT_CLIENT_ID: "dummy-id", CVENT_CLIENT_SECRET: "dummy-secret", RR_WORKSPACE: dir, TEST_STALE: "", TEST_HIDE: "", TEST_TAKEOVER: "", TEST_LINK_TAKEOVER: "", TEST_FOREIGN_INTENT: "", TEST_LINK_STALE: "", TEST_LINK_DENIED: "", TEST_FINAL_STALE: "", ...flags }, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "", stderr = ""; child.stdout.on("data", c => stdout += c); child.stderr.on("data", c => stderr += c);
      child.on("error", reject); child.on("close", code => resolve({ code, stdout, stderr })); child.stdin.end(JSON.stringify(input));
    });
  }
  const receipts = async () => Promise.all((await readdir(join(dir, "receipts"))).filter(f => f.endsWith(".json")).map(async f => JSON.parse(await readFile(join(dir, "receipts", f)))));
  return { dir, run, receipts };
}
test("CLI advertises create-only production writes and explains prohibited update operations", async t => {
  const f = await setup(t), result = await f.run("capabilities");
  assert.equal(result.code, 0, result.stderr);
  const capabilities = JSON.parse(result.stdout);
  assert.equal(capabilities.operations.configureDiscount, "api-write");
  assert.equal(capabilities.operations.listDiscounts, "api-read");
  assert.equal(capabilities.operations.listQuantityItems, "api-read");
  assert.match(capabilities.writeCapabilities.configureDiscount.supports.join(' '), /item-scoped/);
  for (const operation of ["updateEvent", "updateEventBasics", "updateRegistrationType", "updateEventCustomFieldAnswers"]) {
    assert.equal(capabilities.operations[operation], undefined);
    assert.match(capabilities.blockedOperations[operation], /updates are prohibited/);
  }
  assert.equal(existsSync(join(f.dir, "requests.log")), false);
});
test("CLI rejects every existing-item update, including event rename, before any network call or uncertainty", async t => {
  const f = await setup(t, true);
  for (const operation of ["updateEvent", "updateEventBasics", "updateRegistrationType", "updateEventCustomFieldAnswers"]) {
    const result = await f.run(operation, { rrReferences: ["Event!B2"], data: { title: "Renamed", preserveExistingItems: false } });
    assert.equal(result.code, 1); assert.match(result.stderr, /preservation policy prohibits/);
  }
  assert.equal((await f.receipts()).length, 4);
  for (const receipt of await f.receipts()) assert.equal(receipt.status, "BLOCKED");
  assert.deepEqual(JSON.parse(await readFile(join(f.dir, "remote.json"))), row);
  for (const file of ["requests.log", "writes.log", "api-write-uncertain.json", "api-operation.lock"]) assert.equal(existsSync(join(f.dir, file)), false, file);
});
test("CLI preserves an existing code and reports differences without pretending the RR is satisfied", async t => {
  const f = await setup(t, true);
  const result = await f.run("configureDiscount", { ...request, data: { ...request.data, createIfMissing: true } });
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout), receipt = (await f.receipts())[0];
  assert.equal(output.action, "preserved"); assert.equal(output.requirementsSatisfied, false);
  assert.deepEqual(output.differences, ["note"]);
  assert.equal(receipt.status, "PRESERVED_DIFFERENCE"); assert.deepEqual(receipt.result.saved, row);
  assert.equal(receipt.prepared, undefined); assert.equal(receipt.writeEvidence, undefined);
  assert.deepEqual(JSON.parse(await readFile(join(f.dir, "remote.json"))), row);
  assert.equal(existsSync(join(f.dir, "writes.log")), false);
  assert.equal(existsSync(join(f.dir, "api-write-uncertain.json")), false);
  assert.deepEqual(JSON.parse(await readFile(join(f.dir, "api-discounts.json"))), { eventId, discounts: { EXISTING: discountId } });
  const satisfied = await f.run("configureDiscount", { ...request, data: { ...request.data, patch: { note: "Original" } } });
  assert.equal(satisfied.code, 0, satisfied.stderr);
  assert.equal(JSON.parse(satisfied.stdout).requirementsSatisfied, true);
  assert.equal(JSON.parse(satisfied.stdout).action, "unchanged");
  assert.equal(existsSync(join(f.dir, "writes.log")), false);
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
  const preserved = await f.run('configureDiscount', changed); assert.equal(preserved.code, 0, preserved.stderr);
  assert.equal(JSON.parse(preserved.stdout).requirementsSatisfied, false);
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
  const repeat = await f.run(); assert.equal(repeat.code, 1); assert.match(repeat.stderr, /Prior API write is uncertain/);
  const read = await f.run("listDiscounts", {}); assert.equal(read.code, 0, read.stderr);
  assert.equal(existsSync(join(f.dir, "api-write-uncertain.json")), true);
  assert.equal(await readFile(join(f.dir, "writes.log"), "utf8"), "POST\n");
});
