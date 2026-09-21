// One durable, non-expiring paid-build slot for the restricted staging gateway.
// A failed dispatch/restart never frees it. Only positive backend cleanup proof
// permits release; uncertainty requires an operator, not a timeout or retry.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createExecutionSlot({ directory, clearance }) {
  if (!directory || typeof clearance !== 'function') throw new Error('Execution slot configuration required');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'active.json');
  const sync = () => { const fd = openSync(directory, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } };
  const read = () => {
    if (!existsSync(path)) return null;
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (![1, 2, 3].includes(value.workspace) || !/^[0-9a-f-]{36}$/.test(value.jobId) || !/^[0-9a-f-]{36}$/.test(value.claimId)) throw new Error('Shared slot needs operator reconciliation');
    return value;
  };
  let tail = Promise.resolve();
  return { authorize(workspace, raw, method) {
    const action = async () => {
      if (['GET', 'HEAD'].includes(method)) return;
      // Express routes are case-insensitive and tolerate a trailing slash. Use a
      // canonical mutation allowlist so alternate spellings cannot evade gating.
      if (method !== 'POST' || !/^\/api\/(?:jobs|new-rr|take-control|workbooks|workbooks\/[0-9a-f-]{36}\/save|jobs\/[0-9a-f-]{36}\/(?:read|stop|answer|rpc|start|continue))$/.test(raw)) throw new Error('Use the canonical login-first workspace controls');
      const match = /^\/api\/jobs\/([0-9a-f-]{36})\/(answer|rpc|start|continue)$/.exec(raw);
      if (!match) return; // Upload, browser preview, human control and Stop work independently.
      const [, jobId, operation] = match;
      if (['start', 'continue'].includes(operation)) throw new Error('Only fresh login-first builds are enabled');
      let held = read();
      if (operation === 'rpc') {
        if (!held || held.workspace !== workspace || held.jobId !== jobId) throw new Error('This job does not own the shared execution slot');
        return;
      }
      if (held) {
        let clear = false;
        try { clear = await clearance(held) === true; } catch { /* Offline/ambiguous means held. */ }
        if (!clear) throw new Error('Another build holds the shared slot; Stop it and verify cleanup, or ask the operator to reconcile uncertainty');
        const latest = read();
        if (latest?.claimId !== held.claimId) throw new Error('Shared slot changed; request refused');
        renameSync(path, join(directory, `${held.claimId}.released.json`)); sync();
      }
      held = { version: 1, claimId: randomUUID(), workspace, jobId, acquiredAt: new Date().toISOString() };
      const fd = openSync(path, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify(held) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
      sync(); // Durable intent precedes forwarding. No automatic replay on any failure.
    };
    const result = tail.then(action); tail = result.catch(() => {}); return result;
  } };
}
