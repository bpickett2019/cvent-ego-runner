import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, relative } from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { SteelEgoHost } from "../ego-bridge/host.mjs";
import { RUN_POLICY, RUN_SKILLS, RUN_SKILL_FILES, executionPrompt } from "../app/run-policy.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const source = path => readFile(join(root, path), 'utf8');
const ref = name => source(`.pi/skills/cvent-event-build/references/${name}.md`);
const skill = () => source('.pi/skills/cvent-event-build/SKILL.md');
const compact = value => value.replace(/\s+/g, ' ');

// Historical private-fixture acceptance is not replaced by a fake or skipped.
// CVENT_PRIVATE_RR_PLAN lets operators keep the genuine fixture outside public source;
// the same exact source hash, counts and identity assertions below always apply.
test("RR plan covers every sheet and preserves benchmark identities", async () => {
  const plan = JSON.parse(await readFile(process.env.CVENT_PRIVATE_RR_PLAN || join(root, 'data/current/rr-plan.json'), 'utf8'));
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
  assert.match(js, /runtime.ownership === "USER" && !viewerStopped && !\['PAUSING', 'RETURNING', 'STOPPING'\]\.includes\(job\?\.phase\) && !handoffPending/);
});

test("workbook UI has no scope, budget or prompt overrides", async () => {
  const [html, js] = await Promise.all(["public/index.html", "public/app.js"].map(source));
  assert.doesNotMatch(html, /id="(?:sow|allowance|reserve|instruction|lockTarget)"/);
  assert.doesNotMatch(js, /form.append\("instruction"/);
  assert.match(html, /id="eventName"/);
  assert.match(html, /Pi chooses the workflow/);
  assert.match(RUN_POLICY.instruction, /using the cvent-event-build skill/);
});

test("native task delegates policy and stage order without a scripted editor sequence", async () => {
  const task = RUN_POLICY.executionInstructions;
  assert.equal(task, await source('app/native-task.md'));
  assert.ok(task.trim().split(/\s+/).length <= 400);
  assert.match(task, /\.pi\/skills\/cvent-event-build\/SKILL.md/);
  assert.match(compact(task), /execute in the skill's order/);
  assert.match(compact(task), /sheet order is not execution order/);
  assert.match(task, /verify saved fields and relationships/);
  assert.doesNotMatch(task, /SOW|approved-sow|scopeDocument|Work in this order|discounts.first|Stage [1-5]|\$60/i);
  assert.equal(RUN_POLICY.approvedSow, undefined);
  assert.equal(RUN_POLICY.executionPolicy, 'native-pi');
  assert.equal(RUN_POLICY.spendingLimitEnabled, false);
  const rpc = await source('app/pi-rpc.mjs');
  assert.match(rpc, /RUN_SKILLS.flatMap/);
  assert.doesNotMatch(rpc, /"--(?:system-prompt|append-system-prompt|tools|no-tools|no-extensions)"/);
});

test("one explicit skill has a complete self-contained reference graph", async () => {
  assert.deepEqual(RUN_SKILLS, ['cvent-event-build']);
  const directory = join(root, '.pi/skills/cvent-event-build');
  // SKILL.md is immutable client text; native-task also supplies reference entrypoints.
  const pending = RUN_SKILL_FILES.map(file => join(root, file)), seen = new Set();
  while (pending.length) {
    const file = pending.shift(); if (seen.has(file)) continue; seen.add(file);
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /\/Users\/|forge-ui|ego-steel-controls|approved-sow|standing-sow|commandVersion/i, file);
    if (file.endsWith('SKILL.md')) assert.match(text, /^---\nname: cvent-event-build\ndescription: .+\n---/);
    else assert.doesNotMatch(text, /^---\nname:/, 'references are not additional discoverable skills');
    for (const [, target] of text.matchAll(/\]\(([^)]+\.md)\)/g)) {
      if (/^https?:/.test(target)) continue;
      const resolved = resolve(dirname(file), target);
      assert.ok(resolved.startsWith(directory + '/'), target);
      await access(resolved); pending.push(resolved);
    }
  }
  assert.deepEqual([...seen].map(file => relative(root, file)).sort(), [...RUN_SKILL_FILES].sort());
});

