import { randomUUID } from 'node:crypto';
import { ExecutionSlotError } from './execution-slot.mjs';

const protocol = 'shared-event-safety-v1';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
export async function boundedJson(response) {
  if (!response.ok || !response.body) throw new Error('Inventory unavailable');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 16000) throw new Error('Inventory exceeds bound');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
// No caller-supplied event identity or cached all-clear. These are existing fixed
// loopback SSH upstreams, not arbitrary URLs or new authentication credentials.
export async function collectEventInventories({ ports, fetchImpl = fetch }) {
  try {
    if (!Array.isArray(ports) || ports.length !== 3 || new Set(ports).size !== 3 || ports.some(p => !Number.isInteger(p) || p < 1024 || p > 65535)) throw new Error('Invalid peers');
    return await Promise.all(ports.map(async (port, index) => {
      const response = await fetchImpl(`http://127.0.0.1:${port}/api/internal/event-holds`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      const inventory = await boundedJson(response);
      if (inventory?.protocol !== protocol || inventory.workspace !== index + 1 || inventory.enforced !== true || inventory.complete !== true ||
          !Array.isArray(inventory.holds) || inventory.holds.length > 100) throw new Error('Incompatible inventory');
      const holds = inventory.holds.map(hold => {
        if (!hold || (hold.jobId !== null && !uuid(hold.jobId)) || (hold.eventId !== null && !uuid(hold.eventId))) throw new Error('Ambiguous hold');
        return { jobId: hold.jobId, eventId: hold.eventId };
      });
      return { protocol, workspace: index + 1, enforced: true, complete: true, ...(inventory.eventLeasesEnforced === true ? { eventLeasesEnforced: true } : {}), holds };
    }));
  } catch { throw new ExecutionSlotError('SHARED_EVENT_SAFETY_UNAVAILABLE'); }
}
export async function collectEventSafety({ ports, workspace, jobId, operation, now = Date.now, fetchImpl = fetch }) {
  try {
    if (![1, 2, 3].includes(workspace) || !uuid(jobId) || !['answer', 'resume', 'rpc'].includes(operation)) throw new Error('Invalid handoff');
    const issuedAt = now(), inventories = await collectEventInventories({ ports, fetchImpl });
    const proof = { protocol, workspace, jobId, operation, nonce: randomUUID(), issuedAt, expiresAt: issuedAt + 120000, inventories };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    if (encoded.length > 8000 || now() >= proof.expiresAt) throw new Error('Proof unavailable');
    return encoded;
  } catch { throw new ExecutionSlotError('SHARED_EVENT_SAFETY_UNAVAILABLE'); }
}

// Read-only dashboard observation. No event lookup, grant/nonce, native RPC or
// slot release. Unknown/mixed-version evidence never becomes a readiness claim.
export async function readExecutionStatus({ slot, ports, workspace, concurrent = false, now = Date.now, fetchImpl = fetch }) {
  const mode = concurrent ? { version: 2, scope: 'workspace', workspace, maxConcurrent: 3 } : { version: 1, scope: 'shared' };
  const unknown = () => ({ ...mode, checkedAt: new Date(now()).toISOString(), capacity: 'UNKNOWN', holder: null,
    eventSafety: 'UNKNOWN', holdCount: null, owners: [] });
  try {
    const [state, inventories] = await Promise.all([slot.inspect(workspace), collectEventInventories({ ports, fetchImpl })]);
    if (!state.current() || concurrent && inventories.some(i => i.eventLeasesEnforced !== true)) return unknown();
    const holds = inventories.flatMap(inventory => inventory.holds.map(hold => ({ workspace: inventory.workspace, jobId: hold.jobId, scope: hold.eventId === null ? 'unknown' : 'event' })));
    if (state.uncertaintyBlocked && state.holder && !holds.some(hold => hold.workspace === state.holder.workspace && (hold.jobId === state.holder.jobId || hold.jobId === null))) return unknown();
    const unscoped = holds.some(hold => hold.scope === 'unknown');
    return { ...mode, checkedAt: new Date(now()).toISOString(), holder: state.holder,
      ...(concurrent ? { reservations: state.reservations, availableWorkspaces: 3 - new Set(state.reservations.filter(r => r.resourcesCleared !== true).map(r => r.workspace)).size } : {}),
      capacity: state.resourcesCleared === false ? 'HELD' : state.resourcesCleared !== true ? 'UNKNOWN' : unscoped ? 'REVIEW_BLOCKED' : 'AVAILABLE',
      eventSafety: unscoped ? 'UNSCOPED_HOLDS' : holds.length ? 'SCOPED_HOLDS' : 'CLEAR', holdCount: holds.length, owners: holds.slice(0, 10) };
  } catch { return unknown(); }
}
