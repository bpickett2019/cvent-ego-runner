import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { budgetTotals } from './budget.mjs';
import { apiOperationBlocked } from './api-operation-lease.mjs';
import { evidencePresent, readSafetyEvidence, writeUncertainty } from './write-uncertainty.mjs';
export function assertProcessGone(pid) {
  if (!pid) return;
  try { process.kill(pid, 0); throw new Error('Prior Pi process still exists; Stop it before a new run'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

// History is app-side saved-result/billing evidence, never an executor task queue.
// piCostUSD is always this job's native session cost, so totals do not double count.
export function eventHistory(jobsRoot, currentId, target, policy) {
  const root = realpathSync(jobsRoot);
  const jobs = readdirSync(root).filter(id => id !== currentId).map(id => {
    const workspace = join(root, id);
    let record;
    try {
      if (realpathSync(workspace) !== workspace) throw new Error('Linked job');
      record = evidencePresent(join(workspace, 'job.json')) ? readSafetyEvidence(workspace, 'job.json') : null;
      if (record !== null && (typeof record !== 'object' || Array.isArray(record) || record.id !== id)) throw new Error('Invalid job');
    } catch { throw new Error('Prior event safety evidence unavailable; operator review required'); }
    const uncertainty = writeUncertainty(workspace, record || {});
    const ids = [record?.target?.apiEventId, record?.target?.evtstub].filter(value => value !== undefined);
    const bound = ids.length && ids.every(value => typeof value === 'string' && value.length) && new Set(ids).size === 1 ? ids[0] : null;
    // Unknown/conflicting identity cannot be scoped away. Event UUID, not name,
    // binds the hold; new uploads/accounting resets never erase it or replay it.
    if (uncertainty.blocked && (!bound || bound === target.apiEventId || bound === target.evtstub)) {
      const owner = /^[0-9a-f-]{36}$/.test(id) ? id : '(unidentified historical run)';
      throw new Error(`Prior run ${owner} has unresolved write/operation evidence for this event or an unconfirmed event identity. Read-only reconciliation is required; no new AI started and no holds were cleared.`);
    }
    return record ? { workspace, record } : null;
  }).filter(job => job && ([target.apiEventId, target.evtstub].filter(Boolean).some(id => id === job.record.target?.apiEventId || id === job.record.target?.evtstub) || (!job.record.target && job.record.intakeOnly && job.record.piCostUSD > 0)));
  // Paid reading that stopped before target identification remains conservatively
  // charged to subsequent runs; a fresh upload cannot make that spending vanish.
  let priorEventCostUSD = 0, allowanceUSD = policy.allowanceUSD, externalCostReserveUSD = policy.externalCostReserveUSD;
  const evidence = [];
  for (const {workspace, record} of jobs) {
    if (['PREPARING', 'STARTING', 'RUNNING', 'STOPPING'].includes(record.status)) throw new Error('Prior event run is unsettled; Stop/reconcile it first');
    assertProcessGone(record.ownedPid);
    // Settled plans remain evidence, never a new task. Unresolved saved effects
    // were checked above independently of process cleanup and accounting.
    if (record.spendingUnreconciled || record.stopFailures?.length || apiOperationBlocked(workspace) || existsSync(join(workspace,'operation.lock'))) throw new Error('Prior process cleanup, operation locks or spending remain unsettled; finish cleanup before a new run');
    if (!Number.isFinite(record.piCostUSD) || record.piCostUSD < 0) throw new Error('Prior event spending unavailable');
    priorEventCostUSD += budgetTotals(jobsRoot, [record]).spentUSD;
    if (Number.isFinite(record.allowanceUSD)) allowanceUSD = Math.min(allowanceUSD, record.allowanceUSD);
    if (Number.isFinite(record.externalCostReserveUSD)) externalCostReserveUSD = Math.max(externalCostReserveUSD, record.externalCostReserveUSD);
    evidence.push({ jobId: record.id, status: record.status, sessionCostUSD: record.piCostUSD, sourceSha256: record.sha256, receipts: join(workspace,'receipts'), ...(existsSync(join(workspace,'reports/final-report.json')) ? { report: join(workspace,'reports/final-report.json') } : {}) });
  }
  return { priorEventCostUSD, allowanceUSD, externalCostReserveUSD, spendingLimitEnabled: false, evidence, budgetResetId: budgetTotals(jobsRoot, []).resetId };
}
