const $ = id => document.getElementById(id);
let jobId = sessionStorage.getItem("rrJobId");
let job = null, submitting = false, handoffPending = false, stopping = false;
let browserOwnership = null, takingControl = false, viewerRuntimeId = null, viewerStopped = false, loginFirstAvailable = false;
let workbook = null, draftLoading = false, edits = new Map(), previewEpoch = 0, jobs = [];
const active = () => job && ["PREPARING", "STARTING", "RUNNING", "STOPPING"].includes(job.status);
// Present historical terminal labels without rewriting immutable job records.
const statusLabel = status => ({ REVIEW_REQUIRED: "INCOMPLETE", FINISHED: "INCOMPLETE", STOPPED_REQUIRES_REVIEW: "STOPPED" }[status] || status);
const money = value => Number.isFinite(value) ? `$${value.toFixed(2)}` : "—";
const list = value => Array.isArray(value) ? value : value ? [value] : [];
const node = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
function renderList(id, values) {
  $(id).replaceChildren(...(list(values).length ? list(values).map(value => node("li", typeof value === "string" ? value : value.message || JSON.stringify(value))) : [node("li", "None")]));
}
function message(text, error = false) { $("message").textContent = text; $("message").className = error ? "activity-error" : ""; }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: "POST", ...(body instanceof FormData ? { body } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function editorControls() {
  const locked = submitting || stopping || draftLoading || !!active();
  $("sheetSelect").disabled = locked || !workbook || !!edits.size;
  $("previousRows").disabled = locked || !workbook || !workbook.offset || !!edits.size;
  $("nextRows").disabled = locked || !workbook || workbook.offset + workbook.rows.length >= workbook.sheets[workbook.sheet].rows || !!edits.size;
  $("revertWorkbook").disabled = locked || !edits.size;
  $("saveWorkbook").disabled = locked || !edits.size;
  $("editStatus").textContent = edits.size ? `${edits.size} unsaved cell changes · save or revert before starting` : "No unsaved changes · text edits only; formulas preserved, not recalculated.";
}
function renderControls() {
  const setup = job?.status === "RUNNING" && job?.phase === "AWAITING_INPUT" && job?.waitingFor === "setup";
  const userControl = browserOwnership === "USER";
  $("take").disabled = submitting || stopping || takingControl || !browserOwnership || (userControl && !setup);
  $("take").textContent = handoffPending ? "RETURNING TO AGENT…" : takingControl ? "TAKING CONTROL…" : userControl ? "RETURN TO AGENT" : "TAKE CONTROL";
  $("take").title = userControl
    ? setup ? "Return control after verifying login and this run's named event." : "Start a new build before returning control; stopped runs cannot be resumed."
    : "Stop the active build and return browser control to you.";
  const locked = submitting || stopping || draftLoading || !!active();
  $("upload").disabled = locked || !!edits.size || !loginFirstAvailable;
  $("rr").disabled = submitting || stopping || draftLoading || takingControl;
  $("newRR").disabled = submitting || stopping || draftLoading || takingControl;
  $("eventName").disabled = locked;
  // Stop must remain available while Start/Return is awaiting the server.
  $("stop").disabled = stopping || !active();
  const waiting = job?.status === "RUNNING" && job?.phase === "AWAITING_INPUT";
  $("questionPanel").hidden = !waiting;
  $("sendAnswer").hidden = job?.waitingFor === "setup";
  $("answer").hidden = job?.waitingFor === "setup";
  $("loginDone").hidden = job?.waitingFor !== "setup";
  $("securityConfirmation").hidden = !waiting || !/security review/i.test(job?.lastAssistantText || "");
  $("sendAnswer").disabled = submitting;
  $("loginDone").disabled = submitting;
  $("start").hidden = job?.status !== "UPLOADED";
  $("start").disabled = locked || !!$("rr").files?.length || !!workbook;
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
async function loadSheet(sheet = 0, offset = 0) {
  if (!workbook || edits.size || draftLoading) return;
  draftLoading = true; renderControls();
  try { workbook = await api(`/api/workbooks/${workbook.id}?sheet=${sheet}&offset=${offset}`); renderWorkbook(); }
  catch (error) { message(error.message, true); }
  finally { draftLoading = false; renderControls(); }
}
async function refresh() {
  try {
    const requestedId = jobId, epoch = previewEpoch;
    const [runtime, current, progress] = await Promise.all([
      api("/api/runtime"), requestedId ? api(`/api/jobs/${requestedId}`) : Promise.resolve(null),
      requestedId ? api(`/api/jobs/${requestedId}/results/state.json`).catch(() => ({})) : Promise.resolve({}),
    ]);
    if (requestedId !== jobId || epoch !== previewEpoch) return;
    job = current;
    loginFirstAvailable = runtime.loginFirst === true;
    $("loginHint").textContent = loginFirstAvailable ? "Each Start Build creates a clean browser. Sign in, then Return to Agent. AI stays off until verification succeeds." : "Login-first upgrade is pending server activation. Existing runs are preserved; new builds are temporarily unavailable.";
    $("owner").textContent = runtime.ownership === "USER" ? "USER CONTROL" : runtime.ownership === "AGENT" ? "AGENT CONTROL" : "CONTROL HANDOFF / UNCONFIRMED";
    if ((viewerRuntimeId && runtime.runtimeId && viewerRuntimeId !== runtime.runtimeId) || viewerStopped !== !!runtime.browserStopped) $("browserFrame").querySelector("iframe").src = "/viewer";
    viewerRuntimeId = runtime.runtimeId || viewerRuntimeId;
    viewerStopped = !!runtime.browserStopped;
    browserOwnership = runtime.ownership;
    $("browserFrame").classList.toggle("user-control", runtime.ownership === "USER" && !handoffPending && !takingControl && !stopping);
    $("browserStatus").textContent = viewerStopped ? "BROWSER STOPPED" : runtime.ownership === "USER" ? "USER CONTROL" : runtime.ownership;
    const verified = !!job?.apiPreflight && job?.target?.apiEventId === job.apiPreflight.eventId;
    const target = active() ? job.requestedEventName || job.authorizedEventName : $("eventName").value.trim() || job?.requestedEventName;
    $("eventTitle").textContent = target || "Name your target Cvent event";
    $("targetStatus").textContent = active() ? `${verified ? "Verified" : "Verification pending"}: ${target || "No upload-bound target"}` : "Enter the exact existing event name below. Never inferred from the RR.";
    $("bindingNote").textContent = active() ? `Bound to this run: ${target}. Stop and upload again to change it.` : "Target is locked to this upload when you start. A different RR name never changes it.";
    $("loginStatus").textContent = verified && runtime.ownership === "AGENT" ? "USER 1 · Event login verified" : "USER 1 · Human login / verification";
    $("plan").textContent = job ? `${job.createdAt || ""}  Uploaded RR workbook: ${job.originalName}` : "No RR uploaded.";
    $("status").textContent = active() ? (job.workflow === "login-first" && !job.aiStartedAt ? "AI NOT STARTED · $0 this run" : job.phase === "AWAITING_INPUT" ? "WAITING FOR YOU" : "Running") : statusLabel(job?.status) || "Not running";
    const executing = active() && job.phase === "EXECUTING";
    const ended = job && ["STOPPED", "DONE", "INCOMPLETE"].includes(statusLabel(job.status));
    $("stage").textContent = executing ? "Executing RR" : active() ? progress.currentStage || job.phase : statusLabel(job?.status) || "UPLOAD";
    const retiredStartupBlock = ended && job.stopReason?.startsWith("Operator decision required before a new RR:");
    $("action").textContent = retiredStartupBlock ? "This build stopped before AI under a retired startup rule. Upload a new RR to start fresh."
      : ended ? `${job.stopReason || "Execution ended"}. ${job.status === "FINISHED" || job.status === "REVIEW_REQUIRED" ? "This historical run has no verified full-RR completion result." : job.executionSummary || "Saved execution results are available below."}`
      : executing ? job.executionActivity ? `${job.executionActivity.at} · ${job.executionActivity.message}` : "Native Pi is working; saved results require separate verification."
      : job?.lastStartError || progress.currentAction || "Upload an RR and name the event you started.";
    $("agentReply").textContent = executing ? "" : job?.lastAssistantText || job?.intake?.summary || "";
    $("question").textContent = job?.lastAssistantText || "";
    const spendingMode = runtime.budget?.spendingLimitEnabled === false ? "no spending stop" : "spending guard active";
    $("cost").textContent = runtime.budget?.resetId && !active()
      ? `${money(runtime.budget.spentUSD)} tracked since reset · ${spendingMode}${job ? ` · ${money(job.piCostUSD)} selected run` : ""}`
      : job ? `${money(job.piCostUSD)} this run · ${money(job.totalEventCostUSD)} including prior spending · ${spendingMode}` : `No current run · prior spending retained · ${spendingMode}`;
    $("results").hidden = !job; if (job) $("results").href = `/api/jobs/${job.id}/results/final-report.md`;
    const entries = Array.isArray(jobs) ? [...jobs] : [];
    if (job && !entries.some(item => item.id === job.id)) entries.unshift(job);
    $("jobSelect").replaceChildren(Object.assign(node("option", workbook?.originalName || "Select a saved run"), { value: "" }), ...entries.map(item => Object.assign(node("option", `${item.originalName} · ${statusLabel(item.status)}`), { value: item.id })));
    $("jobSelect").value = jobId || ""; $("jobSelect").disabled = !!active() || submitting;
    renderList("completed", progress.completed); renderList("pending", progress.pending);
    renderList("activity", Array.isArray(job?.activity) ? job.activity.slice(-100).reverse().map(entry => `${entry.at} · ${entry.message}`) : list(progress.activity).slice(-10).reverse());
    const count = list(progress.completed).length;
    $("completionTitle").textContent = count ? "Agent-reported progress" : "No completed work reported";
    $("completionCount").textContent = `${count} reported checkpoints · not independent acceptance`;
    $("progressLists").hidden = !count && !list(progress.pending).length;
    const executionStart = job?.aiStartedAt || (job?.workflow !== "login-first" ? job?.startedAt : null);
    const executionEnd = active() ? Date.now() : Date.parse(job?.finishedAt || job?.updatedAt || executionStart);
    const seconds = Math.floor((executionEnd - Date.parse(executionStart)) / 1000);
    const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    $("elapsed").textContent = [Math.floor(elapsed / 3600), Math.floor(elapsed / 60) % 60, elapsed % 60].map(value => String(value).padStart(2, "0")).join(":");
    $("elapsedLabel").textContent = job?.aiStartedAt ? "AI execution · target ~90 min (not a cutoff)" : executionStart ? "Historical duration · includes setup" : "AI execution · starts after verified Return";
    [!!job || !!workbook, !!job?.intake, verified, job?.phase === "EXECUTING"].forEach((done, i) => $(`step${i + 1}`).classList.toggle("done", done));
    if (job?.waitingFor === "setup" && active()) $("browserDetails").open = true;
    renderControls();
  } catch (error) { message(error.message, true); }
}
async function readJob() {
  await api(`/api/jobs/${jobId}/read`, {});
  message("Clean browser ready. Sign in, then RETURN TO AGENT. No Pi process or AI spending while waiting.");
}
$("jobSelect").onchange = async () => {
  if (active() || submitting) return;
  jobId = $("jobSelect").value || null;
  if (jobId) sessionStorage.setItem("rrJobId", jobId); else sessionStorage.removeItem("rrJobId");
  await refresh();
};
$("eventName").value = sessionStorage.getItem("rrTargetName") || "";
$("eventName").oninput = () => { sessionStorage.setItem("rrTargetName", $("eventName").value); $("eventTitle").textContent = $("eventName").value.trim() || "Name your target Cvent event"; };
async function newRR(file = null) {
  if (submitting || stopping || draftLoading || takingControl) return;
  if (file && !/\.xlsx$/i.test(file.name)) { $("rr").value = ""; return message("Choose an .xlsx workbook", true); }
  if ((active() || (jobId && !job) || edits.size) && !confirm("Stop the current run and start a fresh RR context? Unsaved cell edits will be discarded. Saved work, files and cumulative spending stay preserved. Stop cannot undo submitted Cvent changes.")) {
    $("rr").value = ""; return;
  }
  submitting = true; ++previewEpoch; renderControls();
  try {
    message("Ending the current context safely; no new AI session is being started…");
    const result = await api("/api/new-rr", { jobId });
    if (!result.cleared) throw new Error("New RR was not confirmed; keep the current run for review");
    // Stopping is irreversible, but replacing the UI's workbook is not committed
    // until its upload/preview succeeds. Keep the old selection and edits on error.
    if (file) {
      message("Saving and previewing the new RR; your entered target is retained…");
      const form = new FormData(); form.append("rr", file);
      const replacement = await api("/api/workbooks", form);
      sessionStorage.setItem("rrWorkbookId", replacement.id);
      workbook = replacement;
      sessionStorage.setItem("rrTargetName", $("eventName").value);
    } else {
      workbook = null;
      sessionStorage.removeItem("rrWorkbookId"); sessionStorage.removeItem("rrTargetName");
      $("rr").value = ""; $("eventName").value = "";
    }
    jobId = null; job = null; edits.clear(); sessionStorage.removeItem("rrJobId");
    $("answer").value = ""; $("sessionInvalidated").checked = false;
    $("browserControlMessage").textContent = "Prior context ended. Saved work and spending remain. Start a new build before returning control; browser login was not reset.";
    renderWorkbook();
    // A history refresh failure must not turn a confirmed save into an upload error.
    try { jobs = await api("/api/jobs"); } catch {}
    message(file ? "RR saved and selected. Your target was kept. Review the workbook, then START BUILD. AI is off; prior spending still counts."
      : "Fresh RR form ready. Choose an Excel file. AI is off; saved history and cumulative spending are retained.");
  } catch (error) {
    $("rr").value = "";
    message(`${error.message}${file ? " · New RR was not selected. Your prior workbook, edits and target are retained. Any completed Stop remains in effect." : ""}`, true);
  }
  finally { submitting = false; await refresh(); }
}
$("newRR").onclick = () => newRR();
$("rr").onchange = () => { const file = $("rr").files?.[0]; if (file) return newRR(file); };
$("upload").onclick = async () => {
  if (submitting || draftLoading || active() || edits.size || !loginFirstAvailable) return;
  const file = $("rr").files?.[0];
  if (!file && !workbook) return message("Choose the RR .xlsx first", true);
  const targetName = $("eventName").value.trim();
  if (!targetName) return message("Enter the exact Cvent target event name; it is never taken from the RR", true);
  submitting = true; renderControls();
  try {
    message("Binding your named target and preparing a clean browser; AI has not started…");
    const form = new FormData();
    if (workbook) {
      const response = await fetch(`/api/workbooks/${workbook.id}/download`);
      if (!response.ok) throw new Error("Could not read the saved workbook version");
      form.append("rr", await response.blob(), workbook.originalName); form.append("sourceWorkbookId", workbook.id);
    } else form.append("rr", file);
    form.append("eventName", targetName);
    const uploaded = await api("/api/jobs", form);
    jobId = uploaded.id; job = uploaded; sessionStorage.setItem("rrJobId", jobId); sessionStorage.setItem("rrTargetName", targetName);
    $("rr").value = ""; $("answer").value = ""; $("sessionInvalidated").checked = false; $("agentReply").textContent = "";
    await readJob();
  } catch (error) { message(error.message, true); }
  finally { submitting = false; await refresh(); }
};
$("start").onclick = async () => {
  if (submitting || draftLoading || job?.status !== "UPLOADED" || $("rr").files?.length || workbook) return;
  submitting = true; renderControls();
  try { await readJob(); } catch (error) { message(error.message, true); }
  finally { submitting = false; await refresh(); }
};
async function answer(login) {
  if (submitting || takingControl || job?.phase !== "AWAITING_INPUT" || job.status !== "RUNNING") return;
  if (login && job.waitingFor !== "setup") return;
  if (login && /security review/i.test(job.lastAssistantText || "") && !$("sessionInvalidated").checked) {
    const notice = "Human security confirmation is still required above. Only confirm after invalidating the exposed session and signing in again; being logged in alone is not that confirmation.";
    $("browserControlMessage").textContent = notice; message(notice, true);
    $("securityConfirmation").scrollIntoView({ behavior: "smooth" });
    return;
  }
  const text = login ? "I have signed in; return control to Pi and verify only the upload-bound target event." : $("answer").value.trim();
  if (!text) return message("Enter your answer", true);
  submitting = true; handoffPending = login; renderControls();
  if (login) {
    $("browserFrame").classList.remove("user-control");
    $("browserControlMessage").textContent = "Verifying login, safety checks and this run's named event before giving control to the agent…";
  }
  try {
    await api(`/api/jobs/${jobId}/answer`, { message: text, returnControl: login, sessionInvalidated: login && $("sessionInvalidated").checked });
    $("answer").value = ""; $("sessionInvalidated").checked = false;
    message("Answer received. Continuing this live job; no old conversation restored.");
  } catch (error) {
    message(error.message, true);
    if (login) $("browserControlMessage").textContent = `Agent handoff failed: ${error.message}`;
  }
  finally {
    submitting = false; handoffPending = false; await refresh();
    if (login && job?.phase === "AWAITING_INPUT" && job?.waitingFor === "setup") {
      $("browserControlMessage").textContent = job.lastAssistantText || "Agent handoff is still blocked; see the safety/login action above.";
    } else if (login && browserOwnership === "AGENT") {
      $("browserControlMessage").textContent = "The agent has control for this run's verified target. Use Take Control to stop the build and interact yourself.";
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
  $("browserControlMessage").textContent = "Stopping the active build and returning control…";
  try {
    await api("/api/take-control", {});
    $("browserControlMessage").textContent = "You control Cvent. Any active RR was stopped, not reset. Click inside the browser to interact.";
    message("You control Cvent. Any active RR was stopped, not reset.");
  } catch (error) {
    $("browserControlMessage").textContent = `Could not confirm control: ${error.message}`;
    message(error.message, true);
  } finally { takingControl = false; await refresh(); }
  if (browserOwnership === "USER") focusBrowser();
};
$("openBrowser").onclick = () => $("browserDetails").scrollIntoView({ behavior: "smooth" });
$("profile1").onclick = () => $("workspace").scrollIntoView({ behavior: "smooth" });
$("reloadViewer").onclick = () => { const frame = $("browserFrame").querySelector("iframe"); frame.src = "/viewer"; };
$("sheetSelect").onchange = () => loadSheet(Number($("sheetSelect").value), 0);
$("previousRows").onclick = () => loadSheet(workbook.sheet, Math.max(0, workbook.offset - 80));
$("nextRows").onclick = () => loadSheet(workbook.sheet, workbook.offset + 80);
$("revertWorkbook").onclick = () => { if (active() || submitting || draftLoading) return; edits.clear(); renderWorkbook(); renderControls(); };
$("saveWorkbook").onclick = async () => {
  if (!workbook || !edits.size || active() || submitting || draftLoading) return;
  draftLoading = true; renderControls();
  try {
    await api(`/api/workbooks/${workbook.id}/save`, { sha256: workbook.sha256, sheet: workbook.sheet, edits: [...edits].map(([cell, value]) => ({ cell, value })) });
    edits.clear();
    workbook = await api(`/api/workbooks/${workbook.id}?sheet=${workbook.sheet}&offset=${workbook.offset}`);
    renderWorkbook(); message("Draft saved. Original and all previous saved versions retained.");
  } catch (error) { message(error.message, true); }
  finally { draftLoading = false; renderControls(); }
};
async function initialize() {
  const epoch = previewEpoch;
  await refresh();
  if (epoch !== previewEpoch) return;
  try {
    const history = await api("/api/jobs");
    if (epoch !== previewEpoch) return;
    jobs = Array.isArray(history) ? history : [];
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
