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

// Historical private-fixture acceptance is deliberately not replaced by a fake
// workbook or silently skipped. A clean clone lacks this fixture.
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

test("short native task delegates to skills with types-first precedence, without SOW or a scripted editor sequence", async () => {
  const task = RUN_POLICY.executionInstructions;
  assert.equal(task, await source('app/native-task.md'));
  assert.ok(task.trim().split(/\s+/).length <= 120);
  assert.match(task, /\.pi\/skills\/cvent-event-build\/SKILL.md/);
  assert.match(task, /verified event selection, then RR-required\s+registration types, then the remaining work in dependency order/);
  assert.doesNotMatch(task, /Choose your own plan and dependency order/);
  assert.match(task, /Execute and verify saved results/);
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
  const pending = [join(directory, 'SKILL.md')], seen = new Set();
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

test("build skill applies types-first and narrow contact-type scope without bypassing runtime or transport", async () => {
  const build = compact(await skill());
  assert.match(build, /\[runner integration\]\(references\/runner-integration.md\)/);
  assert.match(build, /verified event selection → registration types → remaining configuration/);
  assert.match(build, /Missing essential inputs, known unsupported features and ordinary pre-write navigation\/selector errors are not reasons to end the build/);
  assert.match(build, /sole create-only contact-type exception/);
  const integration = compact(await ref('runner-integration'));
  for (const text of ['Preserve event ID/name', 'Use "$CVENT_API_BIN"', 'No raw HTTP, standalone helper',
    'Do not start another agent, browser, profile, tab or server', 'No deletion/archive',
    'widget/link removal, reset, cloning, publishing', 'shared-account/object changes',
    'attendee/CRM access', 'communications sending', 'Sessions/Speakers configuration',
    'merchant/payment-account', 'banking/settlement', 'shared payment/tax/currency',
    'credential/integration-identifier', 'Human login/MFA only', 'Do not read or print credentials',
    'environment dumps, process environments', 'secret-bearing prior transcripts',
    'Lost identity/control', 'expired login', 'exposed secrets', 'crash/disconnect',
    'unresolved write outcomes', 'Never replay unresolved writes, clear locks/uncertainty or bypass holds',
    'configureDiscount and configureVolumeDiscount only', 'Never bypass a denial/uncertainty via UI']) assert.ok(integration.includes(text), text);
  const bridge = compact(await ref('browser/references/steel-bridge'));
  assert.match(bridge, /active RR build uses `\$CVENT_API_BIN` for discount reads\/writes/);
  assert.match(bridge, /non-discount API writes are not authorized/);
  assert.doesNotMatch(bridge, /Pi may choose Ego or|approved SOW/);
});

test("imported specialists keep domain guidance and use this runner's capabilities and result spelling", async () => {
  const registration = compact(await ref('registration-and-pricing'));
  for (const text of ['Apply authoritative old-to-new mappings', 'type/admission availability',
    'independently reopen/read the saved configuration', 'without submitting attendee records']) assert.ok(registration.includes(text), text);
  const website = compact(await ref('website-and-fields'));
  assert.match(website, /agreed category checklist to detect omissions/);
  assert.match(website, /Continue versus Restore/);
  const discounts = compact(await ref('discounts'));
  for (const text of ['Exact mapping checklist', 'Reconcile and execute',
    'Registration-type Advanced Filters are not exposed', 'before any write',
    'adapter accepts any operator-selected event name', 'verified UUID/name binding', 'configureDiscount/configureVolumeDiscount',
    'not a standalone HTTP helper', 'never a browser fallback',
    'Do not switch to Ego to bypass an API rejection']) assert.ok(discounts.includes(text), text);
  const integration = compact(await ref('runner-integration'));
  for (const text of ['listDiscounts', 'listDiscountedAgendaItems', 'CVENT_CREDENTIALS_FILE',
    'Non-persisting browser preview can verify behavior', 'no blockers/untested/uncertainty']) assert.ok(integration.includes(text), text);
  const verify = compact(await ref('verification'));
  assert.match(verify, /Revisit the original RR to identify omissions/);
  assert.match(verify, /\*\*DONE — RR website\/registration requirements\*\*/);
  assert.match(verify, /\[runner contract\]\(runner-contract.md\)/);
  assert.doesNotMatch(verify, /\*\*COMPLETE\b|SOW|six-widget/);
});

test("skill runner contract preserves progress and controller completion formats", async () => {
  const contract = await ref('runner-contract');
  for (const text of ['state.json.requirements', 'verified_changed', 'verified_existing',
    'partially_verified', 'currentStage', 'currentAction', 'updatedAt', 'unresolved-changes.json',
    'reports/final-report.md', 'reports/final-report.json', 'STOPPED']) assert.ok(contract.includes(text), text);
  const example = JSON.parse(contract.split('Minimum successful JSON:')[1].match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.deepEqual(example, { eventId: '<authorizedEvent.apiEventId>', status: 'DONE', completion: { requirements: true, draft: true }, blockers: [], untested: [] });
  assert.match(compact(contract), /Before changing a verified requirement, mark it unverified again/);
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
  assert.match(integration,/No naming-prefix guard applies/);
  assert.match(integration,/target is locked/);
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
