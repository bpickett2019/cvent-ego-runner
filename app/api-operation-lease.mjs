import { closeSync, constants, fstatSync, lstatSync, openSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('./api-flock.py', import.meta.url));
export const API_GUARD_FILE = 'api-operation.guard';
export const API_LOCK_PROTOCOL = 'kernel-flock-v1';
export class ApiOperationLeaseError extends Error {}
const blocked = () => new ApiOperationLeaseError('API operation ownership is active or unverified; retain evidence and do not bypass the hold');
function present(path) {
  try { return lstatSync(path, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw blocked(); }
}
function regular(stat) {
  return stat?.isFile() && stat.nlink === 1n && stat.size === 0n && (stat.mode & 0o077n) === 0n
    && typeof process.getuid === 'function' && stat.uid === BigInt(process.getuid());
}

// One persistent inode; NEVER unlink, rename, truncate or replace this guard.
// Python sets flock on an inherited reference to Node's open-file description.
// Its immediate exit leaves Node holding the lock; the kernel releases ownership
// when the last actual holder closes/exits, including SIGKILL. No daemon/recovery.
export function acquireApiLease(directory, { create = true, run = spawnSync } = {}) {
  if (present(join(directory, 'api-operation.lock'))) throw new ApiOperationLeaseError('Legacy api-operation.lock requires explicit reconciliation; it was not changed');
  const path = join(directory, API_GUARD_FILE), before = present(path);
  if (before && !regular(before)) throw blocked();
  if (!Number.isInteger(constants.O_NOFOLLOW) || !Number.isInteger(constants.O_NONBLOCK)) throw blocked();
  let fd;
  try {
    fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK | (create ? constants.O_CREAT : 0), 0o600);
    const initial = fstatSync(fd, { bigint: true });
    let released = false;
    const assertOwned = () => {
      if (released) throw blocked();
      const current = present(path), actual = fstatSync(fd, { bigint: true });
      if (!regular(current) || !regular(actual) || current.dev !== initial.dev || current.ino !== initial.ino
        || actual.dev !== initial.dev || actual.ino !== initial.ino || present(join(directory, 'api-operation.lock'))) throw blocked();
    };
    assertOwned();
    const result = run('python3', ['-I', helper], { env: { PATH: process.env.PATH || '' },
      stdio: ['ignore', 'pipe', 'pipe', fd], encoding: 'utf8', timeout: 5000, maxBuffer: 4096 });
    if (result.error || result.status !== 0 || result.stdout !== 'API_FLOCK_V1\n') throw blocked();
    assertOwned();
    return {
      assertOwned,
      release() { if (!released) { released = true; closeSync(fd); } },
    };
  } catch (error) {
    if (fd !== undefined) try { closeSync(fd); } catch { /* Never unlink another inode to compensate. */ }
    throw error instanceof ApiOperationLeaseError ? error : blocked();
  }
}

// Read-only inspection: probe only an existing guard, without creating files.
// A persistent guard's existence is NOT ownership. Legacy and unknown states
// remain blocked. Write uncertainty is intentionally handled separately by callers.
export function apiOperationBlocked(directory, options = {}) {
  try {
    if (present(join(directory, 'api-operation.lock'))) return true;
    if (!present(join(directory, API_GUARD_FILE))) return false;
    const lease = acquireApiLease(directory, { ...options, create: false });
    lease.release();
    return false;
  } catch { return true; }
}
