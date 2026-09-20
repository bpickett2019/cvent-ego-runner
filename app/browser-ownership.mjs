import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
function save(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, path);
}
export function sameBrowser(actual, expected) {
  return ['runtimeId', 'steelSessionId', 'activeTargetId'].every(key =>
    typeof expected?.[key] === 'string' && expected[key] && actual?.[key] === expected[key]);
}
// Synchronous compare-and-write: no await can interleave Stop with a stale
// handoff grant in this single connection process. Not a multi-process lease.
export function transitionBrowser(path, expected, ownerships, patch, cancelled = () => false) {
  const current = read(path);
  if (cancelled() || !sameBrowser(current, expected) || !ownerships.includes(current.ownership)) {
    throw new Error('Browser handoff cancelled or assigned ownership changed');
  }
  const next = { ...current, ...patch };
  save(path, next);
  return next;
}
export function revokeJobBrowser(root, record) {
  const jobPath = join(record.workspace, 'runtime.json');
  const currentPath = join(root, 'data/current/runtime.json');
  const failures = [];
  let assigned = record.browser;
  try {
    const runtime = read(jobPath);
    assigned ||= runtime;
    save(jobPath, { ...runtime, ownership: 'USER' });
  } catch { failures.push('Job browser revocation requires operator review'); }
  try {
    if (existsSync(currentPath)) {
      const current = read(currentPath);
      // During provisioning the job runtime may not yet have the new identity.
      const provisioning = !record.browser && current.jobId === record.id && current.runtimeId === record.id;
      if (sameBrowser(current, assigned) || provisioning) save(currentPath, { ...current, ownership: 'USER' });
    }
  } catch { failures.push('Shared browser revocation requires operator review'); }
  return failures;
}
