import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import { PiRpc } from "../app/pi-rpc.mjs";
import { RUN_POLICY } from "../app/run-policy.mjs";
import { isLocalRequest, eventTarget, eventName, resolveNamedEvent, mountRR } from "../app/rr-connection.mjs";

function nativeFake(handler) {
  const commands = [];
  const child = new EventEmitter();
  Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
  let buffer = "";
  child.stdin.on("data", chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const command = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      commands.push(command.type);
      const data = handler(command);
      child.stdout.write(JSON.stringify({ type: "response", id: command.id, command: command.type, success: true, data }) + "\n");
    }
  });
  const rpc = new PiRpc({ cwd: "/tmp", workspace: "/tmp/job", env: { PI_PROVIDER: "working", PI_MODEL: "model" }, spawnProcess: (_bin, args, options) => {
    assert.ok(args.includes("rpc")); assert.ok(args.includes("model"));
    assert.ok(args.includes("--no-context-files"), "runtime must not inherit development checkpoints");
    assert.equal(args[args.indexOf("--append-system-prompt") + 1], "/tmp/app/runtime-policy.md");
    assert.ok(!args.includes("--system-prompt"), "retain native tools/system prompt");
    assert.ok(args.includes("--no-skills"));
    assert.equal(args[args.indexOf("--skill") + 1], "/tmp/.pi/skills/ego-browser/SKILL.md");
    assert.ok(options.env.PATH.startsWith("/tmp/bin:"));
    assert.ok(!args.includes("--no-extensions"));
    assert.ok(!args.some(arg => ["--session", "--continue", "--resume", "-c", "-r"].includes(arg)), "new process must not auto-load an old session");
    return child;
  } });
  return { rpc, child, commands };
}
test("fresh session is idle, confirmed, changed; LF framing preserves Unicode", async () => {
  let stateCalls = 0;
  const { rpc, child, commands } = nativeFake(command => command.type === "get_state" ? { sessionId: ++stateCalls === 1 ? "old" : "new", isStreaming: false, isCompacting: false, pendingMessageCount: 0, messageCount: 0 } : command.type === "get_session_stats" ? { cost: 0 } : { cancelled: false });
  assert.equal((await rpc.freshSession()).sessionId, "new");
  assert.deepEqual(commands, ["get_state", "new_session", "get_state", "get_session_stats"]);
  const events = []; rpc.on("event", event => events.push(event));
  const frame = Buffer.from(JSON.stringify({ type: "message_update", text: "é\u2028line\u2029end" }) + "\r\n");
  for (const byte of frame) child.stdout.write(Buffer.from([byte]));
  assert.equal(events.at(-1).text, "é\u2028line\u2029end");
});
test("never reset streaming, compacting or queued work; cancelled new_session blocks", async () => {
  for (const state of [{ isStreaming: true }, { isCompacting: true }, { pendingMessageCount: 1 }]) {
    const { rpc, commands } = nativeFake(() => state);
    await assert.rejects(rpc.freshSession(), /not idle/);
    assert.deepEqual(commands, ["get_state"]);
  }
  const { rpc } = nativeFake(command => command.type === "get_state" ? { sessionId: "old", isStreaming: false, isCompacting: false, pendingMessageCount: 0 } : { cancelled: true });
  await assert.rejects(rpc.freshSession(), /not confirmed/);
});
test("fresh session rejects inherited conversation or spending before any prompt", async () => {
  for (const [messageCount, cost] of [[1, 0], [0, 0.1], [0, undefined]]) {
    let states = 0;
    const { rpc, commands } = nativeFake(command => command.type === "get_state" ? { sessionId: ++states === 1 ? "old" : "new", isStreaming: false, isCompacting: false, pendingMessageCount: 0, messageCount } : command.type === "get_session_stats" ? { cost } : { cancelled: false });
    await assert.rejects(rpc.freshSession(), /Fresh empty|prior or unavailable spending/);
    assert.ok(!commands.includes("prompt"));
  }
});

