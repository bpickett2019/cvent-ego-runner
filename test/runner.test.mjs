import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { SteelEgoHost } from "../ego-bridge/host.mjs";
import { RUN_POLICY, executionPrompt } from "../app/run-policy.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);

test("RR plan covers every sheet and preserves benchmark identities", async () => {
  const plan = JSON.parse(await readFile(join(root, "data/current/rr-plan.json"), "utf8"));
  assert.equal(plan.workbook.sheetCount, 21);
  assert.equal(plan.registration.types.length, 17);
  assert.equal(plan.questions.length, 43);
  assert.equal(plan.sourceSha256, "bcfdf7be7ab3c0d26f67727a2b1ee57d81ffbe80aad3147951bab3d6f46330d8");
  const identities = new Map(plan.questionIdentityMap.map((item) => [item.rrSourceIdentity, item]));
  for (const key of ["AGES", "NAICS36D", "CSUB4", "SUB4", "DONATE"]) assert.equal(identities.get(key).status, "FOUND");
  for (const key of ["M-09", "M-10", "M-11"]) assert.equal(identities.get(key).status, "NOT_PRESENT_IN_WORKBOOK");
});

test("watch-only shield intercepts pointer events and return shields before API", async () => {
  const [html, css, js, server] = await Promise.all(["public/index.html", "public/styles.css", "public/app.js", "app/server.mjs"].map((path) => readFile(join(root, path), "utf8")));
  assert.match(server, /\/v1\/sessions\/debug\?showControls=true&interactive=true/, "human login needs the viewer address bar when Steel starts on about:blank");
  assert.match(html, /id="shield" class="shield"/);
  assert.match(css, /\.shield\{[^}]*position:absolute;inset:0;z-index:9999;[^}]*pointer-events:all/);
  assert.match(css, /\.browser-frame\.user-control \.shield\{display:none;pointer-events:none\}/);
  const handler = js.slice(js.indexOf('async function answer(login)'), js.indexOf('$("sendAnswer").onclick'));
  assert.ok(handler.indexOf('classList.remove("user-control")') < handler.indexOf('await api('), "shield must be restored before login answer");
  assert.match(js, /runtime.ownership === "USER" && !handoffPending/);
});