test("client scope preserves identity, shared definitions and assigned transports", async () => {
  const build = compact(await skill());
  assert.match(build, /Event → Registration Types → Admission Items → Fees → Discount Codes/);
  assert.match(build, /Change anything shared across the Cvent account/);
  assert.match(build, /Never repeat a change whose outcome you don't know/);
  const integration = compact(await ref('runner-integration'));
  for (const phrase of ['Verify exact ID/name and unpublished state', 'No other agent, browser, profile, tab, server, raw connection or HTTP fallback',
    'Human login/MFA only', 'same-event claims', 'remove locks/markers', 'exposed secrets', 'Pending Save means observe, not reload or repeat',
    'No automatic next build', 'Other library writers are denied by the RR CLI']) assert.ok(integration.includes(phrase), phrase);
  const bridge = compact(await ref('browser/references/steel-bridge'));
  assert.match(bridge, /non-discount API writes are not authorized/);
  assert.doesNotMatch(bridge, /Pi may choose Ego or|approved SOW/);
});

test("technical references preserve domain evidence without removed specialist policies", async () => {
  const rr = compact(await ref('rr-interpretation'));
  assert.match(rr, /exact sheet\/cell\/range references/);
  assert.match(rr, /Keep deferred connections unfinished until their dependencies are saved and verified/);
  const discounts = compact(await ref('discounts'));
  for (const phrase of ['Registration-type Advanced Filters are not exposed', 'Unsupported required eligibility blocks the discount before writing',
    'full nonempty', 'complete links', 'No raw HTTP or browser discount fallback after denial']) {
    if (phrase === 'full nonempty') assert.match(compact(await source('CVENT-API.md')), /full nonempty desired set/);
    else assert.ok(discounts.includes(phrase), phrase);
  }
  const bridge = compact(await ref('browser/references/steel-bridge'));
  assert.match(bridge, /Continue retains current work; Restore can replace it/);
  const contract = compact(await ref('runner-contract'));
  assert.match(contract, /No included|missing saved field/);
  assert.match(contract, /Registration testing is not a new-build requirement/);
  assert.match(contract, /No automatic next run/);
});

test("skill runner contract preserves progress and controller completion formats", async () => {
  const contract = await ref('runner-contract');
  for (const text of ['"requirements":[]', 'verified_changed', 'verified_existing',
    'partially_verified', 'currentStage', 'currentAction', 'updatedAt', 'unresolved-changes.json',
    'reports/final-report.md', 'reports/final-report.json', 'STOPPED']) assert.ok(contract.includes(text), text);
  const example = JSON.parse(contract.split('Minimum DONE shape')[1].match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(example, { eventId: '<authorizedEvent.apiEventId>', status: 'DONE', completionPolicy: 'client-rules-configuration-only-v1', registrationTesting: 'not_performed', completion: { requirements: true, draft: true }, blockers: [], untested: [] });
  assert.match(compact(contract), /Before editing a verified item, revoke stale verification, mark it unverified/);
});

test("known capability gaps are local blockers; pending and uncertain saves are not replayed", async () => {
  const guide = compact(await ref('browser/references/steel-bridge'));
  for (const text of ['A known unsupported capability before any possible execution is a local blocker, not a whole-run Stop',
    'Never assume an error means nothing executed', 'selector errors do not count',
    'Do not close, navigate, refresh or repeat Save while pending',
    'a validation indicator alone does not prove that nothing persisted',
    'After confirmed completion, independently verify persisted values and connections',
    'If the bounded wait cannot establish the outcome, stop and retain uncertainty without replay',
    'This does not defer Stop for crash/disconnect, unconfirmed tool execution, identity/ownership loss']) assert.ok(guide.includes(text), text);
});

test("native settlement has no audit gate or automatic reprompt", async () => {
  const connection = await source('app/rr-connection.mjs');
  const settlement = connection.slice(connection.indexOf('  async function settle(job)'), connection.indexOf('  app.post("/api/jobs/:id/stop"'));
  assert.match(settlement, /get_last_assistant_text/);
  assert.match(settlement, /status: job.record.status/);
  assert.doesNotMatch(settlement, /audit|requirements\.json|type: "prompt"|follow_up|steer/);
  assert.doesNotMatch(connection, /approvedSow|approved-sow|standing-sow/);
});

test('event access is based on verified identity, not a naming-prefix convention', async () => {
  for(const file of ['app/cvent-api.mjs','app/cvent-bulk-probe.mjs']) {
    const text=await source(file);assert.doesNotMatch(text,/startsWith\(["']\(C\+D\)/);
  }
  const integration=await ref('runner-integration');
  assert.match(compact(integration),/Verify exact ID\/name and unpublished state/);
  assert.match(compact(integration),/Do not retarget or follow replacement inputs/);
  assert.match(compact(await source('CVENT-API.md')),/no naming prefix is required/);
});

test("supported discount read/write capabilities remain available without a live call", () => {
  const capability = JSON.parse(execFileSync(process.execPath, [join(root,'app/cvent-api-cli.mjs'),'capabilities'], {encoding:'utf8'}));
  assert.deepEqual(Object.entries(capability.operations).filter(([,route])=>route==='api-write').map(([name])=>name), ['configureDiscount','configureVolumeDiscount']);
  assert.equal(capability.writeCapabilities.configureDiscount.mode,'event-only-create-or-update');
  assert.equal(capability.writeCapabilities.configureVolumeDiscount.mode,'event-only-create-or-update');
  for (const name of ['getEvent','listDiscounts','listDiscountedAgendaItems','listAdmissionItems','listQuantityItems','listRegistrationTypes']) assert.equal(capability.operations[name], 'api-read');
  assert.equal(capability.operations.deleteDiscount, undefined);
});

test("execution envelope needs no SOW and excludes legacy scope, history and budget coaching", () => {
  const record = { executionInstructions: 'Captured native task', approvedSow: 'LEGACY SCOPE', target: {name:'Selected event',apiEventId:'event-id'}, workbook:'/job/original.xlsx', sha256:'source-hash', allowanceUSD:60, priorEventCostUSD:29, executionPolicy:RUN_POLICY.executionPolicy, instruction:'OBSOLETE WORKFLOW', lastAssistantText:'OLD CONVERSATION' };
  const prompt = executionPrompt(record, '/job');
  assert.equal(prompt.split(record.executionInstructions).length, 2);
  assert.doesNotMatch(prompt, /LEGACY SCOPE|OBSOLETE WORKFLOW|OLD CONVERSATION|runtime-policy|prior-event-evidence|reconciliation/);
  const envelope = JSON.parse(prompt.slice(prompt.indexOf('{')));
  assert.deepEqual(envelope, {workspace:'/job', workbook:record.workbook, workbookSha256:record.sha256, authorizedEvent:record.target, executionPolicy:'native-pi'});
  for (const value of [undefined, '']) assert.throws(() => executionPrompt({...record,executionInstructions:value},'/job'), /Captured task required/);
  const { approvedSow, ...withoutScope } = record;
  assert.equal(executionPrompt(withoutScope, '/job'), prompt);
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
