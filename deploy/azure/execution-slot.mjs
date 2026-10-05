// One durable, non-expiring paid-build slot for the restricted staging gateway.
// A failed dispatch/restart never frees it. Only positive backend cleanup proof
// permits release. Resource-only release additionally requires all-workspace event
// enforcement; retained uncertainty is never deleted or converted into success.
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Only fixed messages and validated owner identifiers cross the public gateway.
export class ExecutionSlotError extends Error {
  constructor(code, owner) {
    const label = owner ? `Workspace ${owner.workspace}, run ${owner.jobId}` : 'The shared execution slot';
    const messages = {
      ROUTE_DENIED: 'Route denied. Use the canonical dashboard controls; no new build was started.',
      EVENT_ALREADY_RUNNING: `${label} is using this Cvent event. Different events may run concurrently; the same event cannot be edited by two builds.`,
      WORKSPACE_HANDOFF_BUSY: 'This workspace already has a handoff in progress. No duplicate paid instruction was sent.',
      TARGET_PREFLIGHT_UNAVAILABLE: 'The selected workspace job/event could not be verified for concurrent admission. Check its setup and retry explicitly; no paid instruction was sent.',
      TARGET_BINDING_CHANGED: 'The verified event or workspace generation changed. No paid instruction was sent; refresh and explicitly Return again.',
      WORKSPACE_RESETTING: 'This workspace is being reset, or this handoff predates its reset. Refresh before an explicit new handoff; no paid instruction was forwarded.',
      SHARED_EVENT_SAFETY_UNAVAILABLE: 'Event safety could not be verified across all three workspaces. A backend is unavailable, incompatible or has ambiguous evidence. No paid handoff was forwarded; Stop and preview remain available.',
      UNSCOPED_EVENT_HOLD: 'Unresolved evidence has no confirmed event identity and blocks all events. Operator review is required; no capacity claim was changed or paid handoff forwarded.',
      SLOT_STATE_INVALID: 'Shared-slot evidence is unavailable or invalid. Operator review is required; no claim was cleared.',
      NOT_SLOT_OWNER: 'This job does not own the shared execution slot. No continuation was sent.',
      CLEARANCE_UNAVAILABLE: `${label}: cleanup verification is unavailable. No claim was cleared; retry only after its backend is available.`,
      EXECUTION_SLOT_HELD: `${label} still holds execution capacity. Stop that run and verify process, browser and spending cleanup; Clear/New RR elsewhere cannot release it.`,
      EVENT_RECONCILIATION_REQUIRED: `${label} has retained write or interrupted-operation uncertainty. Resource/spending checks pass, but read-only saved-result reconciliation is required. Clear/New RR does not erase this hold; no new build was started.`,
    };
    super(messages[code] || messages.SLOT_STATE_INVALID);
    this.publicResult = { code: messages[code] ? code : 'SLOT_STATE_INVALID', error: this.message,
      ...(owner ? { blockingRun: { workspace: owner.workspace, jobId: owner.jobId } } : {}) };
  }
}
export function slotErrorResponse(error) {
  return error instanceof ExecutionSlotError ? error.publicResult : new ExecutionSlotError('SLOT_STATE_INVALID').publicResult;
}
function clearanceProof(value, owner) {
  if (typeof value === 'boolean') return { cleared: value };
  if (value?.version !== 1 || value.jobId !== owner.jobId || typeof value.cleared !== 'boolean' ||
      typeof value.resourcesCleared !== 'boolean' || typeof value.uncertaintyBlocked !== 'boolean' ||
      !Array.isArray(value.resourceBlockers) || !Array.isArray(value.uncertaintyBlockers) ||
      value.resourcesCleared !== (value.resourceBlockers.length === 0) || value.uncertaintyBlocked !== (value.uncertaintyBlockers.length > 0) ||
      value.cleared !== (value.resourcesCleared && !value.uncertaintyBlocked)) return null;
  return value;
}

