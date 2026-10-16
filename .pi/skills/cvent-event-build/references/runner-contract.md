# Runner progress and result contract

[SKILL.md](../SKILL.md) is the business authority. This contract adapts its decisions
to the existing dashboard and runner; it changes no guard or executable capability.
All paths below are relative to this job's workspace. Never edit job.json,
runtime.json, ownership, locks, costs, claims or uncertainty to force progress.

## Technical record: state.json

For new builds under this policy set:

```json
{"completionPolicy":"client-rules-configuration-only-v1","registrationTesting":"not_performed","requirements":[]}
```

These are evidence/presentation metadata, not runtime permissions. Preserve unrelated
state fields. Never add this marker to historical jobs or rewrite their statuses.
Initialize requirements from the included tabs and row filters before authoring;
add missed included requirements when discovered. Use stable IDs and one named item
per actual requirement, not one per cell or per repeated error. Keep all unfinished
items individually visible, including those sharing an underlying issue.

Each requirement retains the existing fields: id, label, source, expected, status,
verification, reason, stage and presentation. Exact workbook cells/ranges belong in
source. Preserve original values in originalExpected; expected is the intended result
after approved policy. Add policyDecisions as an array when a default or judgment is
used, each with rule, original, chosen and reason. Include source dependencies and
observed Cvent IDs in verification or evidence references. Do not invent missing
provenance or put private credentials/attendee data in any record.

Generated codes, deduplication, answer-code omissions, chosen paths, adjusted dates,
item-first discounts and other approved judgments must be reproducible from these
records. A policy-derived value is not a literal workbook value. An unchanged value
on an existing blank field is preservation, not evidence the workbook supplied it.

Statuses keep their existing machine names:
- unverified: requested saved configuration not yet established.
- partially_verified: some required saved fields/relationships remain unchecked.
- verified_existing: existing saved configuration matches the approved intent.
- verified_changed: changed configuration independently read back against that intent.
- blocked: included configuration could not be completed; precise field/cause retained.
- excluded: outside this build's scope; no completion credit.

Registration testing is excluded from acceptance, not an unfinished requirement.
Do not create preview-only blockers/partial records in new builds. Do not convert
historical partial records to verified. A missing saved value, required association
or unique supplied answer code is still unfinished even though preview is excluded.
Record exclusions and preserved leftovers separately; do not hide tool limitations
as exclusions. Apply the skill's approved missing/duplicate answer-code exceptions
without claiming those omitted codes were saved.

## Action and readable presentation

Keep presentation.status equal to requirement.status. Its summary names the business
item and gives a short everyday-language result; nextAction is one concrete human
fix, or empty when none. Use tab, row/item name and column rather than cell coordinates
in these sentences. Keep exact codes when needed to identify the business item; do
not expose UUIDs, technical paths or exception dumps in customer-facing summaries.

presentation.action is evidence-bound:
- not_changed: no edit was dispatched for this requirement.
- unknown: a change may have been sent; its result is not established.
- saved: the stated changed configuration was independently read back.
- unchanged: existing values were checked without editing them.

Before an edit, revoke stale verification and set action to unknown; update only
when evidence establishes the result. A blocked or unverified historical record does
not prove no changes occurred. A partial item may contain a verified saved portion;
state that portion and the exact remaining field, not whole-item completion.
verified_changed requires saved; verified_existing requires unchanged.

Maintain currentStage, currentAction and ISO updatedAt before meaningful batches.
Prefix actions READ, EDIT, SAVE_PENDING, VERIFY or LOCAL. These are agent-reported
progress, not independent write counters. Do not print the entire ledger repeatedly.
Discounts remain first inside the existing Needs attention list, never a separate tab.
Optional issueKey can group a common cause internally without dropping individual rows.

## Concurrent-editor saves

Keep concurrentEditorSaves as an array in the technical record and final JSON. For
each save through the warning, record requirementIds, event/page/component identity,
observed warning/time, baseline evidence, intended changes, outcome and readback
reference. List every such save in the written report under I made a judgment call,
including what was saved and what the operator should check. Unknown results remain
unknown and trigger the existing stop handling. A saved field does not prove that
another editor's unrelated work was preserved. Do not include credentials or private
user identity from a warning when a simple warning description is sufficient.

## Final reports

Write reports/final-report.md and reports/final-report.json during normal settlement.
Do not keep executing after Stop merely to finish a report. A stopped run may have
only its retained ledger; do not claim an absent report exists.

The Markdown report identifies the event and workbook by readable names, then uses
exactly the skill's sections:
1. Done: changed items plus a count of existing matches.
2. I filled in a blank: every fill-in, with $0 prices and NULL text first.
3. I made a judgment call: every decision, including each concurrent-editor save.
4. Not done: every included unfinished item, why and what to check/fix.
5. Not included in this build: Sessions, Optional Items, Volume Discounts, Emails,
   Code Snippets and Theme; other excluded rows such as non-admission fees as relevant.
6. Please check: explicitly say registration pages were not tested and ask the human
   to click through each path to check questions, prices and footers for each audience.

Use short sentences. Name worksheet tab, business row and column, not cell addresses.
Keep exact cells, IDs, original/derived values, saved evidence, dependencies and
individual unfinished items in final JSON/state.json instead of the written report.
Record all approved defaults/judgments, not just the remaining blockers. Do not claim
configuration exists, changed or matched without saved evidence.

The final JSON retains eventId, status, completion, blockers and untested. Add the
same completionPolicy and registrationTesting markers as state.json. Retain the
complete requirement records, policy decisions, exclusions and concurrentEditorSaves.
blockers and untested concern included saved configuration only; registration testing
is explicitly not_performed rather than silently asserted or placed in untested.

Minimum DONE shape (placeholders here are documentation, not real event values):

```json
{"eventId":"<authorizedEvent.apiEventId>","status":"DONE","completionPolicy":"client-rules-configuration-only-v1","registrationTesting":"not_performed","completion":{"requirements":true,"draft":true},"blockers":[],"untested":[]}
```

Use DONE only when every included requirement has resolved intent under the approved
rules and saved configuration/relationships are verified, Draft is verified, Not done
is empty and no uncertainty remains. Display exactly:

Configuration saved under the approved build rules. Registration testing was not performed.

Use INCOMPLETE for any included unfinished configuration, with accurate completion
flags and nonempty blockers/untested as appropriate. Use STOPPED when changes stop
under the skill/runtime, giving the reason in one plain sentence. Machine statuses
stay DONE / INCOMPLETE / STOPPED; the explanatory sentence is not a status enum.

The existing controller remains authoritative for terminal settlement, cleanup and
uncertainty. A model report or normal exit cannot grant DONE through a hold. Record
unresolved writes in unresolved-changes.json as {"uncertainWrites":[...]} with observed
IDs/evidence; never clear a marker or replay a write to complete the report. New
completion wording is not commercial sign-off, behavioral verification or permission
to start another build. Historical reports and costs remain intact.
