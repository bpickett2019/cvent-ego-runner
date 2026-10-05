// Presentation only. This snapshot is never permission to start, resume or clear.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const ownerValid = (owner, unscoped = false) => owner && [1, 2, 3].includes(owner.workspace) && (uuid(owner.jobId) || unscoped && owner.jobId === null);
export function executionReadiness(value, now = Date.now()) {
  const unknown = { capacity: 'CAPACITY UNKNOWN', eventSafety: 'Event safety not verified', owners: [], warning: true,
    detail: 'Readiness is unavailable or stale. Clear changes only the current RR context; it does not erase historical holds. Return always rechecks safety.' };
  if (value?.version === 2) {
    if (value.scope !== 'workspace' || ![1, 2, 3].includes(value.workspace) || value.maxConcurrent !== 3 ||
        value.holder !== null && value.holder?.workspace !== value.workspace) return unknown;
    const view = executionReadiness({ ...value, version: 1, scope: 'shared' }, now);
    if (view.capacity === unknown.capacity) return view;
    if (!Array.isArray(value.reservations) || value.reservations.length > 4 || value.reservations.some(r => !ownerValid(r) || ![true, false, null].includes(r.resourcesCleared)) ||
        !Number.isInteger(value.availableWorkspaces) || value.availableWorkspaces < 0 || value.availableWorkspaces > 3 ||
        value.availableWorkspaces !== 3 - new Set(value.reservations.filter(r => r.resourcesCleared !== true).map(r => r.workspace)).size) return unknown;
    return { ...view,
      capacity: value.capacity === 'AVAILABLE' ? `WORKSPACE ${value.workspace} AVAILABLE · up to 3 different-event builds`
        : value.capacity === 'HELD' ? `WORKSPACE ${value.workspace} RESERVED · other workspaces have independent capacity` : view.capacity,
      detail: `${value.availableWorkspaces}/3 workspace reservations available at this observation. Same-event builds cannot overlap. Stop/Clear affects only its own workspace; retained event uncertainty still requires review. ${view.detail}` };
  }
  if (!value || value.version !== 1 || value.scope !== 'shared' || typeof value.checkedAt !== 'string' || !Number.isFinite(Date.parse(value.checkedAt)) ||
      now - Date.parse(value.checkedAt) > 30000 || Date.parse(value.checkedAt) > now + 5000 ||
      !['AVAILABLE', 'HELD', 'REVIEW_BLOCKED', 'UNKNOWN'].includes(value.capacity) || !['CLEAR', 'SCOPED_HOLDS', 'UNSCOPED_HOLDS', 'UNKNOWN'].includes(value.eventSafety) ||
      value.holder !== null && !ownerValid(value.holder) || !Array.isArray(value.owners) || value.owners.length > 10 ||
      value.owners.some(owner => !ownerValid(owner, true) || !['event', 'unknown'].includes(owner.scope))) return unknown;
  if (value.eventSafety === 'UNKNOWN') {
    if (value.holdCount !== null || value.owners.length || value.capacity === 'AVAILABLE') return unknown;
  } else if (!Number.isInteger(value.holdCount) || value.holdCount < value.owners.length || value.holdCount > 300 ||
      (value.eventSafety === 'CLEAR' ? value.holdCount !== 0 : value.holdCount < 1 || !value.owners.length)) return unknown;
  if (value.capacity === 'AVAILABLE' && value.eventSafety === 'UNSCOPED_HOLDS' || value.capacity === 'REVIEW_BLOCKED' && value.eventSafety !== 'UNSCOPED_HOLDS') return unknown;
  const holder = value.holder ? `Workspace ${value.holder.workspace} · run ${value.holder.jobId}` : null;
  const capacity = value.capacity === 'AVAILABLE' ? 'CAPACITY AVAILABLE · verified resource cleanup'
    : value.capacity === 'HELD' ? `CAPACITY RESERVED${holder ? ` · ${holder}` : ''}`
    : value.capacity === 'REVIEW_BLOCKED' ? 'CAPACITY NOT USABLE · unscoped event hold' : unknown.capacity;
  const eventSafety = value.eventSafety === 'CLEAR' ? 'No retained event holds reported · target/login still require verification'
    : value.eventSafety === 'SCOPED_HOLDS' ? `${value.holdCount} retained event hold${value.holdCount === 1 ? '' : 's'} · affected events require reconciliation`
    : value.eventSafety === 'UNSCOPED_HOLDS' ? 'Unconfirmed event identity · reconciliation required before any event can run' : unknown.eventSafety;
  const owners = value.owners.map(owner => `Workspace ${owner.workspace} · ${owner.jobId ? `run ${owner.jobId}` : 'unscoped shared evidence'} · ${owner.scope === 'event' ? 'event hold retained' : 'event identity unconfirmed'}`);
  if (value.holdCount > owners.length) owners.push(`${value.holdCount - owners.length} more retained holds; nothing was cleared or omitted from enforcement.`);
  return { capacity, eventSafety, owners, warning: value.capacity !== 'AVAILABLE' || value.eventSafety !== 'CLEAR',
    detail: `Observed ${value.checkedAt}. ${value.capacity === 'HELD' ? 'This reservation still needs Stop/cleanup or spending review. ' : ''}Clear/New RR resets the visible context only. It does not clear these holds or start AI. The verified target is checked again on Return.` };
}
