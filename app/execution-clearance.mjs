import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertProcessGone } from './event-history.mjs';
import { apiOperationBlocked } from './api-operation-lease.mjs';
import { historicalHoldRetired } from './fresh-reset.mjs';
import { evidencePresent, readSafetyEvidence, writeUncertainty } from './write-uncertainty.mjs';

// Distinguish resource/accounting proof from retained write uncertainty. The strict
// cleared predicate remains unchanged. A compatible gateway may release capacity
// on resourcesCleared ONLY with mandatory all-workspace event protection; it never
// treats that as saved-write reconciliation or clears this record's uncertainty.
export function executionSafety(root, id, processGone = assertProcessGone) {
  const resourceBlockers = new Set(), uncertaintyBlockers = new Set();
  let retired = false;
  const validId = typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
  try {
    if (!validId) throw new Error('Invalid job ID');
    const workspace = resolve(realpathSync(root), 'data/jobs', id);
    if (realpathSync(workspace) !== workspace) throw new Error('Invalid workspace');
    const record = readSafetyEvidence(workspace, 'job.json');
    if (!record || record.id !== id) throw new Error('Invalid record');
    if (record.phase !== 'SETTLED' || !['DONE', 'INCOMPLETE', 'STOPPED'].includes(record.status) || !record.finishedAt) {
      // A live/unsettled owner is already ineligible. Dashboard observations must
      // not contend on its API guard or spawn process/lock probes just to say so.
      const uncertainty = writeUncertainty(workspace, record);
      return { version: 1, jobId: id, cleared: false, resourcesCleared: false, uncertaintyBlocked: uncertainty.blocked,
        resourceBlockers: ['JOB_NOT_SETTLED'], uncertaintyBlockers: uncertainty.reasons };
    }
    if (record.sessionPrepared !== false) resourceBlockers.add('NATIVE_SESSION_NOT_SETTLED');
    if (record.spendingUnreconciled !== false || !Number.isFinite(record.piCostUSD) || record.piCostUSD < 0) resourceBlockers.add('SPENDING_UNRECONCILED');
    if (!Array.isArray(record.stopFailures) || record.stopFailures.length) resourceBlockers.add('CLEANUP_UNCONFIRMED');
    try {
      if (record.ownedPid != null && (!Number.isInteger(record.ownedPid) || record.ownedPid <= 0)) throw new Error('Invalid process identity');
      processGone(record.ownedPid);
      // Native Pi owns a detached group; a surviving child must still block.
      if (record.ownedPid) processGone(-record.ownedPid);
    } catch { resourceBlockers.add('NATIVE_PROCESS_OR_GROUP_PRESENT'); }
    for (const directory of [workspace, join(root, 'data/current')]) {
      if (apiOperationBlocked(directory) || evidencePresent(join(directory, 'operation.lock'))) resourceBlockers.add('OPERATION_OWNERSHIP_UNCONFIRMED');
      const uncertainty = writeUncertainty(directory, directory === workspace ? record : {}, { reports: directory === workspace });
      for (const reason of uncertainty.reasons) uncertaintyBlockers.add(reason);
    }
    if (!Array.isArray(record.unresolvedChanges)) uncertaintyBlockers.add('UNCERTAINTY_EVIDENCE_UNAVAILABLE');
    if (readSafetyEvidence(workspace, 'runtime.json').ownership !== 'USER' || readSafetyEvidence(workspace, 'receipts/steel-cleanup.json').status !== 'STOPPED') resourceBlockers.add('BROWSER_CLEANUP_UNCONFIRMED');
    retired = historicalHoldRetired(workspace, record);
  } catch {
    resourceBlockers.add('RESOURCE_EVIDENCE_UNAVAILABLE');
    uncertaintyBlockers.add('UNCERTAINTY_EVIDENCE_UNAVAILABLE');
  }
  const resourcesCleared = resourceBlockers.size === 0, uncertaintyBlocked = uncertaintyBlockers.size > 0;
  return { version: 1, jobId: validId ? id : null, cleared: resourcesCleared && !uncertaintyBlocked,
    resourcesCleared, uncertaintyBlocked, historicalHoldRetired: resourcesCleared && retired,
    resourceBlockers: [...resourceBlockers], uncertaintyBlockers: [...uncertaintyBlockers] };
}

// Backward-compatible strict gate. No automatic reconciliation or claim mutation.
export function executionCleared(root, id, processGone = assertProcessGone) {
  return executionSafety(root, id, processGone).cleared;
}
