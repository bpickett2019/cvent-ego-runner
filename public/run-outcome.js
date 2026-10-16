// Presentation only. Never change job status, completion evidence or control gates.
export function runOutcome(job, progress = {}) {
  if (!job || !['DONE', 'INCOMPLETE', 'STOPPED', 'STOPPED_REQUIRES_REVIEW', 'FINISHED', 'REVIEW_REQUIRED'].includes(job.status)) return null;
  const pending = Array.isArray(progress.pending) ? progress.pending : [];
  const stopped = job.status === 'STOPPED' || job.status === 'STOPPED_REQUIRES_REVIEW';
  const legacy = job.status === 'FINISHED' || job.status === 'REVIEW_REQUIRED';
  const complete = job.status === 'DONE' && !job.modelFailure && pending.length === 0;
  const label = stopped ? 'Stopped' : job.modelFailure ? 'Ended — model error' : legacy ? 'Ended — completion unverified'
    : complete ? 'Done — verified complete' : 'Done — unfinished items';
  const summary = stopped ? "Stopping does not undo changes. Check what's left."
    : job.modelFailure ? 'The AI request failed. Review what was saved and what remains.'
    : legacy ? 'This older run does not confirm completion. Review the retained evidence below.'
    : complete ? 'The agent reports the work checked. Review before sign-off.'
    : job.status === 'DONE' ? 'The run ended, but some checks are still open.'
    : 'The run finished. Some work is still unfinished.';
  const notes = pending.length ? pending : complete ? [] : ['No requirement-level results were recorded. Completion and remaining work are unconfirmed; review the retained run evidence.'];
  return { label, summary, notes, complete, icon: complete ? '✓' : stopped ? '■' : '!',
    heading: stopped ? 'Unfinished / not verified before Stop' : 'Unfinished work / needs input',
    remaining: pending.length || (complete ? 0 : 'unconfirmed') };
}
