import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, realpathSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import multer from "multer";
import { PiRpc } from "./pi-rpc.mjs";
import { RUN_POLICY, executionPrompt } from "./run-policy.mjs";
import { assertProcessGone, eventHistory } from "./event-history.mjs";
import { publicEvent, activitySummary, nativeModelFailure } from "./public-events.mjs";
import { revokeJobBrowser, sameBrowser } from "./browser-ownership.mjs";
import { BrowserFailureGuard, hasBrowserSaveUncertainty } from "./browser-failure-guard.mjs";
import { stopJobBrowser } from "./clean-browser.mjs";
import { budgetTotals } from "./budget.mjs";
import { executionSafety } from "./execution-clearance.mjs";
import { apiOperationBlocked, API_LOCK_PROTOCOL } from "./api-operation-lease.mjs";

const read = path => JSON.parse(readFileSync(path, "utf8"));
function save(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}
// Report metadata is a freshness fence, not independent Cvent verification.
// A same-session Return must not turn an earlier report into a new DONE result.
function reportRevision(workspace) {
  try {
    const stat = statSync(join(workspace, "reports/final-report.json"), { bigint: true });
    return [stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
  } catch { return null; }
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
    if (apiOperationBlocked(workspace) || ["api-write-uncertain.json", "browser-save-uncertain.json", "operation.lock"].some(file => existsSync(join(workspace, file)))) return "INCOMPLETE";
    const unresolvedPath = join(realpathSync(workspace), "unresolved-changes.json");
    if (existsSync(unresolvedPath)) {
      if (realpathSync(unresolvedPath) !== unresolvedPath || statSync(unresolvedPath).size > 1_000_000) return "INCOMPLETE";
      const unresolved = read(unresolvedPath);
      const groups = Array.isArray(unresolved) ? [unresolved] : [unresolved?.uncertainWrites, unresolved?.changes].filter(value => value !== undefined);
      if (!groups.length || groups.some(value => !Array.isArray(value) || value.length)) return "INCOMPLETE";
    }
    if (report?.uncertainWrites !== undefined && (!Array.isArray(report.uncertainWrites) || report.uncertainWrites.length)) return "INCOMPLETE";
    // Pi decides applicability; no website/registration category checklist for new runs.
    // Retain interpretation of historical reports without rewriting their evidence.
    if (report?.completion?.requirements !== undefined && ["website", "registration", "dependencies"].some(key => report.completion[key] !== undefined && report.completion[key] !== true)) return "INCOMPLETE";
    const verified = report?.completion?.requirements !== undefined
      ? report.completion.requirements === true
      : ["website", "registration", "dependencies"].every(key => report?.completion?.[key] === true);
    return typeof eventId === "string" && eventId.length > 0 && report?.eventId === eventId && report.status === "DONE"
      && verified && report.completion?.draft === true
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

export function mountRR(app, { root, verifyLogin, prepareTarget, provisionBrowser, verifyEventSafety = () => {}, stopBrowser = stopJobBrowser, rpcFactory = options => new PiRpc(options) }) {
  if (![verifyLogin, prepareTarget, provisionBrowser, verifyEventSafety].every(fn => typeof fn === "function")) throw new Error("Login-first browser provisioning and verification are required");
  const jobsRoot = join(root, "data/jobs");
  mkdirSync(jobsRoot, { recursive: true, mode: 0o700 });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });
  let active = null, busy = false, closing = false, resetting = false, controlEpoch = 0;
  const waitForIdle = async () => {
    if (!busy) return;
    await new Promise((resolve, reject) => {
      const poll = setInterval(() => { if (!busy) { clearInterval(poll); clearTimeout(deadline); resolve(); } }, 10);
      const deadline = setTimeout(() => { clearInterval(poll); reject(new Error('Workspace cancellation is still settling; no reset was committed. Wait for cleanup before retrying Clear.')); }, 30000);
    });
  };
  const pathFor = id => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid job ID");
    return join(jobsRoot, id);
  };
  const records = () => readdirSync(jobsRoot).map(id => join(jobsRoot, id, "job.json")).filter(existsSync).map(read);
  const ledger = job => save(join(job.workspace, "job.json"), job.record);
  const contextPath = join(root, "data/rr-context.json");
  const context = () => {
    const value = existsSync(contextPath) ? read(contextPath) : { id: null, workbookId: null, jobId: null };
    const valid = id => id === null || (typeof id === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id));
    if (!valid(value?.id) || !valid(value?.workbookId) || !valid(value?.jobId)) throw new Error("RR context requires reconciliation; no reset was confirmed");
    return { id: value.id, workbookId: value.workbookId, jobId: value.jobId };
  };
  const assertContext = id => {
    if ((id ?? null) !== context().id) throw new Error("RR context changed; refresh before starting or clearing a run");
  };
  const resetContext = (workbookId = null) => {
    const value = { id: randomUUID(), workbookId, jobId: null };
    save(contextPath, value);
    return value;
  };
  const assertSettled = () => {
    if (records().some(j => ["PREPARING", "STARTING", "RUNNING", "STOPPING"].includes(j.status))) throw new Error("Unsettled durable job exists; reconcile owned resources and spending first");
  };
  const assertResettable = prior => {
    // A context reset is not permission to execute or reconcile a saved write.
    // Settled resource proof allows a fresh UI/Pi context while the immutable
    // historical hold remains enforced at local/shared event handoff gates.
    const directories = [join(root, "data/current"), ...(prior ? [pathFor(prior.id)] : [])];
    for (const directory of directories) {
      const hold = apiOperationBlocked(directory) ? "API operation ownership" : existsSync(join(directory, "operation.lock")) ? "operation.lock" : null;
      if (hold) throw new Error(`New RR blocked${prior ? ` for run ${prior.id}` : ''}: ${hold} requires reconciliation; the RR selection and evidence were retained`);
    }
    if (prior && (prior.startedAt || !["UPLOADED", "CLEARED"].includes(prior.status))) {
      const proof = executionSafety(root, prior.id);
      if (!proof.resourcesCleared) throw new Error(`New RR blocked for run ${prior.id}: process, browser or spending cleanup requires reconciliation (${proof.resourceBlockers.join(', ')}); the RR selection was retained`);
      return; // Never clear markers, release a claim, resume Pi or alter old job bytes.
    }
    // Unexpected write evidence on an unstarted upload has no proven lifecycle.
    // Preserve the conservative refusal instead of guessing that it is settled.
    for (const directory of directories) {
      const hold = ["api-write-uncertain.json", "browser-save-uncertain.json"].find(name => existsSync(join(directory, name)));
      if (hold) throw new Error(`New RR blocked${prior ? ` for run ${prior.id}` : ''}: ${hold} requires reconciliation; the RR selection and evidence were retained`);
    }
    if (!prior) return;
    assertProcessGone(prior.ownedPid);
    if (prior.ownedPid) assertProcessGone(-prior.ownedPid);
    if (prior.sessionPrepared || prior.stopFailures?.length || prior.spendingUnreconciled || prior.unresolvedChanges?.length || prior.apiUnresolved || prior.browserFailureGuard?.executionUncertain) throw new Error(`New RR blocked for run ${prior.id}: process/spending or submitted changes require reconciliation; the RR selection was retained`);
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
    job.record.pauseId = null;
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
      job.record.stopFailures = failures;
      job.record.sessionPrepared = false;
      job.record.finishedAt = new Date().toISOString();
      job.record.phase = "SETTLED";
      // A marker can arrive during asynchronous settlement/remote cleanup too.
      if (hasBrowserSaveUncertainty(job.workspace)) {
        job.tools.add("browser-save-uncertain");
        if (!job.record.browserFailureGuard?.executionUncertain) job.record.browserFailureGuard = new BrowserFailureGuard().observe(null, Date.now(), { saveUncertain: true });
        if (job.finishedNormally) job.record.stopReason = job.record.browserFailureGuard.stopReason;
      }
      for (const id of job.pauseInterrupted || []) job.tools.add(id);
      job.record.unresolvedChanges = [...job.tools];
      if (existsSync(join(job.workspace, "api-write-uncertain.json"))) job.record.apiUnresolved = read(join(job.workspace, "api-write-uncertain.json"));
      job.record.status = job.finishedNormally && !failures.length && !job.record.spendingUnreconciled && !job.record.apiUnresolved && !job.tools.size
        ? (job.record.modelFailure || (Object.hasOwn(job.record, "reportBeforeReturn") && reportRevision(job.workspace) === job.record.reportBeforeReturn)
          ? "INCOMPLETE" : reportedCompletion(job.workspace, job.record.target?.apiEventId)) : "STOPPED";
      job.record.executionSummary = job.record.status === "DONE"
        ? "Done: the agent verified all applicable RR requirements saved and connected, with the event still Draft."
        : job.record.status === "INCOMPLETE"
          ? "Incomplete: full RR configuration and Draft verification were not confirmed. Execution results retain completed work and remaining blockers."
          : "Execution stopped. Submitted changes are not rolled back. A new upload starts from its own RR and live saved state; process cleanup and spending checks still apply.";
      if (job.record.modelFailure) job.record.executionSummary = `${job.record.modelFailure.message} ${job.record.executionSummary} No automatic build replay was started; reconcile any submitted changes before another run.`;
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
  function checkBrowserFailure(job, event = { type: "uncertainty_check" }) {
    if (active !== job || job.record.phase !== "EXECUTING" || job.stopping) return false;
    job.browserFailureGuard ||= new BrowserFailureGuard();
    const failure = job.browserFailureGuard.observe(event, Date.now(), { saveUncertain: hasBrowserSaveUncertainty(job.workspace) });
    if (!failure) return false;
    job.record.browserFailureGuard = failure;
    if (failure.executionUncertain) job.tools.add(event.toolCallId || "browser-save-uncertain");
    ledger(job);
    if (failure.tripped) { void stop(job, failure.stopReason); return true; }
    return false;
  }
  async function prepareSession(job) {
    const { record, workspace } = job;
    if (job.rpc) throw new Error("This run already has a Pi process; no replacement or replay");
    assertProcessGone(record.ownedPid);
    record.status = "PREPARING";
    ledger(job);
    save(join(workspace, "runtime.json"), { ownership: "USER" }); // No tool access until launch verification completes.
    try {
      if (closing || job.stopping) throw new Error("Session preparation cancelled before process launch");
      job.rpc = rpcFactory({ cwd: root, workspace, env: { ...process.env, EGO_BROWSER_BIN: join(root, "bin/ego-browser"), CVENT_API_BIN: join(root, "bin/cvent-api"), CVENT_API_GUIDE: join(root, "CVENT-API.md") } });
      record.ownedPid = job.rpc.child?.pid;
      ledger(job);
      job.rpc.on("fault", error => {
        if (job.stopping) return;
        job.fault = error.message;
        if (active === job) void stop(job, error.message);
      });
      job.rpc.on("event", event => {
        publish(job, event);
        // Native retries/compaction may recover an error. Only the last completed
        // assistant outcome at agent_settled is terminal; never retry from here.
        if (!job.stopping && record.status === "RUNNING" && record.phase === "EXECUTING" && event.type === "message_end" && event.message?.role === "assistant") {
          job.modelFailure = nativeModelFailure(event.message);
          // A human Return alone does not erase a failed request. Only a later
          // completed successful native response can recover it; history stays.
          if (!job.modelFailure && record.modelFailure) { record.modelFailure = null; ledger(job); }
        }
        if (event.type === "tool_execution_start") job.tools.add(event.toolCallId);
        if (event.type === "tool_execution_end") {
          job.tools.delete(event.toolCallId);
          if (event.isError) { record.toolErrors = [...(record.toolErrors || []), { toolCallId: event.toolCallId, toolName: event.toolName, at: new Date().toISOString() }]; ledger(job); }
        }
        if (["tool_execution_start", "tool_execution_end", "agent_settled"].includes(event.type)) checkBrowserFailure(job, event);
        if ((record.waitingFor === "operator" || (record.phase === "PAUSING" && record.pauseReason === "model_failure")) && ["agent_start", "tool_execution_start"].includes(event.type) && !job.stopping) void stop(job, "Unexpected native activity while paused; review before continuing");
        if (event.type === "agent_settled" && record.phase === "EXECUTING" && active === job && !job.stopping) void settle(job).catch(error => stop(job, error.message));
      });
      const session = await job.rpc.freshSession();
      if (!session.sessionId || !session.sessionFile || session.messageCount !== 0 || realpathSync(dirname(resolve(session.sessionFile))) !== realpathSync(join(workspace, "pi-sessions"))) throw new Error("New upload requires an empty session in its own workspace");
      if (records().filter(j => j.id !== record.id).some(j => j.sessionId === session.sessionId || j.sessionFile === session.sessionFile || j.sessionPreparations?.some(s => s.sessionId === session.sessionId))) throw new Error("New upload cannot reuse another job's session");
      if (!session.model?.cost || !Object.values(session.model.cost).some(value => Number.isFinite(value) && value > 0)) throw new Error("Working model has no usable cost rates");
      if (closing || job.fault || job.stopping) throw new Error("Session preparation interrupted");
      Object.assign(record, { sessionId: session.sessionId, sessionFile: session.sessionFile, model: session.model, sessionMode: "fresh-after-handoff", sessionPrepared: true });
      record.sessionPreparations = [...(record.sessionPreparations || []), { at: new Date().toISOString(), sessionId: session.sessionId }];
      record.contextIsolation = { verifiedAt: new Date().toISOString(), initialMessageCount: 0, initialCostUSD: 0, sessionId: session.sessionId };
      ledger(job);
      return job;
    } catch (error) {
      if (!job.stopping) record.status = "PREPARATION_FAILED";
      record.lastStartError = error.message;
      ledger(job);
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
    const request = req.body || {};
    if (Object.keys(request).some(key => !["jobId", "contextId", "prepareUpload", "replaceWorkspace"].includes(key)) ||
        ["prepareUpload", "replaceWorkspace"].some(key => request[key] !== undefined && typeof request[key] !== "boolean")) throw new Error("Invalid New RR request");
    if (closing || resetting || (busy && !request.replaceWorkspace)) throw new Error("Wait for the pending Start/Return to finish, or use Stop first");
    assertContext(request.contextId); // Stale tabs must never cancel a newer generation.
    const current = context();
    if (request.replaceWorkspace && active && active.record.id !== current.jobId) throw new Error("Workspace owner and saved context disagree; cleanup review required");
    if (!request.replaceWorkspace && active && active.record.id !== request.jobId) throw new Error("Another job owns this connection; select and Stop that job before clearing");
    const id = request.replaceWorkspace ? current.jobId : request.jobId || current.jobId;
    if (current.jobId && id !== current.jobId) throw new Error("Selected run changed; refresh before clearing this workspace");
    const selected = id ? read(join(pathFor(id), "job.json")) : null;
    resetting = true; controlEpoch++;
    try {
      let prior = selected;
      if (active) prior = await stop(active, "New RR requested by operator");
      await waitForIdle(); // Cancel/drain an older handoff/upload before committing a new generation.
      assertContext(request.contextId);
      if (closing) throw new Error("Connection shutting down; no reset was committed");
      assertSettled(); // Never hide an interrupted durable job after a restart.
      assertResettable(prior);
      if (prior?.status === "UPLOADED") {
        Object.assign(prior, { status: "CLEARED", phase: "SETTLED", finishedAt: new Date().toISOString() });
        save(join(prior.workspace, "job.json"), prior);
      }
      // File replacement commits only after a valid workbook preview is saved.
      const rrContext = request.prepareUpload ? context() : resetContext();
      res.json({ cleared: true, clearScope: request.prepareUpload ? 'PREPARED_UPLOAD' : 'CURRENT_RR_CONTEXT', executionHoldsCleared: false, sharedSlotReleased: false,
        rrContext, resetScope: 'WORKSPACE', stoppedJobId: prior?.id ?? null, aiStarted: false, historyPreserved: true, spendingPreserved: true });
    } finally { resetting = false; }
  }));
  app.post("/api/jobs", upload.single("rr"), route(async (req, res) => {
    if (closing || resetting || busy || active) throw new Error("Finish or Stop the active job before another upload");
    assertSettled();
    if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) throw new Error("Upload the original .xlsx RR");
    if (Object.keys(req.body || {}).some(key => !["eventName", "sourceWorkbookId", "contextId"].includes(key))) throw new Error("Upload accepts only the RR, target event and context identity; execution instructions are fixed by the runner");
    assertContext(req.body.contextId);
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
      const record = { id, workspace, workbook, instruction, contextId: context().id, apiOperationLocking: API_LOCK_PROTOCOL, requestedEventName, sourceWorkbook, originalName: basename(req.file.originalname), sha256: createHash("sha256").update(req.file.buffer).digest("hex"), status: "UPLOADED", createdAt: new Date().toISOString(), targetCostUSD: RUN_POLICY.targetCostUSD, piCostUSD: 0, unresolvedChanges: [], evidence: "receipts/", spendingUnreconciled: false };
      save(join(workspace, "job.json"), record);
      record.workflow = "login-first"; record.sessionMode = "fresh-after-handoff";
      save(join(workspace, "runtime.json"), { ownership: "USER" });
      save(join(workspace, "state.json"), { status: "UPLOADED", completed: [], pending: [], activity: [], currentStage: "AI not started", currentAction: "Start Build opens a clean browser. No Pi process or model prompt before Return to Agent." });
      save(join(workspace, "job.json"), record);
      save(contextPath, { ...context(), jobId: id, workbookId: sourceWorkbook ? req.body.sourceWorkbookId : context().workbookId });
      res.status(201).json(record);
    } finally { busy = false; }
  }));
  app.get("/api/jobs", route(async (_req, res) => res.json(records().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).map(({ id, contextId, originalName, requestedEventName, createdAt, status }) => ({ id, contextId: contextId ?? null, originalName, requestedEventName, createdAt, status })))));
  app.get("/api/jobs/:id", route(async (req, res) => res.json(read(join(pathFor(req.params.id), "job.json")))));
  app.post("/api/jobs/:id/continue", route(async () => { throw new Error("Old-session continuation is disabled. Upload the RR to start a fresh run; saved event evidence and spending are retained."); }));
  app.post("/api/jobs/:id/start", route(async () => { throw new Error("Use Start Build and the login-first handoff; legacy paid start is disabled"); }));
  // Production login-first path: no native process exists during human login.
  async function startBrowserOnly(req, res) {
    if (closing || resetting || busy || active) throw new Error("Finish or Stop the active job first");
    assertSettled();
    if (Object.keys(req.body || {}).length) throw new Error("Start uses the upload-bound target and fixed instructions");
    const record = read(join(pathFor(req.params.id), "job.json"));
    if (record.workflow !== "login-first" || record.status !== "UPLOADED" || record.piCostUSD !== 0 || record.sessionId) throw new Error("A fresh login-first upload is required");
    if (record.apiOperationLocking !== API_LOCK_PROTOCOL) throw new Error("This upload predates compatible API ownership checks; upload the RR again before starting");
    assertContext(record.contextId);
    if (context().id !== null && context().jobId !== record.id) throw new Error("This upload is no longer the current RR context; upload again to start fresh");
    originalUnchanged(record); eventName(record.requestedEventName);
    const prior = records().filter(r => r.id !== record.id);
    if (prior.some(r => r.spendingUnreconciled || !Number.isFinite(r.piCostUSD) || r.piCostUSD < 0)) throw new Error("Prior spending requires reconciliation");
    Object.assign(record, { executionInstructions: RUN_POLICY.executionInstructions,
      allowanceUSD: RUN_POLICY.allowanceUSD, externalCostReserveUSD: RUN_POLICY.externalCostReserveUSD,
      priorEventCostUSD: budgetTotals(jobsRoot, prior).spentUSD, executionPolicy: RUN_POLICY.executionPolicy,
      status: "RUNNING", phase: "BROWSER_STARTING", startedAt: new Date().toISOString() });
    record.totalEventCostUSD = record.priorEventCostUSD;
    record.spendingLimitEnabled = false;
    const job = { workspace: record.workspace, record, clients: new Set(), tools: new Set(), seq: 0 };
    active = job; busy = true;
    try {
      ledger(job);
      save(contextPath, { ...context(), jobId: record.id });
      writeFileSync(join(job.workspace, "runner-prompt.md"), record.executionInstructions, { mode: 0o400, flag: "wx" });
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
    const requestedName = eventName(Object.hasOwn(req.body, "eventName") ? req.body.eventName : record.requestedEventName);
    const cancelled = () => closing || job.stopping || active !== job || epoch !== controlEpoch;
    busy = true;
    try {
      originalUnchanged(record);
      if (requestedName !== record.requestedEventName) {
        if (job.rpc || record.sessionId || record.aiStartedAt || record.target) throw new Error("Target is locked after execution preparation; start a new run to change it");
        record.targetChanges = [...(record.targetChanges || []), { from: record.requestedEventName, to: requestedName, at: new Date().toISOString() }];
        record.requestedEventName = requestedName;
        ledger(job); // Explicit operator correction before any native session or event action.
      }
      let history;
      const { target, runtime } = await prepareTarget(eventName(record.requestedEventName), {
        returnControl: true, sessionInvalidated: req.body.sessionInvalidated === true, expectedBrowser: record.browser, cancelled,
        beforeBrowser: async apiTarget => {
          if (cancelled()) throw new Error("Handoff cancelled");
          if (apiTarget.name !== record.requestedEventName || apiTarget.apiEventId !== apiTarget.evtstub) throw new Error("Target identity mismatch");
          await verifyEventSafety({ req, record, target: apiTarget });
          if (cancelled()) throw new Error("Handoff cancelled");
          history = eventHistory(jobsRoot, record.id, apiTarget, RUN_POLICY);
        },
      });
      if (cancelled()) throw new Error("Handoff cancelled");
      if (!history || target.name !== record.requestedEventName || target.apiEventId !== target.evtstub || eventTarget(target.url).evtstub !== target.evtstub ||
          runtime.ownership !== "AGENT" || !runtime.identityVerified || runtime.apiPreflight?.eventId !== target.apiEventId ||
          runtime.steelSessionId !== record.browser.steelSessionId || runtime.activeTargetId !== record.browser.activeTargetId || runtime.runtimeId !== record.browser.runtimeId) throw new Error("Verified assigned browser/target required before AI launch");
      await verifyEventSafety({ req, record, target });
      if (cancelled()) throw new Error("Handoff cancelled before native preparation");
      // Launch only now. Keep the same job object so Stop/fault/settlement owns it.
      await prepareSession(job);
      if (cancelled()) throw new Error("Handoff cancelled before prompt");
      const verified = await verifyLogin(target);
      if (cancelled() || verified.ownership !== "AGENT" || !verified.identityVerified || verified.apiPreflight?.eventId !== target.apiEventId ||
          verified.runtimeId !== runtime.runtimeId || verified.steelSessionId !== runtime.steelSessionId || verified.activeTargetId !== runtime.activeTargetId) throw new Error("Browser changed while preparing AI; no prompt sent");
      await verifyEventSafety({ req, record, target });
      if (cancelled()) throw new Error("Handoff cancelled before prompt");
      Object.assign(record, { status: "RUNNING", phase: "EXECUTING", waitingFor: null, lastAssistantText: null, lastStartError: null, aiStartedAt: new Date().toISOString(), sessionMode: "fresh-after-handoff",
        target, authorizedEventName: target.name, apiPreflight: runtime.apiPreflight, allowanceUSD: history.allowanceUSD, externalCostReserveUSD: history.externalCostReserveUSD,
        priorEventCostUSD: history.priorEventCostUSD, totalEventCostUSD: history.priorEventCostUSD, priorEventJobs: history.evidence });
      save(join(job.workspace, "runtime.json"), { ...runtime, ...(record.executionCapabilities ? { executionCapabilities: record.executionCapabilities } : {}) });
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
  function originalUnchanged(record) {
    if (createHash("sha256").update(readFileSync(record.workbook)).digest("hex") !== record.sha256) throw new Error("Original workbook changed");
  }
  function monitor(job) {
    clearInterval(job.timer);
    job.timer = setInterval(() => {
      if (!checkBrowserFailure(job) && !job.stopping) void costs(job).catch(error => stop(job, error.message));
    }, 2000);
  }
  function waiting(job, kind, message) {
    if (job.stopping || active !== job) return;
    clearInterval(job.timer);
    Object.assign(job.record, { status: "RUNNING", phase: "AWAITING_INPUT", waitingFor: kind, lastAssistantText: message });
    job.settling = false;
    ledger(job);
    const statePath = join(job.workspace, "state.json");
    save(statePath, { ...(existsSync(statePath) ? read(statePath) : {}), status: "RUNNING", currentStage: kind === "operator" ? "Paused for human control" : "Waiting for you", currentAction: message });
    publish(job, { type: "rr_question", kind, message });
  }
  // Keep the dashboard's endpoint names; there is only one execution path.
  app.post("/api/jobs/:id/read", route(startBrowserOnly));
  app.post("/api/jobs/:id/answer", route(async (req, res) => {
    const job = requireActive(req);
    if (resetting || busy || job.stopping || job.rpc || job.record.phase !== "AWAITING_INPUT") throw new Error("No login handoff is waiting; stopped jobs cannot resume");
    if (Object.keys(req.body || {}).some(key => !["message", "returnControl", "sessionInvalidated", "eventName"].includes(key))) throw new Error("Unknown answer field");
    // message is a legacy UI label, never a prompt or execution instruction.
    return returnBeforeAI(job, req, res);
  }));
  // Human handoff is within this live job/session, never restoration of a stopped run.
  function pauseEvidence(job, ownership = "USER") {
    if (job.tools.size || job.record.spendingUnreconciled || job.record.apiUnresolved || job.record.unresolvedChanges?.length || job.record.browserFailureGuard?.executionUncertain) throw new Error("Paused work requires reconciliation before Return");
    for (const directory of [job.workspace, join(root, "data/current")]) {
      if (apiOperationBlocked(directory) || ["operation.lock", "api-write-uncertain.json", "browser-save-uncertain.json"].some(name => existsSync(join(directory, name)))) throw new Error("Operation or uncertainty evidence blocks Return; no holds were cleared");
      const runtime = read(join(directory, "runtime.json"));
      if (!sameBrowser(runtime, job.record.browser) || runtime.ownership !== ownership) throw new Error("Assigned browser identity or ownership changed during handoff");
    }
    for (const file of ["unresolved-changes.json", "reports/final-report.json"]) {
      const path = join(realpathSync(job.workspace), file);
      if (!existsSync(path)) continue;
      if (realpathSync(path) !== path || statSync(path).size > 1_000_000) throw new Error("Unresolved-change evidence requires review");
      const value = read(path);
      const groups = file === "unresolved-changes.json"
        ? Array.isArray(value) ? [value] : [value?.changes, value?.uncertainWrites].filter(v => v !== undefined)
        : [value?.uncertainWrites ?? []];
      if (!groups.length || groups.some(v => !Array.isArray(v) || v.length)) throw new Error("Unresolved changes block Return; evidence retained");
    }
  }
  async function sameIdleSession(job) {
    const { data } = await job.rpc.request({ type: "get_state" }, 5000);
    if (data?.sessionId !== job.record.sessionId || data?.sessionFile !== job.record.sessionFile || data?.isStreaming !== false || data?.isCompacting !== false || data?.pendingMessageCount !== 0) throw new Error("Same idle Pi session is not confirmed; no continuation permitted");
  }
  async function takeControl(request = {}) {
    if (!request || Object.keys(request).some(key => !["jobId", "contextId"].includes(key))) throw new Error("Invalid Take Control request");
    const { jobId, contextId } = request;
    assertContext(contextId);
    if (!active || active.record.id !== jobId) throw new Error("Selected live job required for Take Control");
    const job = active, record = job.record;
    if (closing || resetting || busy || job.stopping || job.settling) throw new Error("Handoff already active or ending; use Stop to end this run");
    if (record.phase === "AWAITING_INPUT" && record.waitingFor === "operator") {
      pauseEvidence(job);
      return { ownership: "USER", paused: true, browserRetained: true, pauseId: record.pauseId };
    }
    if (record.phase !== "EXECUTING" || !job.rpc) throw new Error("Take Control requires a live executing Pi session");
    // Take Control is a pause request, not permission to interrupt an opaque
    // tool and manufacture a permanent uncertainty hold. Keep the build running
    // until the operator retries at a tool boundary; explicit Stop still wins.
    if (job.tools.size) throw new Error("Pi is finishing an operation. Nothing was paused or stopped. Let it finish before taking control, or use Stop Build to end this run.");
    busy = true; controlEpoch++;
    const interrupted = job.pauseInterrupted = [...job.tools];
    record.phase = "PAUSING"; record.waitingFor = null; record.pauseReason = "operator";
    clearInterval(job.timer); ledger(job);
    try {
      if (revokeJobBrowser(root, record).length) throw new Error("Browser revocation requires review");
      await job.rpc.pause(record.sessionId);
      if (job.stopping || closing || active !== job) throw new Error("Pause cancelled by Stop");
      // Native cancellation cannot certify the outcome of an interrupted external tool.
      for (const id of interrupted) job.tools.add(id);
      pauseEvidence(job);
      await sameIdleSession(job);
      await costs(job);
      if (job.stopping || closing || active !== job) throw new Error("Pause cancelled by Stop");
      pauseEvidence(job);
      record.pauseId = randomUUID(); record.pausedAt = new Date().toISOString();
      waiting(job, "operator", "Pi is paused. The same browser and session are retained. Return explicitly after human work; Stop Build ends both.");
      return { ownership: "USER", paused: true, browserRetained: true, pauseId: record.pauseId };
    } catch (error) {
      for (const id of interrupted) job.tools.add(id);
      if (!job.stopping) await stop(job, error.message);
      throw error;
    } finally { busy = false; }
  }
  app.post("/api/jobs/:id/resume", route(async (req, res) => {
    const job = requireActive(req), record = job.record, body = req.body || {};
    if (resetting || busy || closing || job.stopping || !job.rpc || record.phase !== "AWAITING_INPUT" || record.waitingFor !== "operator") throw new Error("Only a confirmed live pause can Return; stopped jobs cannot resume");
    if (Object.keys(body).some(key => !["returnControl", "pauseId"].includes(key)) || body.returnControl !== true || !record.pauseId || body.pauseId !== record.pauseId) throw new Error("Explicit Return for the current pause required; refresh before continuing");
    busy = true;
    const epoch = controlEpoch, cancelled = () => closing || job.stopping || active !== job || controlEpoch !== epoch;
    let canWait = false, prompted = false;
    record.phase = "RETURNING"; record.waitingFor = null; ledger(job);
    try {
      originalUnchanged(record); pauseEvidence(job);
      await sameIdleSession(job); await costs(job);
      if (cancelled()) throw new Error("Return cancelled by Stop");
      pauseEvidence(job); canWait = true;
      const { target, runtime } = await prepareTarget(record.requestedEventName, {
        returnControl: true, expectedBrowser: record.browser, cancelled,
        beforeBrowser: async candidate => {
          if (cancelled() || candidate.apiEventId !== record.target.apiEventId || candidate.evtstub !== record.target.evtstub || candidate.name !== record.target.name) throw new Error("Paused event identity changed; no retargeting permitted");
          await verifyEventSafety({ req, record, target: candidate });
          if (cancelled()) throw new Error("Return cancelled by Stop");
        },
      });
      if (cancelled() || target.apiEventId !== record.target.apiEventId || target.name !== record.target.name || eventTarget(target.url).evtstub !== record.target.evtstub || !sameBrowser(runtime, record.browser)) throw new Error("Paused target/browser changed during Return");
      const verified = await verifyLogin(record.target);
      if (!sameBrowser(verified, record.browser) || verified.ownership !== "AGENT" || !verified.identityVerified || verified.apiPreflight?.eventId !== record.target.apiEventId) throw new Error("Same authenticated browser/event required before Return");
      await sameIdleSession(job);
      if (cancelled()) throw new Error("Return cancelled by Stop");
      await verifyEventSafety({ req, record, target });
      if (cancelled()) throw new Error("Return cancelled by Stop");
      // Job copy is granted only after the shared browser has been reverified.
      const latest = read(join(root, "data/current/runtime.json"));
      if (!sameBrowser(latest, record.browser) || latest.ownership !== "AGENT") throw new Error("Browser ownership changed before Return");
      save(join(job.workspace, "runtime.json"), { ...verified, ...(record.executionCapabilities ? { executionCapabilities: record.executionCapabilities } : {}) });
      pauseEvidence(job, "AGENT"); originalUnchanged(record);
      Object.assign(record, { phase: "EXECUTING", waitingFor: null, pauseId: null, resumedAt: new Date().toISOString(), lastAssistantText: null, reportBeforeReturn: reportRevision(job.workspace) });
      job.modelFailure = null; job.settling = false; ledger(job);
      save(join(job.workspace, "state.json"), { ...read(join(job.workspace, "state.json")), status: "RUNNING", currentStage: "Executing RR", currentAction: "Human returned control; Pi will re-observe the same event before continuing.", updatedAt: record.resumedAt });
      monitor(job); prompted = true;
      await job.rpc.request({ type: "prompt", message: "The operator explicitly returned control for this same RR task and verified event. Re-observe the assigned browser and saved state after human work, then choose how to continue using your existing skills and context. Do not replay interrupted actions or bypass unresolved holds. Any earlier final report predates this Return; verify current saved results and refresh the report before claiming completion." });
      res.json({ accepted: true, resumed: true, sessionId: record.sessionId });
    } catch (error) {
      if (!job.stopping) {
        let retain = canWait && !prompted && !cancelled();
        if (revokeJobBrowser(root, record).length) retain = false;
        if (retain) {
          try { pauseEvidence(job); await sameIdleSession(job); pauseEvidence(job); if (cancelled()) retain = false; }
          catch { retain = false; }
        }
        if (retain) waiting(job, "operator", error.message);
        else if (!job.stopping) await stop(job, error.message);
      }
      throw error;
    } finally { busy = false; }
  }));
  async function retainModelFailure(job) {
    const record = job.record;
    // agent_settled means native retry/compaction has finished. No runner retry,
    // cancellation, replacement process or model prompt is sent from this path.
    Object.assign(record, { phase: "PAUSING", waitingFor: null, pauseReason: "model_failure" }); ledger(job);
    if (revokeJobBrowser(root, record).length) throw new Error("Model-error browser revocation requires review");
    pauseEvidence(job);
    await sameIdleSession(job);
    if (job.stopping || closing || active !== job) return;
    pauseEvidence(job);
    record.pauseId = randomUUID(); record.pausedAt = new Date().toISOString();
    const message = `${record.modelFailure.message} Pi and the browser are retained for review. No automatic retry was started. Return explicitly to reverify this event and continue the same task, or Stop Build to end it.`;
    waiting(job, "operator", message);
  }
  async function settle(job) {
    if (job.stopping || job.record.status !== "RUNNING" || job.record.phase !== "EXECUTING" || job.settling || checkBrowserFailure(job)) return;
    job.settling = true; clearInterval(job.timer);
    if (job.modelFailure) {
      job.record.modelFailure = job.modelFailure;
      job.record.modelFailureHistory = [...(job.record.modelFailureHistory || []), { ...job.modelFailure, at: new Date().toISOString() }];
      ledger(job);
    }
    await costs(job);
    if (job.stopping || checkBrowserFailure(job)) return;
    if (job.modelFailure && job.modelFailure.category !== "MODEL_REQUEST_ABORTED") {
      await retainModelFailure(job);
      return;
    }
    // A failed message can contain partial text, or this RPC can return an older
    // success. Neither is a terminal report for the failed request.
    const result = job.record.modelFailure
      ? { text: job.record.modelFailure.message, modelFailure: job.record.modelFailure }
      : (await job.rpc.request({ type: "get_last_assistant_text" })).data;
    if (job.stopping || checkBrowserFailure(job)) return;
    job.record.lastAssistantText = typeof result.text === "string" ? result.text.slice(0, 20000) : "";
    job.finishedNormally = true;
    await stop(job, job.record.modelFailure?.message || "Native execution ended; new runs use fresh sessions");
    save(join(job.workspace, "result.json"), { ...result, status: job.record.status, sessionId: job.record.sessionId });
    publish(job, { type: "rr_result", status: job.record.status });
  }
  app.post("/api/jobs/:id/stop", route(async (req, res) => res.json(await stop(requireActive(req)))));
  app.post("/api/jobs/:id/rpc", route(async (req, res) => {
    const job = requireActive(req);
    if (!job.rpc) throw new Error("AI not started; no Pi RPC is available before verified Return to Agent");
    if (resetting || busy || job.stopping || job.settling || job.record.status !== "RUNNING" || job.record.phase !== "EXECUTING") throw new Error("Job is not accepting commands; paused work requires explicit verified Return");
    const allowed = new Set(["get_state", "get_session_stats", "get_last_assistant_text", "get_commands", "steer", "follow_up"]);
    const { type, message } = req.body;
    if (!allowed.has(type)) throw new Error("RPC command not allowed; reset/start/Stop are lifecycle operations");
    const command = { type };
    if (["steer", "follow_up"].includes(type)) {
      if (typeof message !== "string" || !message.trim() || message.length > 10_000 || message.trimStart().startsWith("/")) throw new Error("Expected bounded plain-text job instruction");
      command.message = `Within this RR task, the skills' operating boundaries and the selected event only:\n${message}`;
      await verifyEventSafety({ req, record: job.record, target: job.record.target });
      if (closing || resetting || busy || job.stopping || job.settling || active !== job || job.record.phase !== "EXECUTING") throw new Error("Execution changed during event safety verification; no instruction sent");
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
    context,
    uiContext: () => existsSync(contextPath) ? context() : null,
    withWorkbookUpload: async (create, contextId) => {
      if (closing || resetting || busy || active) throw new Error("Stop the active build before preparing another workbook");
      assertSettled(); assertContext(contextId);
      const priorId = context().jobId;
      const prior = () => priorId ? read(join(pathFor(priorId), 'job.json')) : null;
      assertResettable(prior());
      const epoch = controlEpoch;
      busy = true;
      try {
        const workbook = await create();
        if (closing || controlEpoch !== epoch) throw new Error("Workbook preparation was cancelled; prior RR context retained");
        assertResettable(prior());
        return { ...workbook, rrContext: resetContext(workbook.id) };
      } finally { busy = false; }
    },
    withWorkbookSave: async (prepare, contextId, workbookId) => {
      if (closing || resetting || busy || active) throw new Error("Workbook is locked while a build, upload or save is active");
      const assertSelected = () => {
        assertContext(contextId);
        const selected = context();
        if (!selected.id || selected.workbookId !== workbookId) throw new Error("Workbook is no longer selected in this RR context; reload or upload it before saving");
        if (selected.jobId && read(join(pathFor(selected.jobId), "job.json")).status === "UPLOADED") throw new Error("Workbook is already bound to a prepared build; use New RR before editing");
      };
      assertSettled(); assertSelected();
      const epoch = controlEpoch;
      busy = true;
      try {
        // Prepare a new immutable version first. Commit the manifest synchronously
        // after final context/cancellation checks: no reset/Start can interleave.
        const commit = await prepare();
        if (closing || controlEpoch !== epoch) throw new Error("Workbook save cancelled; prior selected version retained");
        assertSettled(); assertSelected();
        return commit();
      } finally { busy = false; }
    },
    admissionTarget: ({ jobId, operation, eventName: requestedName } = {}) => {
      // Read-only gateway preflight: no browser control, job mutation or paid RPC.
      if (closing || resetting || busy || !active || active.stopping || active.record.id !== jobId || !['answer', 'resume', 'rpc'].includes(operation)) throw new Error('Workspace handoff is unavailable');
      const record = active.record, selected = context();
      if (record.status !== 'RUNNING' || selected.jobId !== jobId || selected.id !== record.contextId) throw new Error('Workspace generation changed');
      const canRebind = operation === 'answer' && record.phase === 'AWAITING_INPUT' && record.waitingFor === 'setup' && !active.rpc && !record.sessionId && !record.aiStartedAt && !record.target;
      if (operation === 'answer' && !canRebind || operation === 'resume' && (record.phase !== 'AWAITING_INPUT' || record.waitingFor !== 'operator') || operation === 'rpc' && record.phase !== 'EXECUTING') throw new Error('Invalid handoff phase');
      originalUnchanged(record);
      const name = canRebind ? eventName(requestedName ?? record.requestedEventName) : eventName(record.target?.name);
      const eventId = canRebind ? null : record.target?.apiEventId;
      if (!canRebind && (requestedName !== undefined || !/^[0-9a-f-]{36}$/.test(eventId || '') || record.target.evtstub !== eventId)) throw new Error('Target is not bound');
      return { jobId, contextId: record.contextId, name, eventId, canRebind };
    },
    budget: () => ({ ...budgetTotals(jobsRoot, records()), spendingLimitEnabled: false, allowanceUSD: RUN_POLICY.allowanceUSD, externalCostReserveUSD: RUN_POLICY.externalCostReserveUSD }),
    isBusy: () => resetting || busy || !!active,
    takeControl,
    stop: () => { controlEpoch++; return active ? stop(active, "Control returned to operator") : Promise.resolve(); },
    shutdown: async () => { closing = true; if (active) await stop(active, "Connection shutting down"); },
  };
}
