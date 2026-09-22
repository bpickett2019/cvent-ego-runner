import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

// Executes in the page. Only visible DOM signals; no click, navigation or fetch.
export function readSaveSignals({ pendingSelector, completionSelector, rejectionSelector, validationSelector } = {}) {
  const visible = element => !!element && element.getClientRects().length > 0 && element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !== false && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none' && getComputedStyle(element).opacity !== '0';
  const matches = selector => {
    if (!selector) return [];
    try { return [...document.querySelectorAll(selector)].filter(visible); }
    catch (error) {
      if (error.name === 'SyntaxError') throw Error('Save selector is not a valid selector for querySelectorAll; use standard CSS, not Ego locators');
      throw error;
    }
  };
  if (!document.body || document.readyState === 'loading') throw Error('SaveDocumentNotReady');
  const pendingNodes = matches(pendingSelector);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node, saving = false;
  while ((node = walker.nextNode())) {
    if (/^saving(?:\s+changes)?\s*(?:\.{3}|…)?$/i.test(node.textContent.trim()) && visible(node.parentElement)) { saving = true; break; }
  }
  const complete = matches(completionSelector), rejected = matches(rejectionSelector);
  if (complete.length > 1 || rejected.length > 1) throw Error('Ambiguous save outcome selector');
  return { pending: saving || pendingNodes.length > 0, completionVisible: complete.length === 1, rejectionVisible: rejected.length === 1,
    validation: matches(validationSelector).slice(0, 8).map(element => (element.innerText || element.textContent || '').trim().slice(0, 500)).filter(Boolean) };
}

function validateOptions(options) {
  const allowed = ['pendingSelector', 'completionSelector', 'rejectionSelector', 'validationSelector', 'timeoutMs'];
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !allowed.includes(key)) || typeof options.completionSelector !== 'string' || !options.completionSelector.trim()) throw Error('observeSave requires an observed completionSelector (CSS)');
  for (const key of allowed.filter(key => key !== 'timeoutMs')) if (options[key] !== undefined && (typeof options[key] !== 'string' || !options[key].trim() || options[key].length > 1000)) throw Error('Invalid observed save selector');
  const timeoutMs = options.timeoutMs ?? 60000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw Error('Save observation timeout must be 1000–120000 ms');
  return timeoutMs;
}

// Fixed categories + a fingerprint, never raw page errors, selectors, URLs or tokens.
export function saveFailureDiagnostic(error, phase) {
  const message = String(error?.message || '').slice(0, 16384);
  const patterns = [
    ['EXECUTION_CONTEXT_DESTROYED', /Execution context was destroyed/],
    ['EXECUTION_CONTEXT_MISSING', /Cannot find context with specified id/],
    ['DOCUMENT_NOT_READY', /(?:^|\n)(?:Error: )?SaveDocumentNotReady(?:\n|$)/],
    ['AMBIGUOUS_SELECTOR', /Ambiguous save outcome selector/],
    ['INVALID_SELECTOR', /not a valid selector|invalid selector|querySelectorAll.*SyntaxError/i],
    ['CONFLICTING_SIGNALS', /Conflicting save outcome signals/],
    ['OBSERVATION_DEADLINE', /Save outcome remained unknown within bounded observation/],
    ['CONTROL_OR_IDENTITY_LOST', /lost ownership or identity|lost assigned event\/page|Job stopped|Existing uncertainty/],
    ['DISCONNECTED_OR_CRASHED', /disconnected|closed|crashed|target is missing/i],
    ['INVALID_OBSERVATION', /Invalid save observation/],
  ];
  const category = patterns.find(([, pattern]) => pattern.test(message))?.[0] || 'UNCLASSIFIED_ERROR';
  return { phase, category, errorType: ['Error', 'TypeError', 'SyntaxError', 'CdpRequestTimeoutError', 'PageEvaluationTimeoutError'].includes(error?.name) ? error.name : 'OtherError',
    fingerprint: createHash('sha256').update(`${error?.name || 'Error'}\n${message}`).digest('hex') };
}