test("workbook UI has no scope or budget inputs", async () => {
  const [html, js] = await Promise.all(["public/index.html", "public/app.js"].map(path => readFile(join(root, path), "utf8")));
  assert.doesNotMatch(html, /id="(?:sow|allowance|reserve)"/);
  assert.doesNotMatch(js, /\$\("(?:sow|allowance|reserve)"\)/);
  assert.match(html, /under \$60 total per completed RR/);
  assert.match(html, /id="eventName"/);
  assert.doesNotMatch(html, /id="lockTarget"/);
  assert.doesNotMatch(html, /id="instruction"/);
  assert.doesNotMatch(js, /form.append\("instruction"/);
  assert.match(RUN_POLICY.instruction, /approved-sow.md/);
  assert.match(RUN_POLICY.approvedSow, /Never delete\/archive anything/);
  assert.match(RUN_POLICY.approvedSow, /Never publish/);
});

test("one canonical task/SOW retains API and browser authorization boundaries", async () => {
  const prompt = await readFile(join(root, "app/runner-prompt.md"), "utf8");
  assert.equal(RUN_POLICY.approvedSow, prompt);
  assert.ok(prompt.trim().split(/\s+/).length <= 450, "keep the task short; tool recipes belong in linked guides");
  assert.doesNotMatch(prompt, /\$\d|budget|spending|cost|allowanceUSD|reserveUSD/i, "no model-facing dollar target or budget coaching");
  for (const boundary of [
    '"$CVENT_API_BIN" first for supported operations',
    'CVENT-API.md as needed', '.pi/skills/ego-browser/SKILL.md', 'references/steel-bridge.md',
    'use only "$EGO_BROWSER_BIN" nodejs', 'assigned local Steel',
    'Never bypass API failures/tool denials or use direct HTTP/CDP/substitute browsers',
    'Stop immediately on operator Stop, identity drift, lost AGENT ownership',
    'expired login, exposed secrets, crash/disconnect or uncertain execution/save',
    'Authentication/security attestations are human-only', 'hidden/password/token inputs',
    'Never delete/archive anything', 'Never publish', 'attendee/registrant', 'sessions/speakers',
    'shared payment/tax/currency or credential/integration-identifier changes',
    'Do not modify runner/guards or spawn agents', 'not historical tasks/transcripts/workbooks',
    'Verify applicable values and saved connections, not clicks/toasts',
    'Never begin a write you cannot verify', 'reports/final-report.json', 'unresolved-changes.json',
  ]) assert.ok(prompt.includes(boundary), boundary);
  assert.doesNotMatch(prompt, /e712e34c|Medtrade|BDNY|readOperation, writeOperation/);
  assert.match(prompt, /RR-EVIDENCE.md and \.\/bin\/rr-evidence for cached workbook views\/comparisons/);
  assert.match(prompt, /source-referenced creations, modifications, exact matches and blockers/);
  assert.match(prompt, /Finish only when complete or no permitted executable work remains/);
  assert.doesNotMatch(prompt, /requirements\.json|rr-evidence audit|coverage checklist|## Configuration|route-plan/);
  assert.equal(RUN_POLICY.executionPolicy, "api-first-ego-fallback");
  const skill = await readFile(join(root, ".pi/skills/ego-browser/SKILL.md"));
  const upstream = await readFile(join(root, "vendor/ego-lite/skills/ego-browser/SKILL.md"));
  assert.deepEqual(skill, upstream, "pinned upstream skill remains unchanged");
});

test("execution strategy turns supported differences into edits without a deadline shortcut", async () => {
  const prompt = RUN_POLICY.approvedSow;
  assert.match(prompt, /edit existing event-only differences/);
  assert.match(prompt, /not duplicate workarounds or inspection-only reports/);
  assert.match(prompt, /Aim for ~90 minutes, not a cutoff or verification shortcut/);
  const api = await readFile(join(root, 'CVENT-API.md'), 'utf8');
  for (const text of ['create only genuinely missing required objects with complete inputs',
    'Admission-item authoring is a documented API gap',
    'Compare all applicable values and relationships, not just names/IDs',
    'a necessary UI dependency may come first', 'without batching across uncertain execution',
    'continue independent requirements instead']) assert.ok(api.includes(text), text);
  const evidence = await readFile(join(root, 'RR-EVIDENCE.md'), 'utf8');
  for (const text of ['Read/extract once per unchanged workbook',
    'Efficiency never permits stale pre-write baselines or skipping saved verification',
    'do not add repeated metering/tool calls, another agent, a review stage or a paid retry']) assert.ok(evidence.includes(text), text);
});

test("page requirements do not imply Website enablement; Site Designer follows setup and dependencies", () => {
  assert.match(RUN_POLICY.approvedSow, /Choose your own plan/);
  assert.match(RUN_POLICY.approvedSow, /Configure RR-required pages in the applicable existing editor/);
  assert.match(RUN_POLICY.approvedSow, /do not assume website requirements require enabling Cvent's separate Website feature/);
  assert.match(RUN_POLICY.approvedSow, /Site Designer last after other executable work, including setup and dependencies/);
});

test("Site Designer checkpoint offers use Continue, not Restore, within the current RR scope", () => {
  assert.match(RUN_POLICY.approvedSow, /Site Designer last.*Continue, never Restore/);
});

test("Pi owns the plan after reading the actual workbook, with no rigid workflow appendix", async () => {
  const prompt = RUN_POLICY.approvedSow;
  assert.match(prompt, /Read this job's original.xlsx/);
  assert.match(prompt, /across all sheets and dependencies/);
  assert.match(prompt, /configure only applicable event-build requirements and dependencies/);
  assert.match(prompt, /Choose your own plan/);
  assert.match(prompt, /Recover ordinary selector\/navigation errors/);
  assert.match(prompt, /Verify applicable values and saved connections/);
  assert.match(prompt, /execute independent work/);
  assert.match(prompt, /Keep the upload-bound event identity\/name fixed/);
  const connection = await readFile(join(root, 'app/rr-connection.mjs'), 'utf8');
  assert.doesNotMatch(connection, /LOGIN-FIRST VERIFIED JOB|FIRST TASK:|read relevant ranges incrementally/);
});

test("roadmap DONE means verified full configuration in Draft, not a native exit", () => {
  for (const scope of ['DONE requires everything applicable implemented, connected, verified and saved as Draft; otherwise INCOMPLETE',
    'Verify applicable values and saved connections, not clicks/toasts',
    'completion booleans website/registration/dependencies/draft', 'blockers/untested arrays',
    'DONE requires all four true and both arrays empty']) assert.ok(RUN_POLICY.approvedSow.includes(scope), scope);
});
test("only RR-required work is executed and human updates do not become acknowledgment-only tasks", async () => {
  const prompt = RUN_POLICY.approvedSow;
  for (const text of ['configure only applicable event-build requirements and dependencies',
    'Never disguise blocked/untested work as N/A/excluded',
    'Complete scoped lookups and fresh saved verification remain required',
    'identity matches alone prove nothing',
    'Human updates amend execution unless requesting pause/Stop',
    'Finish only when complete or no permitted executable work remains']) assert.ok(prompt.includes(text), text);
  assert.doesNotMatch(prompt, /all six body-widget types/);
  const guide = await readFile(join(root, 'RR-EVIDENCE.md'), 'utf8');
  assert.match(guide, /sheet\/column names and layouts are never hardcoded/);
  assert.match(guide, /Follow every relevant continuation/);
  assert.match(guide, /Do not build every widget or option by default/);
  const api = await readFile(join(root, 'CVENT-API.md'), 'utf8');
  assert.match(api, /without batching across uncertain execution or skipping per-write verification/);
});

test("DONE scope is the approved event build, not unrelated RR or whole-project deliverables", async () => {
  const prompt = RUN_POLICY.approvedSow;
  for (const text of ['event details (dates/timezone/location/capacity)', 'RR-supplied branding/assets',
    'website/theme/header/footer/RR-required widget types, registration, admission items, pricing, paths, optional items, vouchers and advanced rules',
    'Never disguise blocked/untested work as N/A/excluded',
    'explain genuine exclusions/non-applicability separately',
    'edit existing event-only differences']) assert.ok(prompt.includes(text), text);
  const guide = await readFile(join(root, 'RR-EVIDENCE.md'), 'utf8');
  assert.match(guide, /unrelated RR requests are not per-run completion prerequisites/);
  assert.match(guide, /Explain those exclusions separately in the Markdown report, not in the JSON blockers\/untested arrays/);
});

// Instruction-contract regressions, not proof of live model compliance.
test("native instructions distinguish executable dependencies, scope restrictions and blockers", () => {
  const prompt = RUN_POLICY.approvedSow;
  for (const text of ['create missing required objects',
    'Unknown scope/inputs or unsupported operations block dependent requirements only',
    'execute independent work and report precise blockers without self-authorizing exceptions']) assert.ok(prompt.includes(text), text);
});

test("native instructions require unfinished work assessment without delaying safety stops", () => {
  const prompt = RUN_POLICY.approvedSow;
  for (const text of ['execute independent work and report precise blockers',
    'Finish only when complete or no permitted executable work remains, unless a safety stop intervenes',
    'Stop immediately on operator Stop',
    'Never disguise blocked/untested work as N/A/excluded']) assert.ok(prompt.includes(text), text);
  assert.doesNotMatch(prompt, /requirements\.json|rr-evidence audit|follow_up|spawn (?:a )?reviewer/);
});

test("native evidence guidance separates literal RR values from instructions and reuses verified extraction", async () => {
  const guide = await readFile(join(root, 'RR-EVIDENCE.md'), 'utf8');
  for (const text of ['Compare the required displayed text and link destination separately',
    'not permission to normalize away differences', 'Missing saved fields mean inspection is needed',
    'Read choices for relevant questions even when their question text differs',
    'do not manufacture unusable partial objects', 'no new schema or mandatory checklist is required',
    'use `python3` to read the hash-verified extraction artifact',
    'If extraction integrity fails, do not bypass that check',
    'Cached formula results may be absent or stale']) assert.ok(guide.includes(text), text);
  assert.match(RUN_POLICY.approvedSow, /RR-EVIDENCE.md and \.\/bin\/rr-evidence for cached workbook views\/comparisons/);
  assert.match(RUN_POLICY.approvedSow, /inspect uncaptured original details/);
  assert.match(RUN_POLICY.approvedSow, /Avoid repeated unchanged reads/);
});

test("native capability guidance distinguishes scoped executable support from remaining tool limitations", async () => {
  const guide = await readFile(join(root, 'CVENT-API.md'), 'utf8');
  for (const text of ['distinguish an absent authoring helper from an explicitly blocked operation',
    'not question, admission-item, registration-path or layout creation',
    'inspect the assigned Ego UI workflow after proving event-only effects or isolated new shared creation',
    'A rejected API write or uncertain result never authorizes browser fallback',
    'not assumptions or speculative save attempts',
    'missing RR-required shared types may be created separately without editing existing definitions or affecting other events',
    'Explicitly blocked updates must not be rerouted through Ego',
    'Existing event-only differences now use a preserved **PUT**',
    'A blocked dependency only blocks requirements that actually depend on it',
    'Do not perform it, bypass a guard, or treat a general instruction to finish as authorization',
    'No additional approval endpoint, replacement process or automatic reprompt is implied']) assert.ok(guide.includes(text), text);
});

test("pricing guidance permits RR-backed event-only changes but protects shared payment configuration", async () => {
  const prompt = RUN_POLICY.approvedSow;
  assert.match(prompt, /edit existing event-only differences, including admissions\/prices\/relationships/);
  assert.match(prompt, /No account administration, merchant\/payment-account provisioning, banking\/settlement changes, shared payment\/tax\/currency or credential\/integration-identifier changes/);
  assert.match(prompt, /report precise blockers without self-authorizing exceptions/);
  const guide = await readFile(join(root, 'CVENT-API.md'), 'utf8');
  for (const text of ['A monetary value alone is not a prohibited merchant/payment change',
    'including on existing items, when their effects are confined to the selected event',
    'Never infer missing amounts, dates, eligibility or required creation fields',
    'An RR-required event-only surcharge is assessed by its actual scope and supported workflow',
    'not an invented API method or a bypass of a failed API write']) assert.ok(guide.includes(text), text);
});

test("event-only changes cover the SOW while existing shared definitions stay protected", () => {
  const prompt = RUN_POLICY.approvedSow;
  for (const text of ['create missing required objects and edit existing event-only differences, including admissions/prices/relationships',
    'Never modify existing shared/account-wide objects, definitions or defaults',
    'Reuse exact shared matches; create separate required shared objects only through supported, proven-isolated workflows',
    'Prove scope before writing; an event URL/new template is insufficient',
    'Unknown scope/inputs or unsupported operations block dependent requirements only',
    'Verify applicable values and saved connections',
    'source-referenced creations, modifications, exact matches and blockers']) assert.ok(prompt.includes(text), text);
});

test("expanded authoring grant retains no-delete, Draft and guard/no-bypass boundaries", () => {
  const prompt = RUN_POLICY.approvedSow;
  for (const text of ['Never delete/archive anything, including new objects/links',
    'Never publish, send communications, access attendee/registrant records, configure sessions/speakers or affect other events',
    'Never bypass API failures/tool denials',
    'report precise blockers without self-authorizing exceptions',
    'verified and saved as Draft', 'Never replay an uncertain save']) assert.ok(prompt.includes(text), text);
});

test("active prompt and linked guides do not reintroduce blanket preservation", async () => {
  for (const file of ['app/runner-prompt.md', 'CVENT-API.md', 'RR-EVIDENCE.md', '.pi/skills/ego-browser/references/steel-bridge.md']) {
    const text = (await readFile(join(root, file), 'utf8')).replace(/\s+/g, ' ');
    assert.match(text, /edit existing event-only differences|create or modify existing objects|objects, settings and relationships may be created or modified/, file);
    assert.match(text, /Never modify existing shared\/account-wide objects(?: or definitions|, definitions or defaults)/, file);
    assert.match(text, /Never delete\/archive anything/, file);
    assert.doesNotMatch(text, /For any difference or missing object, create a separate RR-compliant object; preserve originals|Account-global creation remains prohibited|Existing prices, fees and discounts remain protected|this does not authorize an event-wide processing surcharge|inspect the assigned Ego UI workflow without changing originals/, file);
  }
});

test("known pre-execution browser gaps are local blockers but uncertain writes still require global Stop", async () => {
  const guide = (await readFile(join(root, '.pi/skills/ego-browser/references/steel-bridge.md'), 'utf8')).replace(/\s+/g, ' ');
  for (const text of ['before any write, block the affected requirement and continue independent safe work',
    'do not begin a write you cannot verify',
    'If a current-run write may have executed and its saved result cannot be verified, use global Stop',
    'A known unsupported capability before any possible execution is a local blocker, not a whole-run Stop',
    'Never assume an error means nothing executed',
    'Uncertain execution/save, page crash, disconnect, identity/ownership loss, expired login, exposed secrets or operator Stop still require global Stop',
    'Do not bypass API failures, replay writes, clear uncertainty or replace the assigned browser']) assert.ok(guide.includes(text), text);
  assert.doesNotMatch(guide, /stop if this prevents reliable verification|Stop and report unsupported operations/);
});

test("native settlement has no ledger/audit gate or automatic reprompt", async () => {
  const connection = await readFile(join(root, 'app/rr-connection.mjs'), 'utf8');
  const settlement = connection.slice(connection.indexOf('  async function settle(job)'), connection.indexOf('  app.post("/api/jobs/:id/stop"'));
  assert.match(settlement, /get_last_assistant_text/);
  assert.match(settlement, /status: job.record.status/);
  assert.doesNotMatch(connection, /REVIEW_REQUIRED|reviewRequired/);
  assert.doesNotMatch(settlement, /audit|requirements\.json|type: "prompt"|follow_up|steer/);
  assert.doesNotMatch(connection, /completion-audit|auditCompletion/);
  assert.match(RUN_POLICY.approvedSow, /source-referenced creations, modifications, exact matches and blockers/);
});

test("simple API guidance exposes scoped updates without a live API call", () => {
  const capability = JSON.parse(execFileSync(process.execPath, [join(root,'app/cvent-api-cli.mjs'),'capabilities'], {encoding:'utf8'}));
  assert.deepEqual(Object.entries(capability.operations).filter(([,route])=>route==='api-write').map(([name])=>name), ['enableEventFeature','configureDiscount','configureVolumeDiscount','updateEvent','updateEventBasics','updateRegistrationType']);
  for (const operation of ['getEvent','listRegistrationTypes','listAdmissionItems','listQuantityItems','listDonationItems',
    'listRegistrationPaths','listQuestions','listQuestionChoices','listEventFeatures','listFees','listVouchers','listDiscounts','listDiscountedAgendaItems']) {
    assert.equal(capability.operations[operation],'api-read',operation);
  }
  assert.equal(capability.writeCapabilities.configureDiscount.mode,'event-only-create-or-update');
  assert.equal(capability.writeCapabilities.configureVolumeDiscount.mode,'event-only-create-or-update');
  assert.match(RUN_POLICY.approvedSow, /Use "\$CVENT_API_BIN" first for supported operations/);
  assert.match(RUN_POLICY.approvedSow, /consult CVENT-API.md as needed/);
});

test("execution envelope omits financial coaching while per-run accounting remains", () => {
  const record = { approvedSow: 'Captured approved scope', target: {name:'Selected event',apiEventId:'event-id'}, workbook:'/job/original.xlsx', allowanceUSD:60, externalCostReserveUSD:10, priorEventCostUSD:29, executionPolicy:RUN_POLICY.executionPolicy, instruction:'OBSOLETE WORKFLOW', lastAssistantText:'OLD CONVERSATION' };
  const prompt = executionPrompt(record, '/job');
  assert.equal(prompt.split(record.approvedSow).length, 2);
  assert.doesNotMatch(prompt, /OBSOLETE WORKFLOW|OLD CONVERSATION|runtime-policy/);
  const envelope = JSON.parse(prompt.slice(prompt.indexOf('{')));
  assert.deepEqual(envelope.authorizedEvent,record.target);
  assert.equal(envelope.workbook,record.workbook);
  for (const field of ['priorEventCostUSD','externalCostReserveUSD','allowanceUSD','targetCostUSD']) {
    assert.equal(envelope[field],undefined,field);
    assert.ok(!prompt.includes(field));
  }
  assert.equal(RUN_POLICY.allowanceUSD,60);
  assert.equal(RUN_POLICY.targetCostUSD,60);
  assert.equal(RUN_POLICY.externalCostReserveUSD,10);
  assert.equal(RUN_POLICY.spendingLimitEnabled,false);
  assert.equal(envelope.priorEventEvidence,undefined);
  assert.doesNotMatch(prompt, /prior-event-evidence|reconciliation/);
  assert.equal(envelope.approvedSow,undefined);
});

test("ordinary recovery is autonomous but unconfirmed execution remains a safety stop", async () => {
  const prompt = RUN_POLICY.approvedSow;
  assert.match(prompt, /Recover ordinary selector\/navigation errors/);
  assert.match(prompt, /Stop immediately.*crash\/disconnect or uncertain execution\/save/);
  assert.match(prompt, /Never replay an uncertain save, clear uncertainty or reload crashed pages to continue/);
  assert.doesNotMatch(prompt, /at most one fresh observation|after one observation/);
  const bridge = await readFile(join(root, '.pi/skills/ego-browser/references/steel-bridge.md'), 'utf8');
  assert.match(bridge, /selector errors do not count/);
  assert.match(bridge, /global Stop and uncertainty review/);
});

test("pending saves receive bounded observation and validation inspection without replay or delayed safety stops", async () => {
  assert.match(RUN_POLICY.approvedSow, /Await saves; inspect validation/);
  const guide = (await readFile(join(root, '.pi/skills/ego-browser/references/steel-bridge.md'), 'utf8')).replace(/\s+/g, ' ');
  for (const boundary of [
    "Treat a responsive UI's `Saving...` as pending, not proof of success or failure",
    'bounded read-only observation with documented waits',
    'Do not close, navigate, refresh or repeat Save while pending',
    'Inspect visible validation messages, not just an icon/count',
    'a validation indicator alone does not prove that nothing persisted',
    'After confirmed completion, independently verify persisted values and connections',
    'If the bounded wait cannot establish the outcome, stop and retain uncertainty without replay',
    'This does not defer Stop for crash/disconnect, unconfirmed tool execution, identity/ownership loss',
    'expired login, exposed secrets or operator Stop, or reopen a previously stopped save',
  ]) assert.ok(guide.includes(boundary), boundary);
});

test("canonical SOW retains exact matching and identity boundaries with event-only edits", () => {
  assert.doesNotMatch(RUN_POLICY.approvedSow, /even when they differ|Never create duplicates|review required/i);
  for (const boundary of ['Keep the upload-bound event identity/name fixed', 'never reset/clone it',
    'Reuse exact matches', 'Preserve RR spelling, values and formatting', 'Complete scoped lookups',
    'Never modify existing shared/account-wide objects, definitions or defaults',
    'never invent defaults or suffixes', 'not duplicate workarounds',
    'assigned local Steel', 'Do not consume another RR']) {
    assert.ok(RUN_POLICY.approvedSow.includes(boundary), boundary);
  }
});

test("guard rejects out-of-scope and forbidden Cvent writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cvent-guard-"));
  const runtimePath = join(dir, "runtime.json");
  const runtime = { ownership: "AGENT", activeTargetId: "target", expectedEvtstub: "expected" };
  await writeFile(runtimePath, JSON.stringify(runtime));
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

test("guard rejects agent authentication input and USER browser access", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cvent-auth-"));
  const runtimePath = join(dir, "runtime.json");
  await writeFile(runtimePath, JSON.stringify({ ownership: "AGENT", activeTargetId: "target", expectedEvtstub: "x" }));
  const client = { setExternalSink() {}, async request(method) { if (method === "Target.getTargets") return { targetInfos: [{ type: "page", targetId: "target", url: "https://login.microsoftonline.com/tenant/oauth2" }] }; return { result: { value: "" } }; } };
  const host = new SteelEgoHost(client, runtimePath);
  await assert.rejects(host.assertOperationAllowed({ method: "Input.dispatchKeyEvent", params: { key: "A" }, sessionId: "s" }), /authentication input is human-only/);
  await writeFile(runtimePath, JSON.stringify({ ownership: "USER", activeTargetId: "target", expectedEvtstub: "x" }));
  await assert.rejects(host.assertOperationAllowed({ method: "Runtime.evaluate", params: { expression: "1+1" } }), /User owns/);
});
