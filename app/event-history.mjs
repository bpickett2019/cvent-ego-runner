import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
export function assertProcessGone(pid) {
  if (!pid) return;
  try { process.kill(pid, 0); throw new Error('Prior Pi process still exists; Stop it before a new run'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

// History is saved-result/billing evidence, never a previous conversation.
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
    const uncertainty = join(workspace, 'unresolved-changes.json');
    const unresolved = existsSync(uncertainty) ? read(uncertainty) : null;
    // Native Pi may report a top-level list or either documented object shape.
    // Never let a nonempty uncertainty report become permission for a fresh run.
    const uncertainWrites = Array.isArray(unresolved) ? unresolved : unresolved?.uncertainWrites ?? unresolved?.changes ?? [];
    if (!Array.isArray(uncertainWrites)) throw new Error('Prior uncertainty report needs reconciliation');
    if (record.spendingUnreconciled || record.stopFailures?.length || record.unresolvedChanges?.length || record.apiUnresolved || ['api-write-uncertain.json','api-operation.lock','operation.lock'].some(file => existsSync(join(workspace,file))) || uncertainWrites.length) throw new Error('Prior event has uncertain operations or spending; reconcile before a new run');
    if (!Number.isFinite(record.piCostUSD) || record.piCostUSD < 0) throw new Error('Prior event spending unavailable');
    priorEventCostUSD += record.piCostUSD;
    if (Number.isFinite(record.allowanceUSD)) allowanceUSD = Math.min(allowanceUSD, record.allowanceUSD);
    if (Number.isFinite(record.externalCostReserveUSD)) externalCostReserveUSD = Math.max(externalCostReserveUSD, record.externalCostReserveUSD);
    evidence.push({ jobId: record.id, status: record.status, sessionCostUSD: record.piCostUSD, sourceSha256: record.sha256, receipts: join(workspace,'receipts'), ...(existsSync(join(workspace,'reports/final-report.json')) ? { report: join(workspace,'reports/final-report.json') } : {}) });
  }
  if (priorEventCostUSD >= allowanceUSD - externalCostReserveUSD) throw new Error('Cumulative event spending reached the execution budget; a new upload cannot reset it');
  return { priorEventCostUSD, allowanceUSD, externalCostReserveUSD, evidence };
}
