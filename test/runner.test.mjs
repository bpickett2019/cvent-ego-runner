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

test("short native task points to a distinct standing SOW without replacing Pi's system or tools", async () => {
  assert.equal(RUN_POLICY.executionInstructions, await source('app/native-task.md'));
  assert.equal(RUN_POLICY.approvedSow, await source('app/standing-sow.md'));
  assert.notEqual(RUN_POLICY.approvedSow, RUN_POLICY.executionInstructions);
  assert.ok(RUN_POLICY.executionInstructions.trim().split(/\s+/).length <= 350);
  assert.match(RUN_POLICY.executionInstructions, /approved-sow.md/);
  const rpc = await source('app/pi-rpc.mjs');
  assert.match(rpc, /"--skill", join\(cwd, "\.pi\/skills\/ego-browser\/SKILL.md"\)/);
  assert.doesNotMatch(rpc, /"--(?:system-prompt|append-system-prompt|tools|no-tools)"/);
  assert.equal(await source('.pi/skills/ego-browser/SKILL.md'), await source('vendor/ego-lite/skills/ego-browser/SKILL.md'));
});

test("Pi chooses plan and tool order, with no mandatory API-first, editor sequence or save helper", async () => {
  const prompt = RUN_POLICY.executionInstructions;
  assert.equal(RUN_POLICY.executionPolicy, 'native-pi');
  assert.match(prompt, /Choose your own plan, tool order and recovery approach/);
  assert.match(prompt, /Neither tool has priority/);
  assert.match(prompt, /No required checklist, editor sequence, save helper or second agent/);
  assert.match(prompt, /RR-EVIDENCE.md describes optional workbook utilities/);
  for (const file of ['app/native-task.md', 'app/standing-sow.md', 'CVENT-API.md', 'CVENT-API-COVERAGE.md', '.pi/skills/ego-browser/references/steel-bridge.md']) {
    assert.doesNotMatch(await source(file), /Site Designer (?:last|LAST)|API work before unrelated|adapter first|only documented API-unsupported work uses Ego|prefer `saveOnce/i, file);
  }
  const bridge = await source('.pi/skills/ego-browser/references/steel-bridge.md');
  assert.match(bridge, /Normal Page\s+actions and documented waits remain available; no helper is mandatory/);
  assert.match(bridge, /Continue retains current work; Restore can replace it/);
  assert.match(bridge, /do not necessarily\s+require enabling Cvent's separate Website feature/);
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

test("native browser task keeps human authentication, ownership, uncertainty and Stop boundaries", () => {
  for (const text of ['.pi/skills/ego-browser/SKILL.md', 'references/steel-bridge.md', '"$EGO_BROWSER_BIN" nodejs',
    'assigned local Steel', 'Authentication/security attestations are human-only',
    'credentials, cookies/storage or hidden/password/token inputs', 'Respect tool denials',
    'do not bypass them', 'changes to runner/guards', 'Recover ordinary selector/navigation errors',
    'Actual operator Stop, identity drift, lost AGENT ownership',
    'expired login, exposed secrets, crash/disconnect or uncertain execution/save still require an immediate stop',
    'Never replay an uncertain save or clear uncertainty', 'Do not consume another RR or spawn agents']) assert.ok(RUN_POLICY.executionInstructions.includes(text), text);
});

test("prohibited requirements and confirmed pre-dispatch denials are local blockers, not whole-run stops", () => {
  const prompt = RUN_POLICY.executionInstructions;
  for (const text of ['If a requirement needs a prohibited action, missing input or unsupported capability',
    'leave it untouched, record the reason for the final report',
    'skip dependent work and continue independent requirements',
    'A confirmed pre-dispatch denial is a local blocker, not an uncertain write or reason to stop the whole run',
    'uncertain execution/save still require an immediate stop']) assert.ok(prompt.includes(text), text);
});

test("Pi verifies requirements and Draft without a category checklist or project-delivery gate", () => {
  const prompt = RUN_POLICY.executionInstructions;
  for (const text of ['across all relevant sheets, dependencies and assets', 'Human updates amend execution',
    'Verify saved values and connections, not clicks/toasts', 'confirm unpublished Draft',
    'Continue independent executable work', 'completion {requirements, draft}',
    'both flags true and both arrays empty', 'Report exclusions separately', 'never disguise gaps as N/A']) assert.ok(prompt.includes(text), text);
  assert.doesNotMatch(prompt, /website\/registration\/dependencies\/draft|requirements\.json|rr-evidence audit|~90|\$\d/);
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
