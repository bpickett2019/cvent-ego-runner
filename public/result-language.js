// Presentation only. Saved statuses remain authoritative; never infer a write
// from a partial/blocked status, a click, or a phrase in a diagnostic paragraph.
const text = v => typeof v === 'string' ? v.trim() : '';
const actions = new Set(['saved', 'unchanged', 'not_changed', 'unknown']);
const statuses = new Set(['verified_changed', 'verified_existing', 'partially_verified', 'blocked', 'unverified', 'excluded']);
const technicalPattern = /https?:\/\/|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|\bapi-[a-z0-9]{6,}|(?:^|\s)(?:work|receipts|reports)\/|\b(?:verified_existing|verified_changed|partially_verified|DECISION-[a-z0-9_-]+)\b/i;
const shortText = (value, limit) => { const s = text(value); return s && s.length <= limit && !technicalPattern.test(s) ? s : ''; };
const normalize = value => text(value).replace(/\\(?:xa0|u00a0)/gi, ' ').replace(/\s*\|\s*/g, ' / ').replace(/\s+/g, ' ');
const upperFirst = value => value.charAt(0).toUpperCase() + value.slice(1);

function subject(label, index) {
  let s = normalize(label);
  const footer = /^(.+?) footer:\s*(.+?)\s+visible=(?:yes|no|true|false)$/i.exec(s);
  if (footer) s = `${footer[2]} in the ${footer[1].toLowerCase()} footer`;
  const registration = /^Registration type ['"](.+?)['"]\s*(?:\([^)]*\))?\s*assigned\/active on event$/i.exec(s);
  if (registration) s = `${registration[1]} registration type`;
  const discount = /^Discount code\s+([^\s(]+)(?:\s+\((.*)\))?$/i.exec(s);
  if (discount) s = `the ${discount[1]} discount${discount[2] ? ` (${discount[2]})` : ''}`;
  // Unknown/overly technical labels stay in the evidence rather than being
  // rewritten into an invented business meaning.
  if (!s || technicalPattern.test(s)) return `item ${index + 1}`;
  return s.length > 100 ? s.slice(0, 97) + '…' : s.replace(/[.;]+$/, '');
}
function presentation(item, status) {
  const p = item.presentation;
  if (!statuses.has(status) || !p || typeof p !== 'object' || Array.isArray(p) || p.status !== status || !actions.has(p.action)) return null;
  if (status === 'verified_changed' && p.action !== 'saved' || status === 'verified_existing' && p.action !== 'unchanged') return null;
  if (!text(p.summary)) return null;
  const summary = shortText(p.summary, 180);
  // A long/technical sentence is not suitable for the main view, but does not
  // erase a valid, status-bound action. Never truncate away its qualifications.
  return { summary, action: p.action, nextAction: shortText(p.nextAction, 160),
    issueKey: summary && typeof p.issueKey === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(p.issueKey) ? p.issueKey : '',
    configurationStatus: p.configurationStatus, remainingCheck: p.remainingCheck };
}
function savedPartial(item, status, p) {
  // Group confirmed saved portions with Saved, not Needs attention. This is not
  // full verification or proof that this run wrote an existing setting. Keep the
  // original status, remaining details and evidence; never classify from prose.
  return status === 'partially_verified' && (p?.action === 'saved' || p?.action === 'unchanged') &&
    !!(text(item.verification) || text(item.evidence));
}
function fallback(status, name) {
  if (status === 'verified_changed') return `${upperFirst(name)} was saved and checked.`;
  if (status === 'verified_existing') return `${upperFirst(name)} already matches the workbook.`;
  if (status === 'excluded') return `${upperFirst(name)} wasn't included.`;
  if (status === 'partially_verified') return `${upperFirst(name)} needs more checking.`;
  if (status === 'blocked') return `${upperFirst(name)} isn't finished.`;
  return `${upperFirst(name)} still needs checking.`;
}
function actionNote(status, action) {
  if (status === 'verified_changed') return 'Saved and checked.';
  if (status === 'verified_existing') return 'No changes were needed.';
  if (status === 'excluded') return 'Not part of this build.';
  if (action === 'saved') return 'Some changes were saved.';
  if (action === 'unchanged') return 'Checked without changes.';
  if (action === 'not_changed') return 'Not changed.';
  return "The report doesn't say whether anything was saved.";
}
function remainingReason(item) {
  // Preserve a short, already-readable reason verbatim. Never summarize a long
  // technical paragraph by guessing which conditions or exceptions matter.
  const reason = text(item.reason) || text(item.blocker);
  return shortText(reason, 160) || '';
}
function sourceNote(item) {
  // Show recorded provenance, never infer a cell from a row index or label.
  return shortText(item.source, 500) || (text(item.source)
    ? 'Full source reference is in Technical evidence.' : 'Worksheet/cell not recorded.');
}
function issueNote(item, verified, status) {
  if (verified || status === 'excluded') return '';
  return remainingReason(item) || (text(item.reason) || text(item.blocker)
    ? 'The report contains a longer explanation in Technical evidence.' : 'The report does not identify the remaining issue.');
}
function evidence(item, status, note) {
  const original = value => typeof value === 'string' ? value : '';
  const fields = [
    ['Requirement', original(item.label)], ['Reference', original(item.id)], ['Saved status', original(item.status) || status || 'unverified'],
    ['Source', original(item.source)], ['Verification', original(item.verification) || original(item.evidence)],
    ['Remaining issue', original(item.reason) || original(item.blocker)], ['Reported action', note],
    ['Original summary', original(item.presentation?.summary)], ['Original next step', original(item.presentation?.nextAction)],
    ['Original action', original(item.presentation?.action)], ['Summary status', original(item.presentation?.status)],
    ['Configuration status', original(item.presentation?.configurationStatus)], ['Remaining check', original(item.presentation?.remainingCheck)],
  ];
  return fields.filter(([, value]) => value.trim()).map(([label, value]) => ({ label, value }));
}
export function resultLanguage(state) {
  const result = { mode: Array.isArray(state?.requirements) ? 'requirements' : 'legacy', changed: [], existing: [], pending: [], excluded: [], legacy: [], configurationMatchCount: 0, verificationOnly: [], attentionCount: 0 };
  if (result.mode === 'legacy') {
    for (const [kind, value] of [['completed', state?.completed], ['pending', state?.pending]]) {
      const rows = Array.isArray(value) ? value : value ? [value] : [];
      rows.forEach((row, index) => {
        const detail = text(row) || text(row?.message);
        const note = { key: `${kind}-${index}`, summary: kind === 'completed' ? "Progress noted. Completion isn't confirmed." : 'This item still needs attention.',
          nextAction: kind === 'pending' ? shortText(detail, 160) || 'Review the retained evidence below.' : '', nextActionLabel: 'Note', actionNote: "The report doesn't confirm a saved result.", evidence: detail ? [{ label: 'Original note', value: detail }] : [], members: [] };
        (kind === 'pending' ? result.pending : result.legacy).push(note);
      });
    }
    result.attentionCount = result.pending.length;
    return result;
  }
  state.requirements.forEach((entry, index) => {
    const item = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const status = text(item.status), name = subject(text(item.label) || (typeof entry === 'string' ? entry : ''), index), p = presentation(item, status);
    const verified = status === 'verified_changed' || status === 'verified_existing';
    const action = verified ? status === 'verified_changed' ? 'saved' : 'unchanged' : p?.action || 'unknown';
    const partialSaved = savedPartial(item, status, p);
    const note = partialSaved
      ? action === 'saved' ? 'Changes saved. See any remaining details below.' : 'Existing settings checked; no changes made.'
      : actionNote(status, action);
    const reason = !verified && status !== 'excluded' ? remainingReason(item) : '';
    const row = { key: `${index}:${text(item.id).slice(0, 160)}`, subject: upperFirst(name), status, action,
      summary: p?.summary || (partialSaved ? `${upperFirst(name)} has saved settings.` : fallback(status, name)),
      nextAction: p?.nextAction || reason || (!verified && status !== 'excluded' ? 'Review this requirement’s retained evidence below.' : ''),
      nextActionLabel: partialSaved ? 'Check' : p?.nextAction || !reason ? 'Next' : 'Still open',
      actionNote: note, sourceNote: sourceNote(item), remainingIssue: issueNote(item, verified, status),
      remainingIssueLabel: partialSaved ? 'Details' : 'Why',
      evidence: evidence(item, status, action), issueKey: p?.issueKey || '', members: [] };
    if (status === 'verified_changed' || partialSaved) result.changed.push(row);
    else if (status === 'verified_existing') result.existing.push(row);
    else if (status === 'excluded') result.excluded.push(row);
    else result.pending.push(row);
  });
  // Keep every requirement individually listed, even with an identical issue.
  result.attentionCount = result.pending.length;
  return result;
}