test("native continuation switches to the exact original idle session without reset", async () => {
  let switched = false;
  const { rpc, commands } = nativeFake(command => {
    if (command.type === "switch_session") { assert.equal(command.sessionPath, "/job/session.jsonl"); switched = true; return { cancelled: false }; }
    return { sessionId: switched ? "original" : "temporary", sessionFile: switched ? "/job/session.jsonl" : "/tmp/new.jsonl", isStreaming: false, isCompacting: false, pendingMessageCount: 0 };
  });
  assert.equal((await rpc.resumeSession("/job/session.jsonl", "original")).sessionId, "original");
  assert.deepEqual(commands, ["get_state", "switch_session", "get_state"]);
  const wrong = nativeFake(() => ({ cancelled: false, sessionId: "other", sessionFile: "/other", isStreaming: false, isCompacting: false, pendingMessageCount: 0 }));
  await assert.rejects(wrong.rpc.resumeSession("/job/session.jsonl", "original"), /Original idle session/);
  const cancelled = nativeFake(command => command.type === "switch_session" ? { cancelled: true } : { isStreaming: false, isCompacting: false, pendingMessageCount: 0 });
  await assert.rejects(cancelled.rpc.resumeSession("/job/session.jsonl", "original"), /not confirmed/);
});

test("verified identity persists on same-event subscreens but not conflicting identities", () => {
  const prior = { name: "Selected Event", evtstub: "abc" };
  const observed = { info: { url: "https://app.cvent.com/Subscribers/Events2/EventWebsite/EditWebsite/Index/View?evtstub=abc" }, snapshot: "Site Designer Personal Information Save", eventNames: [] };
  assert.equal(resolveNamedEvent(prior.name, observed, prior).evtstub, "abc");
  assert.throws(() => resolveNamedEvent(prior.name, observed), /does not match/);
  assert.throws(() => resolveNamedEvent(prior.name, observed, { ...prior, evtstub: "wrong" }), /does not match/);
  assert.throws(() => resolveNamedEvent(prior.name, { ...observed, eventNames: ["Wrong Event"] }, prior), /does not match/);
  for (const url of ["https://app.cvent.com/Subscribers/Events2/View?evtstub=wrong", "https://app.cvent.com/Subscribers/Events2/View?evtstub=abc&evtstub=wrong", "https://app.cvent.com/Subscribers/Login.aspx?evtstub=abc"]) {
    assert.throws(() => resolveNamedEvent(prior.name, { ...observed, info: { url } }, prior));
  }
  assert.throws(() => resolveNamedEvent(prior.name, { ...observed, snapshot: "Sign in Password" }, prior), /login first/);
});

