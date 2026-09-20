import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, realpathSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import multer from "multer";
import { PiRpc } from "./pi-rpc.mjs";
import { RUN_POLICY, executionPrompt } from "./run-policy.mjs";
import { assertProcessGone, eventHistory } from "./event-history.mjs";
import { publicEvent, activitySummary } from "./public-events.mjs";
import { revokeJobBrowser } from "./browser-ownership.mjs";
import { BrowserFailureGuard } from "./browser-failure-guard.mjs";
import { stopJobBrowser } from "./clean-browser.mjs";

const read = path => JSON.parse(readFileSync(path, "utf8"));
function save(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}
// Native Pi verifies the RR and supplies its existing final report. This only
// interprets that execution result; it is not an audit or an independent agent.
export function reportedCompletion(workspace, eventId) {
  try {
    const path = join(realpathSync(workspace), "reports/final-report.json");
    if (realpathSync(path) !== path) return "INCOMPLETE";
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 1_000_000) return "INCOMPLETE";
    const report = read(path);
    if (["api-write-uncertain.json", "api-operation.lock", "operation.lock"].some(file => existsSync(join(workspace, file)))) return "INCOMPLETE";
    const unresolvedPath = join(realpathSync(workspace), "unresolved-changes.json");
    if (existsSync(unresolvedPath)) {
      if (realpathSync(unresolvedPath) !== unresolvedPath || statSync(unresolvedPath).size > 1_000_000) return "INCOMPLETE";
      const unresolved = read(unresolvedPath);
      const groups = Array.isArray(unresolved) ? [unresolved] : [unresolved?.uncertainWrites, unresolved?.changes].filter(value => value !== undefined);
      if (!groups.length || groups.some(value => !Array.isArray(value) || value.length)) return "INCOMPLETE";
    }
    if (report?.uncertainWrites !== undefined && (!Array.isArray(report.uncertainWrites) || report.uncertainWrites.length)) return "INCOMPLETE";
    return typeof eventId === "string" && eventId.length > 0 && report?.eventId === eventId && report.status === "DONE"
      && ["website", "registration", "dependencies", "draft"].every(key => report.completion?.[key] === true)
      && ["blockers", "untested"].every(key => Array.isArray(report[key]) && report[key].length === 0)
      ? "DONE" : "INCOMPLETE";
  } catch { return "INCOMPLETE"; }
}
// Local single-user connection, not an authentication or multi-tenant boundary.
export function isLocalRequest(req) {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket?.remoteAddress)) return false;
  const host = req.headers.host || "";
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  if (req.headers.origin && req.headers.origin !== `http://${host}`) return false;
  return req.headers["sec-fetch-site"] !== "cross-site";
}
export function eventTarget(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || !/(^|\.)cvent\.com$/i.test(url.hostname)) throw new Error("Expected HTTPS Cvent event URL");
  const queryIds = [...url.searchParams].filter(([key]) => key.toLowerCase() === "evtstub").map(([, value]) => value);
  const pathIds = url.pathname.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/ig) || [];
  if (queryIds.length > 1 || new Set([...queryIds, ...pathIds]).size > 1) throw new Error("Ambiguous event identity in URL");
  const stub = queryIds[0] || pathIds[0];
  if (!stub || !/^[a-zA-Z0-9_-]{1,200}$/.test(stub)) throw new Error("Open the selected event's Event Details page before Return to Agent; the current page has no valid event identity (the Events list is not an event)");
  return { url: url.href, evtstub: stub };
}
export function eventName(value) {
  if (typeof value !== "string") throw new Error("Cvent event name required");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 300 || /^https?:\/\//i.test(name)) throw new Error("Enter the Cvent event name, not its URL");
  return name;
}
export function resolveNamedEvent(expectedName, observed, previouslyVerified = null) {
  const name = eventName(expectedName);
  const target = eventTarget(observed.info?.url || "");
  if (!["app.cvent.com", "events.app.cvent.com"].includes(new URL(target.url).hostname)) throw new Error("Open the named event in the assigned Cvent browser");
  if (/\/login|\/signin|\/auth/i.test(new URL(target.url).pathname) || /sign in|log in|password|verification code/i.test(observed.snapshot || "") || !/event details|registration|event overview|site designer/i.test(observed.snapshot || "")) throw new Error("Authenticated event UI not confirmed; complete login first");
  const names = (observed.eventNames || []).filter(value => typeof value === "string" && value.trim()).map(eventName);
  if (new Set(names).size > 1) throw new Error("Displayed event name is ambiguous. Open the selected event's Event Details page to confirm it");
  const continuedIdentity = !names.length && previouslyVerified?.name === name && previouslyVerified?.evtstub === target.evtstub && /^\/subscribers\/events2\//i.test(new URL(target.url).pathname);
  if (!names.includes(name) && !continuedIdentity) throw new Error("Event name does not match the selected event. Open its Event Details page and verify the exact name before returning control");
  return { ...target, name };
}

