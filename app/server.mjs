import express from "express";
import httpProxy from "http-proxy";
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isLocalRequest, eventTarget, eventName, resolveNamedEvent, mountRR } from "./rr-connection.mjs";
import { CventConnection } from "./cvent-api.mjs";
import { eventObservationProgram } from "./browser-identity.mjs";
import { eventLocationPlan, eventLocationProgram } from "./event-location.mjs";
import { RUN_POLICY } from "./run-policy.mjs";
import { mountWorkbooks } from "./workbooks.mjs";
import { acknowledgeSessionIncident } from "./session-security.mjs";
import { provisionCleanBrowser, steelOrigin } from "./clean-browser.mjs";
import { transitionBrowser } from "./browser-ownership.mjs";
import { executionCleared } from "./execution-clearance.mjs";

// Native Pi and its tools inherit owner-only artifact permissions.
process.umask(0o077);
const root = resolve(new URL("..", import.meta.url).pathname);
const current = resolve(root, "data/current");
const runtimePath = resolve(current, "runtime.json");
const statePath = resolve(current, "state.json");
const operationLock = resolve(current, "operation.lock");
const app = express();
const cventApi = new CventConnection();
let targetLookup = false;
let returningControl = false;
let browserEpoch = 0;
const viewerProxy = httpProxy.createProxyServer({ target: "http://127.0.0.1:3400", ws: true, changeOrigin: true });
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
};
app.use((req, res, next) => {
  if (!isLocalRequest(req)) return res.status(403).end();
  res.set("Cache-Control", "no-store");
  next();
});
app.use((req, res, next) => {
  if (process.env.CVENT_EXECUTION_ENABLED === 'false' && req.method === 'POST' && (/^\/api\/(?:target|return-agent)$/.test(req.path) || /^\/api\/jobs\/[^/]+\/(?:answer|rpc|start|continue)$/.test(req.path))) return res.status(503).json({ error: 'Paid AI is disabled pending secure credentials and activation checks. Browser preview and Stop remain available.' });
  next();
});
app.use(express.json({ limit: "100kb" }));
app.use(express.static(resolve(root, "public")));
async function updateState(patch) {
  const state = { ...await readJson(statePath), ...patch, updatedAt: new Date().toISOString() };
  await writeJson(statePath, state);
}
async function waitForIdle(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (existsSync(operationLock)) {
    if (Date.now() > deadline) throw new Error("Existing Ego operation active; refusing to interrupt an unowned resource");
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
}
async function observe(program = eventObservationProgram()) {
  await waitForIdle();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(resolve(root, "bin/ego-browser"), ["nodejs"], { cwd: root, env: { ...process.env, RR_WORKSPACE: current }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Login observation timed out")); }, 45000);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.resume();
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("exit", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error("Assigned browser observation failed; complete login manually"));
      try { resolvePromise(JSON.parse(stdout)); } catch { reject(new Error("Invalid login observation")); }
    });
    // Default is read-only. Event location explicitly supplies a v2 Page program
    // under LOCATING ownership, which permits only the selected event route.
    child.stdin.end(program);
  });
}
async function verifyLogin(target) {
  const runtime = await readJson(runtimePath);
  if ((await readJson(statePath)).status === "RUNNING") throw new Error("Legacy execution is active; do not reset or replace it");
  if (!runtime.identityVerified || runtime.ownership !== "AGENT") throw new Error("Complete login and Return to Agent before paid execution");
  const apiVerified = await cventApi.assertTarget(target);
  const observed = await observe();
  const priorIdentity = runtime.resolvedEventName === target.name && runtime.expectedEvtstub === target.evtstub && runtime.apiEvent?.id === target.apiEventId && runtime.apiEvent?.name === target.name ? target : null;
  const actual = resolveNamedEvent(target.name, observed, priorIdentity);
  if (actual.evtstub !== target.evtstub) throw new Error("Assigned browser is not on the confirmed Cvent event; event names alone are not unique identities");
  const latest = await readJson(runtimePath);
  if (latest.ownership !== "AGENT" || latest.steelSessionId !== runtime.steelSessionId || latest.activeTargetId !== runtime.activeTargetId) throw new Error("Browser ownership or identity changed during login check");
  return { ...latest, apiPreflight: apiVerified.receipt, lastLoginVerification: { at: new Date().toISOString(), url: actual.url } };
}
// Exclusive ownership; a stale lock requires deliberate operator reconciliation.
const connectionLock = resolve(root, "data/rr-connection.lock");
const lockHandle = openSync(connectionLock, "wx", 0o600);
writeFileSync(lockHandle, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
process.once("exit", () => { closeSync(lockHandle); try { unlinkSync(connectionLock); } catch {} });
async function resolveTarget(name) {
  const runtime = await readJson(runtimePath);
  if (targetLookup || returningControl || runtime.expectedEventName !== name || runtime.resolvedEventName !== name || runtime.apiEvent?.name !== name || !runtime.targetEventUrl || !runtime.expectedEvtstub) throw new Error("Select the event, complete human login if needed, and Return to Agent; Ego opens and verifies the event");
  const target = eventTarget(runtime.targetEventUrl);
  if (target.evtstub !== runtime.expectedEvtstub) throw new Error("Stored event identity is inconsistent");
  if (runtime.apiEvent.id !== target.evtstub) throw new Error("API/browser event identity mapping is not verified; no guessing or browser fallback");
  return { ...target, name, apiEventId: runtime.apiEvent.id };
}
async function provisionBrowser(record, cancelled) {
  if (targetLookup || returningControl) throw new Error("Browser handoff already active");
  await waitForIdle();
  const previous = await readJson(runtimePath);
  const runtime = await provisionCleanBrowser({ root, record, cancelled });
  if (cancelled()) throw new Error("Browser startup cancelled; prior browser retained");
  await writeJson(resolve(record.workspace, "receipts/previous-browser-runtime.json"), previous);
  // Carry incident acknowledgments, never authentication cookies or event identity.
  runtime.securityAcknowledgedJobs = previous.securityAcknowledgedJobs || [];
  runtime.securityAcknowledgedAt = previous.securityAcknowledgedAt;
  runtime.ownership = "BOOTSTRAPPING";
  await writeJson(runtimePath, runtime);
  try {
    await observe(`const task = await taskSpace(1246080070); const tabs = await task.tabs(); if (tabs.length !== 1 || !tabs[0].active) throw new Error('Assigned new page is ambiguous'); const page = tabs[0].label ? task.page(tabs[0].label) : await task.adopt(tabs[0].page); await page.goto('https://app.cvent.com/Subscribers/Events2/EventSelection'); cliLog(JSON.stringify({ready:true}));`);
    if (cancelled()) throw new Error("Browser startup cancelled");
  } finally {
    const latest = await readJson(runtimePath);
    if (latest.runtimeId === runtime.runtimeId) await writeJson(runtimePath, { ...latest, ownership: "USER" });
  }
  await updateState({ status: "LOGIN_REQUIRED", currentAction: "Clean browser ready; human login required. AI not started." });
  return readJson(runtimePath);
}
const connection = mountRR(app, { root, verifyLogin, prepareTarget, provisionBrowser });
mountWorkbooks(app, { root, isBusy: () => connection.isBusy() });
app.get("/api/execution-clearance/:id", (req, res) => res.json({ cleared: executionCleared(root, req.params.id) }));
app.get("/api/state", async (_req, res) => res.json(await readJson(statePath)));
async function browserStopped(runtime) {
  if (!/^[0-9a-f-]{36}$/.test(runtime.jobId || "")) return false;
  try { return (await readJson(resolve(root, "data/jobs", runtime.jobId, "receipts/steel-cleanup.json"))).status === "STOPPED"; }
  catch { return false; }
}
app.get("/api/runtime", async (_req, res) => {
  const runtime = await readJson(runtimePath);
  const { runtimeId, activeTargetId, steelSessionId, ownership, targetEventUrl, expectedEventName, resolvedEventName, expectedEvtstub, apiEvent } = runtime;
  res.json({ loginFirst: true, executionEnabled: process.env.CVENT_EXECUTION_ENABLED !== 'false', budget: connection.budget(), browserStopped: await browserStopped(runtime), runtimeId, activeTargetId, steelSessionId, ownership, targetEventUrl, expectedEventName, resolvedEventName, expectedEvtstub, apiEvent, executionPolicy: RUN_POLICY.executionDescription, executionPolicyId: RUN_POLICY.executionPolicy });
});
async function selectTarget(name) {
  if (targetLookup || returningControl) throw new Error("Wait for the existing browser handoff");
  targetLookup = true;
  try {
    await writeJson(runtimePath, { ...await readJson(runtimePath), expectedEventName: name, resolvedEventName: null, expectedEvtstub: null, targetEventUrl: null, apiEvent: null });
    const matches = await cventApi.findEvents(name);
    if (!matches.length) throw new Error("No exact event-name match was found through the Cvent API");
    if (matches.length !== 1) throw new Error("Multiple Cvent API events have that name. A unique event identity must be approved before execution; no event was selected");
    await writeJson(runtimePath, { ...await readJson(runtimePath), apiEvent: matches[0] });
    return { name, resolved: false, apiEvent: matches[0], route: "api" };
  } finally { targetLookup = false; }
}
app.post("/api/target", async (req, res) => {
  if (connection.isBusy()) return res.status(409).json({ error: "Cannot change target during an active job" });
  res.json(await selectTarget(eventName(req.body.eventName)));
});
app.post("/api/take-control", async (_req, res) => {
  browserEpoch++;
  await connection.stop();
  // Revoke navigation immediately if a Return-to-Agent operation is in flight.
  await writeJson(runtimePath, { ...await readJson(runtimePath), ownership: "USER" });
  await waitForIdle();
  await updateState({ status: "LOGIN_REQUIRED", currentAction: "Human owns the assigned Steel browser" });
  res.json({ ownership: "USER" });
});
async function returnAgent(cancelled = () => false) {
  if (targetLookup || returningControl) throw new Error("Wait for the existing browser handoff");
  returningControl = true;
  const epoch = browserEpoch, revoked = () => cancelled() || epoch !== browserEpoch;
  let assigned;
  try {
    await waitForIdle();
    const runtime = assigned = await readJson(runtimePath);
    const name = eventName(runtime.expectedEventName);
    if (!runtime.apiEvent?.id || runtime.apiEvent.name !== name) throw new Error("Find the named event through the Cvent API first");
    transitionBrowser(runtimePath, runtime, ["USER", "AGENT"], { ownership: "RETURNING" }, revoked);
    let observed = await observe();
    const plan = eventLocationPlan(runtime, observed);
    const target = { name, evtstub: plan.id, apiEventId: plan.id, url: plan.destination };
    // API failures block browser navigation; they are never bypassed through UI.
    await cventApi.assertTarget(target);
    const latest = await readJson(runtimePath);
    if (latest.ownership !== "RETURNING" || latest.expectedEventName !== name || latest.apiEvent?.id !== plan.id || latest.steelSessionId !== runtime.steelSessionId || latest.activeTargetId !== runtime.activeTargetId) throw new Error("Browser or requested event changed during verification");
    if (observed.info.url !== plan.destination) {
      transitionBrowser(runtimePath, latest, ["RETURNING"], { ownership: "LOCATING", expectedEvtstub: plan.id }, revoked);
      await updateState({ status: "LOCATING", currentAction: "Ego is opening the selected event; authoring is blocked" });
      observed = await observe(eventLocationProgram(plan));
    }
    const actual = resolveNamedEvent(name, observed);
    if (actual.evtstub !== plan.id) throw new Error("API/browser event identities differ; stopped without switching events");
    const confirmed = await readJson(runtimePath);
    if (!["RETURNING", "LOCATING"].includes(confirmed.ownership) || confirmed.apiEvent?.id !== plan.id || confirmed.expectedEventName !== name || confirmed.steelSessionId !== runtime.steelSessionId || confirmed.activeTargetId !== runtime.activeTargetId) throw new Error("Browser or target changed during event location");
    transitionBrowser(runtimePath, confirmed, ["RETURNING", "LOCATING"], { ownership: "AGENT", expectedEvtstub: actual.evtstub, targetEventUrl: actual.url, resolvedEventName: name }, revoked);
    await verifyLogin({ ...target, url: actual.url });
    if (revoked()) throw new Error("Browser handoff cancelled");
    await updateState({ status: "READY", currentAction: "Selected event verified; live job handoff controls AI start" });
    return { ownership: "AGENT", authenticated: true, target: { ...target, url: actual.url } };
  } catch (error) {
    // A delayed handoff failure may only revoke its own browser, never another.
    try { transitionBrowser(runtimePath, assigned, ["USER", "AGENT", "RETURNING", "LOCATING"], { ownership: "USER" }); } catch {}
    await updateState({ status: "LOGIN_REQUIRED", currentAction: error.message });
    throw error;
  } finally { returningControl = false; }
}
async function securityIncidents(runtime) {
  const incidents = [];
  for (const id of readdirSync(resolve(root, "data/jobs"))) {
    const path = resolve(root, "data/jobs", id, "reports/final-report.json");
    if (existsSync(path) && (await readJson(path)).status === "PARTIAL_SECURITY_REVIEW_REQUIRED" && !runtime.securityAcknowledgedJobs?.includes(id)) incidents.push(id);
  }
  return incidents;
}
async function prepareTarget(name, { returnControl = false, sessionInvalidated = false, expectedBrowser, cancelled = () => false, beforeBrowser = async () => {} } = {}) {
  if (cancelled()) throw new Error("Browser handoff cancelled");
  let runtime = await readJson(runtimePath);
  if (expectedBrowser && (runtime.runtimeId !== expectedBrowser.runtimeId || runtime.steelSessionId !== expectedBrowser.steelSessionId || runtime.activeTargetId !== expectedBrowser.activeTargetId)) throw new Error("Assigned clean browser changed; no AI started");
  const incidents = await securityIncidents(runtime);
  if (incidents.length) {
    if (targetLookup || returningControl) throw new Error("Wait for the existing browser handoff");
    returningControl = true;
    try {
      runtime = await acknowledgeSessionIncident({ incidents, returnControl, sessionInvalidated,
        readRuntime: () => readJson(runtimePath), writeRuntime: value => writeJson(runtimePath, value), waitForIdle, observe });
    } finally { returningControl = false; }
  }
  if (runtime.expectedEventName !== name || runtime.apiEvent?.name !== name) await selectTarget(name);
  runtime = await readJson(runtimePath);
  await beforeBrowser({ name, evtstub: runtime.apiEvent.id, apiEventId: runtime.apiEvent.id, url: `https://app.cvent.com/Subscribers/Events2/Details/EventDetails/Index?evtstub=${runtime.apiEvent.id}` });
  if (runtime.ownership !== "AGENT" && !returnControl) throw new Error("Browser control is with you, not necessarily logged out. If already signed in, click I've signed in to return control and verify the named event. Sign in only if Cvent actually requests it; no session was reset.");
  await returnAgent(cancelled);
  if (cancelled()) throw new Error("Browser handoff cancelled");
  const target = await resolveTarget(name);
  runtime = await verifyLogin(target);
  return { target, runtime };
}
app.post("/api/return-agent", async (req, res) => {
  if (connection.isBusy()) return res.status(409).json({ error: "Use the waiting job's I've signed in action, or Stop active execution first" });
  const runtime = await readJson(runtimePath);
  const { target } = await prepareTarget(eventName(runtime.expectedEventName), { returnControl: true, sessionInvalidated: req.body?.sessionInvalidated === true });
  res.json({ ownership: "AGENT", authenticated: true, target });
});
app.get("/viewer", async (_req, res) => {
  const runtime = await readJson(runtimePath);
  if (await browserStopped(runtime)) return res.type("html").send('<!doctype html><html><body style="background:#111827;color:#e5e7eb;font:16px system-ui;padding:32px"><h2>Browser stopped</h2><p>This run ended. Its browser has been shut down to free memory. Saved evidence and profiles are preserved.</p><p>Start a fresh RR build when you are ready.</p></body></html>');
  if (!runtime.steelApiOrigin) return res.type('html').send('<!doctype html><html><body style="background:#111827;color:#e5e7eb;font:16px system-ui;padding:32px"><h2>Your private browser</h2><p>Upload an RR and Start Build to open a fresh browser. AI remains off until configuration and verified handoff.</p></body></html>');
  const origin = steelOrigin(runtime.steelApiOrigin);
  let html = await fetch(`${origin}/v1/sessions/debug?showControls=true&interactive=true`, { signal: AbortSignal.timeout(10000) }).then(r => r.text());
  html = html.replace("const baseWsUrl = 'ws://0.0.0.0:3000/v1/sessions/cast';", "const baseWsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/\\/viewer$/, '/steel-cast');");
  res.type("html").send(html);
});
app.use((error, _req, res, _next) => res.status(409).json({ error: error.message }));
const port = Number(process.env.PORT || 8787);
const server = app.listen(port, "127.0.0.1", () => console.log(`RR Pi RPC connection: http://127.0.0.1:${port}`));
server.on("error", error => { console.error(error.message); process.exit(1); });
server.on("upgrade", (req, socket, head) => {
  if (!isLocalRequest(req) || !req.url.startsWith("/steel-cast")) return socket.destroy();
  void readJson(runtimePath).then(async runtime => {
    if (await browserStopped(runtime) || !runtime.steelApiOrigin) return socket.destroy();
    req.url = req.url.replace(/^\/steel-cast/, "/v1/sessions/cast");
    viewerProxy.ws(req, socket, head, { target: steelOrigin(runtime.steelApiOrigin || "http://127.0.0.1:3400") });
  }).catch(() => socket.destroy());
});
viewerProxy.on("error", () => {});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  server.close();
  void connection.shutdown().finally(() => process.exit(0));
});
