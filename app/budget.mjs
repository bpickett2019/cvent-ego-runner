import { existsSync, readFileSync, readdirSync, lstatSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const resetPath = jobsRoot => join(dirname(jobsRoot), 'budget-reset.json');
const validCost = n => Number.isFinite(n) && n >= 0;
// Operator-approved credits affect future budget accounting only. Historical
// native costs, uncertainty, process checks and preservation evidence stay intact.
export function budgetTotals(jobsRoot, records) {
  const path = resetPath(jobsRoot);
  let reset = null;
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 1_000_000) throw new Error('Budget reset requires reconciliation');
    reset = read(path);
    if (reset.version !== 1 || typeof reset.id !== 'string' || !reset.credits || Array.isArray(reset.credits) || typeof reset.credits !== 'object' || Object.values(reset.credits).some(n => !validCost(n))) throw new Error('Invalid budget reset');
  }
  let spentUSD = 0, historicalUSD = 0;
  for (const record of records) {
    if (!validCost(record.piCostUSD)) throw new Error('Prior spending unavailable');
    const credit = reset && Object.hasOwn(reset.credits, record.id) ? reset.credits[record.id] : 0;
    if (credit > record.piCostUSD) throw new Error('Historical cost changed after budget reset; reconcile before execution');
    historicalUSD += record.piCostUSD;
    spentUSD += record.piCostUSD - credit;
  }
  return { spentUSD, historicalUSD, resetId: reset?.id || null };
}
export function resetRunBudget(jobsRoot, reason) {
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('Explicit operator authorization reason required');
  const records = readdirSync(jobsRoot).map(id => join(jobsRoot, id, 'job.json')).filter(existsSync).map(read);
  for (const record of records) {
    if (['PREPARING','STARTING','RUNNING','STOPPING'].includes(record.status) || record.spendingUnreconciled || !validCost(record.piCostUSD)) throw new Error('Settle execution and spending before resetting the budget');
    if (record.ownedPid) {
      try { process.kill(record.ownedPid, 0); throw new Error('Native process still exists'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
  const receipt = { version: 1, id: randomUUID(), authorizedAt: new Date().toISOString(), reason, credits: Object.fromEntries(records.map(r => [r.id, r.piCostUSD])) };
  const path = resetPath(jobsRoot);
  // Each authorization is retained independently. Never delete job cost history.
  writeFileSync(join(dirname(jobsRoot), `budget-reset-${receipt.id}.json`), JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
  const temp = `${path}.${receipt.id}.tmp`;
  writeFileSync(temp, JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
  return { ...budgetTotals(jobsRoot, records), creditedJobs: records.length };
}
