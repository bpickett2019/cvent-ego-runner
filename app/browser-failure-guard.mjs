import { lstatSync } from 'node:fs';
import { join } from 'node:path';

// Presence in this controller-owned job workspace is authoritative, not shell stdout.
// Never follow/read a marker symlink or expose its contents. Inspection errors fail closed.
export function hasBrowserSaveUncertainty(workspace) {
  try { lstatSync(join(workspace, 'browser-save-uncertain.json')); return true; }
  catch (error) { return error.code !== 'ENOENT'; }
}

// Conservative single-run circuit breaker, not a progress/completion detector.
// Inspect private failures locally; return only fixed metadata, never their text.
export const BROWSER_FAILURE_WINDOW_MS = 10 * 60 * 1000;
export const BROWSER_FAILURE_LIMIT = 3;
export function classifyBrowserFailure(event) {
  if (event?.type !== 'tool_execution_end' || event.toolName !== 'bash' || event.isError !== true) return null;
  const content = Array.isArray(event.result?.content) ? event.result.content : [];
  const text = content.slice(0, 64).filter(c => c?.type === 'text' && typeof c.text === 'string')
    .map(c => c.text.length > 16384 ? c.text.slice(0, 8192) + '\n' + c.text.slice(-8192) : c.text).join('\n');
  if (/BrowserSaveUncertainError:/.test(text)) return 'EXECUTION_UNCERTAIN';
  if (/(?:^|\n)PageEvaluationTimeoutError:/m.test(text) && /execution could not be confirmed stopped|mayHaveLateEffects["']?\s*[:=]\s*true/i.test(text)) return 'EXECUTION_UNCERTAIN';
  if (/(?:^|\n)(?:ElementResolutionError|StaleElementReferenceError):/m.test(text)) return 'ELEMENT_RESOLUTION';
  if (/(?:^|\n)(?:PageEvaluationTimeoutError:|CdpRequestTimeoutError:|Error: (?:snapshot: CDP request timed out|page\.(?:reload|goto) timed out))/m.test(text)) return 'BROWSER_UNRESPONSIVE';
  return null;
}
export class BrowserFailureGuard {
  constructor() { this.failures = []; }
  observe(event, now = Date.now(), { saveUncertain = false } = {}) {
    const category = saveUncertain ? 'EXECUTION_UNCERTAIN' : classifyBrowserFailure(event);
    // Ordinary selector failures belong to Pi's recovery, not a global Stop quota.
    if (!category || category === 'ELEMENT_RESOLUTION') return null;
    // Successful snapshots do not establish recovery from renderer/CDP failures.
    this.failures = this.failures.filter(f => now - f.at <= BROWSER_FAILURE_WINDOW_MS);
    if (!saveUncertain && event?.toolCallId && this.failures.some(f => f.id === event.toolCallId)) return null;
    this.failures.push({ at: now, id: event?.toolCallId });
    this.failures = this.failures.slice(-BROWSER_FAILURE_LIMIT);
    const executionUncertain = category === 'EXECUTION_UNCERTAIN';
    const tripped = executionUncertain || this.failures.length >= BROWSER_FAILURE_LIMIT;
    return { category, failuresInWindow: this.failures.length, windowMs: BROWSER_FAILURE_WINDOW_MS,
      at: new Date(now).toISOString(), executionUncertain, tripped,
      stopReason: saveUncertain ? 'Browser save outcome is uncertain; preserve the current-run marker and reconcile without replay'
        : executionUncertain ? 'Browser execution could not be confirmed stopped; review possible late effects before any new run'
        : tripped ? 'Browser failure circuit breaker: 3 unresponsive-browser failures within 10 minutes; review before spending on another run' : null };
  }
}