test("Stop clears queues before native cancellation", async () => {
  const { rpc, commands } = nativeFake(() => ({}));
  await rpc.stop();
  assert.deepEqual(commands, ["clear_queue", "abort", "abort_bash"]);
});
test("failed queue clearing terminates owned execution without unsafe native abort", async () => {
  const { rpc } = nativeFake(() => ({}));
  const calls = [];
  rpc.request = async command => { calls.push(command.type); throw new Error("queue acknowledgement lost"); };
  rpc.terminate = async () => { calls.push("terminate-owned"); };
  assert.equal((await rpc.stop()).length, 1);
  assert.deepEqual(calls, ["clear_queue", "terminate-owned"]);
});
test("password-free loopback access rejects remote peers, rebinding and cross-origin requests", () => {
  const local = { socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:8788" } };
  assert.equal(isLocalRequest(local), true);
  assert.equal(isLocalRequest({ ...local, socket: { remoteAddress: "192.168.1.2" } }), false);
  assert.equal(isLocalRequest({ ...local, headers: { host: "evil.example:8788" } }), false);
  assert.equal(isLocalRequest({ ...local, headers: { ...local.headers, origin: "https://evil.example" } }), false);
  assert.equal(isLocalRequest({ ...local, headers: { ...local.headers, origin: "http://127.0.0.1:8787" } }), false);
  assert.equal(isLocalRequest({ ...local, headers: { ...local.headers, "sec-fetch-site": "cross-site" } }), false);
  assert.equal(isLocalRequest({ ...local, headers: { ...local.headers, origin: "http://127.0.0.1:8788" } }), true);
  assert.throws(() => eventTarget("https://cvent.com.evil.test/?evtstub=abc"));
  assert.throws(() => eventTarget("https://user:pass@app.cvent.com/?evtstub=abc"));
  assert.equal(eventTarget("https://app.cvent.com/?evtstub=abc").evtstub, "abc");
});

test("event names resolve only from authenticated selected-event evidence", () => {
  assert.equal(eventName("  Annual   Conference  "), "Annual Conference");
  assert.throws(() => eventName(""), /event name/);
  assert.throws(() => eventName("https://app.cvent.com/?evtstub=abc"), /not its URL/);
  const observed = { info: { url: "https://app.cvent.com/?evtstub=abc" }, snapshot: "Event Details Registration", eventNames: ["Annual Conference"] };
  assert.deepEqual(resolveNamedEvent("Annual Conference", observed), { name: "Annual Conference", url: observed.info.url, evtstub: "abc" });
  const modernUrl = "https://events.app.cvent.com/events/home?evtstub=abc";
  assert.equal(resolveNamedEvent("Annual Conference", { ...observed, info: { url: modernUrl } }).evtstub, "abc");
  assert.throws(() => resolveNamedEvent("Annual Conference", { ...observed, info: { url: "https://app.cvent.com/Subscribers/Events2/EventSelection" } }), /Events list is not an event/);
  assert.throws(() => resolveNamedEvent("Annual Conference", { ...observed, info: { url: "https://events.app.cvent.com.evil.test/?evtstub=abc" } }), /Expected HTTPS Cvent event URL/);
  assert.throws(() => resolveNamedEvent("Wrong Event", observed), /does not match/);
  assert.throws(() => resolveNamedEvent("Annual", observed), /does not match/);
  assert.throws(() => resolveNamedEvent("Annual Conference", { ...observed, eventNames: [] }), /does not match/);
  assert.throws(() => resolveNamedEvent("Annual Conference", { ...observed, eventNames: ["Annual Conference", "Other Event"] }), /ambiguous/);
  assert.throws(() => resolveNamedEvent("Annual Conference", { ...observed, snapshot: "Sign in. Password" }), /login first/);
  assert.throws(() => resolveNamedEvent("Annual Conference", { ...observed, info: { url: "https://other.cvent.com/?evtstub=abc" } }), /assigned Cvent browser/);
});

test("job lifecycle: isolated originals, login gate, durable cost, scoped RPC, Stop and no replay", async t => {
  const root = await mkdtemp(join(tmpdir(), "rr-rpc-test-"));
  await mkdir(join(root, "app"));
  await writeFile(join(root, "app/runner-prompt.md"), "Execute RR, do not rebuild software.");
  let loggedIn = false, apiReady = false, launches = 0, fake, reportedCost = 3.5;
  class FakeRpc extends EventEmitter {
    constructor(workspace) { super(); this.commands = []; this.workspace = workspace; this.id = `fresh-${launches}`; this.prompted = false; }
    state() { return { sessionId: this.id, sessionFile: join(this.workspace, 'pi-sessions/fresh.jsonl'), messageCount: 0, isStreaming: false, isCompacting: false, pendingMessageCount: 0, model: { cost: { input: 1 } } }; }
    async freshSession() { this.commands.push({ type: "new_session" }); return this.state(); }
    async request(command) {
      this.commands.push(command);
      if (command.type === 'prompt') this.prompted = true;
      return { success: true, data: command.type === 'get_state' ? this.state() : command.type === "get_session_stats" ? { cost: this.prompted ? reportedCost : 0 } : { text: "Partial; inspect receipts" } };
    }
    async stop(afterAbort) { this.commands.push({ type: "clear_queue" }, { type: "abort" }); await afterAbort(); return []; }
  }
  const app = express(); app.use(express.json());
  app.use((req, res, next) => isLocalRequest(req) ? next() : res.sendStatus(403));
  const connection = mountRR(app, { root, resolveTarget: async name => {
    if (!["Annual Conference", "Independent Event", "Budget Event"].includes(name)) throw new Error("Named event is not confirmed");
    const stub = name === "Annual Conference" ? "abc" : name === "Budget Event" ? "budget" : "independent";
    return { name, url: `https://app.cvent.com/?evtstub=${stub}`, evtstub: stub, apiEventId: stub };
  }, verifyLogin: async target => {
    if (!loggedIn) throw new Error("Login required");
    return { identityVerified: true, ownership: "AGENT", steelSessionId: "assigned", ...(apiReady ? { apiPreflight: { eventId: target.apiEventId, route: "api" } } : {}) };
  }, rpcFactory: ({workspace}) => { launches++; fake = new FakeRpc(workspace); return fake; } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => { await connection.shutdown(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, data) => fetch(base + path, { method: data === undefined ? "GET" : "POST", headers: data instanceof FormData ? {} : { "Content-Type": "application/json" }, ...(data === undefined ? {} : { body: data instanceof FormData ? data : JSON.stringify(data) }) });
  assert.equal((await fetch(base + "/api/jobs/nope", { headers: { Origin: "https://evil.example" } })).status, 403);
  async function upload(bytes = "original workbook bytes", filename = "RR.xlsx", targetName = "Annual Conference") { const data = new FormData(); data.append("rr", new Blob([bytes]), filename); data.append("eventName", targetName); return (await request("/api/jobs", data)).json(); }
  const first = await upload(), second = await upload("independent workbook bytes", "Different RR.xlsx", "Independent Event");
  assert.notEqual(first.workspace, second.workspace);
  assert.notEqual(first.sha256, second.sha256);
  assert.equal(second.originalName, "Different RR.xlsx");
  assert.equal(first.sessionMode, "fresh-on-upload");
  assert.ok(first.sessionId, "upload initializes an empty session without a paid prompt");
  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(launches, 2);
  const duplicate = await upload();
  assert.equal(duplicate.sha256, first.sha256);
  assert.notEqual(duplicate.id, first.id, "even identical bytes are a separate upload/job");
  assert.deepEqual(JSON.parse(await readFile(join(second.workspace, 'state.json'), 'utf8')).completed, []);
  assert.equal(await readFile(first.workbook, "utf8"), "original workbook bytes");
  assert.equal(await readFile(second.workbook, "utf8"), "independent workbook bytes");
  const approval = { authorizedEventName: "Annual Conference" };
  for (const override of [{ approvedSow: "Publish everything" }, { allowanceUSD: 1000 }, { externalCostReserveUSD: 0 }, { targetCostUSD: 1000 }]) {
    assert.equal((await request(`/api/jobs/${first.id}/start`, { ...approval, ...override })).status, 409, "clients cannot override the fixed run policy");
  }
  assert.equal((await request(`/api/jobs/${first.id}/start`, approval)).status, 409);
  assert.equal(launches, 3);
  loggedIn = true;
  assert.equal((await request(`/api/jobs/${first.id}/start`, approval)).status, 409, "API preflight must pass before paid execution");
  assert.equal(launches, 3);
  apiReady = true;
  assert.equal((await request(`/api/jobs/${first.id}/start`, { ...approval, authorizedEventName: "Unconfirmed Event" })).status, 409);
  assert.equal(launches, 3);
  assert.equal((await request(`/api/jobs/${first.id}/start`, approval)).status, 200);
  assert.equal(fake.commands[0].type, "new_session");
  const prompt = fake.commands.find(c => c.type === 'prompt');
  assert.match(prompt.message, /original.xlsx/);
  assert.match(prompt.message, /FIRST TASK: read and understand this job's uploaded RR locally/);
  const initialState = JSON.parse(await readFile(join(first.workspace, 'state.json'), 'utf8'));
  assert.equal(initialState.currentStage, 'Read RR first');
  assert.ok(prompt.message.includes(JSON.stringify(RUN_POLICY.approvedSow)));
  const running = await (await request(`/api/jobs/${first.id}`)).json();
  assert.equal(running.executionPolicy, "api-first-ego-fallback");
  assert.ok(prompt.message.includes('"executionPolicy":"api-first-ego-fallback"'));
  assert.equal(running.allowanceUSD, 60);
  assert.equal(running.targetCostUSD, 60);
  assert.equal(running.externalCostReserveUSD, 10);
  assert.equal(await readFile(join(first.workspace, "approved-sow.md"), "utf8"), RUN_POLICY.approvedSow);
  assert.match(prompt.message, /Annual Conference/);
  assert.match(prompt.message, /evtstub=abc/);
  assert.equal((await request(`/api/jobs/${second.id}/start`, approval)).status, 409);
  assert.equal((await request(`/api/jobs/${first.id}/rpc`, { type: "new_session" })).status, 409);
  assert.equal((await request(`/api/jobs/${first.id}/rpc`, { type: "steer", message: "/danger" })).status, 409);
  assert.equal((await request(`/api/jobs/${first.id}/rpc`, { type: "follow_up", message: "Verify saved results" })).status, 200);
  const stream = await request(`/api/jobs/${first.id}/events`);
  assert.equal(stream.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const reader = stream.body.getReader();
  await reader.read(); // Initial connected frame.
  const privateCanary = 'PRIVATE_NATIVE_REASONING_AND_TOKEN';
  fake.emit("event", { type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: privateCanary } });
  fake.emit("event", { type: "tool_execution_start", toolCallId: "uncertain", toolName: "bash", args: { command: privateCanary } });
  const activity = new TextDecoder().decode((await reader.read()).value);
  assert.match(activity, /tool_execution_start/);
  assert.doesNotMatch(activity, /PRIVATE_NATIVE|thinking_delta|command|toolCallId/);
  assert.match(await readFile(join(first.workspace, 'progress.jsonl'), 'utf8'), /PRIVATE_NATIVE_REASONING_AND_TOKEN/, 'private evidence is retained unchanged');
  await reader.cancel();
  assert.equal((await request(`/api/jobs/${first.id}/stop`, {})).status, 200);
  const stopped = await (await request(`/api/jobs/${first.id}`)).json();
  assert.equal(stopped.piCostUSD, 3.5);
  assert.deepEqual(stopped.unresolvedChanges, ["uncertain"]);
  assert.equal(stopped.status, "STOPPED_REQUIRES_REVIEW");
  assert.equal((await request(`/api/jobs/${first.id}/start`, approval)).status, 409);
  assert.equal((await request(`/api/jobs/${first.id}/results/progress.jsonl`)).status, 409, 'historical native traces are never downloadable');
  assert.equal((await request(`/api/jobs/${second.id}/start`, approval)).status, 409, "new context cannot hide prior uncertain writes to the same event");
  assert.equal((await request(`/api/jobs/${second.id}/start`, { ...approval, authorizedEventName: "Independent Event" })).status, 200);
  const secondRunning = await (await request(`/api/jobs/${second.id}`)).json();
  assert.notEqual(secondRunning.sessionId, running.sessionId);
  assert.notEqual(secondRunning.sessionFile, running.sessionFile);
  assert.equal(secondRunning.contextIsolation.initialMessageCount, 0);
  assert.equal(secondRunning.contextIsolation.initialCostUSD, 0);
  assert.equal(fake.commands[0].type, "new_session");
  assert.ok(!fake.commands.some(command => command.type === "switch_session"));
  const secondPrompt = fake.commands.find(command => command.type === "prompt").message;
  assert.ok(secondPrompt.includes(JSON.stringify(second.workbook)), "Pi receives the new user's workbook path");
  assert.ok(!secondPrompt.includes(first.workspace), "previous job input does not leak into the next run");
  assert.match(secondPrompt, /Independent Event/);
  assert.match(secondPrompt, /evtstub=independent/);
  assert.doesNotMatch(secondPrompt, /Annual Conference|evtstub=abc/);
  fake.emit("event", { type: "agent_settled" });
  for (let i = 0; i < 30; i++) {
    const result = await (await request(`/api/jobs/${second.id}`)).json();
    if (result.status === "REVIEW_REQUIRED") break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await request(`/api/jobs/${second.id}/results/result.json`)).status, 200);
  assert.equal(JSON.parse(await readFile(join(first.workspace, "job.json"), "utf8")).piCostUSD, 3.5);
  // Settlement releases this process; another run must use a fresh upload.
  assert.equal((await request(`/api/jobs/${second.id}/stop`, {})).status, 409);
  const budgetJob = await upload(undefined, undefined, "Budget Event");
  reportedCost = 50;
  assert.equal((await request(`/api/jobs/${budgetJob.id}/start`, { authorizedEventName: "Budget Event" })).status, 200);
  let budgetResult;
  for (let i = 0; i < 60; i++) {
    budgetResult = await (await request(`/api/jobs/${budgetJob.id}`)).json();
    if (budgetResult.status === "STOPPED_REQUIRES_REVIEW") break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(budgetResult.status, "STOPPED_REQUIRES_REVIEW");
  assert.match(budgetResult.stopReason, /under-\$60 goal/);
  assert.equal(budgetResult.piCostUSD, 50);
  assert.ok(fake.commands.some(command => command.type === "clear_queue"));
  reportedCost = 3.5;
  const third = await upload();
  const interrupted = JSON.parse(await readFile(join(first.workspace, "job.json"), "utf8"));
  interrupted.status = "RUNNING";
  await writeFile(join(first.workspace, "job.json"), JSON.stringify(interrupted));
  assert.equal((await request(`/api/jobs/${third.id}/start`, approval)).status, 409, "durable unsettled job blocks restart execution");
});
