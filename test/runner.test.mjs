import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { SteelEgoHost } from "../ego-bridge/host.mjs";
import { RUN_POLICY, executionPrompt } from "../app/run-policy.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const source = path => readFile(join(root, path), 'utf8');

test("RR plan covers every sheet and preserves benchmark identities", async () => {
  const plan = JSON.parse(await source("data/current/rr-plan.json"));
  assert.equal(plan.workbook.sheetCount, 21);
  assert.equal(plan.registration.types.length, 17);
  assert.equal(plan.questions.length, 43);
  assert.equal(plan.sourceSha256, "bcfdf7be7ab3c0d26f67727a2b1ee57d81ffbe80aad3147951bab3d6f46330d8");
  const identities = new Map(plan.questionIdentityMap.map(item => [item.rrSourceIdentity, item]));
  for (const key of ["AGES", "NAICS36D", "CSUB4", "SUB4", "DONATE"]) assert.equal(identities.get(key).status, "FOUND");
  for (const key of ["M-09", "M-10", "M-11"]) assert.equal(identities.get(key).status, "NOT_PRESENT_IN_WORKBOOK");
});

test("watch-only shield intercepts pointer events and return shields before API", async () => {
  const [html, css, js, server] = await Promise.all(["public/index.html", "public/styles.css", "public/app.js", "app/server.mjs"].map(source));
  assert.match(server, /\/v1\/sessions\/debug\?showControls=true&interactive=true/);
  assert.match(html, /id="shield" class="shield"/);
  assert.match(css, /\.shield\{[^}]*position:absolute;inset:0;z-index:9999;[^}]*pointer-events:all/);
  assert.match(css, /\.browser-frame\.user-control \.shield\{display:none;pointer-events:none\}/);
  const handler = js.slice(js.indexOf('async function answer(login)'), js.indexOf('$("sendAnswer").onclick'));
  assert.ok(handler.indexOf('classList.remove("user-control")') < handler.indexOf('await api('));
  assert.match(js, /runtime.ownership === "USER" && !handoffPending/);
});

