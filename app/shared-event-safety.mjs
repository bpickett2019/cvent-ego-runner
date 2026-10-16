import { readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { executionSafety } from './execution-clearance.mjs';
import { evidencePresent, readSafetyEvidence, writeUncertainty } from './write-uncertainty.mjs';

export const EVENT_SAFETY_PROTOCOL = 'shared-event-safety-v1';
export const EVENT_SAFETY_HEADER = 'x-cvent-event-safety';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const message = 'Shared event safety could not be verified across all workspaces. No continuation is authorized; retry after operator review.';
const fail = () => { throw new Error(message); };

// No credentials, raw records, event names, contents, or automatic reconciliation.
// This is an uncertainty inventory, NOT resource cleanup or paid-slot clearance.
export function eventHoldInventory(root, workspaceId, { requireEventLease = false } = {}) {
  const result = { protocol: EVENT_SAFETY_PROTOCOL, workspace: workspaceId ?? null,
    enforced: [1, 2, 3].includes(workspaceId), ...(requireEventLease ? { eventLeasesEnforced: true } : {}), complete: false, holds: [] };
  try {
    const jobs = realpathSync(join(root, 'data/jobs'));
    const entries = readdirSync(jobs); if (entries.length > 1000) return result;
    if (writeUncertainty(join(root, 'data/current'), {}, { reports: false }).blocked) result.holds.push({ jobId: null, eventId: null });
    for (const id of entries) {
      if (!uuid(id)) return result;
      const directory = join(jobs, id);
      if (realpathSync(directory) !== directory) return result;
      const record = evidencePresent(join(directory, 'job.json')) ? readSafetyEvidence(directory, 'job.json') : null;
      if (record !== null && (!record || record.id !== id || Array.isArray(record) || !['UPLOADED', 'PREPARING', 'STARTING', 'RUNNING', 'STOPPING', 'STOPPED', 'INCOMPLETE', 'DONE', 'REVIEW_REQUIRED', 'CLEARED'].includes(record.status))) return result;
      if (record !== null && (!writeUncertainty(directory, record).blocked || executionSafety(root, id).historicalHoldRetired === true)) continue;
      // A partial/orphan job directory cannot be certified clean from absence of
      // its record. Keep it globally blocking even if no marker was recovered.
      const identities = [record?.target?.apiEventId, record?.target?.evtstub].filter(value => value !== undefined);
      const eventId = identities.length && identities.every(uuid) && new Set(identities).size === 1 ? identities[0] : null;
      result.holds.push({ jobId: id, eventId });
      if (result.holds.length > 100) return result;
    }
    result.complete = true;
  } catch { /* Unavailable/malformed evidence never becomes an empty clear inventory. */ }
  return result;
}

// The header is an internal assertion over the existing trusted loopback/SSH hop,
// NOT a browser token or hostile-shell sandbox. The gateway strips caller headers.
// Shared mode is configured explicitly; standalone mode cannot silently consume it.
export function createSharedEventSafety({ workspaceId, requireEventLease = false, now = Date.now } = {}) {
  if (workspaceId !== undefined && ![1, 2, 3].includes(workspaceId) || requireEventLease && workspaceId === undefined) throw new Error('Invalid shared workspace identity');
  const requests = new WeakMap(), consumed = new Map();
  function parse(req, record) {
    const raw = req.headers?.[EVENT_SAFETY_HEADER];
    if (workspaceId === undefined) { if (raw !== undefined) fail(); return null; }
    if (typeof raw !== 'string' || raw.length > 8000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) fail();
    let proof;
    try { proof = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch { fail(); }
    const route = /^\/api\/jobs\/([0-9a-f-]{36})\/(answer|resume|rpc)$/.exec(req.originalUrl || req.url || '');
    if (!route || req.method !== 'POST' || !uuid(record.id) || route[1] !== record.id || proof?.protocol !== EVENT_SAFETY_PROTOCOL ||
        proof.workspace !== workspaceId || proof.jobId !== record.id || proof.operation !== route[2] || !uuid(proof.nonce) ||
        !Number.isFinite(proof.issuedAt) || !Number.isFinite(proof.expiresAt) || proof.expiresAt - proof.issuedAt !== 120000 || now() < proof.issuedAt - 5000 || now() >= proof.expiresAt ||
        !Array.isArray(proof.inventories) || proof.inventories.length !== 3) fail();
    for (let index = 0; index < 3; index++) {
      const inventory = proof.inventories[index];
      if (inventory?.protocol !== EVENT_SAFETY_PROTOCOL || inventory.workspace !== index + 1 || inventory.enforced !== true || inventory.complete !== true ||
          !Array.isArray(inventory.holds) || inventory.holds.length > 100 || inventory.holds.some(hold => !hold ||
            (hold.jobId !== null && !uuid(hold.jobId)) || (hold.eventId !== null && !uuid(hold.eventId)))) fail();
    }
    if (requireEventLease && (workspaceId === undefined || proof.inventories.some(i => i.eventLeasesEnforced !== true) ||
        proof.lease?.protocol !== 'workspace-event-lease-v1' || !uuid(proof.lease.claimId) || !uuid(proof.lease.contextId) || !uuid(proof.lease.eventId) ||
        proof.lease.contextId !== record.contextId || proof.lease.sharedContactTypeCreation !== false)) fail();
    // A retry is a new explicit gateway handoff, not replay of an old assertion.
    for (const [nonce, expiresAt] of consumed) if (now() >= expiresAt) consumed.delete(nonce);
    if (consumed.has(proof.nonce) || consumed.size >= 1000) fail();
    consumed.set(proof.nonce, proof.expiresAt);
    return proof;
  }
  return ({ req, record, target }) => {
    let context = requests.get(req);
    if (!context) { context = { proof: parse(req, record), eventId: null }; requests.set(req, context); }
    const proof = context.proof; if (!proof) return;
    if (proof.jobId !== record.id || now() < proof.issuedAt - 5000 || now() >= proof.expiresAt) fail();
    if (!uuid(target?.apiEventId) || target.evtstub !== target.apiEventId || context.eventId && context.eventId !== target.apiEventId) fail();
    if (requireEventLease && proof.lease.eventId !== target.apiEventId) fail();
    context.eventId = target.apiEventId; // One immutable API-resolved event per request.
    if (requireEventLease) record.executionCapabilities = { concurrentWorkspaces: 3, sharedContactTypeCreation: false };
    for (const inventory of proof.inventories) for (const hold of inventory.holds) {
      if (hold.eventId === null || hold.eventId === target.apiEventId) {
        const owner = hold.jobId ? `run ${hold.jobId}` : 'unscoped evidence';
        throw new Error(`Workspace ${inventory.workspace}, ${owner} has unresolved write/operation evidence for this event or an unknown event. Read-only reconciliation is required; no paid continuation was sent.`);
      }
    }
  };
}
