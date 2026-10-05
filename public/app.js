import { workspaceBase, workspacePath, scopedStorage } from './workspace-routing.js';
import { requirementProgress } from './requirement-progress.js';
import { executionReadiness } from './execution-readiness.js';
import { runOutcome } from './run-outcome.js';
const basePath = workspaceBase(location.pathname);
const appPath = path => workspacePath(basePath, path);
const sessionStorage = scopedStorage(window.sessionStorage, basePath);
const $ = id => document.getElementById(id);
let jobId = sessionStorage.getItem("rrJobId");
let job = null, submitting = false, handoffPending = false, stopping = false;
let workspaceLabel = "USER 1", localWorkspaces = null, executionEnabled = true;
let browserOwnership = null, takingControl = false, viewerRuntimeId = null, viewerStopped = false, loginFirstAvailable = false;
let workbook = null, draftLoading = false, edits = new Map(), previewEpoch = 0, jobs = [];
let historyReady = false, setupTargetEditable = false, operatorPauseSupported = false, workbookSaveContextRequired = false;
let resetContextAvailable = false, workspaceResetSupported = false, authoritativeContext = false, rrContextId = sessionStorage.getItem('rrContextId');
let readinessRequest = 0, readinessPending = false, readinessReadAt = 0;
const active = () => job && ["PREPARING", "STARTING", "RUNNING", "STOPPING"].includes(job.status);
const canResumePaused = () => operatorPauseSupported && job?.status === 'RUNNING' && job.phase === 'AWAITING_INPUT' && job.waitingFor === 'operator' && typeof job.pauseId === 'string' && !!job.pauseId;
const canEditSetupTarget = () => setupTargetEditable && job?.status === 'RUNNING' && job.phase === 'AWAITING_INPUT' && job.waitingFor === 'setup' && !job.aiStartedAt && browserOwnership === 'USER';
// Present historical terminal labels without rewriting immutable job records.
const statusLabel = status => ({ REVIEW_REQUIRED: "INCOMPLETE", FINISHED: "INCOMPLETE", STOPPED_REQUIRES_REVIEW: "STOPPED" }[status] || status);
const money = value => Number.isFinite(value) ? `$${value.toFixed(2)}` : "—";
const list = value => Array.isArray(value) ? value : value ? [value] : [];
const node = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
function renderList(id, values) {
  $(id).replaceChildren(...(list(values).length ? list(values).map(value => node("li", typeof value === "string" ? value : value.message || JSON.stringify(value))) : [node("li", "None")]));
}
function message(text, error = false) { $("message").textContent = text; $("message").className = error ? "activity-error" : ""; }
async function api(path, body, options = {}) {
  const response = await fetch(appPath(path), { ...options, ...(body === undefined ? {} : { method: "POST", ...(body instanceof FormData ? { body } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function renderReadiness(value) {
  const view = executionReadiness(value);
  $('capacityStatus').textContent = view.capacity;
  $('eventSafetyStatus').textContent = view.eventSafety;
  $('safetyOwners').replaceChildren(...view.owners.map(owner => node('li', owner)));
  $('safetyDetail').textContent = view.detail;
  $('executionReadiness').setAttribute('data-warning', String(view.warning));
}
function invalidateReadiness() {
  readinessRequest++; readinessPending = false; readinessReadAt = 0;
  renderReadiness(null);
}
async function refreshReadiness(force = false) {
  if (submitting || stopping || takingControl || handoffPending) return;
  if (!force && (readinessPending || Date.now() - readinessReadAt < 10000)) return;
  const request = ++readinessRequest, epoch = previewEpoch;
  readinessPending = true; renderReadiness(null);
  try {
    const value = await api('/api/execution-status', undefined, { cache: 'no-store', signal: AbortSignal.timeout(7000) });
    if (request === readinessRequest && epoch === previewEpoch) renderReadiness(value);
  } catch { if (request === readinessRequest && epoch === previewEpoch) renderReadiness(null); }
  finally { if (request === readinessRequest) { readinessPending = false; readinessReadAt = Date.now(); } }
}
function editorControls() {
  const locked = submitting || stopping || draftLoading || !!active();
  $("sheetSelect").disabled = locked || !workbook || !!edits.size;
  $("previousRows").disabled = locked || !workbook || !workbook.offset || !!edits.size;
  $("nextRows").disabled = locked || !workbook || workbook.offset + workbook.rows.length >= workbook.sheets[workbook.sheet].rows || !!edits.size;
  $("revertWorkbook").disabled = locked || !edits.size;
  $("saveWorkbook").disabled = locked || !edits.size || (workbookSaveContextRequired && !rrContextId);
  $("editStatus").textContent = workbookSaveContextRequired && workbook && !rrContextId ? "Current RR context is unconfirmed; re-upload this workbook before saving. Your unsaved edits remain visible." : edits.size ? `${edits.size} unsaved cell changes · save or revert before starting` : "No unsaved changes · text edits only; formulas preserved, not recalculated.";
}
function renderControls() {
  if (submitting || stopping || takingControl || handoffPending) invalidateReadiness();
  const setup = job?.status === "RUNNING" && job?.phase === "AWAITING_INPUT" && job?.waitingFor === "setup";
  const userControl = browserOwnership === "USER", paused = canResumePaused();
  $("take").disabled = submitting || stopping || takingControl || !browserOwnership || (userControl && !setup && !paused) || (operatorPauseSupported && !userControl && job?.phase !== 'EXECUTING');
  $("take").textContent = handoffPending ? "RETURNING TO AGENT…" : takingControl ? "TAKING CONTROL…" : userControl ? "RETURN TO AGENT" : "TAKE CONTROL";
  $("take").title = userControl
    ? paused ? "Reverify this event and continue the same paused Pi session." : setup ? "Return control after verifying login and this run's named event." : "Start a new build before returning control; stopped runs cannot be resumed."
    : operatorPauseSupported ? "Pause Pi and retain this browser after safety checks. Stop Build ends both." : "This backend ends the build and closes its browser; pause is not available.";
  const locked = !historyReady || submitting || stopping || draftLoading || !!active();
  $("upload").disabled = locked || !!edits.size || !loginFirstAvailable;
  $("rr").disabled = !historyReady || submitting || stopping || draftLoading || takingControl;
  $("newRR").disabled = !historyReady || submitting || stopping || draftLoading || takingControl;
  $("eventName").disabled = locked && !(canEditSetupTarget() && historyReady && !submitting && !stopping && !draftLoading && !takingControl);
  // Stop must remain available while Start/Return is awaiting the server.
  $("stop").disabled = stopping || !active();
  const waiting = job?.status === "RUNNING" && job?.phase === "AWAITING_INPUT";
  $("questionPanel").hidden = !waiting;
  $("sendAnswer").hidden = job?.waitingFor === "setup" || paused;
  $("answer").hidden = job?.waitingFor === "setup" || paused;
  $("loginDone").hidden = job?.waitingFor !== "setup" && !paused;
  $("loginDone").textContent = paused ? "RETURN TO SAME BUILD" : "I'VE SIGNED IN · RETURN TO AGENT";
  $("securityConfirmation").hidden = !waiting || !/security review/i.test(job?.lastAssistantText || "");
  $("sendAnswer").disabled = submitting;
  $("loginDone").disabled = submitting;
  $("start").hidden = job?.status !== "UPLOADED";
  $("start").disabled = locked || !!$("rr").files?.length || !!workbook;
  if (!executionEnabled) {
    $("take").disabled = true; $("take").textContent = 'AI NOT ENABLED';
    $("loginDone").disabled = true; $("sendAnswer").disabled = true;
  }
  editorControls();
}
function renderWorkbook() {
  if (!workbook) {
    $("sheetSelect").replaceChildren(); $("sheetTable").replaceChildren();
    $("workbookName").textContent = "No RR selected"; $("rrSelection").textContent = "No RR selected · choose an .xlsx"; $("sheetRange").textContent = "";
    editorControls(); return;
  }
  $("sheetSelect").replaceChildren(...workbook.sheets.map((sheet, index) => Object.assign(node("option", `${sheet.name} (${sheet.rows} × ${sheet.columns})`), { value: String(index) })));
  $("sheetSelect").value = String(workbook.sheet);
  $("workbookName").textContent = `${workbook.originalName} · ${workbook.revision ? `DRAFT v${workbook.revision}` : "ORIGINAL PRESERVED"}`;
  $("rrSelection").textContent = `Saved: ${workbook.originalName} · ${workbook.revision ? `draft v${workbook.revision}` : "original preserved"}`;
  $("sheetRange").textContent = `${workbook.sheets[workbook.sheet].name} · rows ${workbook.offset + 1}–${workbook.offset + workbook.rows.length} of ${workbook.sheets[workbook.sheet].rows} · ${workbook.sheets[workbook.sheet].columns} columns${workbook.sheets[workbook.sheet].columns > 64 ? " (showing first 64)" : ""}`;
  const head = document.createElement("thead"), header = document.createElement("tr");
  header.append(node("th", "#"), ...workbook.columns.map(column => node("th", column))); head.append(header);
  const body = document.createElement("tbody");
  workbook.rows.forEach((cells, index) => {
    const row = document.createElement("tr"), number = workbook.offset + index + 1;
    row.append(node("td", String(number)));
    cells.forEach((cell, column) => {
      const ref = `${workbook.columns[column]}${number}`, td = node("td", cell.value);
      td.contentEditable = String(!cell.formula && !active()); td.spellcheck = false;
      td.setAttribute("aria-label", ref); if (cell.formula) td.className = "formula";
      td.oninput = () => {
        if (active() || submitting || draftLoading) { td.textContent = edits.get(ref) ?? cell.value; return; }
        const value = td.textContent;
        if (value === cell.value) edits.delete(ref); else edits.set(ref, value);
        td.classList.toggle("dirty", edits.has(ref)); renderControls();
      };
      row.append(td);
    });
    body.append(row);
  });
  $("sheetTable").replaceChildren(head, body); editorControls();
}
function renderCurrentRun(displayStatus) {
  // History remains private recovery/accounting evidence, not another execution context.
  const label = job ? `${job.originalName || 'Current RR'} · ${displayStatus || statusLabel(job.status)}` : workbook?.originalName || 'No current run';
  $("jobSelect").replaceChildren(Object.assign(node("option", label), { value: jobId || "" }));
  $("jobSelect").value = jobId || "";
  $("jobSelect").disabled = true;
}
function clearRunView() {
  invalidateReadiness();
  // Clear immediately after a confirmed replacement, even if the next poll fails.
  const blank = {
    plan: 'No RR run started.', status: 'Not running', stage: 'UPLOAD',
    action: 'Review the new RR and selected event, then Start Build.',
    agentReply: '', question: '', elapsed: '00:00:00',
    elapsedLabel: 'AI execution · starts after verified Return',
    cost: 'No current run · prior spending retained',
    completionTitle: 'No completed work reported', completionCount: '0 reported checkpoints',
    completionMark: '•', outcomeSummary: '', pendingTitle: 'Remaining / blocked',
    browserStatus: 'BROWSER STOPPED', owner: 'USER CONTROL',
  };
  for (const [id, text] of Object.entries(blank)) $(id).textContent = text;
  for (const id of ['completed', 'pending', 'excluded', 'activity']) renderList(id, []);
  for (const id of ['results', 'questionPanel', 'progressLists', 'excludedProgress', 'securityConfirmation', 'outcomeSummary']) $(id).hidden = true;
  $("results").href = "";
  [!!workbook, false, false, false].forEach((done, i) => $(`step${i + 1}`).classList.toggle('done', done));
  browserOwnership = null; viewerRuntimeId = null; viewerStopped = true;
  $("browserFrame").classList.remove('user-control');
  $("browserFrame").querySelector('iframe').src = appPath('/viewer');
  renderCurrentRun();
}
function rememberContext(context) {
  const valid = id => id === null || (typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id));
  if (!context || !valid(context.id) || !valid(context.jobId) || !valid(context.workbookId)) throw new Error('Invalid workspace reset state; refresh before continuing');
  rrContextId = context.id;
  if (rrContextId) sessionStorage.setItem('rrContextId', rrContextId); else sessionStorage.removeItem('rrContextId');
}
function adoptReset(context) {
  rememberContext(context); ++previewEpoch;
  jobId = context.jobId; job = null; workbook = null; jobs = []; edits.clear(); draftLoading = false;
  for (const key of ['rrJobId', 'rrWorkbookId', 'rrTargetName']) sessionStorage.removeItem(key);
  if (jobId) sessionStorage.setItem('rrJobId', jobId);
  if (context.workbookId) sessionStorage.setItem('rrWorkbookId', context.workbookId);
  $("rr").value = ""; $("eventName").value = ""; $("answer").value = ""; $("sessionInvalidated").checked = false;
  renderWorkbook(); clearRunView();
  message('Current RR context reset confirmed. Historical event holds, evidence and spending are retained; check Execution readiness before Return.');
}
async function loadSheet(sheet = 0, offset = 0) {
  if (!workbook || edits.size || draftLoading) return;
  const epoch = previewEpoch, id = workbook.id;
  draftLoading = true; renderControls();
  try {
    const next = await api(`/api/workbooks/${id}?sheet=${sheet}&offset=${offset}`);
    if (epoch !== previewEpoch) return;
    workbook = next; renderWorkbook();
  }
  catch (error) { if (epoch === previewEpoch) message(error.message, true); }
  finally { if (epoch === previewEpoch) { draftLoading = false; renderControls(); } }
}
async function refresh() {
  // Readiness must not stay green merely because an unrelated runtime read hangs.
  void refreshReadiness();
  try {
    const requestedId = jobId, epoch = previewEpoch;
    // Read the server's context before following cached job/workbook pointers.
    const runtime = await api('/api/runtime');
    if (requestedId !== jobId || epoch !== previewEpoch) return;
    resetContextAvailable = Object.hasOwn(runtime, 'rrContext');
    workspaceResetSupported = runtime.workspaceResetSupported === true;
    authoritativeContext = resetContextAvailable && runtime.rrContext !== null;
    if (resetContextAvailable && !authoritativeContext && rrContextId !== null) throw new Error('Persisted RR context is missing; reconcile before continuing');
    if (authoritativeContext) {
      const context = runtime.rrContext;
      if (context?.id !== rrContextId || context?.jobId !== jobId || context?.workbookId !== (sessionStorage.getItem('rrWorkbookId') || null)) {
        if (submitting || stopping || takingControl) return;
        adoptReset(context);
        return initialize();
      }
      rememberContext(context);
    }
    const [current, progress] = await Promise.all([
      requestedId ? api(`/api/jobs/${requestedId}`) : Promise.resolve(null),
      requestedId ? api(`/api/jobs/${requestedId}/results/state.json`).catch(() => ({})) : Promise.resolve({}),
    ]);
    if (requestedId !== jobId || epoch !== previewEpoch) return;
    job = current;
    const checkpoints = requirementProgress(progress), outcome = runOutcome(job, checkpoints);
    loginFirstAvailable = runtime.loginFirst === true;
    setupTargetEditable = runtime.setupTargetEditable === true;
    operatorPauseSupported = runtime.operatorPauseSupported === true;
    workbookSaveContextRequired = runtime.workbookSaveContextRequired === true;
    executionEnabled = runtime.executionEnabled !== false;
    if (localWorkspaces?.staging) document.querySelector('.staging-banner').textContent = `${workspaceLabel} · RESTRICTED STAGING · ${executionEnabled ? 'AI ENABLED' : 'AI DISABLED · CREDENTIALS PENDING'}`;
    $("loginHint").textContent = loginFirstAvailable ? "Each Start Build creates a clean browser. Sign in, then Return to Agent. AI stays off until verification succeeds." : "Login-first upgrade is pending server activation. Existing runs are preserved; new builds are temporarily unavailable.";
    $("owner").textContent = runtime.ownership === "USER" ? "USER CONTROL" : runtime.ownership === "AGENT" ? "AGENT CONTROL" : "CONTROL HANDOFF / UNCONFIRMED";
    if ((viewerRuntimeId && runtime.runtimeId && viewerRuntimeId !== runtime.runtimeId) || viewerStopped !== !!runtime.browserStopped) $("browserFrame").querySelector("iframe").src = appPath("/viewer");
    viewerRuntimeId = runtime.runtimeId || viewerRuntimeId;
    viewerStopped = !!runtime.browserStopped;
    if (viewerStopped) $("browserControlMessage").textContent = "This run's browser is stopped. Saved evidence is retained; start a fresh build when ready. Reload Viewer does not resume it.";
    else if (canResumePaused() && !handoffPending && !takingControl) $("browserControlMessage").textContent = job.lastAssistantText || "Pi is paused; the same browser is retained. Return explicitly after review, or Stop Build to end it.";
    browserOwnership = runtime.ownership;
    $("browserFrame").classList.toggle("user-control", runtime.ownership === "USER" && !viewerStopped && !['PAUSING', 'RETURNING', 'STOPPING'].includes(job?.phase) && !handoffPending && !takingControl && !stopping);
    $("browserStatus").textContent = viewerStopped ? "BROWSER STOPPED" : runtime.ownership === "USER" ? "USER CONTROL" : runtime.ownership;
    const verified = !!job?.apiPreflight && job?.target?.apiEventId === job.apiPreflight.eventId;
    const target = active() && !canEditSetupTarget() ? job.requestedEventName || job.authorizedEventName : $("eventName").value.trim() || job?.requestedEventName;
    $("eventTitle").textContent = target || "Name your target Cvent event";
    $("targetStatus").textContent = active() ? `${verified ? "Verified" : "Verification pending"}: ${target || "No selected target"}` : "Enter the exact existing event name below. Never inferred from the RR.";
    $("bindingNote").textContent = canEditSetupTarget()
      ? "You can correct this name before AI starts. Return to Agent verifies and binds the entered event without resetting login."
      : active() ? `Bound to this run: ${target}. Stop and upload again to change it.` : "Use any existing event name. Return to Agent verifies its exact identity; the RR never chooses the target.";
    $("loginStatus").textContent = verified && runtime.ownership === "AGENT" ? `${workspaceLabel} · Event login verified` : `${workspaceLabel} · Human login / verification`;
    $("plan").textContent = job ? `${job.createdAt || ""}  Uploaded RR workbook: ${job.originalName}` : "No RR uploaded.";
    $("status").textContent = canResumePaused() ? job.pauseReason === 'model_failure' ? "MODEL ERROR · PAUSED" : "PAUSED · HUMAN CONTROL" : active() ? (job.workflow === "login-first" && !job.aiStartedAt ? "AI NOT STARTED · $0 this run" : job.phase === "AWAITING_INPUT" ? "WAITING FOR YOU" : "Running") : outcome?.label || statusLabel(job?.status) || "Not running";
    const executing = active() && job.phase === "EXECUTING";
    const ended = job && ["STOPPED", "DONE", "INCOMPLETE"].includes(statusLabel(job.status));
    const reportedStage = executing && Array.isArray(progress.requirements) && typeof progress.currentStage === "string" ? progress.currentStage.trim() : "";
    const reportedAction = executing && Array.isArray(progress.requirements) && typeof progress.currentAction === "string" ? progress.currentAction.trim() : "";
    $("stage").textContent = executing ? reportedStage || "Executing RR" : active() ? progress.currentStage || job.phase : outcome?.label || statusLabel(job?.status) || "UPLOAD";
    const retiredStartupBlock = ended && job.stopReason?.startsWith("Operator decision required before a new RR:");
    $("action").textContent = retiredStartupBlock ? "This build stopped before AI under a retired startup rule. Upload a new RR to start fresh."
      : ended ? `${job.stopReason || "Execution ended"}. ${job.status === "FINISHED" || job.status === "REVIEW_REQUIRED" ? "This historical run has no verified full-RR completion result." : job.executionSummary || "Saved execution results are available below."}`
      : executing ? reportedAction ? `Agent-reported: ${reportedAction}` : job.executionActivity ? `${job.executionActivity.at} · ${job.executionActivity.message}` : "Native Pi is working; saved results require separate verification."
      : job?.lastStartError || progress.currentAction || "Upload an RR and name the event you started.";
    $("agentReply").textContent = executing ? "" : job?.lastAssistantText || job?.intake?.summary || "";
    $("question").textContent = job?.lastAssistantText || "";
    const spendingMode = runtime.budget?.spendingLimitEnabled === false ? "no spending stop" : "spending guard active";
    $("cost").textContent = runtime.budget?.resetId && !active()
      ? `${money(runtime.budget.spentUSD)} tracked since reset · ${spendingMode}${job ? ` · ${money(job.piCostUSD)} selected run` : ""}`
      : job ? `${money(job.piCostUSD)} this run · ${money(job.totalEventCostUSD)} including prior spending · ${spendingMode}` : `No current run · prior spending retained · ${spendingMode}`;
    $("results").hidden = !job || !!job.modelFailure || (!!active() && Object.hasOwn(job, 'reportBeforeReturn'));
    if (job) $("results").href = appPath(`/api/jobs/${job.id}/results/final-report.md`);
    renderCurrentRun(outcome?.label);
    const pending = outcome?.notes || checkpoints.pending;
    $('outcomeSummary').hidden = !outcome;
    $('outcomeSummary').textContent = outcome?.summary || '';
    $('pendingTitle').textContent = outcome?.heading || 'Remaining / blocked';
    $('completionMark').textContent = outcome?.icon || '•';
    renderList("completed", checkpoints.completed); renderList("pending", pending);
    renderList("excluded", checkpoints.excluded);
    $("excludedProgress").hidden = !checkpoints.excluded.length;
    renderList("activity", Array.isArray(job?.activity) ? job.activity.slice(-100).reverse().map(entry => `${entry.at} · ${entry.message}`) : list(progress.activity).slice(-10).reverse());
    const count = checkpoints.completed.length;
    $("completionTitle").textContent = outcome?.label || (count ? "Agent-reported progress" : "No completed work reported");
    $("completionCount").textContent = checkpoints.mode === 'requirements'
      ? `${checkpoints.changedCount} changed · ${checkpoints.existingCount} existing matches · ${outcome?.remaining ?? checkpoints.pending.length} remaining · ${checkpoints.excluded.length} excluded · not independent acceptance`
      : `${count} reported checkpoints · not independent acceptance`;
    $("progressLists").hidden = !count && !pending.length && !checkpoints.excluded.length;
    const executionStart = job?.aiStartedAt || (job?.workflow !== "login-first" ? job?.startedAt : null);
    const executionEnd = active() ? Date.now() : Date.parse(job?.finishedAt || job?.updatedAt || executionStart);
    const seconds = Math.floor((executionEnd - Date.parse(executionStart)) / 1000);
    const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    $("elapsed").textContent = [Math.floor(elapsed / 3600), Math.floor(elapsed / 60) % 60, elapsed % 60].map(value => String(value).padStart(2, "0")).join(":");
    $("elapsedLabel").textContent = job?.pausedAt ? "Run elapsed · includes human pauses" : job?.aiStartedAt ? "AI execution · target ~90 min (not a cutoff)" : executionStart ? "Historical duration · includes setup" : "AI execution · starts after verified Return";
    // These are reached lifecycle milestones, not a prescribed RR editor order
    // or proof of full completion. Settlement must not erase a reached phase.
    const browserPrepared = !!(job?.browser?.runtimeId && job.browser.steelSessionId && job.browser.activeTargetId);
    const executionStarted = Number.isFinite(Date.parse(job?.aiStartedAt));
    [!!job || !!workbook, browserPrepared, verified, executionStarted].forEach((reached, i) => $(`step${i + 1}`).classList.toggle("done", reached));
    if (job?.waitingFor === "setup" && active()) $("browserDetails").open = true;
    renderControls();
    void refreshReadiness();
  } catch (error) { invalidateReadiness(); message(error.message, true); }
}
async function readJob() {
  await api(`/api/jobs/${jobId}/read`, {});
  message("Clean browser ready. Sign in, then RETURN TO AGENT. No Pi process or AI spending while waiting.");
}
$("eventName").value = sessionStorage.getItem("rrTargetName") || "";
$("eventName").oninput = () => { sessionStorage.setItem("rrTargetName", $("eventName").value); $("eventTitle").textContent = $("eventName").value.trim() || "Name your target Cvent event"; };
async function newRR(file = null) {
  if (!historyReady || submitting || stopping || draftLoading || takingControl) return;
  if (file && !/\.xlsx$/i.test(file.name)) { $("rr").value = ""; return message("Choose an .xlsx workbook", true); }
  if ((active() || (jobId && !job) || edits.size) && !confirm("Replace the current run in this workspace and start fresh? Other workspaces are untouched. Unsaved cell edits will be discarded; saved work and costs remain. Stop cannot undo submitted Cvent changes.")) {
    $("rr").value = ""; return;
  }
  submitting = true; ++previewEpoch; renderControls();
  try {
    message("Ending the current context safely; no new AI session is being started…");
    const result = await api("/api/new-rr", { jobId, ...(resetContextAvailable ? { contextId: rrContextId, prepareUpload: !!file } : {}), ...(workspaceResetSupported ? { replaceWorkspace: true } : {}) });
    if (!result.cleared) throw new Error("New RR was not confirmed; keep the current run for review");
    // Stopping is irreversible, but replacing the UI's workbook is not committed
    // until its upload/preview succeeds. Keep the old selection and edits on error.
    if (file) {
      message("Saving and previewing the new RR; your entered target is retained…");
      const form = new FormData(); form.append("rr", file);
      if (rrContextId) form.append('contextId', rrContextId);
      const replacement = await api("/api/workbooks", form);
      if (resetContextAvailable) rememberContext(replacement.rrContext);
      sessionStorage.setItem("rrWorkbookId", replacement.id);
      workbook = replacement;
      sessionStorage.setItem("rrTargetName", $("eventName").value);
    } else {
      if (resetContextAvailable) rememberContext(result.rrContext);
      workbook = null;
      sessionStorage.removeItem("rrWorkbookId"); sessionStorage.removeItem("rrTargetName");
      $("rr").value = ""; $("eventName").value = "";
    }
    jobId = null; job = null; jobs = []; edits.clear(); sessionStorage.removeItem("rrJobId");
    $("answer").value = ""; $("sessionInvalidated").checked = false;
    $("browserControlMessage").textContent = "Fresh RR context. Start Build opens a clean browser; after login, one new Pi session reads this RR using the cvent-event-build skill. Prior evidence and spending remain private.";
    renderWorkbook(); clearRunView();
    const slotNote = result.sharedSlotStatus === 'REVIEW_REQUIRED' ? ` Capacity release still needs review: ${result.slotError?.error || 'cleanup verification unavailable'}`
      : ['RELEASED', 'EMPTY'].includes(result.sharedSlotStatus) ? ' No execution reservation remains for this workspace.'
      : result.sharedSlotStatus === 'OTHER_WORKSPACE' ? ' Another workspace owns execution capacity and was not changed.' : ' Check Execution readiness for capacity.';
    message((file ? 'New RR saved with fresh context; your target was kept. Start Build creates a clean browser; AI starts only after verified Return.'
      : 'Workspace cleared. No AI session was started.') + slotNote + ' Historical event reviews, files and costs remain; other workspaces are untouched.', result.sharedSlotStatus === 'REVIEW_REQUIRED');
  } catch (error) {
    $("rr").value = "";
    message(`${error.message}${file ? " · New RR was not selected. Your prior workbook, edits and target are retained. Any completed Stop remains in effect." : " · Clear was not confirmed. Your RR selection is retained; any completed Stop remains in effect."}`, true);
  }
  finally { submitting = false; await refresh(); }
}
$("newRR").onclick = () => newRR();
$("rr").onchange = () => { const file = $("rr").files?.[0]; if (file) return newRR(file); };
$("upload").onclick = async () => {
  if (!historyReady || submitting || draftLoading || active() || edits.size || !loginFirstAvailable) return;
  const file = $("rr").files?.[0];
  if (!file && !workbook) return message("Choose the RR .xlsx first", true);
  const targetName = $("eventName").value.trim();
  if (!targetName) return message("Enter the exact Cvent target event name; it is never taken from the RR", true);
  submitting = true; renderControls();
  try {
    message("Binding your named target and preparing a clean browser; AI has not started…");
    const form = new FormData();
    if (workbook) {
      const response = await fetch(appPath(`/api/workbooks/${workbook.id}/download`));
      if (!response.ok) throw new Error("Could not read the saved workbook version");
      form.append("rr", await response.blob(), workbook.originalName); form.append("sourceWorkbookId", workbook.id);
    } else form.append("rr", file);
    form.append("eventName", targetName);
    if (rrContextId) form.append('contextId', rrContextId);
    const uploaded = await api("/api/jobs", form);
    jobId = uploaded.id; job = uploaded; sessionStorage.setItem("rrJobId", jobId); sessionStorage.setItem("rrTargetName", targetName);
    $("rr").value = ""; $("answer").value = ""; $("sessionInvalidated").checked = false; $("agentReply").textContent = "";
    await readJob();
  } catch (error) { message(error.message, true); }
  finally { submitting = false; await refresh(); }
};
$("start").onclick = async () => {
  if (!historyReady || submitting || draftLoading || job?.status !== "UPLOADED" || $("rr").files?.length || workbook) return;
  submitting = true; renderControls();
  try { await readJob(); } catch (error) { message(error.message, true); }
  finally { submitting = false; await refresh(); }
};
async function answer(login) {
  if (submitting || takingControl || job?.phase !== "AWAITING_INPUT" || job.status !== "RUNNING") return;
  const paused = login && canResumePaused();
  if (login && job.waitingFor !== "setup" && !paused) return;
  if (login && /security review/i.test(job.lastAssistantText || "") && !$("sessionInvalidated").checked) {
    const notice = "Human security confirmation is still required above. Only confirm after invalidating the exposed session and signing in again; being logged in alone is not that confirmation.";
    $("browserControlMessage").textContent = notice; message(notice, true);
    $("securityConfirmation").scrollIntoView({ behavior: "smooth" });
    return;
  }
  const enteredTarget = login && canEditSetupTarget() ? $("eventName").value.trim() : undefined;
  if (enteredTarget === '') return message("Enter the exact existing Cvent event name before returning control", true);
  const text = login ? "I have signed in; return control to Pi and verify only the selected target event." : $("answer").value.trim();
  if (!text) return message("Enter your answer", true);
  let handoffError = null;
  submitting = true; handoffPending = login; renderControls();
  if (login) {
    $("browserFrame").classList.remove("user-control");
    $("browserControlMessage").textContent = "Verifying login, safety checks and this run's named event before giving control to the agent…";
  }
  try {
    if (paused) await api(`/api/jobs/${jobId}/resume`, { returnControl: true, pauseId: job.pauseId });
    else await api(`/api/jobs/${jobId}/answer`, { message: text, returnControl: login, sessionInvalidated: login && $("sessionInvalidated").checked, ...(enteredTarget !== undefined ? { eventName: enteredTarget } : {}) });
    $("answer").value = ""; $("sessionInvalidated").checked = false;
    message("Answer received. Continuing this live job; no old conversation restored.");
  } catch (error) {
    handoffError = error.message;
    message(error.message, true);
    if (login) $("browserControlMessage").textContent = `Agent handoff failed: ${error.message}`;
  }
  finally {
    submitting = false; handoffPending = false; await refresh();
    if (login && job?.phase === "AWAITING_INPUT" && (job?.waitingFor === "setup" || job?.waitingFor === "operator")) {
      const notice = handoffError || job.lastAssistantText || "Agent handoff is still blocked; see the event/login action above.";
      $("browserControlMessage").textContent = notice;
      message(notice, true);
    } else if (login && browserOwnership === "AGENT") {
      $("browserControlMessage").textContent = operatorPauseSupported
        ? "The agent has control for this verified event. Take Control pauses this same build after safety checks; Stop Build ends it."
        : "The agent has control. This backend's Take Control ends the build and closes its browser; it does not pause.";
    }
  }
}
$("sendAnswer").onclick = () => answer(false);
$("loginDone").onclick = () => answer(true);
$("stop").onclick = async () => {
  if (stopping || !active()) return;
  stopping = true; renderControls();
  try {
    const result = await api(`/api/jobs/${jobId}/stop`, {});
    message(result.stopFailures?.length || result.spendingUnreconciled ? "Stop requires operator reconciliation. Do not start another run." : "Stopped. Saved work and spending are preserved. A new run needs a new upload.", !!result.stopFailures?.length || !!result.spendingUnreconciled);
  }
  catch (error) { message(error.message, true); }
  finally { stopping = false; await refresh(); }
};
function focusBrowser() {
  $("browserDetails").scrollIntoView({ behavior: "smooth" });
  $("browserFrame").querySelector("iframe").focus();
}
$("take").onclick = async () => {
  if (submitting || takingControl || !browserOwnership) return;
  if (browserOwnership === "USER") return answer(true);
  takingControl = true; renderControls();
  $("browserFrame").classList.remove("user-control");
  $("browserControlMessage").textContent = operatorPauseSupported ? "Pausing Pi and checking ownership, interrupted work and spending…" : "Ending the active build and closing its browser…";
  try {
    const result = await api("/api/take-control", operatorPauseSupported ? { jobId, contextId: rrContextId } : {});
    const notice = result.paused && result.browserRetained
      ? "Pi is paused; the same browser is retained. You can interact, then Return to the same build after verification. Stop Build ends both."
      : "The active RR was stopped. This backend does not preserve the browser for Take Control; start a fresh build when ready.";
    $("browserControlMessage").textContent = notice;
    message(notice);
  } catch (error) {
    $("browserControlMessage").textContent = `Could not confirm control: ${error.message}`;
    message(error.message, true);
  } finally { takingControl = false; await refresh(); }
  if (browserOwnership === "USER" && !viewerStopped) focusBrowser();
};
$("openBrowser").onclick = () => $("browserDetails").scrollIntoView({ behavior: "smooth" });
$("profile1").onclick = () => $("workspace").scrollIntoView({ behavior: "smooth" });
$("reloadViewer").onclick = () => { const frame = $("browserFrame").querySelector("iframe"); frame.src = appPath("/viewer"); };
$("sheetSelect").onchange = () => loadSheet(Number($("sheetSelect").value), 0);
$("previousRows").onclick = () => loadSheet(workbook.sheet, Math.max(0, workbook.offset - 80));
$("nextRows").onclick = () => loadSheet(workbook.sheet, workbook.offset + 80);
$("revertWorkbook").onclick = () => { if (active() || submitting || draftLoading) return; edits.clear(); renderWorkbook(); renderControls(); };
$("saveWorkbook").onclick = async () => {
  if (!workbook || !edits.size || active() || submitting || draftLoading) return;
  if (workbookSaveContextRequired && !rrContextId) return message("Current RR context is unconfirmed; re-upload this workbook before saving. Unsaved edits are retained.", true);
  const epoch = previewEpoch, saved = workbook, contextId = rrContextId;
  draftLoading = true; renderControls();
  try {
    await api(`/api/workbooks/${saved.id}/save`, { sha256: saved.sha256, sheet: saved.sheet, edits: [...edits].map(([cell, value]) => ({ cell, value })), ...(workbookSaveContextRequired ? { contextId } : {}) });
    if (epoch !== previewEpoch) return;
    edits.clear();
    const next = await api(`/api/workbooks/${saved.id}?sheet=${saved.sheet}&offset=${saved.offset}`);
    if (epoch !== previewEpoch) return;
    workbook = next;
    renderWorkbook(); message("Draft saved. Original and all previous saved versions retained.");
  } catch (error) { if (epoch === previewEpoch) message(error.message, true); }
  finally { if (epoch === previewEpoch) { draftLoading = false; renderControls(); } }
};
async function configureLocalWorkspaces() {
  const response = await fetch(appPath('/local-workspaces.json'), { cache: 'no-store' });
  if (response.status === 404) return; // Normal single-user deployment remains unchanged.
  if (!response.ok) throw new Error('Local workspace configuration unavailable');
  const { localWorkspaceConfig } = await import('./workspace-config.js');
  localWorkspaces = localWorkspaceConfig(await response.json(), location.origin, location.pathname);
  workspaceLabel = localWorkspaces.label;
  document.title = `Forge · ${workspaceLabel} · ${localWorkspaces.staging ? 'Staging' : 'Local'} workspace`;
  const switcher = document.querySelector('.workspace-switcher');
  switcher.dataset.localMulti = 'true';
  switcher.querySelector('p').textContent = '3 separate workspaces · click to switch';
  const buttons = switcher.querySelectorAll('.profile');
  for (const [index, workspace] of localWorkspaces.workspaces.entries()) {
    const button = buttons[index], selected = workspace.id === localWorkspaces.current;
    button.disabled = false; button.classList.toggle('selected', selected);
    button.title = `Open ${workspace.label}'s separate dashboard and browser`;
    button.setAttribute('aria-label', `Open User ${workspace.id} workspace`);
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    button.replaceChildren(document.createTextNode(`${selected ? '● ' : ''}${workspace.label} `), node('span', selected ? 'SELECTED' : 'OPEN'));
    button.onclick = () => {
      if (submitting || stopping || draftLoading || takingControl) return message('Wait for this action to finish before switching workspaces.', true);
      if (selected) return $("workspace").scrollIntoView({ behavior: 'smooth' });
      if (edits.size && !confirm('Switch workspaces and discard unsaved cell edits? Running jobs continue in their own workspace.')) return;
      location.assign(workspace.url);
    };
  }
  document.querySelector('.profile-pill').firstChild.textContent = `${workspaceLabel} `;
  for (const pill of document.querySelectorAll('.tiny-pill')) {
    if (pill.textContent === 'USER 1 · PROFILE 1') pill.textContent = `${workspaceLabel} · PRIVATE BROWSER`;
  }
  document.querySelector('.local-user small').textContent = localWorkspaces.staging ? 'Shared staging login · separate VM workspaces' : 'Local preview · separate apps, same OS user';
  document.querySelector('.staging-banner').textContent = `${workspaceLabel} · ${localWorkspaces.staging ? 'RESTRICTED STAGING' : 'LOCAL PREVIEW'} · AI DISABLED`;
}
async function initialize() {
  const epoch = previewEpoch;
  historyReady = false; renderControls();
  try { await configureLocalWorkspaces(); }
  catch (error) { message(error.message, true); }
  await refresh();
  if (epoch !== previewEpoch) return;
  try {
    const history = await api("/api/jobs");
    if (epoch !== previewEpoch) return;
    if (!Array.isArray(history)) throw new Error('Saved runs could not be loaded. Refresh before uploading another RR.');
    jobs = history;
    // Fresh tabs must see their existing job in single-runner mode too. Otherwise
    // file replacement sends a null jobId and correctly fails the ownership gate.
    if (!jobId && !authoritativeContext) {
      const running = jobs.filter(item => ['PREPARING', 'STARTING', 'RUNNING', 'STOPPING'].includes(item.status));
      if (running.length === 1) {
        jobId = running[0].id; sessionStorage.setItem('rrJobId', jobId);
        if (!$("eventName").value.trim() && typeof running[0].requestedEventName === 'string') {
          $("eventName").value = running[0].requestedEventName;
          sessionStorage.setItem('rrTargetName', $("eventName").value);
        }
      }
    }
    if (resetContextAvailable && jobId && !$("eventName").value.trim()) {
      const selected = jobs.find(item => item.id === jobId);
      if (typeof selected?.requestedEventName === 'string') {
        $("eventName").value = selected.requestedEventName;
        sessionStorage.setItem('rrTargetName', $("eventName").value);
      }
    }
    historyReady = true; renderControls();
    const savedId = sessionStorage.getItem("rrWorkbookId");
    if (/^[0-9a-f-]{36}$/.test(savedId || "")) {
      const saved = await api(`/api/workbooks/${savedId}`);
      if (epoch !== previewEpoch) return;
      workbook = saved; renderWorkbook();
    }
    await refresh();
  } catch (error) { message(error.message, true); }
}
initialize();
let refreshTicks = 0;
// These are local UI reads, never Pi calls. Waiting/idle refresh is only every 10s.
setInterval(() => {
  if (submitting || (active() && job.phase !== "AWAITING_INPUT") || ++refreshTicks % 5 === 0) void refresh();
}, 2000);