function assertObservation(last) {
  if (!last || typeof last.pending !== 'boolean' || typeof last.completionVisible !== 'boolean' || typeof last.rejectionVisible !== 'boolean' || !Array.isArray(last.validation)) throw Error('Invalid save observation');
  if (last.completionVisible && last.rejectionVisible) throw Error('Conflicting save outcome signals');
}

async function uncertain(onUncertain, evidence, cause) {
  let retained = true;
  try { await onUncertain({ reason: 'Save outcome unknown; no replay or further writes', ...evidence }); }
  catch { retained = false; }
  const diagnostic = saveFailureDiagnostic(cause, evidence.phase);
  const error = new Error(`Save outcome unknown; stop without replay (${diagnostic.phase}/${diagnostic.category}). ${retained ? 'Preserve evidence and independently reconcile.' : 'Evidence persistence also failed; do not continue.'}`);
  error.name = 'BrowserSaveUncertainError'; error.diagnostic = diagnostic;
  throw error;
}

export async function observeSave(page, options, { checkControl, onUncertain, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  if (!checkControl || !onUncertain) throw Error('Save observer requires bound safety hooks');
  const started = now(); let last = null, polls = 0, attempts = 0, transientReadFailures = 0, lastTransientFailure = null, phase = 'VALIDATE_OPTIONS';
  try {
    const timeoutMs = validateOptions(options);
    while (true) {
      phase = 'CONTROL_BEFORE_READ'; await checkControl();
      if (attempts && now() - started >= timeoutMs) { phase = 'DEADLINE'; throw Error('Save outcome remained unknown within bounded observation'); }
      phase = 'OBSERVE_DOM'; attempts++;
      let transient = false;
      try { last = await page.evaluate(readSaveSignals, options); polls++; }
      catch (error) {
        const diagnostic = saveFailureDiagnostic(error, phase);
        // Only retry this fixed read-only function, never an input or a control check.
        // Explicit late-effect/time-out errors, crashes and unknown errors stay fatal.
        if (!['EXECUTION_CONTEXT_DESTROYED', 'EXECUTION_CONTEXT_MISSING', 'DOCUMENT_NOT_READY'].includes(diagnostic.category) || error?.mayHaveLateEffects === true || /Timeout/.test(error?.name || '') || /disconnected|closed|crashed|timed out|could not be confirmed stopped/i.test(error?.message || '')) throw error;
        transient = true; transientReadFailures++; lastTransientFailure = diagnostic;
      }
      phase = 'CONTROL_AFTER_READ'; await checkControl();
      if (now() - started > timeoutMs) { phase = 'DEADLINE'; throw Error('Save outcome remained unknown within bounded observation'); }
      phase = 'VALIDATE_OBSERVATION';
      if (!transient) {
        assertObservation(last);
        if (!last.pending && (last.completionVisible || last.rejectionVisible)) return { status: last.rejectionVisible ? 'REJECTION_VISIBLE_NOT_VERIFIED' : 'COMPLETION_VISIBLE_NOT_VERIFIED', verified: false, ...last, polls, attempts, transientReadFailures, lastTransientFailure, elapsedMs: now() - started };
      }
      phase = 'DEADLINE';
      if (now() - started >= timeoutMs) throw Error('Save outcome remained unknown within bounded observation');
      await sleep(Math.min(1000, timeoutMs - (now() - started)));
    }
  } catch (error) {
    return uncertain(onUncertain, { schemaVersion: 2, phase, failure: saveFailureDiagnostic(error, phase), polls, attempts, transientReadFailures, lastTransientFailure, elapsedMs: now() - started, lastObservation: last }, error);
  }
}

// Convenience for grounded UI saves: preflight while still in edit state, click ONCE,
// then observe. Independent saved-value/relationship verification is still required.
export async function saveOnce(page, saveRef, options, hooks) {
  validateOptions(options);
  if (typeof saveRef !== 'string' || !saveRef.trim() || saveRef.length > 1000) throw Error('Expected an observed Save locator');
  if (!hooks?.checkControl || !hooks?.onUncertain) throw Error('Save requires bound safety hooks');
  await hooks.checkControl();
  await page.waitForSelector(saveRef, { state: 'visible', timeout: 5000 });
  const before = await page.evaluate(readSaveSignals, options);
  assertObservation(before);
  if (before.pending || before.completionVisible || before.rejectionVisible) throw Error('Save preflight requires an unambiguous edit state without a pending or prior outcome signal; no click dispatched');
  await hooks.checkControl();
  try { await page.click(saveRef); }
  catch (error) {
    return uncertain(hooks.onUncertain, { schemaVersion: 2, phase: 'SAVE_DISPATCH', failure: saveFailureDiagnostic(error, 'SAVE_DISPATCH'), polls: 0, attempts: 0, lastObservation: null }, error);
  }
  return observeSave(page, options, hooks);
}

export function saveObserverForHost(host, { submit = false } = {}) {
  return async (page, optionsOrRef, saveOptions) => {
    const workspace = dirname(host.runtimePath), marker = join(workspace, 'browser-save-uncertain.json');
    if (existsSync(marker) || existsSync(join(workspace, 'api-write-uncertain.json'))) throw Error('Existing uncertainty; do not reopen a stopped save');
    let initial;
    const onUncertain = async evidence => {
      // Never overwrite/clear another marker or historical evidence.
      try { await writeFile(marker, JSON.stringify({ ...evidence, runtimeId: initial?.runtimeId ?? null, eventId: initial?.apiEvent?.id ?? null, createdAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    };
    try { initial = await host.runtime(); }
    catch (error) {
      if (submit) throw error; // Preflight failed before any Save input.
      return uncertain(onUncertain, { schemaVersion: 2, phase: 'CONTROL_BASELINE', failure: saveFailureDiagnostic(error, 'CONTROL_BASELINE'), polls: 0, attempts: 0, lastObservation: null }, error);
    }
    const controlledRuntime = async () => {
      const current = await host.runtime();
      if (existsSync(marker) || existsSync(join(workspace, 'api-write-uncertain.json'))) throw Error('Existing uncertainty; do not reopen a stopped save');
      if (current.ownership !== 'AGENT' || ['runtimeId', 'activeTargetId', 'steelSessionId', 'expectedEvtstub', 'expectedEventName'].some(key => current[key] !== initial[key]) || !isDeepStrictEqual(current.apiEvent, initial.apiEvent)) throw Error('Save observation lost ownership or identity');
      if (existsSync(join(workspace, 'job.json')) && JSON.parse(await readFile(join(workspace, 'job.json'), 'utf8')).status !== 'RUNNING') throw Error('Job stopped');
      return current;
    };
    const checkControl = async () => {
      let current = await controlledRuntime();
      // Ego task.page(label) is lazy: targetId is unset until a Page operation.
      // Resolve through the documented read-only API, never by assigning an ID.
      if (page.targetId === undefined) {
        await page.info();
        current = await controlledRuntime(); // Stop/ownership/identity may change during the read.
      }
      const target = await host.activeTarget();
      const url = new URL(target.url), ids = [...url.pathname.matchAll(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/ig)].map(match => match[0]);
      for (const [key, value] of url.searchParams) if (key.toLowerCase() === 'evtstub') ids.push(value);
      if (url.protocol !== 'https:' || !['app.cvent.com', 'events.app.cvent.com'].includes(url.hostname) || url.username || url.password || url.port || !initial.expectedEvtstub || !ids.length || ids.some(id => id !== initial.expectedEvtstub) || initial.apiEvent?.id !== initial.expectedEvtstub || initial.apiEvent?.name !== initial.expectedEventName || page.targetId !== current.activeTargetId) throw Error('Save observation lost assigned event/page');
    };
    // Post-Save checks belong inside observeSave's uncertainty boundary, not outside it.
    const hooks = { checkControl, onUncertain };
    return submit ? saveOnce(page, optionsOrRef, saveOptions, hooks) : observeSave(page, optionsOrRef, hooks);
  };
}
