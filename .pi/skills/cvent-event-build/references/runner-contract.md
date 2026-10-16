# Progress and results

Use [SKILL.md](../SKILL.md) for scope, decisions, report sections and DONE wording.
This contract describes existing machine records; it grants no runtime permissions.
Paths are relative to this job's workspace. Never edit job.json, runtime.json,
ownership, locks, costs, claims or uncertainty to force progress.

## state.json

For new builds under this policy, preserve unrelated fields and initialize:

```json
{"completionPolicy":"client-rules-configuration-only-v1","registrationTesting":"not_performed","requirements":[]}
```

Inventory the included requirements before authoring and add omissions when found.
Use stable IDs and one named item per actual requirement, not one per error or cell.
Keep each unfinished item visible even when several share a cause. Do not add this
policy marker to historical jobs or rewrite their records.

Each requirement retains id, label, source, expected, status, verification, reason,
stage and presentation. Keep exact workbook cells/ranges in source, original values
in originalExpected, and the policy-derived intended result in expected. When a
policy decision is used, add policyDecisions entries with rule, original, chosen
and reason. Retain dependencies, observed Cvent IDs and saved evidence references.
Do not invent provenance or include credentials or attendee data.

| status | Meaning |
| --- | --- |
| unverified | Requested saved configuration is not established. |
| partially_verified | Some required saved fields or relationships remain unchecked. |
| verified_existing | Existing saved configuration matches the approved intent. |
| verified_changed | Changed configuration was independently read back against the intent. |
| blocked | Included configuration is unfinished; retain the precise field and cause. |
| excluded | Outside scope; receives no completion credit. |

A missing saved field, required association or unique supplied answer code remains
unfinished. The skill's approved omitted-code exceptions do not mean a code was
saved. Registration testing is not a new-build requirement: do not create preview-only
blockers. Historical partials retain their original status and evidence.

## Presentation and progress

presentation.status must equal requirement.status. summary names the business item
and result in plain English; nextAction is one concrete human fix or empty when none.
Use readable tab/row/column names in prose; keep source cells, UUIDs, technical paths
and error details in technical evidence, not customer-facing summaries.

presentation.action is evidence-bound:
- not_changed: no edit was dispatched for this requirement.
- unknown: a change may have been sent; its result is not established.
- saved: the stated changed configuration was independently read back.
- unchanged: existing values were checked without editing them.

Before editing a verified item, revoke stale verification, mark it unverified and set
action to unknown. Set verified_changed only with saved, and verified_existing only
with unchanged. A partial record can describe a saved portion and the exact remaining
work; it cannot claim the whole item complete. A blocked/unverified historical record
does not establish that nothing was changed. Never rewrite raw status for display.

Update currentStage, currentAction and ISO updatedAt before meaningful batches.
Prefix actions READ, EDIT, SAVE_PENDING, VERIFY or LOCAL. These are agent-reported
progress, not independent write counters. Do not repeatedly print the whole ledger.
Optional issueKey groups a cause without hiding individual requirements. Blocked
discounts stay first inside Needs attention, never in a separate tab.

## Concurrent-editor saves

Keep concurrentEditorSaves in state and final JSON. For each save through a warning,
record requirementIds, event/page/component identity, observed warning/time, baseline
evidence, intended changes, outcome and readback reference. Disclose each save in
the skill's judgment-call report section. Saved values do not prove another editor's
unrelated work was preserved. Omit private user identities from warning descriptions.
Unknown outcomes retain Stop/uncertainty protections.

## Final reports and settlement

During normal settlement write reports/final-report.md and reports/final-report.json.
The Markdown report identifies the event/workbook by readable names and follows the
skill's exact sections, including all defaults, judgments, remaining work and testing
disclosure. Do not keep executing after Stop just to finish a report or claim an
absent report exists; retained state may be the only stopped-run evidence.

Final JSON retains eventId, status, completion, blockers and untested. Include the
same completionPolicy and registrationTesting markers, complete requirement records,
policy decisions, exclusions and concurrentEditorSaves. blockers and untested concern
included saved configuration, not registration testing.

Minimum DONE shape (documentation placeholders, not actual target values):

```json
{"eventId":"<authorizedEvent.apiEventId>","status":"DONE","completionPolicy":"client-rules-configuration-only-v1","registrationTesting":"not_performed","completion":{"requirements":true,"draft":true},"blockers":[],"untested":[]}
```

DONE requires every included requirement's approved intent and saved relationships
to be verified, Draft verified, Not done empty and no uncertainty. Use the exact DONE
explanation from SKILL.md. INCOMPLETE retains accurate flags and specific unfinished
items. STOPPED retains the interruption reason. Neither Saved grouping nor existing
matches hide unfinished requirements or turn an INCOMPLETE run into DONE.

The controller is authoritative for terminal settlement, cleanup and uncertainty;
a report or model exit cannot override its holds. Record unresolved writes in
unresolved-changes.json as {"uncertainWrites":[...]} with observed IDs/evidence.
Never clear a marker or replay a write to complete the report. No automatic next run.
