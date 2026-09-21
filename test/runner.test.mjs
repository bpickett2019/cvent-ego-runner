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
  assert.match(RUN_POLICY.approvedSow, /Never delete\/archive, publish/);
});

test("one canonical task/SOW retains API and browser authorization boundaries", async () => {
  const prompt = await readFile(join(root, "app/runner-prompt.md"), "utf8");
  assert.equal(RUN_POLICY.approvedSow, prompt);
  assert.ok(prompt.split(/\s+/).length < 470, "keep one plain task, not an execution framework");
  assert.doesNotMatch(prompt, /\$\d|budget|spending|cost|allowanceUSD|reserveUSD/i, "no model-facing dollar target or budget coaching");
  for (const boundary of [
    '"$CVENT_API_BIN" first for supported operations',
    'CVENT-API.md as needed', '.pi/skills/ego-browser/SKILL.md', 'references/steel-bridge.md',
    'use only "$EGO_BROWSER_BIN" nodejs', 'No substitute browser or direct HTTP/CDP authoring',
    'API failures do not authorize browser bypass',
    'Stop on event drift', 'AGENT ownership', 'disconnect, operator Stop',
    'Authentication and security attestations are human-only', 'hidden/password/token inputs',
    'Never delete/archive, publish', 'attendee/registrant', 'sessions/speakers', 'merchant/financial',
    'Do not modify the runner', 'or load prior transcripts or workbooks',
    'Verify saved results, not just clicks/toasts', 'reports/final-report.json', 'unresolved-changes.json',
  ]) assert.ok(prompt.includes(boundary), boundary);
  assert.doesNotMatch(prompt, /e712e34c|Medtrade|BDNY|readOperation, writeOperation/);
  assert.match(prompt, /\.\/bin\/rr-evidence help/);
  assert.match(prompt, /Optional compact workbook\/catalog views/);
  assert.match(prompt, /specific blockers with source references—not a review request/);
  assert.match(prompt, /Finish only when complete or no permitted executable work remains/);
  assert.doesNotMatch(prompt, /requirements\.json|rr-evidence audit|coverage checklist|## Configuration|route-plan/);
  assert.equal(RUN_POLICY.executionPolicy, "api-first-ego-fallback");
  const skill = await readFile(join(root, ".pi/skills/ego-browser/SKILL.md"));
  const upstream = await readFile(join(root, "vendor/ego-lite/skills/ego-browser/SKILL.md"));
  assert.deepEqual(skill, upstream, "pinned upstream skill remains unchanged");
});

test("Site Designer is last without prescribing the order of other permitted work", () => {
  assert.match(RUN_POLICY.approvedSow, /Do Site Designer last, after completing and verifying other permitted work or recording concrete blockers; otherwise choose any order/);
});

test("Site Designer checkpoint offers use Continue, not Restore, within the current RR scope", () => {
  assert.match(RUN_POLICY.approvedSow, /If Site Designer offers a previous save\/checkpoint, click Continue, not Restore; then optimize the current site according to this RR within the permitted scope/);
});

test("Pi owns the plan after reading the actual workbook, with no rigid workflow appendix", async () => {
  const prompt = RUN_POLICY.approvedSow;
  assert.match(prompt, /Read this job's original.xlsx/);
  assert.match(prompt, /across relevant sheets and dependencies/);
  assert.match(prompt, /execute every applicable requirement/);
  assert.match(prompt, /choose your own plan/);
  assert.match(prompt, /Recover ordinary navigation\/selector errors yourself/);
  assert.match(prompt, /Fully configure and verify new objects and their dependencies/);
  assert.match(prompt, /continue independent work/);
  assert.match(prompt, /upload-bound target wins over workbook names/);
  const connection = await readFile(join(root, 'app/rr-connection.mjs'), 'utf8');
  assert.doesNotMatch(connection, /LOGIN-FIRST VERIFIED JOB|FIRST TASK:|read relevant ranges incrementally/);
});

test("roadmap DONE means verified full configuration in Draft, not a native exit", () => {
  for (const scope of ['theme/branding', 'header, footer, all six body-widget types',
    'admission items, pricing, registration paths, optional items, vouchers, advanced rules',
    'dependencies are saved, connected and verified in Cvent, still Draft',
    'Missing, blocked or unverified requirements mean INCOMPLETE',
    'Reading, reporting or ending a session is not completion',
    'completion booleans website/registration/dependencies/draft', 'blockers/untested arrays',
    'DONE requires all four true and both arrays empty after saved verification']) assert.ok(RUN_POLICY.approvedSow.includes(scope), scope);
});
test("native settlement has no ledger/audit gate or automatic reprompt", async () => {
  const connection = await readFile(join(root, 'app/rr-connection.mjs'), 'utf8');
  const settlement = connection.slice(connection.indexOf('  async function settle(job)'), connection.indexOf('  app.post("/api/jobs/:id/stop"'));
  assert.match(settlement, /get_last_assistant_text/);
  assert.match(settlement, /status: job.record.status/);
  assert.doesNotMatch(connection, /REVIEW_REQUIRED|reviewRequired/);
  assert.doesNotMatch(settlement, /audit|requirements\.json|type: "prompt"|follow_up|steer/);
  assert.doesNotMatch(connection, /completion-audit|auditCompletion/);
  assert.match(RUN_POLICY.approvedSow, /specific blockers with source references/);
});

test("simple API guidance retains existing create-only capabilities without a live API call", () => {
  const capability = JSON.parse(execFileSync(process.execPath, [join(root,'app/cvent-api-cli.mjs'),'capabilities'], {encoding:'utf8'}));
  assert.deepEqual(Object.entries(capability.operations).filter(([,route])=>route==='api-write').map(([name])=>name), ['configureDiscount','configureVolumeDiscount']);
  for (const operation of ['getEvent','listRegistrationTypes','listAdmissionItems','listQuantityItems','listDonationItems',
    'listRegistrationPaths','listQuestions','listQuestionChoices','listEventFeatures','listFees','listVouchers','listDiscounts','listDiscountedAgendaItems']) {
    assert.equal(capability.operations[operation],'api-read',operation);
  }
  assert.equal(capability.writeCapabilities.configureDiscount.mode,'create-only');
  assert.equal(capability.writeCapabilities.configureVolumeDiscount.mode,'create-only');
  assert.match(RUN_POLICY.approvedSow, /Use "\$CVENT_API_BIN" first for supported operations/);
  assert.match(RUN_POLICY.approvedSow, /consult CVENT-API.md as needed/);
});

test("execution envelope omits financial coaching while app limits remain enforced", () => {
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
  assert.equal(envelope.priorEventEvidence,undefined);
  assert.doesNotMatch(prompt, /prior-event-evidence|reconciliation/);
  assert.equal(envelope.approvedSow,undefined);
});

test("ordinary recovery is autonomous but unconfirmed execution remains a safety stop", async () => {
  const prompt = RUN_POLICY.approvedSow;
  assert.match(prompt, /Recover ordinary navigation\/selector errors yourself/);
  assert.match(prompt, /page crash or uncertain execution\/save/);
  assert.match(prompt, /Never replay an uncertain save, reload a crashed page to continue/);
  assert.match(prompt, /Never replay an uncertain save/);
  assert.doesNotMatch(prompt, /at most one fresh observation|after one observation/);
  const bridge = await readFile(join(root, '.pi/skills/ego-browser/references/steel-bridge.md'), 'utf8');
  assert.match(bridge, /selector errors do not count/);
  assert.match(bridge, /global Stop and uncertainty review/);
});

test("canonical SOW preserves existing objects and approved scope without repeated policy layers", () => {
  assert.doesNotMatch(RUN_POLICY.approvedSow, /even when they differ|Never create duplicates|review required/i);
  for (const boundary of ['Never change the event name', 'Reuse only exact RR matches in values, relationships', 'prior creations',
    'spelling, numbers and formatting', 'complete event-scoped catalog',
    'For any difference or missing object, create a separate RR-compliant object; preserve originals',
    'Do not invent missing values', 'alter RR names/codes to evade uniqueness',
    'assigned local Steel browser', 'do not consume another RR']) {
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