test("workbook UI has no scope or budget overrides", async () => {
  const [html, js] = await Promise.all(["public/index.html", "public/app.js"].map(source));
  assert.doesNotMatch(html, /id="(?:sow|allowance|reserve|instruction|lockTarget)"/);
  assert.doesNotMatch(js, /form.append\("instruction"/);
  assert.match(html, /id="eventName"/);
  assert.match(html, /Pi chooses the workflow/);
  assert.match(RUN_POLICY.instruction, /approved-sow.md/);
});

test("bounded native task points to a distinct standing SOW without replacing Pi's system or tools", async () => {
  assert.equal(RUN_POLICY.executionInstructions, await source('app/native-task.md'));
  assert.equal(RUN_POLICY.approvedSow, await source('app/standing-sow.md'));
  assert.notEqual(RUN_POLICY.approvedSow, RUN_POLICY.executionInstructions);
  assert.ok(RUN_POLICY.executionInstructions.trim().split(/\s+/).length <= 800);
  assert.deepEqual(RUN_POLICY.executionInstructions.match(/^## .+$/gm), [
    '## 1. Initialize Progress and Follow the Stage Order', '## 2. Execute Each Requirement',
    '## 3. Use Ego and Preserve Boundaries', '## 4. Report Verified Progress',
  ]);
  assert.match(RUN_POLICY.executionInstructions, /approved-sow.md/);
  const rpc = await source('app/pi-rpc.mjs');
  assert.match(rpc, /"--skill", join\(cwd, "\.pi\/skills\/ego-browser\/SKILL.md"\)/);
  assert.doesNotMatch(rpc, /"--(?:system-prompt|append-system-prompt|tools|no-tools)"/);
  assert.equal(await source('.pi/skills/ego-browser/SKILL.md'), await source('vendor/ego-lite/skills/ego-browser/SKILL.md'));
});

test("registration foundations precede website presentation without API authoring or a mandatory save helper", async () => {
  const prompt = RUN_POLICY.executionInstructions.replace(/\s+/g, ' ');
  assert.equal(RUN_POLICY.executionPolicy, 'native-pi');
  assert.match(prompt, /Work in this order: 1\. Event details, registration types, admission\/optional items, availability, fees and price tiers\. 2\. Registration paths and assignments, required admission\/payment steps, discounts and vouchers\. 3\. Fields, questions, choices and advanced\/conditional rules\. 4\. Website theme, branding, header, footer, pages and presentation\./);
  for (const text of [
    'Before advancing, earlier-stage requirements must be verified or have specific, evidenced blockers',
    'Unattempted work is not blocked', 'Record shared blockers once and continue independent earlier-stage work',
    'Use Site Designer early only for a named current-stage functional dependency',
    'Complete, save and verify that work, then return to the earliest unfinished stage',
    'Do not inspect or polish unrelated presentation during foundation work, including checking existing branding matches',
    'No direct Cvent API calls, alternate browser connections or other agents']) assert.ok(prompt.includes(text), text);
  assert.doesNotMatch(prompt, /Choose your own plan, tool order|No mandatory editor sequence|must use saveOnce/i);
  assert.doesNotMatch(prompt, /Neither tool has priority|browserSkill|browserReference|browserExecutable|from resources/);
  for (const file of ['app/native-task.md', 'app/standing-sow.md', 'CVENT-API.md', 'CVENT-API-COVERAGE.md', '.pi/skills/ego-browser/references/steel-bridge.md']) {
    assert.doesNotMatch(await source(file), /Site Designer (?:last|LAST)|API work before unrelated|adapter first|only documented API-unsupported work uses Ego|prefer `saveOnce/i, file);
  }
  const bridge = await source('.pi/skills/ego-browser/references/steel-bridge.md');
  assert.match(bridge, /Normal Page\s+actions and documented waits remain available; no helper is mandatory/);
  assert.match(bridge, /Continue retains current work; Restore can replace it/);
  assert.match(bridge, /do not necessarily\s+require enabling Cvent's separate Website feature/);
});

test("RR task initializes coverage before inspection and executes requirement-scoped corrections", () => {
  const prompt = RUN_POLICY.executionInstructions.replace(/\s+/g, ' ');
  for (const text of [
    'Before inspecting Cvent, initialize state.json.requirements per RPC-CONNECTION.md',
    'Populate Remaining immediately, not after the first edit or at the end',
    'For each requirement or connected dependency group',
    'Save, establish the outcome, and independently read back persistence',
    'Immediately update the requirement status, then continue',
    'Complete this loop before surveying unrelated objects',
    'Do not inventory the whole event before making grounded corrections',
    'Correct assignments that differ from the RR',
    'Reuse or update the verified, mapped event-only path',
    'Create an RR-named path only when the required object is confirmed missing',
    'track fields/questions/rules for Stage 3',
    'Verify saved path identities, assignments and connections—not just names',
    'age or naming alone does not determine correctness',
    'Never inspect credentials, dump environment variables, read process environments',
    'or search secret-bearing files or prior-job transcripts',
    'prefix the action with READ, EDIT, SAVE_PENDING or VERIFY',
    'Clicks, Save dispatches, tool success and filesystem writes are not verified Cvent changes',
  ]) assert.ok(prompt.includes(text), text);
});

test("standing scope reflects the SOW and later changes, not workbook capability claims", () => {
  const sow = RUN_POLICY.approvedSow;
  for (const text of ['Finalized - EmeraldX_Timeline_Roadmap_v3.docx', 'later agreed changes',
    'workbook template notes', 'do not override this scope',
    'event details (dates/timezone/location/capacity)', 'RR-supplied branding/assets',
    'website/theme/header/footer/RR-required widget types', 'registration, admission items, pricing, paths, optional items, vouchers and advanced rules',
    'including their dependencies', 'Do not build every available widget',
    'Use RR workbook uploads and one native Pi', 'not a structured intake replacement',
    'historical price estimates and automatic dollar ceilings', 'are not this run\'s work']) assert.ok(sow.includes(text), text);
});

test("event-only authoring and exact values remain authorized while shared definitions stay protected", () => {
  const sow = RUN_POLICY.approvedSow;
  for (const text of ['Reuse exact matches', 'create missing required objects and edit existing event-only differences',
    'including admissions/prices/relationships', 'not duplicate workarounds or inspection-only reports',
    'Preserve RR spelling, values and formatting', 'never invent defaults or suffixes',
    'Never modify existing shared/account-wide objects, definitions or defaults',
    'separate required shared creation needs demonstrated isolation',
    'An event URL/new template alone does not prove isolation',
    'missing inputs block dependent work, not unrelated executable requirements']) assert.ok(sow.includes(text), text);
});

test("no-delete, no-publish, selected event, excluded data and payment boundaries remain explicit", () => {
  for (const text of ['Keep the upload-bound event identity/name fixed', 'never reset/clone it',
    'Never delete/archive anything, including new objects/links', 'Never publish',
    'send communications', 'attendee/registrant records', 'sessions/speakers', 'affect other events',
    'No account administration', 'merchant/payment-account provisioning', 'banking/settlement',
    'shared payment/tax/currency', 'credential/integration-identifier changes']) assert.ok(RUN_POLICY.approvedSow.includes(text), text);
});

test("native browser task loads guidance once per context and preserves authentication, ownership, uncertainty and Stop boundaries", () => {
  const prompt = RUN_POLICY.executionInstructions.replace(/\s+/g, ' ');
  for (const text of [
    'Load .pi/skills/ego-browser/SKILL.md and its references/steel-bridge.md once unless already in context',
    'The Steel reference governs browser lifecycle and save handling',
    'Use "$EGO_BROWSER_BIN" nodejs in the assigned Steel browser for all Cvent inspection, configuration and verification',
    'No direct Cvent API calls, alternate browser connections or other agents',
    'Obey ownership and operator Stop', 'Human login/MFA only',
    'Never inspect credentials, dump environment variables',
    'Stop Cvent actions on lost identity/control, expired login, exposed secrets, crash/disconnect or unresolved write outcomes',
    'Never replay unresolved writes or bypass holds', 'Preserve evidence and reports']) assert.ok(prompt.includes(text), text);
});

test("unfamiliar editors and local blockers do not replace run-level safety stops", () => {
  const prompt = RUN_POLICY.executionInstructions.replace(/\s+/g, ' ');
  for (const text of ['Investigate unfamiliar controls using observed evidence and documented methods',
    'Record shared blockers once and continue independent earlier-stage work',
    'A pending Save requires bounded observation—not another Save or navigation',
    'Do not guess URLs or repeat failures without new facts']) assert.ok(prompt.includes(text), text);
  assert.match(prompt, /Stop Cvent actions on lost identity\/control[^.]+unresolved write outcomes/);
});

test("Pi verifies requirements and Draft using the referenced progress and completion contracts", async () => {
  const prompt = RUN_POLICY.executionInstructions.replace(/\s+/g, ' ');
  for (const text of ['Read every worksheet, including notes, mappings, continuation rows, formulas/cached values, strikeouts and assets',
    'independently read back persistence', 'unpublished Draft',
    'Only independently verified saved results count as completed',
    'Keep state.json.requirements current after every verified change, existing match or evidenced blocker',
    'update currentStage, currentAction and updatedAt',
    'Include the requirement ID and prefix the action with READ, EDIT, SAVE_PENDING or VERIFY',
    'Report DONE only when every in-scope requirement and Draft are verified, both completion flags are true, blockers/untested are empty, and no unresolved execution remains',
    'Otherwise report INCOMPLETE', 'Blocked work is not excluded', 'Preserve unresolved writes in unresolved-changes.json',
    'reports/final-report.md', 'reports/final-report.json per RPC-CONNECTION.md']) assert.ok(prompt.includes(text), text);
  const contract = await source('RPC-CONNECTION.md');
  for (const text of ['verified_changed', 'verified_existing', 'Before a new edit to a previously verified requirement, mark it unverified again',
    'both strict `true` flags', 'empty blocker/untested arrays']) assert.ok(contract.includes(text), text);
  const example = JSON.parse(contract.split('## Completion contract')[1].match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(example, { eventId: '<authorizedEvent.apiEventId>', status: 'DONE', completion: { requirements: true, draft: true }, blockers: [], untested: [] });
  assert.doesNotMatch(prompt, /website\/registration\/dependencies\/draft|requirements\.json|rr-evidence audit|~90/);
});

test("RR-authoritative updates preserve unspecified data, object identity and scope boundaries", () => {
  const prompt = RUN_POLICY.executionInstructions.replace(/\s+/g, ' ');
  for (const text of ['Implement the uploaded RR in authorizedEvent within approved-sow.md',
    'The RR defines the target configuration; live Cvent is the starting state',
    'Execute and verify—not merely inspect, plan or recommend',
    'Identify objects by verified codes/IDs, object types or explicit mappings, not similar labels alone',
    'Compare it with the exact RR values and relationships',
    'Correct existing differences or create confirmed missing objects',
    'An existing code does not prove its settings are correct',
    'Preserve unrelated paths and avoid duplicates',
    'Repeated RR rows may require distinct fees or relationships',
    'These creations and in-place reassignments are authorized within scope',
    'Preserve the bound event ID/name, unpublished Draft, unspecified settings and unrelated content',
    'Distinguish requirements from examples and blank templates', 'Never invent missing values',
    'Never delete/archive objects, remove widgets or placements, delete-and-recreate, reset, clone or publish',
    'No shared-account/object changes, attendee/CRM access, communications or Sessions/Speakers configuration',
    'Prove permitted scope before writing']) assert.ok(prompt.includes(text), text);
  assert.doesNotMatch(prompt, /Leave Agenda[^.]*untouched|overwrite everything|delete-and-recreate the event/);
});

test("efficiency guidance preserves verification without adding a dollar-based stopping threshold", () => {
  assert.equal(RUN_POLICY.spendingLimitEnabled, false);
  assert.equal(RUN_POLICY.runCostLimitUSD, undefined);
  const prompt = RUN_POLICY.executionInstructions.replace(/\s+/g, ' ');
  for (const text of ['Batch grounded edits within an understood editor, but never across uncertainty',
    'Complete this loop before surveying unrelated objects',
    'Only independently verified saved results count as completed',
    'Obey ownership and operator Stop',
    'Never replay unresolved writes or bypass holds']) assert.ok(prompt.includes(text), text);
  assert.doesNotMatch(prompt, /\$30|remaining budget is insufficient|per-run spending stop/);
});

test("guidance preserves source interpretation, independent readback and actual capability boundaries", async () => {
  const guide = await source('RR-EVIDENCE.md');
  for (const text of ['Compare the required displayed text and link destination separately',
    'not permission to normalize away differences', 'Missing saved fields mean inspection is needed',
    'Read choices for relevant questions even when their question text differs',
    'do not manufacture unusable partial objects', 'Cached formula results may be absent or stale',
    'sheet/column names and layouts are never hardcoded', 'Follow every relevant continuation',
    'unrelated RR requests are not per-run completion prerequisites']) assert.ok(guide.includes(text), text);
  const api = await source('CVENT-API.md');
  for (const text of ['distinguish an absent authoring helper from an explicitly blocked operation',
    'A rejected API write or uncertain result never authorizes browser fallback',
    'Explicitly blocked updates must not be rerouted through Ego',
    'Compare all applicable values and relationships, not just names/IDs',
    'A monetary value alone is not a prohibited merchant/payment change',
    'Never infer missing amounts, dates, eligibility or required creation fields']) assert.ok(api.includes(text), text);
});

test("known capability gaps are local blockers; pending and uncertain saves are not replayed", async () => {
  const guide = (await source('.pi/skills/ego-browser/references/steel-bridge.md')).replace(/\s+/g, ' ');
  for (const text of ['A known unsupported capability before any possible execution is a local blocker, not a whole-run Stop',
    'Never assume an error means nothing executed', 'selector errors do not count',
    'Do not close, navigate, refresh or repeat Save while pending',
    'a validation indicator alone does not prove that nothing persisted',
    'After confirmed completion, independently verify persisted values and connections',
    'If the bounded wait cannot establish the outcome, stop and retain uncertainty without replay',
    'This does not defer Stop for crash/disconnect, unconfirmed tool execution, identity/ownership loss']) assert.ok(guide.includes(text), text);
});

test("native settlement has no ledger/audit gate or automatic reprompt", async () => {
  const connection = await source('app/rr-connection.mjs');
  const settlement = connection.slice(connection.indexOf('  async function settle(job)'), connection.indexOf('  app.post("/api/jobs/:id/stop"'));
  assert.match(settlement, /get_last_assistant_text/);
  assert.match(settlement, /status: job.record.status/);
  assert.doesNotMatch(connection, /REVIEW_REQUIRED|reviewRequired|completion-audit|auditCompletion/);
  assert.doesNotMatch(settlement, /audit|requirements\.json|type: "prompt"|follow_up|steer/);
});

test("supported API capability map remains available without a live call", () => {
  const capability = JSON.parse(execFileSync(process.execPath, [join(root,'app/cvent-api-cli.mjs'),'capabilities'], {encoding:'utf8'}));
  assert.deepEqual(Object.entries(capability.operations).filter(([,route])=>route==='api-write').map(([name])=>name), ['enableEventFeature','configureDiscount','configureVolumeDiscount','updateEvent','updateEventBasics','updateRegistrationType']);
  for (const operation of ['getEvent','listRegistrationTypes','listAdmissionItems','listQuantityItems','listDonationItems',
    'listRegistrationPaths','listQuestions','listQuestionChoices','listEventFeatures','listFees','listVouchers','listDiscounts','listDiscountedAgendaItems']) assert.equal(capability.operations[operation],'api-read',operation);
  assert.equal(capability.writeCapabilities.configureDiscount.mode,'event-only-create-or-update');
  assert.equal(capability.writeCapabilities.configureVolumeDiscount.mode,'event-only-create-or-update');
});

test("execution envelope uses only captured task and scope path, never historical context or budget coaching", () => {
  const record = { executionInstructions: 'Captured native task', approvedSow: 'Captured approved scope', target: {name:'Selected event',apiEventId:'event-id'}, workbook:'/job/original.xlsx', allowanceUSD:60, externalCostReserveUSD:10, priorEventCostUSD:29, executionPolicy:RUN_POLICY.executionPolicy, instruction:'OBSOLETE WORKFLOW', lastAssistantText:'OLD CONVERSATION' };
  const prompt = executionPrompt(record, '/job');
  assert.equal(prompt.split(record.executionInstructions).length, 2);
  assert.ok(!prompt.includes(record.approvedSow), 'scope is read from captured file, not duplicated in prompt');
  assert.doesNotMatch(prompt, /OBSOLETE WORKFLOW|OLD CONVERSATION|runtime-policy|prior-event-evidence|reconciliation/);
  const envelope = JSON.parse(prompt.slice(prompt.indexOf('{')));
  assert.deepEqual(envelope.authorizedEvent,record.target);
  assert.equal(envelope.workbook,record.workbook);
  assert.equal(envelope.scopeDocument,'/job/approved-sow.md');
  assert.equal(envelope.executionPolicy,'native-pi');
  for (const field of ['priorEventCostUSD','externalCostReserveUSD','allowanceUSD','targetCostUSD','priorEventEvidence']) assert.equal(envelope[field],undefined);
  assert.equal(RUN_POLICY.spendingLimitEnabled,false);
  for (const key of ['executionInstructions','approvedSow']) for (const value of [undefined, '']) assert.throws(() => executionPrompt({...record,[key]:value},'/job'), /Captured task and standing scope required/);
});

test("guard rejects out-of-scope and forbidden Cvent writes", async t => {
  const dir = await mkdtemp(join(tmpdir(), "cvent-guard-"));
  t.after(() => rm(dir, {recursive:true,force:true}));
  const runtimePath = join(dir, "runtime.json");
  await writeFile(runtimePath, JSON.stringify({ ownership: "AGENT", activeTargetId: "target", expectedEvtstub: "expected" }));
  const client = {
    setExternalSink() {},
    async request(method) {
      if (method === "Target.getTargets") return { targetInfos: [{ type: "page", targetId: "target", title: "Wrong event", url: "https://app.cvent.com/events?evtstub=wrong" }] };
      if (method === "Runtime.evaluate") return { result: { value: "Save" } };
      return {};
    },
    sendEnvelope() {},
  };
  const host = new SteelEgoHost(client, runtimePath);
  await assert.rejects(host.assertOperationAllowed({ method: "Input.dispatchMouseEvent", params: { x: 1, y: 1 }, sessionId: "s" }), /expected evtstub/);
  await assert.rejects(host.assertOperationAllowed({ method: "Runtime.evaluate", params: { expression: "document.querySelector('#publish').click()" }, sessionId: "s" }), /prohibited Cvent action/);
});

test("guard rejects agent authentication input and USER browser access", async t => {
  const dir = await mkdtemp(join(tmpdir(), "cvent-auth-"));
  t.after(() => rm(dir, {recursive:true,force:true}));
  const runtimePath = join(dir, "runtime.json");
  await writeFile(runtimePath, JSON.stringify({ ownership: "AGENT", activeTargetId: "target", expectedEvtstub: "x" }));
  const client = { setExternalSink() {}, async request(method) { if (method === "Target.getTargets") return { targetInfos: [{ type: "page", targetId: "target", url: "https://login.microsoftonline.com/tenant/oauth2" }] }; return { result: { value: "" } }; } };
  const host = new SteelEgoHost(client, runtimePath);
  await assert.rejects(host.assertOperationAllowed({ method: "Input.dispatchKeyEvent", params: { key: "A" }, sessionId: "s" }), /authentication input is human-only/);
  await writeFile(runtimePath, JSON.stringify({ ownership: "USER", activeTargetId: "target", expectedEvtstub: "x" }));
  await assert.rejects(host.assertOperationAllowed({ method: "Runtime.evaluate", params: { expression: "1+1" } }), /User owns/);
});
