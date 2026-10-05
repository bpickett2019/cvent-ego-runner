// Presentation only. Never change job status, completion evidence or control gates.
export function runOutcome(job, progress = {}) {
  if (!job || !['DONE', 'INCOMPLETE', 'STOPPED', 'STOPPED_REQUIRES_REVIEW', 'FINISHED', 'REVIEW_REQUIRED'].includes(job.status)) return null;
  const pending = Array.isArray(progress.pending) ? progress.pending : [];
  const stopped = job.status === 'STOPPED' || job.status === 'STOPPED_REQUIRES_REVIEW';
  const legacy = job.status === 'FINISHED' || job.status === 'REVIEW_REQUIRED';
  const complete = job.status === 'DONE' && !job.modelFailure && pending.length === 0;
  const label = stopped ? 'Stopped' : job.modelFailure ? 'Ended — model error' : legacy ? 'Ended — completion unverified'
    : complete ? 'Done — verified complete' : 'Done — unfinished items';
  const summary = stopped ? 'The run was interrupted. Unfinished or unverified work is listed below; this is not completion.'
    : job.modelFailure ? 'The model request failed. This is not a completed build; see the error, unfinished work and saved notes.'
    : legacy ? 'This historical run has no verified full-completion result. Review its saved report and notes before relying on it.'
    : complete ? 'The runner reports all applicable requirements verified. Review the saved report for the evidence; project sign-off remains a human decision.'
    : job.status === 'DONE' ? 'Processing finished, but the progress notes still contain unverified work. Review the saved report to resolve the discrepancy.'
    : 'Processing finished. Missing inputs, blocked requirements and unverified work are listed below. Done here means finished processing, not that every requirement was completed.';
  const notes = pending.length ? pending : complete ? [] : ['Unfinished work was not itemized in progress. See the saved report and agent notes below; do not assume everything was completed.'];
  return { label, summary, notes, complete, icon: complete ? '✓' : stopped ? '■' : '!',
    heading: stopped ? 'Unfinished / not verified before Stop' : 'Unfinished work / needs input',
    remaining: pending.length || (complete ? 0 : 'unconfirmed') };
}
