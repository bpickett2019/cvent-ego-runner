// Presentation only: these are agent-reported statuses, not independent acceptance.
const text = value => typeof value === 'string' ? value.trim() : '';
const legacyList = value => Array.isArray(value) ? value : value ? [value] : [];

export function requirementProgress(state) {
  if (!Array.isArray(state?.requirements)) return {
    mode: 'legacy', completed: legacyList(state?.completed), pending: legacyList(state?.pending), excluded: [],
    changedCount: 0, existingCount: 0,
  };
  const result = { mode: 'requirements', completed: [], pending: [], excluded: [], changedCount: 0, existingCount: 0 };
  state.requirements.forEach((entry, index) => {
    const item = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const id = text(item.id), label = text(item.label) || (typeof entry === 'string' ? text(entry) : '');
    const title = (id && label && id !== label ? `${id} — ${label}` : label || id || `Requirement ${index + 1}`).slice(0, 240);
    const status = text(item.status);
    const verified = status === 'verified_changed' || status === 'verified_existing';
    const detail = (verified ? text(item.verification) || text(item.evidence)
      : text(item.reason) || text(item.blocker) || text(item.verification) || text(item.evidence)).slice(0, 600);
    const prefix = status === 'verified_changed' ? 'Changed' : status === 'verified_existing' ? 'Existing match'
      : status === 'excluded' ? 'Excluded' : status === 'blocked' ? 'Blocked'
      : status === 'partially_verified' ? 'Partially verified' : status === 'unverified' || !status ? 'Unverified'
      : `Unverified (${status.slice(0, 60)})`;
    const value = `${prefix} · ${title}${detail ? ` — ${detail}` : ''}`;
    if (verified) {
      result.completed.push(value);
      if (status === 'verified_changed') result.changedCount++;
      else result.existingCount++;
    } else if (status === 'excluded') result.excluded.push(value);
    else result.pending.push(value);
  });
  return result;
}
