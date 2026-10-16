// Read-only UI snapshots. Never change job records or infer saved Cvent outcomes.
export function createProgressEvidence() {
  const snapshots = new Map(), latest = new Map();
  let sequence = 0, generation = 0;
  return {
    clear() { snapshots.clear(); latest.clear(); generation++; },
    async load(key, read) {
      if (!key) return { state: {}, stale: false, warning: '' };
      const request = ++sequence, epoch = generation;
      latest.set(key, request);
      try {
        const state = await read();
        if (!state || typeof state !== 'object' || Array.isArray(state)
          || (state.requirements !== undefined && !Array.isArray(state.requirements))
          || !(Array.isArray(state.requirements) || Array.isArray(state.completed) || Array.isArray(state.pending))) throw Error('Invalid progress response');
        if (epoch === generation && latest.get(key) === request) {
          snapshots.set(key, structuredClone(state));
          if (snapshots.size > 10) { const oldest = snapshots.keys().next().value; snapshots.delete(oldest); latest.delete(oldest); }
        }
        return { state, stale: false, warning: '' };
      } catch {
        const previous = snapshots.get(key);
        return { state: previous ? structuredClone(previous) : {}, stale: true,
          warning: previous ? 'Progress could not be refreshed. Showing the last successful snapshot, not current verification.'
            : 'Progress is unavailable. This does not mean there is no unfinished work.' };
      }
    },
  };
}
export function canCheckFinalReport(job) {
  return !!job && !job.modelFailure && ['DONE', 'INCOMPLETE', 'STOPPED', 'STOPPED_REQUIRES_REVIEW', 'FINISHED', 'REVIEW_REQUIRED'].includes(job.status);
}
export async function finalReportAvailability(job, head) {
  if (!canCheckFinalReport(job)) return 'not_ready';
  try {
    const response = await head();
    return response.status === 200 && !response.redirected ? 'available' : response.status === 404 ? 'missing' : 'unavailable';
  } catch { return 'unavailable'; }
}
export function evidenceNotice(snapshot, report) {
  const messages = snapshot.stale ? [snapshot.warning] : [];
  if (report === 'missing') messages.push('No final report is available. The retained progress below is an incomplete snapshot, not a final report.');
  if (report === 'unavailable') messages.push('The final report could not be checked. Its link is hidden; retained progress is shown below, not a final report.');
  return messages.join(' ');
}
