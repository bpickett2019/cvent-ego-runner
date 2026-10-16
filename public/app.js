import { workspaceBase, workspacePath, scopedStorage } from './workspace-routing.js';
import { requirementProgress } from './requirement-progress.js';
import { executionReadiness } from './execution-readiness.js';
import { runOutcome } from './run-outcome.js';
import { resultLanguage } from './result-language.js';
import { bindRrFileInput } from './rr-file-input.js';
import { createProgressEvidence, canCheckFinalReport, finalReportAvailability, evidenceNotice } from './progress-evidence.js';
const progressEvidence = createProgressEvidence();
let refreshSequence = 0;
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
let readinessSnapshot = null, readinessSnapshotEpoch = null, readinessExpiry = null, reportCheck = null;
const active = () => job && ["PREPARING", "STARTING", "RUNNING", "STOPPING"].includes(job.status);
const canResumePaused = () => operatorPauseSupported && job?.status === 'RUNNING' && job.phase === 'AWAITING_INPUT' && job.waitingFor === 'operator' && typeof job.pauseId === 'string' && !!job.pauseId;
const canEditSetupTarget = () => setupTargetEditable && job?.status === 'RUNNING' && job.phase === 'AWAITING_INPUT' && job.waitingFor === 'setup' && !job.aiStartedAt && browserOwnership === 'USER';
// Present historical terminal labels without rewriting immutable job records.
const statusLabel = status => ({ REVIEW_REQUIRED: "INCOMPLETE", FINISHED: "INCOMPLETE", STOPPED_REQUIRES_REVIEW: "STOPPED" }[status] || status);
const money = value => Number.isFinite(value) ? `$${value.toFixed(2)}` : "—";
const list = value => Array.isArray(value) ? value : value ? [value] : [];
const node = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
function setText(element, value) {
  const text = value == null ? '' : String(value);
  if (element.textContent !== text) element.textContent = text;
}
function syncChildren(element, next) {
  const top = element.scrollTop, left = element.scrollLeft, wanted = new Set(next);
  for (const child of [...element.children]) if (!wanted.has(child)) element.removeChild(child);
  next.forEach((child, index) => { if (element.children[index] !== child) element.insertBefore(child, element.children[index] || null); });
  element.scrollTop = top; element.scrollLeft = left;
}
function renderList(id, values, showEmpty = true) {
  const element = $(id), rows = list(values);
  const labels = rows.length ? rows.map(value => typeof value === 'string' ? value : value?.message || JSON.stringify(value)) : showEmpty ? ['None'] : [];
  const existing = new Map();
  for (const child of element.children) {
    const pool = existing.get(child.textContent) || []; pool.push(child); existing.set(child.textContent, pool);
  }
  syncChildren(element, labels.map(value => {
    const text = value == null ? '' : String(value);
    return existing.get(text)?.shift() || node('li', text);
  }));
}
// Use requirement identity/source, never incidental words in a summary or question.
const isDiscountResult = row => (row.evidence || []).some(({ label, value }) =>
  label === 'Source' && /^\s*['"]?(?:\d+\s+)?(?:discount codes?|(?:volume|group) discounts?)['"]?\s*!/i.test(value) ||
  label === 'Requirement' && /^\s*(?:discount(?:\s+code)?|(?:volume|group)\s+discount)\b/i.test(value));
const resultDisclosures = new Map(), resultRows = new Map();
let resultRenderKey = '', resultJobId = null;
function renderNaturalResults(progress, checkpoints, outcome) {
  const view = resultLanguage(progress), key = JSON.stringify([jobId, view, outcome?.complete]);
  if (resultJobId !== jobId) {
    resultDisclosures.clear(); resultRows.clear(); resultJobId = jobId;
    $('pendingSection').open = true;
  }
  if (key === resultRenderKey) return view;
  resultRenderKey = key;
  const disclosure = (key, title, content) => {
    const details = node('details', '');
    details.className = 'result-details'; details.open = resultDisclosures.get(key) === true;
    const owner = jobId;
    details.ontoggle = () => { if (jobId === owner && details.isConnected !== false) resultDisclosures.set(key, details.open); };
    details.append(node('summary', title), content); return details;
  };
  const renderRow = (row, member = false) => {
    const li = node('li', ''); li.className = 'result-item';
    if (member && row.subject) li.append(node('strong', row.subject));
    else {
      if (row.subject) li.append(node('strong', row.subject));
      li.append(node('p', row.summary));
    }
    const more = node('div', ''); more.className = 'result-more';
    if (row.actionNote) { const action = node('p', row.actionNote); action.className = 'result-action-note'; li.append(action); }
    if (row.sourceNote) li.append(node('p', `Source: ${row.sourceNote}`));
    if (row.remainingIssue) li.append(node('p', `Why: ${row.remainingIssue}`));
    if (row.nextAction) { const next = node('p', `${row.nextActionLabel || 'Next'}: ${row.nextAction}`); next.className = 'result-next'; li.append(next); }
    if (row.members.length) {
      const members = node('ul', ''); members.className = 'result-list'; members.append(...row.members.map(x => renderRow(x, true)));
      more.append(members);
      li.append(disclosure(`${row.key}:members`, `See ${row.members.length} items`, more));
    } else {
      if (row.evidence.length) {
        const dl = node('dl', ''); dl.className = 'result-evidence';
        for (const field of row.evidence) dl.append(node('dt', field.label), node('dd', field.value));
        more.append(disclosure(`${row.key}:raw`, 'Technical evidence', dl));
      }
      li.append(disclosure(`${row.key}:evidence`, 'More', more));
    }
    return li;
  };
  const sections = [
    ['changed', view.changed, 'Saved'], ['pending', view.pending, 'Needs attention'],
    ['existing', view.existing, 'Already Correct in CVENT'], ['excluded', view.excluded, 'Excluded'],
    ['legacy', view.legacy, 'Notes'],
  ];
  const retainedRows = new Set();
  for (const [name, rows, title] of sections) {
    // Keep discounts inside their status category. Bring unfinished discounts to
    // the top of Needs attention so they are visible without a separate section.
    const displayRows = name === 'pending'
      ? [...rows.filter(isDiscountResult), ...rows.filter(row => !isDiscountResult(row))]
      : rows;
    syncChildren($(`${name}Plain`), displayRows.map(row => {
      const key = `${name}:${row.key}`, signature = JSON.stringify(row);
      retainedRows.add(key);
      let cached = resultRows.get(key);
      if (!cached || cached.signature !== signature) {
        cached = { signature, element: renderRow(row) }; resultRows.set(key, cached);
      }
      return cached.element;
    }));
    $(`${name}Section`).hidden = rows.length === 0;
    setText($(`${name}ResultTitle`), `${title} (${rows.length})`);
  }
  for (const key of resultRows.keys()) if (!retainedRows.has(key)) resultRows.delete(key);
  $('previewTechnical').hidden = !view.verificationOnly.length;
  renderList('previewTechnicalList', view.verificationOnly.map(row => `${row.subject} — ${row.nextAction}`));
  const unitemized = outcome && !outcome.complete && !checkpoints.pending.length;
  $('resultMissingDetail').hidden = !unitemized;
  $('resultMissingDetail').textContent = unitemized ? outcome.notes[0] : '';
  $('plainResults').hidden = !unitemized && !sections.some(([, rows]) => rows.length);
  $('technicalResults').hidden = !unitemized && !sections.some(([, rows]) => rows.length);
  return view;
}
function message(text, error = false) { $("message").textContent = text; $("message").className = error ? "activity-error" : ""; }
async function api(path, body, options = {}) {
  const response = await fetch(appPath(path), { ...options, ...(body === undefined ? {} : { method: "POST", ...(body instanceof FormData ? { body } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function cachedReadiness() { return readinessSnapshotEpoch === previewEpoch ? readinessSnapshot : null; }
function renderReadiness(value) {
  clearTimeout(readinessExpiry); readinessExpiry = null;
  const now = Date.now(), checkedAt = Date.parse(value?.checkedAt);
  // Retain only timestamps accepted by executionReadiness's existing age bounds.
  // Never turn a rejected future timestamp into a valid observation just by waiting.
  readinessSnapshot = Number.isFinite(checkedAt) && checkedAt <= now + 5000 && now - checkedAt <= 30000 ? value : null;
  readinessSnapshotEpoch = previewEpoch;
  const view = executionReadiness(readinessSnapshot, now);
  setText($('capacityStatus'), view.capacity);
  setText($('eventSafetyStatus'), view.eventSafety);
  renderList('safetyOwners', view.owners, false);
  setText($('safetyDetail'), view.detail);
  $('executionReadiness').setAttribute('data-warning', String(view.warning));
  $('executionReadiness').setAttribute('data-checking', String(readinessPending));
  $('readinessCheck')?.setAttribute('aria-hidden', String(!readinessPending));
  if (readinessSnapshot) {
    const snapshot = readinessSnapshot;
    readinessExpiry = setTimeout(() => { if (readinessSnapshot === snapshot) renderReadiness(cachedReadiness()); }, checkedAt + 30001 - now);
  }
}
function invalidateReadiness() {
  readinessRequest++; readinessPending = false; readinessReadAt = 0;
  renderReadiness(null);
}
async function refreshReadiness(force = false) {
  if (submitting || stopping || takingControl || handoffPending) return;
  if (!force && (readinessPending || Date.now() - readinessReadAt < 10000)) return;
  const request = ++readinessRequest, epoch = previewEpoch;
  readinessPending = true; renderReadiness(cachedReadiness());
  try {
    const value = await api('/api/execution-status', undefined, { cache: 'no-store', signal: AbortSignal.timeout(7000) });
    if (request === readinessRequest && epoch === previewEpoch) renderReadiness(value);
  } catch { if (request === readinessRequest && epoch === previewEpoch) renderReadiness(null); }
  finally { if (request === readinessRequest) { readinessPending = false; readinessReadAt = Date.now(); renderReadiness(cachedReadiness()); } }
}
function renderReportStatus(snapshot, status, url) {
  const link = $('results');
  link.hidden = status !== 'available';
  if (status === 'available') {
    if (link.getAttribute('href') !== url) link.setAttribute('href', url);
  } else if (link.hasAttribute('href')) link.removeAttribute('href');
  const notice = evidenceNotice(snapshot, status);
  setText($('progressEvidenceNotice'), notice); $('progressEvidenceNotice').hidden = !notice;
}
function updateReport(current, snapshot, requestedId, epoch) {
  if (!requestedId || !canCheckFinalReport(current)) {
    reportCheck = null; renderReportStatus(snapshot, 'not_ready', ''); return;
  }
  const key = `${basePath}:${requestedId}:${epoch}`;
  if (reportCheck?.key !== key) reportCheck = { key, status: 'not_ready', pending: false, snapshot };
  const check = reportCheck, url = appPath(`/api/jobs/${requestedId}/results/final-report.md`);
  check.snapshot = snapshot;
  // Keep the same run's last checked link/notice during a bounded background HEAD.
  renderReportStatus(snapshot, check.status, url);
  if (check.pending) return;
  check.pending = true;
  void finalReportAvailability(current, () => fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(5000) })).then(status => {
    check.pending = false;
    if (reportCheck !== check || requestedId !== jobId || epoch !== previewEpoch) return;
    if (!canCheckFinalReport(job)) { reportCheck = null; renderReportStatus(check.snapshot, 'not_ready', ''); return; }
    check.status = status;
    renderReportStatus(check.snapshot, status, url);
  });
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
  const select = $('jobSelect'), value = jobId || '';
  if (select.children.length !== 1 || select.children[0].value !== value) select.replaceChildren(Object.assign(node('option', label), { value }));
  else setText(select.children[0], label);
  select.value = value;
  select.disabled = true;
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
    completionTitle: 'No results yet', completionCount: '0 progress notes',
    completionMark: '•', outcomeSummary: '', pendingTitle: 'Remaining / blocked',
    browserStatus: 'BROWSER STOPPED', owner: 'USER CONTROL',
  };
  for (const [id, text] of Object.entries(blank)) $(id).textContent = text;
  resultDisclosures.clear(); resultRows.clear(); resultRenderKey = ''; resultJobId = null; reportCheck = null;
  $('resultsHeading').textContent = 'Progress'; $('runtimeDetails').hidden = false;
  for (const name of ['changed', 'pending', 'existing', 'excluded', 'legacy']) { $(`${name}Plain`).replaceChildren(); $(`${name}Section`).hidden = true; $(`${name}Section`).open = false; }
  $('plainResults').hidden = true; $('previewTechnical').hidden = true; $('previewTechnicalList').replaceChildren();
  $('technicalResults').hidden = true; $('technicalResults').open = false;
  progressEvidence.clear();
  $('progressEvidenceNotice').textContent = ''; $('progressEvidenceNotice').hidden = true;
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
  message('Current RR context changed. Check Execution readiness before Return; historical files and spending remain.');
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
    const requestedId = jobId, epoch = previewEpoch, refreshId = ++refreshSequence;
    // Read the server's context before following cached job/workbook pointers.
    const runtime = await api('/api/runtime');
    if (requestedId !== jobId || epoch !== previewEpoch || refreshId !== refreshSequence) return;
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
    const [current, snapshot] = await Promise.all([
      requestedId ? api(`/api/jobs/${requestedId}`) : Promise.resolve(null),
      progressEvidence.load(requestedId ? `${basePath}:${requestedId}` : null,
        () => api(`/api/jobs/${requestedId}/results/state.json`, undefined, { signal: AbortSignal.timeout(5000) })),
    ]);
    if (requestedId !== jobId || epoch !== previewEpoch || refreshId !== refreshSequence) return;
    job = current;
    const progress = snapshot.state, checkpoints = requirementProgress(progress);
    let outcome = runOutcome(job, checkpoints, progress?.completionPolicy);
    if (snapshot.stale && outcome) outcome = { ...outcome, complete: false, icon: '!', label: 'Progress unavailable · saved run retained', summary: snapshot.warning, remaining: 'unconfirmed' };
    // Independent single-flight report checks must not blink or starve behind the 2s poll.
    updateReport(current, snapshot, requestedId, epoch);
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
      : ended ? job.modelFailure?.message || job.stopReason || 'See the results below.'
      : executing ? reportedAction ? `Agent-reported: ${reportedAction}` : job.executionActivity ? `${job.executionActivity.at} · ${job.executionActivity.message}` : "Native Pi is working; saved results require separate verification."
      : job?.lastStartError || progress.currentAction || "Upload an RR and name the event you started.";
    $("agentReply").textContent = executing ? "" : job?.lastAssistantText || job?.intake?.summary || "";
    $("question").textContent = job?.lastAssistantText || "";
    const spendingMode = runtime.budget?.spendingLimitEnabled === false ? "no spending stop" : "spending guard active";
    $("cost").textContent = runtime.budget?.resetId && !active()
      ? `${money(runtime.budget.spentUSD)} tracked since reset · ${spendingMode}${job ? ` · ${money(job.piCostUSD)} selected run` : ""}`
      : job ? `${money(job.piCostUSD)} this run · ${money(job.totalEventCostUSD)} including prior spending · ${spendingMode}` : `No current run · prior spending retained · ${spendingMode}`;
    renderCurrentRun(outcome?.label);
    const pending = outcome?.notes || checkpoints.pending;
    $('outcomeSummary').hidden = !outcome;
    $('outcomeSummary').textContent = outcome?.summary || '';
    $('pendingTitle').textContent = outcome?.heading || 'Remaining / blocked';
    $('completionMark').textContent = outcome?.icon || '•';
    $('resultsHeading').textContent = outcome ? 'Results' : 'Progress';
    $('runtimeDetails').hidden = !!outcome && !job.modelFailure && !['STOPPED', 'STOPPED_REQUIRES_REVIEW'].includes(job.status);
    const displayedResults = renderNaturalResults(progress, checkpoints, outcome);
    renderList("completed", checkpoints.completed); renderList("pending", pending);
    renderList("excluded", checkpoints.excluded);
    $("excludedProgress").hidden = !checkpoints.excluded.length;
    renderList("activity", Array.isArray(job?.activity) ? job.activity.slice(-100).reverse().map(entry => `${entry.at} · ${entry.message}`) : list(progress.activity).slice(-10).reverse());
    const count = checkpoints.completed.length;
    $("completionTitle").textContent = outcome?.label || (count ? "Progress" : "No results yet");
    $("completionCount").textContent = snapshot.stale ? 'Progress unavailable · remaining work unconfirmed' : checkpoints.mode === 'requirements'
      ? displayedResults.verificationOnly.length
        ? `${displayedResults.changed.length} saved · ${displayedResults.existing.length} already correct in CVENT · ${displayedResults.attentionCount} ${displayedResults.attentionCount === 1 ? 'setting needs' : 'settings need'} attention · ${displayedResults.excluded.length} excluded`
        : `${checkpoints.changedCount} changed · ${checkpoints.existingCount} already correct in CVENT · ${typeof outcome?.remaining === 'string' ? 'work left: unknown' : `${outcome?.remaining ?? checkpoints.pending.length} left`} · ${checkpoints.excluded.length} excluded`
      : `${count} progress notes`;
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
      : 'Workspace cleared. No AI session was started.') + slotNote + ' Settled historical holds are retired for fresh runs; original evidence, saved Cvent changes and costs remain. Other workspaces are untouched.', result.sharedSlotStatus === 'REVIEW_REQUIRED');
  } catch (error) {
    $("rr").value = "";
    message(`${error.message}${file ? " · New RR was not selected. Your prior workbook, edits and target are retained. Any completed Stop remains in effect." : " · Clear was not confirmed. Your RR selection is retained; any completed Stop remains in effect."}`, true);
  }
  finally { submitting = false; await refresh(); }
}
$("newRR").onclick = () => newRR();
bindRrFileInput({
  zone: document.querySelector('.upload-zone'), input: $("rr"), document,
  isBusy: () => !historyReady || submitting || stopping || draftLoading || takingControl,
  onFile: file => newRR(file), onError: text => message(text, true),
});
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
  $('signOut').hidden = !localWorkspaces.sessionLogin;
  $('signOut').href = '/logout?next=' + encodeURIComponent(`/workspaces/${localWorkspaces.current}/`);
  $('signOut').onclick = event => { if (edits.size && !confirm('Leave this workspace and discard unsaved workbook edits? Signing out does not stop running builds.')) event.preventDefault(); };
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderReadiness(cachedReadiness()); });
let refreshTicks = 0;
// These are local UI reads, never Pi calls. Waiting/idle refresh is only every 10s.
setInterval(() => {
  if (submitting || (active() && job.phase !== "AWAITING_INPUT") || ++refreshTicks % 5 === 0) void refresh();
}, 2000);
