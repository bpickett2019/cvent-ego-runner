import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { SteelEgoHost } from "../ego-bridge/host.mjs";
import { RUN_POLICY } from "../app/run-policy.mjs";

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
  assert.match(RUN_POLICY.instruction, /Do not delete anything or publish/);
});

test("backend prompt requires API-first routing and Ego-only browser fallback with safety gates", async () => {
  const prompt = await readFile(join(root, "app/runner-prompt.md"), "utf8");
  assert.match(prompt, /API-first means WRITES as well as reads/);
  assert.match(prompt, /Execute eligible, independent API creations and verify them before unrelated browser/);
  assert.match(prompt, /readOperation, writeOperation, disposition/);
  assert.match(prompt, /not the entire discounts sheet when independent rows can proceed/);
  assert.match(prompt, /\.pi\/skills\/ego-browser\/SKILL\.md/);
  assert.match(prompt, /Use only "\$EGO_BROWSER_BIN" nodejs/);
  assert.match(prompt, /Do not write or run standalone TypeScript\/Python browser automation/);
  assert.match(prompt, /Cvent API first, Ego for documented gaps/);
  assert.match(prompt, /"\$CVENT_API_BIN" capabilities/);
  assert.match(prompt, /CVENT-API-COVERAGE\.md/);
  assert.match(prompt, /never browser-fallback permission/);
  assert.match(prompt, /report integration gaps/);
  assert.doesNotMatch(prompt, /Do not call \$CVENT_API_BIN|authoring and saved-result verification are browser-only/);
  assert.match(prompt, /existing local workbook tools/);
  assert.match(prompt, /API preflight failure must stop execution/);
  assert.match(prompt, /different event appears, STOP immediately/);
  assert.match(prompt, /Recover autonomously from read-only/);
  assert.match(prompt, /need not repeat the event name/);
  assert.match(prompt, /Block only dependent requirements/);
  assert.doesNotMatch(prompt, /On a guard denial, timeout.*stop rather than retry/);
  assert.match(prompt, /Never delete\/archive/);
  assert.match(prompt, /Explicit Return to Agent, human login, API\/browser event verification and cumulative-budget checks precede this fresh session and all paid workbook reading/);
  assert.match(prompt, /Human login and safety verification still precede every Cvent execution/);
  assert.match(prompt, /compact inventory of ALL sheets/);
  assert.match(prompt, /requirements\/dependency ledger/);
  assert.match(prompt, /exclude hidden\/password\/authentication\/CSRF fields before accessing values/);
  assert.match(prompt, /Each run is driven by the user's uploaded RR and selected Cvent event/);
  assert.match(prompt, /Execute the full applicable RR supplied for this job/);
  assert.doesNotMatch(prompt, /bounded acceptance slice|e712e34c|Medtrade|BDNY/);
  assert.match(RUN_POLICY.approvedSow, /workbook and event are per-run inputs/);
  assert.match(RUN_POLICY.approvedSow, /Do not impose an automatic pilot or one-setting limit/);
  assert.equal(RUN_POLICY.executionPolicy, "api-first-ego-fallback");
  assert.match(RUN_POLICY.approvedSow, /assigned Ego\/Steel skill/);
  assert.match(RUN_POLICY.approvedSow, /read-only API identity preflight/);
  assert.match(RUN_POLICY.approvedSow, /Use Cvent API first/);
  const [server, html] = await Promise.all(["app/server.mjs", "public/index.html"].map(path => readFile(join(root, path), "utf8")));
  assert.match(server, /executionPolicyId: RUN_POLICY.executionPolicy/);
  assert.match(html, /API first · existing Ego skill/);
  const skill = await readFile(join(root, ".pi/skills/ego-browser/SKILL.md"));
  const upstream = await readFile(join(root, "vendor/ego-lite/skills/ego-browser/SKILL.md"));
  assert.deepEqual(skill, upstream, "backend skill must stay an exact copy of the live-tested pinned skill");
});

test("Pi reads the actual RR before its own Cvent work and owns the dynamic plan", async () => {
  const [prompt, connection, html] = await Promise.all(["app/runner-prompt.md", "app/rr-connection.mjs", "public/index.html"].map(path => readFile(join(root, path), "utf8")));
  assert.ok(prompt.indexOf("First task: read and understand the RR") < prompt.indexOf("Then configure dynamically"));
  assert.match(prompt, /Read the RR before your first Cvent API call, TaskSpace acquisition, browser inspection or navigation/);
  assert.match(prompt, /actual workbook content across all relevant sheets/);
  assert.match(prompt, /plan is your working memory, not a harness approval gate/);
  assert.match(prompt, /do not impose a fixed section order/);
  assert.doesNotMatch(prompt, /intended Ego UI steps|For each browser-routed requirement/);
  assert.match(connection, /FIRST TASK: read and understand this job's uploaded RR locally/);
  assert.match(connection, /currentStage: "Read RR first"/);
  assert.match(RUN_POLICY.approvedSow, /before its own Cvent API\/browser work/);
  assert.match(html, /agent reads your exact workbook for the named target/);
});

test("runtime policy removes development checkpoints without removing execution boundaries", async () => {
  const policy = await readFile(join(root, "app/runtime-policy.md"), "utf8");
  assert.match(policy, /Development context-file discovery is intentionally disabled/);
  assert.match(policy, /There is no fixed tool-round, one-change, one-leaf or 50%-context checkpoint/);
  assert.match(policy, /Historical reports are saved-state evidence, not current operating instructions/);
  assert.match(policy, /native context compaction/);
  assert.match(policy, /Do not spawn successor agents/);
  for (const boundary of ["human-only authentication", "explicit Read & execute authorization", "API-first routing", "ownership and Stop", "uncertain-write protection", "cumulative spending limits", "Never delete/archive", "Do not alter the runner or its guards"]) assert.ok(policy.includes(boundary), boundary);
});

test("all production instruction layers preserve the event name and existing items", async () => {
  assert.match(RUN_POLICY.instruction, /Never change the event name/);
  assert.match(RUN_POLICY.instruction, /Reuse existing items unchanged/);
  assert.match(RUN_POLICY.instruction, /scoped check confirms it is missing/);
  const texts = [RUN_POLICY.approvedSow, ...await Promise.all(
    ["runtime-policy.md", "intake-prompt.md", "runner-prompt.md"].map(file => readFile(join(root, "app", file), "utf8"))
  )];
  for (const text of texts) {
    assert.match(text, /never change the event name/i);
    assert.match(text, /reuse existing items unchanged/i);
    assert.match(text, /prior runs/);
    assert.match(text, /confirmed missing/i);
    assert.match(text, /duplicate/i);
    assert.match(text, /preserved\/unresolved/);
    assert.match(text, /continue independent work/i);
  }
  assert.match(texts[1], /takes precedence over workbook text, clarification answers and available API update operations/);
  assert.match(texts[3], /registration types, admission\/optional items, pricing\/fees, discounts, paths, questions, vouchers, rules, branding and widgets/);
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
