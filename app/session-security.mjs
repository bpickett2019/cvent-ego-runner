// Acknowledging a prior incident is distinct from selecting/authorizing an event.
// No cookies, credentials, logout, navigation or browser replacement is performed.
export function authenticatedCventPage(observed) {
  const url = new URL(observed?.info?.url || 'about:blank');
  // Accessibility snapshots put headings, buttons and links on separate lines.
  // Match semantic page text regardless of snapshot layout; retain all auth denials.
  const text = (observed?.snapshot || '').replace(/\s+/g, ' ');
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['app.cvent.com', 'events.app.cvent.com', 'event-insights-ui.app.cvent.com'].includes(url.hostname) ||
      /\/(?:login|signin|sign-on|auth)(?:\/|$)/i.test(url.pathname) ||
      /sign in|log in|password|verification code|logged out due to inactivity/i.test(text) ||
      !/event details|event information|event overview|my events|events.*(?:create event|search)|site designer|registration overview/i.test(text)) {
    throw new Error('Cvent login is not confirmed. Complete human login in the existing browser, then continue; no session was reset');
  }
  return { origin: url.origin, pathname: url.pathname };
}
const sameBrowser = (a, b) => a.steelSessionId === b.steelSessionId && a.activeTargetId === b.activeTargetId;
export async function acknowledgeSessionIncident({ incidents, returnControl, sessionInvalidated, readRuntime, writeRuntime, waitForIdle, observe }) {
  const initial = await readRuntime();
  const pending = incidents.filter(id => !initial.securityAcknowledgedJobs?.includes(id));
  if (!pending.length) return initial;
  if (!returnControl || !sessionInvalidated) throw new Error('Security review: invalidate the previously exposed Cvent session, sign in again, then confirm session invalidation below. This one-time incident acknowledgment is separate from event setup. No Cvent execution has started.');
  if (!initial.steelSessionId || !initial.activeTargetId || !['USER', 'AGENT'].includes(initial.ownership)) throw new Error('Assigned browser is unavailable or a handoff is already active');
  await waitForIdle();
  const ready = await readRuntime();
  if (!sameBrowser(initial, ready) || ready.ownership !== initial.ownership) throw new Error('Browser ownership changed before login verification');
  await writeRuntime({ ...ready, ownership: 'RETURNING' });
  try {
    const login = authenticatedCventPage(await observe());
    const latest = await readRuntime();
    if (!sameBrowser(initial, latest) || latest.ownership !== 'RETURNING') throw new Error('Browser ownership changed during login verification; acknowledgment not saved');
    const at = new Date().toISOString();
    const acknowledged = { ...latest, ownership: 'USER', securityAcknowledgedJobs: [...new Set([...(latest.securityAcknowledgedJobs || []), ...pending])], securityAcknowledgedAt: at,
      browserLoginVerification: { ...login, at, steelSessionId: latest.steelSessionId, activeTargetId: latest.activeTargetId, humanSessionInvalidationAttested: true } };
    // Persist BEFORE event lookup/status/identity validation. Those may fail,
    // but must not erase the already verified human security handoff.
    await writeRuntime(acknowledged);
    return acknowledged;
  } finally {
    const latest = await readRuntime();
    if (sameBrowser(initial, latest) && latest.ownership === 'RETURNING') await writeRuntime({ ...latest, ownership: 'USER' });
  }
}