export function mountRR(app, { root, resolveTarget, verifyLogin, prepareTarget, provisionBrowser, stopBrowser = stopJobBrowser, rpcFactory = options => new PiRpc(options) }) {
  const jobsRoot = join(root, "data/jobs");
  mkdirSync(jobsRoot, { recursive: true, mode: 0o700 });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });
  let active = null, prepared = null, busy = false, closing = false, controlEpoch = 0;
  const pathFor = id => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid job ID");
    return join(jobsRoot, id);
  };
  const records = () => readdirSync(jobsRoot).map(id => join(jobsRoot, id, "job.json")).filter(existsSync).map(read);
  const ledger = job => save(join(job.workspace, "job.json"), job.record);
  const assertSettled = () => {
    if (records().some(j => ["PREPARING", "STARTING", "RUNNING", "STOPPING"].includes(j.status))) throw new Error("Unsettled durable job exists; reconcile owned resources and spending first");
  };
  const publish = (job, event) => {
    const frame = { seq: ++job.seq, at: new Date().toISOString(), event };
    appendFileSync(join(job.workspace, "progress.jsonl"), JSON.stringify(frame) + "\n", { mode: 0o600 });
    const activity = publicEvent(event);
    if (!activity) return;
    const publicFrame = { seq: frame.seq, at: frame.at, event: activity };
    const message = activitySummary(activity);
    if (message) {
      const entry = { at: frame.at, message };
      job.record.activity = [...(job.record.activity || []), entry].slice(-100);
      if (job.record.status === "RUNNING" && job.record.phase === "EXECUTING" && !job.stopping) job.record.executionActivity = entry;
      ledger(job);
    }
    for (const client of job.clients) if (!client.write(`id: ${frame.seq}\ndata: ${JSON.stringify(publicFrame)}\n\n`)) { client.end(); job.clients.delete(client); }
  };
  async function costs(job) {
    const stats = (await job.rpc.request({ type: "get_session_stats" }, 5000)).data;
    if (!Number.isFinite(stats.cost) || stats.cost < 0) throw new Error("Pi cost unavailable; pause for spending reconciliation");
    job.record.piCostUSD = Math.max(job.record.piCostUSD, stats.cost);
    job.record.totalEventCostUSD = (job.record.priorEventCostUSD || 0) + job.record.piCostUSD;
    job.record.stats = stats;
    ledger(job);
    return stats;
  }
  async function stop(job, reason = "Operator Stop") {
    if (job.stopping) return job.stopping;
    job.record.status = "STOPPING";
    job.record.stopReason = reason;
    job.record.waitingFor = null;
    ledger(job);
    job.stopping = (async () => {
      clearInterval(job.timer);
      // Revoke both copies before cancellation; never let a failed write skip
      // native abort/process cleanup. Do not touch a different assigned browser.
      const failures = revokeJobBrowser(root, job.record);
      try {
        if (job.rpc) failures.push(...await job.rpc.stop(async () => { await costs(job).catch(() => { job.record.spendingUnreconciled = true; }); }));
      } catch {
        failures.push("Native Stop cleanup requires reconciliation");
        job.record.spendingUnreconciled = true;
      }
      // Await in-flight creation before cleanup, so a late Docker start cannot
      // escape Stop/shutdown. This promise excludes the route's Stop handler.
      await job.browserStarting?.catch(() => {});
      failures.push(...revokeJobBrowser(root, job.record));
      try { await stopBrowser({ root, record: job.record }); }
      catch { failures.push("Steel browser cleanup requires reconciliation"); }
      if (prepared === job) prepared = null;
      job.record.stopFailures = failures;
      job.record.sessionPrepared = false;
      job.record.finishedAt = new Date().toISOString();
      job.record.phase = "SETTLED";
      job.record.unresolvedChanges = [...job.tools];
      if (existsSync(join(job.workspace, "api-write-uncertain.json"))) job.record.apiUnresolved = read(join(job.workspace, "api-write-uncertain.json"));
      job.record.status = job.finishedNormally && !failures.length && !job.record.spendingUnreconciled && !job.record.apiUnresolved && !job.tools.size
        ? reportedCompletion(job.workspace, job.record.target?.apiEventId) : "STOPPED";
      job.record.executionSummary = job.record.status === "DONE"
        ? "Done: the agent verified all RR-required website, registration and dependencies saved and connected, with the event still Draft."
        : job.record.status === "INCOMPLETE"
          ? "Incomplete: full RR configuration and Draft verification were not confirmed. Execution results retain completed work and remaining blockers."
          : "Execution stopped. Submitted changes are not rolled back; unresolved execution or spending must be reconciled before another run.";
      ledger(job);
      const statePath = join(job.workspace, "state.json");
      try {
        const priorState = existsSync(statePath) ? read(statePath) : {};
        save(statePath, { ...priorState, status: job.record.status, currentStage: job.record.status, currentAction: job.record.executionSummary, updatedAt: job.record.finishedAt });
      } catch {
        failures.push("Progress state could not be saved");
        job.record.status = "STOPPED";
        job.record.executionSummary = "Execution stopped; progress state could not be saved. Reconcile the retained evidence before another run.";
        ledger(job); // Preserve malformed state, without skipping native cleanup.
      }
      publish(job, { type: "rr_stopped", failures });
      for (const client of job.clients) client.end();
      if (active === job) active = null;
      return job.record;
    })();
    return job.stopping;
  }
  async function releasePrepared() {
    if (!prepared) return;
    const job = prepared;
    if (job.releasing) return job.releasing;
    job.releasing = (async () => {
      const failures = await job.rpc.stop(async () => { await costs(job).catch(() => { job.record.spendingUnreconciled = true; }); });
      job.record.sessionPrepared = false;
      job.record.stopFailures = failures;
      if (!failures.length) job.record.ownedPid = null;
      ledger(job);
      if (failures.length || job.record.spendingUnreconciled || job.record.piCostUSD !== 0) throw new Error("Idle session cleanup requires reconciliation");
      if (prepared === job) prepared = null;
    })();
    return job.releasing;
  }
  async function prepareSession(record, existingJob = null) {
    if (prepared?.record.id === record.id && !prepared.fault && !prepared.releasing) return prepared;
    await releasePrepared(); // Only a never-prompted, zero-cost idle context is replaced.
    assertProcessGone(record.ownedPid);
    const workspace = record.workspace;
    const frames = existsSync(join(workspace, "progress.jsonl")) ? readFileSync(join(workspace, "progress.jsonl"), "utf8").trim().split("\n").filter(Boolean) : [];
    const job = existingJob || { workspace, record, clients: new Set(), tools: new Set(), seq: frames.length ? JSON.parse(frames.at(-1)).seq : 0 };
    record.status = "PREPARING";
    ledger(job);
    save(join(workspace, "runtime.json"), { ownership: "USER" }); // Upload cannot author Cvent.
    try {
      if (closing || job.stopping) throw new Error("Session preparation cancelled before process launch");
      job.rpc = rpcFactory({ cwd: root, workspace, env: { ...process.env, EGO_BROWSER_BIN: join(root, "bin/ego-browser"), CVENT_API_BIN: join(root, "bin/cvent-api"), CVENT_API_GUIDE: join(root, "CVENT-API.md") } });
      prepared = job;
      record.ownedPid = job.rpc.child?.pid;
      ledger(job);
      job.rpc.on("fault", error => {
        if (job.stopping || job.releasing) return;
        job.fault = error.message;
        if (active === job) void stop(job, error.message);
      });
      job.rpc.on("event", event => {
        publish(job, event);
        if (event.type === "tool_execution_start") job.tools.add(event.toolCallId);
        if (event.type === "tool_execution_end") {
          job.tools.delete(event.toolCallId);
          if (event.isError) { record.toolErrors = [...(record.toolErrors || []), { toolCallId: event.toolCallId, toolName: event.toolName, at: new Date().toISOString() }]; ledger(job); }
          if (active === job && record.phase === "EXECUTING" && !job.stopping) {
            job.browserFailureGuard ||= new BrowserFailureGuard();
            const failure = job.browserFailureGuard.observe(event);
            if (failure) {
              record.browserFailureGuard = failure;
              // Native process exit cannot prove that remote page execution ended.
              // Retain conservative uncertainty so the next upload cannot replay it.
              if (failure.executionUncertain) job.tools.add(event.toolCallId || "browser-execution-uncertain");
              ledger(job);
              if (failure.tripped) void stop(job, failure.stopReason);
            }
          }
        }
        if (event.type === "agent_settled" && active === job && !job.stopping) void settle(job).catch(error => stop(job, error.message));
      });
      const session = await job.rpc.freshSession();
      if (!session.sessionId || !session.sessionFile || session.messageCount !== 0 || realpathSync(dirname(resolve(session.sessionFile))) !== realpathSync(join(workspace, "pi-sessions"))) throw new Error("New upload requires an empty session in its own workspace");
      if (records().filter(j => j.id !== record.id).some(j => j.sessionId === session.sessionId || j.sessionFile === session.sessionFile || j.sessionPreparations?.some(s => s.sessionId === session.sessionId))) throw new Error("New upload cannot reuse another job's session");
      if (!session.model?.cost || !Object.values(session.model.cost).some(value => Number.isFinite(value) && value > 0)) throw new Error("Working model has no usable cost rates");
      if (closing || job.fault || job.releasing || job.stopping) throw new Error("Session preparation interrupted");
      Object.assign(record, { sessionId: session.sessionId, sessionFile: session.sessionFile, model: session.model, status: "UPLOADED", sessionMode: "fresh-on-upload", sessionPrepared: true });
      record.sessionPreparations = [...(record.sessionPreparations || []), { at: new Date().toISOString(), sessionId: session.sessionId }];
      record.contextIsolation = { verifiedAt: new Date().toISOString(), initialMessageCount: 0, initialCostUSD: 0, sessionId: session.sessionId };
      ledger(job);
      return job;
    } catch (error) {
      if (!job.stopping) record.status = "PREPARATION_FAILED";
      record.lastStartError = error.message;
      ledger(job);
      if (prepared === job && active !== job) await releasePrepared();
      throw error;
    }
  }
  const route = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) { if (!res.headersSent) res.status(409).json({ error: error.message }); }
  };
  const requireActive = req => {
    if (!active || active.record.id !== req.params.id) throw new Error("Job is not active in this connection; no automatic recovery or replay");
    return active;
  };
  // A fresh UI context is not a new paid session. Settle owned execution first,
  // retain all evidence/costs, then defer Pi creation until the next handoff.
  app.post("/api/new-rr", route(async (req, res) => {
    if (closing || busy) throw new Error("Wait for the pending Start/Return to finish, or use Stop first");
    if (Object.keys(req.body || {}).some(key => key !== "jobId")) throw new Error("New RR accepts only the selected job identity");
    const id = req.body?.jobId;
    const selected = id ? read(join(pathFor(id), "job.json")) : null;
    if ((active || prepared) && (active || prepared).record.id !== id) throw new Error("Another job owns this connection; select and Stop that job before clearing");
    busy = true; controlEpoch++;
    try {
      let prior = selected;
      if (active) prior = await stop(active, "New RR requested by operator");
      else if (prepared) { const idle = prepared; await releasePrepared(); prior = idle.record; }
      assertSettled(); // Never hide an interrupted durable job after a restart.
      if (prior) {
        assertProcessGone(prior.ownedPid);
        if (prior.stopFailures?.length || prior.spendingUnreconciled) throw new Error("New RR blocked: process/spending cleanup requires operator reconciliation");
        if (prior.status === "UPLOADED") {
          Object.assign(prior, { status: "CLEARED", phase: "SETTLED", finishedAt: new Date().toISOString() });
          save(join(prior.workspace, "job.json"), prior);
        }
      }
      res.json({ cleared: true, aiStarted: false, historyPreserved: true, spendingPreserved: true });
    } finally { busy = false; }
  }));
  app.post("/api/jobs", upload.single("rr"), route(async (req, res) => {
    if (closing || busy || active) throw new Error("Finish or Stop the active job before another upload");
    assertSettled();
    if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) throw new Error("Upload the original .xlsx RR");
    if (Object.keys(req.body || {}).some(key => !["eventName", "sourceWorkbookId"].includes(key))) throw new Error("Upload accepts only the RR and target event name; execution instructions are fixed by the runner");
    const requestedEventName = eventName(req.body?.eventName);
    let sourceWorkbook = null;
    if (req.body.sourceWorkbookId) {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(req.body.sourceWorkbookId)) throw new Error("Invalid source workbook identity");
      sourceWorkbook = read(join(root, "data/workbooks", req.body.sourceWorkbookId, "manifest.json"));
      if (sourceWorkbook.sha256 !== createHash("sha256").update(req.file.buffer).digest("hex")) throw new Error("Source workbook version changed; reload before starting");
    }
    busy = true;
    try {
      const id = randomUUID(), workspace = pathFor(id);
      mkdirSync(workspace, { mode: 0o700 });
      for (const directory of ["receipts", "reports", "pi-sessions"]) mkdirSync(join(workspace, directory), { mode: 0o700 });
      const workbook = join(workspace, "original.xlsx");
      writeFileSync(workbook, req.file.buffer, { mode: 0o400, flag: "wx" });
      const instruction = RUN_POLICY.instruction;
      const record = { id, workspace, workbook, instruction, requestedEventName, sourceWorkbook, originalName: basename(req.file.originalname), sha256: createHash("sha256").update(req.file.buffer).digest("hex"), status: "UPLOADED", createdAt: new Date().toISOString(), targetCostUSD: RUN_POLICY.targetCostUSD, piCostUSD: 0, unresolvedChanges: [], evidence: "receipts/", spendingUnreconciled: false };
      save(join(workspace, "job.json"), record);
      save(join(workspace, "state.json"), { status: "UPLOADED", completed: [], pending: [], activity: [], currentStage: "Fresh Pi session", currentAction: "Ready to read your RR; no model prompt has been sent" });
      if (provisionBrowser) {
        record.workflow = "login-first"; record.sessionMode = "fresh-after-handoff";
        save(join(workspace, "runtime.json"), { ownership: "USER" });
        save(join(workspace, "state.json"), { status: "UPLOADED", completed: [], pending: [], activity: [], currentStage: "AI not started", currentAction: "Start Build opens a clean browser. No Pi process or model prompt before Return to Agent." });
        save(join(workspace, "job.json"), record);
      } else await prepareSession(record);
      res.status(201).json(record);
    } finally { busy = false; }
  }));
  app.get("/api/jobs", route(async (_req, res) => res.json(records().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).map(({ id, originalName, requestedEventName, createdAt, status }) => ({ id, originalName, requestedEventName, createdAt, status })))));
  app.get("/api/jobs/:id", route(async (req, res) => res.json(read(join(pathFor(req.params.id), "job.json")))));
  app.post("/api/jobs/:id/continue", route(async () => { throw new Error("Old-session continuation is disabled. Upload the RR to start a fresh run; saved event evidence and spending are retained."); }));
  app.post("/api/jobs/:id/start", route(async (req, res) => {
    if (provisionBrowser) throw new Error("Use Start Build and the login-first handoff; legacy paid start is disabled");
    if (closing || busy || active) throw new Error("Connection closing or another job active; never reset it");
    assertSettled();
    busy = true;
    let job, record;
    const approvedEpoch = controlEpoch;
    try {
      const workspace = pathFor(req.params.id);
      record = read(join(workspace, "job.json"));
      if (record.status !== "UPLOADED") throw new Error("Job already attempted; upload the RR for a fresh run");
      if (!req.body || Object.keys(req.body).some(key => key !== "authorizedEventName")) throw new Error("Start accepts only the confirmed event name; scope and spending policy are managed by the runner");
      if (createHash("sha256").update(readFileSync(record.workbook)).digest("hex") !== record.sha256) throw new Error("Original workbook changed");
      if (record.spendingUnreconciled || record.piCostUSD !== 0 || record.stopFailures?.length) throw new Error("Unstarted session needs spending/process reconciliation");
      const name = eventName(req.body.authorizedEventName);
      if (record.requestedEventName && name !== record.requestedEventName) throw new Error("Target is bound to the upload; upload again to select a different event");
      const target = await resolveTarget(name);
      if (target.name !== name || eventTarget(target.url).evtstub !== target.evtstub) throw new Error("Resolved event identity differs from approval");
      const history = eventHistory(jobsRoot, record.id, target, RUN_POLICY);
      const runtime = await verifyLogin(target);
      if (!runtime.identityVerified || runtime.ownership !== "AGENT") throw new Error("Verified assigned browser and returned control required");
      if (!target.apiEventId || runtime.apiPreflight?.eventId !== target.apiEventId) throw new Error("Verified Cvent API access to the approved event is required before paid execution");
      // Legacy/unstarted uploads after restart get a new EMPTY context, never an old conversation.
      job = await prepareSession(record);
      record = job.record;
      const session = (await job.rpc.request({ type: "get_state" })).data;
      const stats = (await job.rpc.request({ type: "get_session_stats" })).data;
      if (job.fault || session.sessionId !== record.sessionId || session.sessionFile !== record.sessionFile || session.isStreaming !== false || session.isCompacting !== false || session.pendingMessageCount !== 0 || session.messageCount !== 0 || stats.cost !== 0) throw new Error("Upload session is no longer empty and idle; no prompt sent");
      if (closing || approvedEpoch !== controlEpoch) throw new Error("Execution cancelled during preflight");
      Object.assign(record, { approvedSow: RUN_POLICY.approvedSow, allowanceUSD: history.allowanceUSD, externalCostReserveUSD: history.externalCostReserveUSD, priorEventCostUSD: history.priorEventCostUSD, totalEventCostUSD: history.priorEventCostUSD, priorEventJobs: history.evidence, authorizedEventName: name, target, apiPreflight: runtime.apiPreflight, executionPolicy: RUN_POLICY.executionPolicy, status: "STARTING", startedAt: new Date().toISOString(), lastStartError: null });
      save(join(workspace, "runtime.json"), { ...runtime, expectedEvtstub: target.evtstub, targetEventUrl: target.url });
      save(join(workspace, "state.json"), { status: "RUNNING", completed: [], pending: [], activity: [], currentStage: "Read RR first", currentAction: "Pi will understand the uploaded workbook before choosing Cvent actions" });
      writeFileSync(join(workspace, "approved-sow.md"), record.approvedSow, { mode: 0o400, flag: "wx" });
      save(join(workspace, "receipts/prior-event-evidence.json"), history);
      active = job; prepared = null;
      ledger(job);
      const message = executionPrompt(record, workspace);
      if (job.stopping) throw new Error("Start cancelled by Stop");
      record.status = "RUNNING"; ledger(job);
      await job.rpc.request({ type: "prompt", message });
      if (!job.stopping && !job.settling && record.status === "RUNNING") job.timer = setInterval(() => { void costs(job).then(() => {
        if (record.totalEventCostUSD >= record.allowanceUSD - record.externalCostReserveUSD) return stop(job, "Cumulative spending threshold reached for the under-$60 goal");
      }).catch(error => stop(job, error.message)); }, 2000);
      res.json({ started: true, id: record.id, sessionId: record.sessionId });
    } catch (error) {
      if (job && active === job) await stop(job, error.message);
      if (record) {
        // Keep pre-launch errors visible across polling/reloads, without pretending a run started.
        const latest = read(join(record.workspace, "job.json"));
        latest.lastStartError = error.message;
        save(join(record.workspace, "job.json"), latest);
        if (prepared?.record.id === latest.id) prepared.record.lastStartError = error.message;
      }
      throw error;
    } finally { busy = false; }
  }));
  // Production login-first path: no native process exists during human login.
  async function startBrowserOnly(req, res) {
    if (closing || busy || active) throw new Error("Finish or Stop the active job first");
    assertSettled();
    if (Object.keys(req.body || {}).length) throw new Error("Start uses the upload-bound target and fixed instructions");
    const record = read(join(pathFor(req.params.id), "job.json"));
    if (record.workflow !== "login-first" || record.status !== "UPLOADED" || record.piCostUSD !== 0 || record.sessionId) throw new Error("A fresh login-first upload is required");
    originalUnchanged(record); eventName(record.requestedEventName);
    const prior = records().filter(r => r.id !== record.id);
    if (prior.some(r => r.spendingUnreconciled || !Number.isFinite(r.piCostUSD) || r.piCostUSD < 0)) throw new Error("Prior spending requires reconciliation");
    Object.assign(record, { approvedSow: RUN_POLICY.approvedSow, allowanceUSD: RUN_POLICY.allowanceUSD, externalCostReserveUSD: RUN_POLICY.externalCostReserveUSD,
      priorEventCostUSD: prior.reduce((n, r) => n + r.piCostUSD, 0), executionPolicy: RUN_POLICY.executionPolicy,
      status: "RUNNING", phase: "BROWSER_STARTING", startedAt: new Date().toISOString() });
    record.totalEventCostUSD = record.priorEventCostUSD;
    if (record.totalEventCostUSD >= record.allowanceUSD - record.externalCostReserveUSD) throw new Error("Cumulative spending threshold reached");
    const job = { workspace: record.workspace, record, clients: new Set(), tools: new Set(), seq: 0 };
    active = job; busy = true; ledger(job);
    writeFileSync(join(job.workspace, "approved-sow.md"), record.approvedSow, { mode: 0o400, flag: "wx" });
    try {
      job.browserStarting = Promise.resolve().then(() => provisionBrowser(record, () => closing || !!job.stopping || active !== job));
      const runtime = await job.browserStarting;
      if (job.stopping || closing || active !== job) throw new Error("Browser startup cancelled; no AI started");
      if (!runtime.freshProfile || runtime.jobId !== record.id || runtime.ownership !== "USER") throw new Error("Clean assigned browser was not confirmed");
      record.browser = { runtimeId: runtime.runtimeId, steelSessionId: runtime.steelSessionId, activeTargetId: runtime.activeTargetId };
      save(join(job.workspace, "runtime.json"), runtime);
      waiting(job, "setup", "Clean browser ready. Sign in manually, then click Return to Agent. AI not started; no model spending while waiting.");
      res.json({ started: true, id: record.id, aiStarted: false });
    } catch (error) { await stop(job, error.message); throw error; }
    finally { busy = false; }
  }
  async function returnBeforeAI(job, req, res) {
    if (req.body.returnControl !== true || job.record.waitingFor !== "setup") throw new Error("Explicit Return to Agent required before starting AI");
    const record = job.record, epoch = controlEpoch;
    const cancelled = () => closing || job.stopping || active !== job || epoch !== controlEpoch;
    busy = true;
    try {
      originalUnchanged(record);
      let history;
      const { target, runtime } = await prepareTarget(eventName(record.requestedEventName), {
        returnControl: true, sessionInvalidated: req.body.sessionInvalidated === true, expectedBrowser: record.browser, cancelled,
        beforeBrowser: apiTarget => {
          if (cancelled()) throw new Error("Handoff cancelled");
          if (apiTarget.name !== record.requestedEventName || apiTarget.apiEventId !== apiTarget.evtstub) throw new Error("Target identity mismatch");
          history = eventHistory(jobsRoot, record.id, apiTarget, RUN_POLICY);
        },
      });
      if (cancelled()) throw new Error("Handoff cancelled");
      if (!history || target.name !== record.requestedEventName || target.apiEventId !== target.evtstub || eventTarget(target.url).evtstub !== target.evtstub ||
          runtime.ownership !== "AGENT" || !runtime.identityVerified || runtime.apiPreflight?.eventId !== target.apiEventId ||
          runtime.steelSessionId !== record.browser.steelSessionId || runtime.activeTargetId !== record.browser.activeTargetId || runtime.runtimeId !== record.browser.runtimeId) throw new Error("Verified assigned browser/target required before AI launch");
      // Launch only now. Keep the same job object so Stop/fault/settlement owns it.
      await prepareSession(record, job);
      if (cancelled()) throw new Error("Handoff cancelled before prompt");
      const verified = await verifyLogin(target);
      if (cancelled() || verified.ownership !== "AGENT" || !verified.identityVerified || verified.apiPreflight?.eventId !== target.apiEventId ||
          verified.runtimeId !== runtime.runtimeId || verified.steelSessionId !== runtime.steelSessionId || verified.activeTargetId !== runtime.activeTargetId) throw new Error("Browser changed while preparing AI; no prompt sent");
      prepared = null;
      Object.assign(record, { status: "RUNNING", phase: "EXECUTING", waitingFor: null, lastAssistantText: null, lastStartError: null, aiStartedAt: new Date().toISOString(), sessionMode: "fresh-after-handoff",
        target, authorizedEventName: target.name, apiPreflight: runtime.apiPreflight, allowanceUSD: history.allowanceUSD, externalCostReserveUSD: history.externalCostReserveUSD,
        priorEventCostUSD: history.priorEventCostUSD, totalEventCostUSD: history.priorEventCostUSD, priorEventJobs: history.evidence });
      save(join(job.workspace, "runtime.json"), runtime);
      save(join(job.workspace, "receipts/prior-event-evidence.json"), history);
      ledger(job);
      save(join(job.workspace, "state.json"), { status: "RUNNING", currentStage: "Executing RR", currentAction: "Native Pi is starting; saved results require separate verification", completed: ["target-verified"], pending: [], activity: [] });
      monitor(job);
      await job.rpc.request({ type: "prompt", message: executionPrompt(record, job.workspace) });
      res.json({ accepted: true, aiStarted: true });
    } catch (error) {
      if (job.rpc || cancelled()) { if (!job.stopping) await stop(job, error.message); throw error; }
      if (revokeJobBrowser(root, record).length) { await stop(job, "Failed handoff requires ownership review"); throw error; }
      waiting(job, "setup", error.message); res.json({ accepted: true, aiStarted: false });
    } finally { busy = false; }
  }
  // One native session: local RR reading, any human clarification, then the
  // existing authoring path. No workbook parser, secondary agent or restoration.
  function boundedText(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 10_000 || value.trimStart().startsWith("/")) throw new Error("Enter a bounded plain-text instruction");
    return value.trim();
  }
  function originalUnchanged(record) {
    if (createHash("sha256").update(readFileSync(record.workbook)).digest("hex") !== record.sha256) throw new Error("Original workbook changed");
  }
  async function sameIdleSession(job) {
    const state = (await job.rpc.request({ type: "get_state" })).data;
    if (job.fault || job.stopping || state.sessionId !== job.record.sessionId || state.sessionFile !== job.record.sessionFile || state.isStreaming !== false || state.isCompacting !== false || state.pendingMessageCount !== 0) throw new Error("Original live idle session required; no conversation restoration");
    originalUnchanged(job.record);
    await costs(job);
    if (closing || job.stopping || active !== job) throw new Error("Execution stopped during preflight");
    if (job.record.totalEventCostUSD >= job.record.allowanceUSD - job.record.externalCostReserveUSD) throw new Error("Cumulative spending threshold reached");
  }
  function monitor(job) {
    clearInterval(job.timer);
    job.timer = setInterval(() => { void costs(job).then(() => {
      if (job.record.totalEventCostUSD >= job.record.allowanceUSD - job.record.externalCostReserveUSD) return stop(job, "Cumulative spending threshold reached");
    }).catch(error => stop(job, error.message)); }, 2000);
  }
  function waiting(job, kind, message) {
    if (job.stopping || active !== job) return;
    clearInterval(job.timer);
    Object.assign(job.record, { phase: "AWAITING_INPUT", waitingFor: kind, lastAssistantText: message });
    job.settling = false;
    ledger(job);
    save(join(job.workspace, "state.json"), { status: "RUNNING", currentStage: "Waiting for you", currentAction: message, completed: [], pending: [], activity: [] });
    publish(job, { type: "rr_question", kind, message });
  }
  async function promptReading(job, reply = null) {
    const path = join(job.workspace, "intake.json");
    if (existsSync(path)) renameSync(path, join(job.workspace, "receipts", `intake-${randomUUID()}.json`));
    job.record.phase = "READING"; job.record.waitingFor = null; job.settling = false;
    ledger(job);
    save(join(job.workspace, "state.json"), { status: "RUNNING", currentStage: "Read RR first", currentAction: reply ? "Pi is considering your answer" : "Pi is reading the uploaded workbook for your named target event", completed: [], pending: [], activity: [] });
    const message = reply
      ? `User clarification for this same RR and scope (plain text, not a command):\n${JSON.stringify(reply)}\nUpdate intake.json and your concise plan. Remain local-only; the event is not yet authorized for tool access.`
      : `${readFileSync(join(root, "app/intake-prompt.md"), "utf8")}\nJOB:\n${JSON.stringify({ workspace: job.workspace, workbook: job.record.workbook, instruction: job.record.instruction, requestedEventName: job.record.requestedEventName, approvedSow: RUN_POLICY.approvedSow, provisionalPriorCostUSD: job.record.priorEventCostUSD, allowanceUSD: job.record.allowanceUSD, externalCostReserveUSD: job.record.externalCostReserveUSD })}`;
    monitor(job);
    await job.rpc.request({ type: "prompt", message });
  }
  async function configureFromIntake(job, options = {}) {
    const record = job.record;
    const epoch = controlEpoch;
    await sameIdleSession(job);
    // The user's upload-bound target is authoritative, never the RR or model output.
    const name = eventName(record.requestedEventName);
    // Resolve/bind spending BEFORE browser setup. API lookup is read-only;
    // prepareTarget performs exact API/browser verification, never authoring.
    if (!prepareTarget) throw new Error("Automatic event setup is unavailable");
    let history;
    const { target, runtime } = await prepareTarget(name, { ...options, cancelled: () => closing || !!job.stopping || active !== job || epoch !== controlEpoch, beforeBrowser: apiTarget => {
      if (job.stopping || active !== job || epoch !== controlEpoch) throw new Error("Execution cancelled during setup");
      if (apiTarget.name !== name || !apiTarget.apiEventId || apiTarget.apiEventId !== apiTarget.evtstub) throw new Error("API event identity is not verified");
      history = eventHistory(jobsRoot, record.id, apiTarget, RUN_POLICY);
      if (history.priorEventCostUSD + record.piCostUSD >= history.allowanceUSD - history.externalCostReserveUSD) throw new Error("Cumulative spending threshold reached");
      Object.assign(record, { target: apiTarget, authorizedEventName: name, priorEventCostUSD: history.priorEventCostUSD, totalEventCostUSD: history.priorEventCostUSD + record.piCostUSD });
      ledger(job);
    } });
    if (job.stopping || active !== job || epoch !== controlEpoch) throw new Error("Execution cancelled during setup");
    if (target.name !== name || eventTarget(target.url).evtstub !== target.evtstub || target.apiEventId !== target.evtstub || !runtime.identityVerified || runtime.ownership !== "AGENT" || runtime.apiPreflight?.eventId !== target.apiEventId) throw new Error("API/browser event identity is not verified");
    if (!history || record.target?.apiEventId !== target.apiEventId) throw new Error("History must be reconciled before browser setup");
    Object.assign(record, { target, authorizedEventName: name, apiPreflight: runtime.apiPreflight, priorEventCostUSD: history.priorEventCostUSD, totalEventCostUSD: history.priorEventCostUSD + record.piCostUSD, priorEventJobs: history.evidence, allowanceUSD: history.allowanceUSD, externalCostReserveUSD: history.externalCostReserveUSD });
    ledger(job);
    await sameIdleSession(job);
    if (job.stopping || epoch !== controlEpoch) throw new Error("Execution cancelled during setup");
    save(join(job.workspace, "receipts/prior-event-evidence.json"), history);
    save(join(job.workspace, "runtime.json"), { ...runtime, expectedEvtstub: target.evtstub, targetEventUrl: target.url });
    record.phase = "EXECUTING"; record.waitingFor = null; record.lastAssistantText = null; job.settling = false;
    ledger(job);
    save(join(job.workspace, "state.json"), { status: "RUNNING", currentStage: "Configure and verify", currentAction: "API first; Ego for documented gaps", completed: ["workbook-analysis", "target-verified"], pending: [], activity: [] });
    monitor(job);
    await job.rpc.request({ type: "prompt", message: `${executionPrompt(record, job.workspace)}\nContinue from this same job's completed RR reading and clarifications; do not restart analysis unnecessarily.` });
  }
  app.post("/api/jobs/:id/read", route(async (req, res) => {
    if (provisionBrowser) return startBrowserOnly(req, res);
    if (closing || busy || active) throw new Error("Finish or Stop the active job first");
    assertSettled();
    if (Object.keys(req.body || {}).length) throw new Error("Read uses the instruction saved with this upload");
    busy = true;
    let job;
    try {
      const record = read(join(pathFor(req.params.id), "job.json"));
      if (record.status !== "UPLOADED" || record.piCostUSD !== 0 || record.spendingUnreconciled || record.stopFailures?.length) throw new Error("A fresh unexecuted upload is required");
      eventName(record.requestedEventName); // Old unbound uploads need a fresh explicitly targeted upload.
      originalUnchanged(record);
      // Until API identity verifies the named target, use the conservative total of all prior
      // jobs. Failed pre-target reading remains charged, not lost on re-upload.
      const prior = records().filter(r => r.id !== record.id);
      if (prior.some(r => r.spendingUnreconciled || !Number.isFinite(r.piCostUSD) || r.piCostUSD < 0)) throw new Error("Prior spending requires reconciliation");
      const priorCost = prior.reduce((n, r) => n + r.piCostUSD, 0);
      const allowance = Math.min(RUN_POLICY.allowanceUSD, ...prior.map(r => r.allowanceUSD ?? RUN_POLICY.allowanceUSD));
      const reserve = Math.max(RUN_POLICY.externalCostReserveUSD, ...prior.map(r => r.externalCostReserveUSD ?? 0));
      if (priorCost >= allowance - reserve) throw new Error("Cumulative spending threshold reached before reading");
      const epoch = controlEpoch;
      job = await prepareSession(record);
      const session = (await job.rpc.request({ type: "get_state" })).data;
      const stats = (await job.rpc.request({ type: "get_session_stats" })).data;
      if (job.fault || closing || epoch !== controlEpoch || session.sessionId !== record.sessionId || session.sessionFile !== record.sessionFile || session.isStreaming !== false || session.isCompacting !== false || session.pendingMessageCount !== 0 || session.messageCount !== 0 || stats.cost !== 0) throw new Error("Fresh empty idle session required; no prompt sent");
      Object.assign(job.record, { workflow: "rr-first", intakeOnly: true, instruction: record.instruction || RUN_POLICY.instruction, approvedSow: RUN_POLICY.approvedSow, allowanceUSD: allowance, externalCostReserveUSD: reserve, priorEventCostUSD: priorCost, totalEventCostUSD: priorCost, executionPolicy: RUN_POLICY.executionPolicy, status: "RUNNING", startedAt: new Date().toISOString(), lastStartError: null });
      writeFileSync(join(job.workspace, "approved-sow.md"), job.record.approvedSow, { mode: 0o400, flag: "wx" });
      active = job; prepared = null;
      ledger(job);
      await promptReading(job);
      res.json({ started: true, id: record.id, sessionId: record.sessionId });
    } catch (error) {
      if (active === job && job) await stop(job, error.message);
      throw error;
    } finally { busy = false; }
  }));
  app.post("/api/jobs/:id/answer", route(async (req, res) => {
    const job = requireActive(req);
    if (busy || job.stopping || job.record.phase !== "AWAITING_INPUT") throw new Error("No live clarification is waiting; stopped jobs cannot resume");
    if (Object.keys(req.body || {}).some(key => !["message", "returnControl", "sessionInvalidated"].includes(key))) throw new Error("Unknown answer field");
    const reply = boundedText(req.body?.message);
    if (job.record.workflow === "login-first" && !job.rpc) return returnBeforeAI(job, req, res);
    busy = true;
    try {
      await sameIdleSession(job);
      if (job.record.waitingFor === "clarification") {
        (job.record.clarifications ??= []).push(reply);
        await promptReading(job, reply);
      } else {
        job.record.phase = "SETUP"; ledger(job);
        try { await configureFromIntake(job, { returnControl: req.body.returnControl === true, sessionInvalidated: req.body.sessionInvalidated === true }); }
        catch (error) {
          if (job.record.phase === "EXECUTING") throw error; // Never replay an uncertain prompt.
          waiting(job, "setup", error.message);
        }
      }
      res.json({ accepted: true });
    } catch (error) { await stop(job, error.message); throw error; }
    finally { busy = false; }
  }));
  async function settleIntake(job) {
    if (job.settling) return;
    job.settling = true; clearInterval(job.timer);
    await sameIdleSession(job);
    const raw = readFileSync(join(job.workspace, "intake.json"), "utf8");
    if (raw.length > 20_000) throw new Error("RR intake summary is too large");
    const intake = JSON.parse(raw);
    if (!intake || typeof intake.summary !== "string" || !intake.summary.trim() || !Array.isArray(intake.questions) || intake.questions.length > 20 || !intake.questions.every(q => typeof q === "string" && q.trim() && q.length <= 2000) || !(intake.eventName === null || typeof intake.eventName === "string")) throw new Error("Pi intake is incomplete; no Cvent execution permitted");
    job.record.intake = intake;
    job.record.lastAssistantText = intake.summary;
    ledger(job);
    if (intake.questions.length) return waiting(job, "clarification", [intake.summary, ...intake.questions].join("\n\n"));
    job.record.phase = "SETUP"; ledger(job);
    try { await configureFromIntake(job); }
    catch (error) {
      if (job.record.phase === "EXECUTING") throw error;
      waiting(job, "setup", error.message);
    }
  }
  async function settle(job) {
    if (job.record.workflow === "rr-first" && job.record.phase === "READING") return settleIntake(job);
    if (job.settling) return;
    job.settling = true; clearInterval(job.timer);
    await costs(job);
    if (job.stopping) return;
    const result = (await job.rpc.request({ type: "get_last_assistant_text" })).data;
    if (job.stopping) return;
    job.record.lastAssistantText = typeof result.text === "string" ? result.text.slice(0, 20000) : "";
    job.finishedNormally = true;
    await stop(job, "Native execution ended; new runs use fresh sessions");
    save(join(job.workspace, "result.json"), { ...result, status: job.record.status, sessionId: job.record.sessionId });
    publish(job, { type: "rr_result", status: job.record.status });
  }
  app.post("/api/jobs/:id/stop", route(async (req, res) => res.json(await stop(requireActive(req)))));
  app.post("/api/jobs/:id/rpc", route(async (req, res) => {
    const job = requireActive(req);
    if (!job.rpc) throw new Error("AI not started; no Pi RPC is available before verified Return to Agent");
    if (job.stopping || job.settling || job.record.status !== "RUNNING") throw new Error("Job is not accepting commands");
    const allowed = new Set(["get_state", "get_session_stats", "get_last_assistant_text", "get_commands", "steer", "follow_up"]);
    const { type, message } = req.body;
    if (!allowed.has(type)) throw new Error("RPC command not allowed; reset/start/Stop are lifecycle operations");
    const command = { type };
    if (["steer", "follow_up"].includes(type)) {
      if (typeof message !== "string" || !message.trim() || message.length > 10_000 || message.trimStart().startsWith("/")) throw new Error("Expected bounded plain-text job instruction");
      command.message = `Within the existing approved SOW, event and cumulative budget only:\n${message}`;
    }
    res.json(await job.rpc.request(command));
  }));
  app.get("/api/jobs/:id/events", route(async (req, res) => {
    const job = requireActive(req);
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    res.flushHeaders(); res.write(`data: ${JSON.stringify({ type: "connected", nextSeq: job.seq + 1 })}\n\n`);
    job.clients.add(res);
    const timer = setInterval(() => res.write(": keepalive\n\n"), 15000);
    req.on("close", () => { clearInterval(timer); job.clients.delete(res); });
  }));
  app.get("/api/jobs/:id/results/:file", route(async (req, res) => {
    // progress.jsonl contains private native tool output and reasoning, including
    // historical incidents. Preserve it locally; never offer it as a download.
    const allowed = new Set(["job.json", "result.json", "state.json", "final-report.json", "final-report.md"]);
    if (!allowed.has(req.params.file)) throw new Error("Unknown result artifact");
    const workspace = pathFor(req.params.id);
    const file = req.params.file.startsWith("final-report") ? join(workspace, "reports", req.params.file) : join(workspace, req.params.file);
    if (!existsSync(file)) return res.status(404).json({ error: "Result not available" });
    res.set("Cache-Control", "no-store").sendFile(file);
  }));
  return {
    isBusy: () => busy || !!active,
    stop: () => { controlEpoch++; return active ? stop(active, "Control returned to operator") : Promise.resolve(); },
    shutdown: async () => { closing = true; if (active) await stop(active, "Connection shutting down"); await releasePrepared(); },
  };
}
