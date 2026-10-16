import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { evidencePresent, readSafetyEvidence, writeUncertainty } from './write-uncertainty.mjs';

const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['job.json', 'runtime.json', 'receipts/steel-cleanup.json', 'api-write-uncertain.json', 'browser-save-uncertain.json', 'unresolved-changes.json', 'reports/final-report.json'];
const fail = () => { throw new Error('Fresh reset requires settled resources and readable, event-bound evidence; no historical hold was retired'); };
const sync = path => { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } };
function eventId(record) {
  const ids = [record?.target?.apiEventId, record?.target?.evtstub].filter(v => v !== undefined);
  if (!ids.length || !ids.every(uuid) || new Set(ids).size !== 1) fail();
  return ids[0];
}
function fingerprint(workspace) {
  return hash(JSON.stringify(files.map(file => {
    const path = join(workspace, file);
    if (!evidencePresent(path)) return [file, null];
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.size > 1_000_000) fail();
    return [file, hash(readFileSync(path))];
  })));
}

// This is an explicit operator reset acknowledgement, NOT saved-result proof.
// Only a receipt referenced by the atomically committed RR context is effective.
// Old markers, jobs, costs and sessions are never modified. Changed evidence
// invalidates the acknowledgement; executionSafety separately rechecks resources.
export function historicalHoldRetired(workspace, record) {
  try {
    if (!uuid(record?.id) || basename(workspace) !== record.id || realpathSync(workspace) !== workspace) return false;
    const root = dirname(dirname(dirname(workspace))), data = join(root, 'data');
    if (!evidencePresent(join(data, 'rr-context.json'))) return false;
    const context = readSafetyEvidence(data, 'rr-context.json');
    if (!uuid(context.freshResetId) || !uuid(context.id)) return false;
    const receipt = readSafetyEvidence(data, `fresh-resets/${context.freshResetId}.json`);
    if (receipt.version !== 1 || receipt.action !== 'CLEAR_NEW_RR' || receipt.id !== context.freshResetId || receipt.workspaceKey !== hash(realpathSync(root)) || receipt.savedResultVerified !== false || receipt.oldSessionResumable !== false || !Array.isArray(receipt.holds) || receipt.holds.length > 1000 || new Set(receipt.holds.map(h => h.jobId)).size !== receipt.holds.length) return false;
    const entry = receipt.holds.find(h => h.jobId === record.id);
    return !!entry && entry.eventId === eventId(record) && entry.fingerprint === fingerprint(workspace);
  } catch { return false; }
}

// Called synchronously only after Stop/drain/context checks. The returned receipt
// is inert until resetContext commits its ID; failed uploads never call this.
export function prepareFreshReset(root, safety) {
  root = realpathSync(root);
  const jobs = join(root, 'data/jobs'), current = join(root, 'data/current');
  if (realpathSync(jobs) !== jobs || typeof safety !== 'function') fail();
  if (writeUncertainty(current, {}, { reports: false }).blocked) fail();
  const ids = readdirSync(jobs);
  if (ids.length > 1000 || !ids.every(uuid)) fail();
  const holds = [];
  for (const id of ids.sort()) {
    const workspace = join(jobs, id);
    if (realpathSync(workspace) !== workspace) fail();
    const record = readSafetyEvidence(workspace, 'job.json');
    if (record?.id !== id) fail();
    const uncertainty = writeUncertainty(workspace, record);
    if (!uncertainty.blocked) continue;
    if (uncertainty.reasons.includes('UNCERTAINTY_EVIDENCE_UNAVAILABLE')) fail();
    const bound = eventId(record), before = fingerprint(workspace);
    const proof = safety(root, id);
    if (proof?.jobId !== id || proof.resourcesCleared !== true || !Array.isArray(proof.resourceBlockers) || proof.resourceBlockers.length || before !== fingerprint(workspace)) fail();
    holds.push({ jobId: id, eventId: bound, fingerprint: before });
  }
  const id = randomUUID(), directory = join(root, 'data/fresh-resets');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== directory) fail();
  const receipt = { version: 1, id, action: 'CLEAR_NEW_RR', at: new Date().toISOString(), workspaceKey: hash(root), savedResultVerified: false, oldSessionResumable: false, holds };
  const path = join(directory, `${id}.json`);
  writeFileSync(path, JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
  sync(path); sync(directory);
  return { id, count: holds.length };
}
