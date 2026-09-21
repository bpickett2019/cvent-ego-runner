import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertProcessGone } from './event-history.mjs';

// Positive cleanup proof only. No expiry, historical-marker clearance or replay.
export function executionCleared(root, id, processGone = assertProcessGone) {
  try {
    if (!/^[0-9a-f-]{36}$/.test(id)) return false;
    const workspace = resolve(realpathSync(root), 'data/jobs', id);
    if (realpathSync(workspace) !== workspace) return false;
    const read = name => JSON.parse(readFileSync(join(workspace, name), 'utf8'));
    const record = read('job.json');
    if (record.id !== id || record.phase !== 'SETTLED' || !['DONE', 'INCOMPLETE', 'STOPPED'].includes(record.status)
      || !record.finishedAt || record.sessionPrepared !== false || record.spendingUnreconciled !== false
      || !Number.isFinite(record.piCostUSD) || record.piCostUSD < 0
      || !Array.isArray(record.stopFailures) || record.stopFailures.length
      || !Array.isArray(record.unresolvedChanges) || record.unresolvedChanges.length || record.apiUnresolved
      || record.browserFailureGuard?.executionUncertain) return false;
    processGone(record.ownedPid);
    for (const directory of [workspace, join(root, 'data/current')]) {
      if (['operation.lock', 'api-operation.lock', 'api-write-uncertain.json', 'browser-save-uncertain.json'].some(name => existsSync(join(directory, name)))) return false;
    }
    if (existsSync(join(workspace, 'unresolved-changes.json'))) {
      const unresolved = read('unresolved-changes.json');
      const groups = Array.isArray(unresolved) ? [unresolved] : [unresolved?.changes, unresolved?.uncertainWrites].filter(v => v !== undefined);
      if (!groups.length || groups.some(v => !Array.isArray(v) || v.length)) return false;
    }
    if (existsSync(join(workspace, 'reports/final-report.json'))) {
      const report = read('reports/final-report.json');
      if (report.uncertainWrites !== undefined && (!Array.isArray(report.uncertainWrites) || report.uncertainWrites.length)) return false;
    }
    return read('runtime.json').ownership === 'USER' && read('receipts/steel-cleanup.json').status === 'STOPPED';
  } catch { return false; }
}
