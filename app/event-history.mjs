import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { budgetTotals } from './budget.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
export function assertProcessGone(pid) {
  if (!pid) return;
  try { process.kill(pid, 0); throw new Error('Prior Pi process still exists; Stop it before a new run'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

// History is app-side saved-result/billing evidence, never an executor task queue.
// piCostUSD is always this job's native session cost, so totals do not double count.
export function eventHistory(jobsRoot, currentId, target, policy) {
  const jobs = readdirSync(jobsRoot).filter(id => id !== currentId).map(id => {
    const workspace = join(jobsRoot, id), path = join(workspace, 'job.json');
    return existsSync(path) ? { workspace, record: read(path) } : null;
  }).filter(job => job && (job.record.target?.evtstub === target.evtstub || (!job.record.target && job.record.intakeOnly && job.record.piCostUSD > 0)));
  // Paid reading that stopped before target identification remains conservatively
  // charged to subsequent runs; a fresh upload cannot make that spending vanish.
  let priorEventCostUSD = 0, allowanceUSD = policy.allowanceUSD, externalCostReserveUSD = policy.externalCostReserveUSD;
  const evidence = [];
  for (const {workspace, record} of jobs) {
    if (['PREPARING', 'STARTING', 'RUNNING', 'STOPPING'].includes(record.status)) throw new Error('Prior event run is unsettled; Stop/reconcile it first');
    assertProcessGone(record.ownedPid);
    // Settled-run write reports are history, not prerequisites for this RR.
    // Only owned resources/unfinished operations and billing carry launch gates.
    if (record.spendingUnreconciled || record.stopFailures?.length || ['api-operation.lock','operation.lock'].some(file => existsSync(join(workspace,file)))) throw new Error('Prior process cleanup, operation locks or spending remain unsettled; finish cleanup before a new run');
    if (!Number.isFinite(record.piCostUSD) || record.piCostUSD < 0) throw new Error('Prior event spending unavailable');
    priorEventCostUSD += budgetTotals(jobsRoot, [record]).spentUSD;
    if (Number.isFinite(record.allowanceUSD)) allowanceUSD = Math.min(allowanceUSD, record.allowanceUSD);
    if (Number.isFinite(record.externalCostReserveUSD)) externalCostReserveUSD = Math.max(externalCostReserveUSD, record.externalCostReserveUSD);
    evidence.push({ jobId: record.id, status: record.status, sessionCostUSD: record.piCostUSD, sourceSha256: record.sha256, receipts: join(workspace,'receipts'), ...(existsSync(join(workspace,'reports/final-report.json')) ? { report: join(workspace,'reports/final-report.json') } : {}) });
  }
  return { priorEventCostUSD, allowanceUSD, externalCostReserveUSD, spendingLimitEnabled: false, evidence, budgetResetId: budgetTotals(jobsRoot, []).resetId };
}
