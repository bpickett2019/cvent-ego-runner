import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

// Bounded private evidence inspection only. No marker mutation, reconciliation,
// replay or raw evidence/message exposure. Dangling links and unreadable data block.
export function evidencePresent(path) {
  try { lstatSync(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export function readSafetyEvidence(workspace, relative) {
  const path = join(realpathSync(workspace), relative), stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.size > 1_000_000) throw new Error('Safety evidence unavailable');
  return JSON.parse(readFileSync(path, 'utf8'));
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function writeUncertainty(workspace, record = {}, { reports = true } = {}) {
  const reasons = new Set();
  try {
    if (!object(record)) throw new Error('Invalid job evidence');
    if (record.unresolvedChanges !== undefined) {
      if (!Array.isArray(record.unresolvedChanges)) throw new Error('Invalid tool evidence');
      if (record.unresolvedChanges.length) reasons.add('UNRESOLVED_TOOLS');
    }
    if (record.apiUnresolved) reasons.add('API_WRITE_UNCERTAIN');
    if (record.browserFailureGuard != null) {
      if (!object(record.browserFailureGuard) || typeof record.browserFailureGuard.executionUncertain !== 'boolean') throw new Error('Invalid browser evidence');
      if (record.browserFailureGuard.executionUncertain) reasons.add('BROWSER_EXECUTION_UNCERTAIN');
    }
    for (const [file, reason] of [['api-write-uncertain.json', 'API_WRITE_UNCERTAIN'], ['browser-save-uncertain.json', 'BROWSER_SAVE_UNCERTAIN']]) {
      if (evidencePresent(join(workspace, file))) reasons.add(reason);
    }
    if (reports) {
      const reportDirectory = join(realpathSync(workspace), 'reports');
      if (evidencePresent(reportDirectory) && (!lstatSync(reportDirectory).isDirectory() || realpathSync(reportDirectory) !== reportDirectory)) throw new Error('Invalid report directory');
      if (evidencePresent(join(workspace, 'unresolved-changes.json'))) {
        const value = readSafetyEvidence(workspace, 'unresolved-changes.json');
        const groups = Array.isArray(value) ? [value] : object(value) ? [value.changes, value.uncertainWrites].filter(v => v !== undefined) : [];
        if (!groups.length || groups.some(v => !Array.isArray(v))) throw new Error('Invalid unresolved-change evidence');
        if (groups.some(v => v.length)) reasons.add('UNRESOLVED_CHANGES');
      }
      if (evidencePresent(join(workspace, 'reports/final-report.json'))) {
        const report = readSafetyEvidence(workspace, 'reports/final-report.json');
        if (!object(report) || (report.uncertainWrites !== undefined && !Array.isArray(report.uncertainWrites))) throw new Error('Invalid report evidence');
        if (report.uncertainWrites?.length) reasons.add('REPORT_UNCERTAINTY');
      }
    }
  } catch { reasons.add('UNCERTAINTY_EVIDENCE_UNAVAILABLE'); }
  return { blocked: reasons.size > 0, reasons: [...reasons] };
}