// Validate the exact assertion which will be forwarded, not a caller boolean
// saying event safety passed. The installed gateway owns prepareHandoff.
function handoffProof(encoded, workspace, jobId, operation, now) {
  try {
    if (typeof encoded !== 'string' || encoded.length > 8000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error();
    const proof = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
    if (proof.protocol !== 'shared-event-safety-v1' || proof.workspace !== workspace || proof.jobId !== jobId || proof.operation !== operation || !uuid(proof.nonce) ||
        !Number.isFinite(proof.issuedAt) || !Number.isFinite(proof.expiresAt) || proof.expiresAt - proof.issuedAt !== 120000 || now() < proof.issuedAt - 5000 || now() >= proof.expiresAt ||
        !Array.isArray(proof.inventories) || proof.inventories.length !== 3) throw Error();
    for (let index = 0; index < 3; index++) {
      const inventory = proof.inventories[index];
      if (inventory?.protocol !== proof.protocol || inventory.workspace !== index + 1 || inventory.enforced !== true || inventory.complete !== true ||
          !Array.isArray(inventory.holds) || inventory.holds.length > 100 || inventory.holds.some(hold => !hold ||
            (hold.jobId !== null && !uuid(hold.jobId)) || (hold.eventId !== null && !uuid(hold.eventId)))) throw Error();
    }
    return proof;
  } catch { throw new ExecutionSlotError('SHARED_EVENT_SAFETY_UNAVAILABLE'); }
}

export function createExecutionSlot({ directory, clearance, prepareHandoff, now = Date.now }) {
  if (!directory || typeof clearance !== 'function' || (prepareHandoff !== undefined && typeof prepareHandoff !== 'function')) throw new Error('Execution slot configuration required');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'active.json');
  const sync = () => { const fd = openSync(directory, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } };
  const read = () => {
    if (!existsSync(path)) return null;
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (![1, 2, 3].includes(value.workspace) || !/^[0-9a-f-]{36}$/.test(value.jobId) || !/^[0-9a-f-]{36}$/.test(value.claimId)) throw new ExecutionSlotError('SLOT_STATE_INVALID');
    return value;
  };
  const archiveClaim = held => {
    const archive = join(directory, `${held.claimId}.released.json`);
    try { lstatSync(archive); throw new ExecutionSlotError('SLOT_STATE_INVALID'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    renameSync(path, archive); sync();
  };
  let tail = Promise.resolve();
  const resets = new Set(), generations = new Map();
  return {
    async resetWorkspace(workspace, resetBackend) {
      if (![1, 2, 3].includes(workspace) || typeof resetBackend !== 'function') throw new ExecutionSlotError('ROUTE_DENIED');
      if (resets.has(workspace)) throw new ExecutionSlotError('WORKSPACE_RESETTING');
      resets.add(workspace); generations.set(workspace, (generations.get(workspace) || 0) + 1);
      let original, invalid = false;
      try { original = read(); } catch { invalid = true; }
      try {
        // Stop/Clear reach the backend without waiting on a slow paid-slot queue.
        const result = await resetBackend();
        if (result?.cleared !== true || result.resetScope !== 'WORKSPACE' || result.aiStarted !== false ||
            result.executionHoldsCleared !== false || !['CURRENT_RR_CONTEXT', 'PREPARED_UPLOAD'].includes(result.clearScope)) throw new ExecutionSlotError('SLOT_STATE_INVALID');
        const release = async () => {
          if (invalid) throw new ExecutionSlotError('SLOT_STATE_INVALID');
          const held = read();
          if (!held) return { sharedSlotReleased: false, sharedSlotStatus: 'EMPTY' };
          if (held.workspace !== workspace) return { sharedSlotReleased: false, sharedSlotStatus: 'OTHER_WORKSPACE' };
          if (JSON.stringify(held) !== JSON.stringify(original)) throw new ExecutionSlotError('SLOT_STATE_INVALID');
          const cleanup = async () => {
            let proof;
            try { proof = clearanceProof(await clearance(held), held); } catch { /* Keep claim on unavailable evidence. */ }
            if (!proof?.cleared && !(prepareHandoff && proof?.resourcesCleared === true)) throw new ExecutionSlotError(!proof ? 'CLEARANCE_UNAVAILABLE' : 'EXECUTION_SLOT_HELD', held);
            return proof;
          };
          let proof = await cleanup(), encoded, shared;
          if (prepareHandoff) {
            try { encoded = await prepareHandoff({ workspace, jobId: held.jobId, operation: 'answer' }); }
            catch { throw new ExecutionSlotError('SHARED_EVENT_SAFETY_UNAVAILABLE'); }
            shared = handoffProof(encoded, workspace, held.jobId, 'answer', now);
            proof = await cleanup();
            handoffProof(encoded, workspace, held.jobId, 'answer', now);
            if (proof.uncertaintyBlocked && !shared.inventories[workspace - 1].holds.some(hold => hold.jobId === held.jobId)) throw new ExecutionSlotError('SHARED_EVENT_SAFETY_UNAVAILABLE');
          }
          // No target grant is forwarded. Unknown/event-scoped holds remain in
          // inventory and still deny future execution; only idle capacity ends.
          if (JSON.stringify(read()) !== JSON.stringify(held)) throw new ExecutionSlotError('SLOT_STATE_INVALID');
          archiveClaim(held);
          return { sharedSlotReleased: true, sharedSlotStatus: 'RELEASED' };
        };
        const pending = tail.then(release); tail = pending.catch(() => {});
        try { return { ...result, ...await pending }; }
        catch (error) { return { ...result, sharedSlotReleased: false, sharedSlotStatus: 'REVIEW_REQUIRED', slotError: slotErrorResponse(error) }; }
      } finally { resets.delete(workspace); }
    },
    async inspect() {
      // Observational only: no queue, assertion, archive, acquisition or release.
      try {
        const held = read(), revision = JSON.stringify(held);
        const proof = held ? clearanceProof(await clearance(held), held) : { resourcesCleared: true, uncertaintyBlocked: false };
        return { holder: held ? { workspace: held.workspace, jobId: held.jobId } : null,
          resourcesCleared: proof?.resourcesCleared ?? (proof?.cleared === true ? true : null),
          uncertaintyBlocked: proof?.uncertaintyBlocked ?? (proof?.cleared === true ? false : null),
          current: () => { try { return JSON.stringify(read()) === revision; } catch { return false; } } };
      } catch { return { holder: null, resourcesCleared: null, uncertaintyBlocked: null, current: () => false }; }
    },
    authorize(workspace, raw, method) {
    if (![1, 2, 3].includes(workspace)) return Promise.reject(new ExecutionSlotError('ROUTE_DENIED'));
    if (['GET', 'HEAD'].includes(method)) return Promise.resolve();
    // Canonical Stop/preview/ownership/intake requests do not change the paid
    // claim. Never queue them behind a slow cleanup or peer-inventory request.
    if (method !== 'POST' || !/^\/api\/(?:jobs|new-rr|take-control|workbooks|workbooks\/[0-9a-f-]{36}\/save|jobs\/[0-9a-f-]{36}\/(?:read|stop|answer|resume|rpc|start|continue))$/.test(raw)) return Promise.reject(new ExecutionSlotError('ROUTE_DENIED'));
    const match = /^\/api\/jobs\/([0-9a-f-]{36})\/(answer|resume|rpc|start|continue)$/.exec(raw);
    if (!match) return Promise.resolve();
    const generation = generations.get(workspace) || 0;
    const assertNotReset = () => { if (resets.has(workspace) || (generations.get(workspace) || 0) !== generation) throw new ExecutionSlotError('WORKSPACE_RESETTING'); };
    if (resets.has(workspace)) return Promise.reject(new ExecutionSlotError('WORKSPACE_RESETTING'));
    const action = async () => {
      assertNotReset();
      const [, jobId, operation] = match;
      if (['start', 'continue'].includes(operation)) throw new ExecutionSlotError('ROUTE_DENIED');
      let held = read();
      const sameHolder = held?.workspace === workspace && held.jobId === jobId;
      if ((operation === 'rpc' || operation === 'resume') && !sameHolder) throw new ExecutionSlotError('NOT_SLOT_OWNER', held);
      const cleanupProof = async () => {
        let proof = null;
        try { proof = clearanceProof(await clearance(held), held); } catch { /* Offline/ambiguous means held. */ }
        if (!proof?.cleared && !(prepareHandoff && proof?.resourcesCleared === true)) throw new ExecutionSlotError(!proof ? 'CLEARANCE_UNAVAILABLE'
          : proof.resourcesCleared && proof.uncertaintyBlocked ? 'EVENT_RECONCILIATION_REQUIRED' : 'EXECUTION_SLOT_HELD', held);
        return proof;
      };
      let cleanup = held && !sameHolder ? await cleanupProof() : null;
      // Stay inside the serialized slot transaction. No claim is acquired or
      // archived until complete compatible inventories have been collected.
      let encoded, shared;
      if (prepareHandoff) {
        try { encoded = await prepareHandoff({ workspace, jobId, operation }); }
        catch { throw new ExecutionSlotError('SHARED_EVENT_SAFETY_UNAVAILABLE'); }
        shared = handoffProof(encoded, workspace, jobId, operation, now);
        if (shared.inventories.some(inventory => inventory.holds.some(hold => hold.eventId === null))) throw new ExecutionSlotError('UNSCOPED_EVENT_HOLD');
      }
      if (held && !sameHolder && prepareHandoff) cleanup = await cleanupProof(); // Recheck after asynchronous inventory reads.
      if (encoded) handoffProof(encoded, workspace, jobId, operation, now); // No expired grant at commit.
      if (cleanup?.uncertaintyBlocked && shared && !shared.inventories[held.workspace - 1].holds.some(hold => hold.jobId === held.jobId)) {
        throw new ExecutionSlotError('SHARED_EVENT_SAFETY_UNAVAILABLE'); // A retained owner hold must not disappear between proofs.
      }
      assertNotReset(); // A queued/slow handoff cannot survive a workspace reset.
      const latest = read();
      if (JSON.stringify(latest) !== JSON.stringify(held)) throw new ExecutionSlotError('SLOT_STATE_INVALID');
      // Same-holder setup retries and live Return keep the exact reservation;
      // backend setup/native/pause-token checks still decide eligibility.
      if (sameHolder) return encoded;
      if (held) archiveClaim(held); // Preserve original claim bytes, including on restart/failure.
      held = { version: 1, claimId: randomUUID(), workspace, jobId, acquiredAt: new Date(now()).toISOString() };
      const fd = openSync(path, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify(held) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
      sync(); // Durable intent precedes forwarding. No automatic replay on any failure.
      return encoded;
    };
    const result = tail.then(action); tail = result.catch(() => {}); return result;
  } };
}
