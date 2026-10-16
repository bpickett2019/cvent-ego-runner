// Three durable workspace reservations, with serialized event admission only.
// Never delete history, steal a live claim, time-expire a lease, or retry a prompt.
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ExecutionSlotError } from './execution-slot.mjs';

export const CONCURRENT_LEASE_PROTOCOL = 'workspace-event-lease-v1';
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const fail = (code, owner) => { throw new ExecutionSlotError(code, owner); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function proof(value, owner) {
  if (value?.version !== 1 || value.jobId !== owner.jobId || typeof value.resourcesCleared !== 'boolean' || typeof value.uncertaintyBlocked !== 'boolean' ||
      !Array.isArray(value.resourceBlockers) || !Array.isArray(value.uncertaintyBlockers) ||
      value.resourcesCleared !== (value.resourceBlockers.length === 0) || value.uncertaintyBlocked !== (value.uncertaintyBlockers.length > 0) ||
      value.cleared !== (value.resourcesCleared && !value.uncertaintyBlocked) ||
      value.historicalHoldRetired !== undefined && (typeof value.historicalHoldRetired !== 'boolean' || value.historicalHoldRetired && !value.resourcesCleared)) fail('CLEARANCE_UNAVAILABLE', owner);
  return value;
}
export function createWorkspaceSlots({ directory, clearance, resolveTarget, collectInventories, now = Date.now }) {
  if (!directory || [clearance, resolveTarget, collectInventories].some(f => typeof f !== 'function')) throw Error('Concurrent admission dependencies required');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'workspace-active.json'), legacyPath = join(directory, 'active.json');
  let tail = Promise.resolve(); const resets = new Set(), generations = new Map(), pending = new Map();
  const serial = action => { const p = tail.then(action); tail = p.catch(() => {}); return p; };
  const sync = p => { const fd = openSync(p, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } };
  function readFile(p) {
    try { const s = lstatSync(p); if (!s.isFile() || s.isSymbolicLink() || s.size > 16384) fail('SLOT_STATE_INVALID'); return readFileSync(p, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  function read() {
    try {
      const raw = readFile(path); if (raw === null) return { version: 1, revision: null, claims: [] };
      const s = JSON.parse(raw);
      if (s.version !== 1 || !uuid(s.revision) || !Array.isArray(s.claims) || s.claims.length > 3 || new Set(s.claims.map(c => c.workspace)).size !== s.claims.length ||
          s.claims.some(c => ![1, 2, 3].includes(c.workspace) || !uuid(c.jobId) || !uuid(c.claimId) || !uuid(c.contextId) || !uuid(c.eventId))) fail('SLOT_STATE_INVALID');
      return s;
    } catch { fail('SLOT_STATE_INVALID'); }
  }
  function legacy() {
    try {
      const raw = readFile(legacyPath); if (raw === null) return null;
      const c = JSON.parse(raw);
      if (![1, 2, 3].includes(c.workspace) || !uuid(c.jobId) || !uuid(c.claimId)) fail('SLOT_STATE_INVALID');
      return { raw, claim: c };
    } catch { fail('SLOT_STATE_INVALID'); }
  }
  function archiveLegacy(original) {
    if (!equal(legacy(), original)) fail('SLOT_STATE_INVALID');
    const archive = join(directory, `${original.claim.claimId}.released.json`);
    if (readFile(archive) !== null) fail('SLOT_STATE_INVALID');
    renameSync(legacyPath, archive); sync(directory);
  }
  function commit(before, claims) {
    if (!equal(read(), before)) fail('SLOT_STATE_INVALID');
    // Keep every original revision, including released owners. A failed commit
    // may leave a matching archive, never authorization to overwrite evidence.
    if (before.revision) {
      const history = join(directory, 'workspace-history'); mkdirSync(history, { recursive: true, mode: 0o700 });
      const archive = join(history, `${before.revision}.json`), bytes = readFile(path), prior = readFile(archive);
      if (prior !== null && prior !== bytes) fail('SLOT_STATE_INVALID');
      if (prior === null) { writeFileSync(archive, bytes, { flag: 'wx', mode: 0o600 }); sync(archive); sync(history); }
    }
    const next = { version: 1, revision: randomUUID(), claims }, temp = join(directory, `${next.revision}.pending.json`);
    writeFileSync(temp, JSON.stringify(next) + '\n', { flag: 'wx', mode: 0o600 }); sync(temp);
    renameSync(temp, path); sync(directory); return next;
  }
  async function inventories() {
    let rows; try { rows = await collectInventories(); } catch { fail('SHARED_EVENT_SAFETY_UNAVAILABLE'); }
    if (!Array.isArray(rows) || rows.length !== 3 || rows.some((r, i) => r.protocol !== 'shared-event-safety-v1' || r.workspace !== i + 1 || r.enforced !== true || r.complete !== true || r.eventLeasesEnforced !== true ||
        !Array.isArray(r.holds) || r.holds.length > 100 || r.holds.some(h => !h || h.jobId !== null && !uuid(h.jobId) || h.eventId !== null && !uuid(h.eventId)))) fail('SHARED_EVENT_SAFETY_UNAVAILABLE');
    return rows;
  }
  async function cleanup(owner, rows) {
    let value; try { value = proof(await clearance(owner), owner); } catch (e) { if (e instanceof ExecutionSlotError) throw e; fail('CLEARANCE_UNAVAILABLE', owner); }
    if (value.uncertaintyBlocked && value.historicalHoldRetired !== true && !rows[owner.workspace - 1].holds.some(h => h.jobId === owner.jobId || h.jobId === null)) fail('SHARED_EVENT_SAFETY_UNAVAILABLE');
    return value;
  }
  return {
    async inspect(workspace) {
      if (![1, 2, 3].includes(workspace)) fail('ROUTE_DENIED');
      const before = read(), old = legacy(), owners = [...before.claims, ...(old ? [old.claim] : [])];
      const states = await Promise.all(owners.map(async c => {
        try { return { owner: c, ...proof(await clearance(c), c) }; }
        catch { return { owner: c, resourcesCleared: null, uncertaintyBlocked: null }; }
      }));
      const own = states.find(s => s.owner.workspace === workspace), blockingLegacy = old && states.at(-1)?.resourcesCleared !== true;
      return { holder: own ? { workspace, jobId: own.owner.jobId } : null,
        resourcesCleared: blockingLegacy ? states.at(-1).resourcesCleared : own?.resourcesCleared ?? true,
        uncertaintyBlocked: own?.historicalHoldRetired === true ? false : own?.uncertaintyBlocked ?? false,
        reservations: states.map(s => ({ workspace: s.owner.workspace, jobId: s.owner.jobId, resourcesCleared: s.resourcesCleared })),
        current: () => { try { return equal(read(), before) && equal(legacy(), old); } catch { return false; } } };
    },
    async resetWorkspace(workspace, resetBackend) {
      if (![1, 2, 3].includes(workspace) || typeof resetBackend !== 'function') fail('ROUTE_DENIED');
      if (resets.has(workspace)) fail('WORKSPACE_RESETTING');
      resets.add(workspace); generations.set(workspace, (generations.get(workspace) || 0) + 1);
      let original, old, invalid = false;
      try { original = read().claims.find(c => c.workspace === workspace); old = legacy(); } catch { invalid = true; }
      try {
        const result = await resetBackend();
        if (result?.cleared !== true || result.resetScope !== 'WORKSPACE' || result.aiStarted !== false || result.executionHoldsCleared !== false || !['CURRENT_RR_CONTEXT', 'PREPARED_UPLOAD'].includes(result.clearScope)) fail('SLOT_STATE_INVALID');
        try {
          const released = await serial(async () => {
            if (invalid) fail('SLOT_STATE_INVALID');
            const before = read(), held = before.claims.find(c => c.workspace === workspace), prior = legacy();
            if (!equal(held, original) || !equal(prior, old)) fail('SLOT_STATE_INVALID');
            const owners = [held, ...(prior?.claim.workspace === workspace ? [prior.claim] : [])].filter(Boolean);
            if (!owners.length) return { sharedSlotReleased: false, sharedSlotStatus: prior || before.claims.length ? 'OTHER_WORKSPACE' : 'EMPTY' };
            const rows = await inventories();
            for (const owner of owners) if (!(await cleanup(owner, rows)).resourcesCleared) fail('EXECUTION_SLOT_HELD', owner);
            for (const owner of owners) if (!(await cleanup(owner, rows)).resourcesCleared) fail('EXECUTION_SLOT_HELD', owner);
            if (!equal(read(), before) || !equal(legacy(), prior)) fail('SLOT_STATE_INVALID');
            if (prior?.claim.workspace === workspace) archiveLegacy(prior);
            if (held) commit(before, before.claims.filter(c => c.workspace !== workspace));
            return { sharedSlotReleased: true, sharedSlotStatus: 'RELEASED' };
          });
          return { ...result, ...released };
        } catch (e) { return { ...result, sharedSlotReleased: false, sharedSlotStatus: 'REVIEW_REQUIRED', slotError: (e instanceof ExecutionSlotError ? e : new ExecutionSlotError('SLOT_STATE_INVALID')).publicResult }; }
      } finally { resets.delete(workspace); }
    },
    async authorize(workspace, raw, method, { body = {}, cancelled = () => false } = {}) {
      if (![1, 2, 3].includes(workspace)) fail('ROUTE_DENIED');
      if (['GET', 'HEAD'].includes(method)) return;
      if (method !== 'POST' || !/^\/api\/(?:jobs|new-rr|take-control|workbooks|workbooks\/[0-9a-f-]{36}\/save|jobs\/[0-9a-f-]{36}\/(?:read|stop|answer|resume|rpc|start|continue))$/.test(raw)) fail('ROUTE_DENIED');
      const match = /^\/api\/jobs\/([0-9a-f-]{36})\/(answer|resume|rpc|start|continue)$/.exec(raw);
      if (!match) return;
      const [, jobId, operation] = match;
      if (!uuid(jobId) || ['start', 'continue'].includes(operation)) fail('ROUTE_DENIED');
      if (pending.has(workspace)) fail('WORKSPACE_HANDOFF_BUSY');
      const ticket = randomUUID(), generation = generations.get(workspace) || 0;
      const check = () => { if (cancelled() || resets.has(workspace) || generation !== (generations.get(workspace) || 0)) fail('WORKSPACE_RESETTING'); };
      const finish = () => { if (pending.get(workspace) === ticket) pending.delete(workspace); };
      check(); pending.set(workspace, ticket);
      try {
        let target;
        try { target = await resolveTarget({ workspace, jobId, operation, ...(operation === 'answer' && Object.hasOwn(body, 'eventName') ? { eventName: body.eventName } : {}) }); }
        catch { fail('TARGET_PREFLIGHT_UNAVAILABLE'); }
        check();
        if (target?.protocol !== 'workspace-event-target-v1' || target.workspace !== workspace || target.jobId !== jobId || !uuid(target.contextId) || !uuid(target.eventId) || typeof target.canRebind !== 'boolean') fail('TARGET_PREFLIGHT_UNAVAILABLE');
        return await serial(async () => {
          check(); const before = read(), old = legacy(), own = before.claims.find(c => c.workspace === workspace);
          if (['rpc', 'resume'].includes(operation) && (!own || own.jobId !== jobId)) fail('NOT_SLOT_OWNER', own);
          const rows = await inventories(); check();
          for (const row of rows) for (const hold of row.holds) {
            if (hold.eventId === null) fail('UNSCOPED_EVENT_HOLD');
            if (hold.eventId === target.eventId) fail('EVENT_RECONCILIATION_REQUIRED', { workspace: row.workspace, jobId: hold.jobId });
          }
          const needClear = [...(old ? [old.claim] : []), ...before.claims.filter(c => c.workspace === workspace ? c.jobId !== jobId : c.eventId === target.eventId)];
          for (const owner of needClear) if (!(await cleanup(owner, rows)).resourcesCleared) fail(owner.workspace !== workspace && owner.eventId ? 'EVENT_ALREADY_RUNNING' : 'EXECUTION_SLOT_HELD', owner);
          if (own?.jobId === jobId && (own.contextId !== target.contextId || own.eventId !== target.eventId && !target.canRebind)) fail('TARGET_BINDING_CHANGED');
          // Recheck the API-resolved job/context before issuing the reservation.
          let latest; try { latest = await resolveTarget({ workspace, jobId, operation, ...(operation === 'answer' && Object.hasOwn(body, 'eventName') ? { eventName: body.eventName } : {}) }); } catch { fail('TARGET_PREFLIGHT_UNAVAILABLE'); }
          if (!equal(latest, target)) fail('TARGET_BINDING_CHANGED');
          for (const owner of needClear) if (!(await cleanup(owner, rows)).resourcesCleared) fail('EXECUTION_SLOT_HELD', owner);
          check(); if (!equal(read(), before) || !equal(legacy(), old)) fail('SLOT_STATE_INVALID');
          const held = own?.jobId === jobId && own.eventId === target.eventId ? own : { workspace, jobId, contextId: target.contextId, eventId: target.eventId, claimId: randomUUID(), acquiredAt: new Date(now()).toISOString() };
          const issuedAt = now();
          const grant = { protocol: 'shared-event-safety-v1', workspace, jobId, operation, nonce: randomUUID(), issuedAt, expiresAt: issuedAt + 120000, inventories: rows,
            lease: { protocol: CONCURRENT_LEASE_PROTOCOL, claimId: held.claimId, contextId: held.contextId, eventId: held.eventId, sharedContactTypeCreation: false } };
          const header = Buffer.from(JSON.stringify(grant)).toString('base64');
          if (header.length > 8000) fail('SHARED_EVENT_SAFETY_UNAVAILABLE');
          check();
          if (old) archiveLegacy(old);
          if (held !== own) commit(before, [...before.claims.filter(c => c.workspace !== workspace), held].sort((a, b) => a.workspace - b.workspace));
          return { header, finish };
        });
      } catch (e) { finish(); throw e; }
    },
  };
}
