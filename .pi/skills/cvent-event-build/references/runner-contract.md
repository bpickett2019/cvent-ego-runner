# Runner progress and result contract

This is an output adapter, not an execution order or separate review agent.
All paths below are relative to the authoritative job workspace. Preserve the
runner's files and unrelated fields; never edit job.json, runtime.json, ownership,
locks, costs or uncertainty markers to claim success or unlock tools.

## Progress

Maintain state.json.requirements as an array. Initialize it from identified
applicable RR requirements before Cvent inspection; extend it when new source
requirements are discovered. Use stable IDs, source cells, exact expected values
and concise human-readable labels. Requirements are not counts of populated cells
or every property in the coverage checklist. Optional unrequested settings belong
in report applicability notes, not synthetic blocked/completed ledger entries.
Approved-baseline obligations need their actual approval/source/version and saved
verification; current Cvent values alone do not supply desired-state authority.

Example entry (not an actual requirement):

```json
{"id":"sheet:cell-or-stable-id","label":"Requirement description","source":"Sheet!A1","expected":"exact RR value","status":"unverified","verification":"","reason":""}
```

Statuses:
- unverified: not yet independently checked.
- partially_verified: some required readback remains.
- verified_existing: a saved existing match independently verified.
- verified_changed: changes saved and independently read back.
- blocked: an applicable requirement with a specific evidenced reason.
- excluded: genuinely outside operating boundaries, with a reason; not completed.

Before changing a verified requirement, mark it unverified again. Update entries
as verification or blockers are established. A blocked requirement is not a terminal
run status: record its source, reason and affected dependents, then select independent
executable work in the required stage order from operating-model.md. Account for
Event details before Registration Types and the remaining ordered stages; record
Sessions, Emails and Code Snippets as skipped/excluded, never completed.
Do not count clicks, Save dispatches, tool success or filesystem writes as saved Cvent changes.

Unverified does not mean untouched. Use the existing status, verification, reason and status-bound presentation.action to state what evidence actually establishes. Identify known unfinished work and its concrete next step, not a generic instruction to open a potentially absent report. Do not fabricate missing actions or relabel old records. If Stop prevents reporting, the saved ledger remains available for review but a final report may not exist. Do not claim that the dashboard supplies a fallback report, and do not continue execution to generate one.

## Field-specific action items

For every incomplete applicable item, name the actual item and affected Cvent field/header. Put the exact observed worksheet and cell/range in `source` (for example `07 Discount Codes!L2`); retain additional dependency sources in `verification`/`reason`. Do not invent cell coordinates from example layouts or infer them from requirement IDs. If a source cannot be established, explicitly say it was not recorded or could not be resolved.

State what was saved or not changed using the evidence-bound action, why it is unfinished in `reason`, and the exact human decision/fix in `presentation.nextAction`. Prefer “Automatically apply this discount is blank” to “null value” or an API exception. Missing fields must not be masked by a generic next step or an unrelated blocker. Do not claim that nothing changed after a possible write; use unknown and stop according to the safety rules. Do not ask for a new run as a substitute for identifying the missing field, and never recommend resuming a stopped/uncertain job.

Synthetic example only, not a real workbook finding:

```json
{"label":"Discount code EXAMPLE","source":"07 Discount Codes!L2","status":"blocked","verification":"","reason":"Automatically apply this discount is blank; the new discount was not created.","presentation":{"status":"blocked","summary":"EXAMPLE was not created because Automatically apply this discount is blank.","action":"not_changed","nextAction":"Enter Yes or No for Automatically apply this discount in L2."}}
```

A separate complete discount continues through the existing build order. These statuses do not instruct the controller to bypass a hold. Optional unrequested settings belong in applicability notes rather than synthetic blocked rows. Keep every applicable item individually visible in its existing status category; unfinished discounts remain first inside Needs attention, not a new Discounts section.

## Plain-language result sentences

Alongside status, verification and reason, include a status-bound `presentation` object on every new requirement from ledger initialization onward. Name the actual business item/code in its summary so it is identifiable without opening technical details. Before any authoring of that requirement, truthfully state that it has not yet been changed by this run (`action: "not_changed"`). Immediately before dispatching an edit/Save, change the action to `unknown` until saved readback establishes the result; never leave a stale no-change claim across a possible write. Existing/historical unverified records cannot be assumed untouched. The same build session writes these sentences; do not launch a second agent, a paid summary pass or a new run. This object is presentation only and cannot change completion or safety rules.

```json
{"status":"verified_existing","summary":"The exhibitor Hotel Info link is already correct.","action":"unchanged","nextAction":""}
```

This is the shape of `requirement.presentation`, not a real job requirement. Its `status` must equal the requirement's current status; update or clear it whenever that status or evidence changes. Before a new edit, revoke any stale verified summary along with the verified status.

- `summary`: one short natural-language sentence, or two very short ones (aim for20 words or fewer; maximum180 characters). Say what happened or what still needs attention, once. Prefer “saved”, “already correct”, “not changed” and “needs checking” over jargon. Use business names, not internal IDs, UUIDs, API/receipt names, paths or URLs. Do not repeat the heading, action note or next step. Keep exact evidence in the existing fields.
- `action`: `saved` only when the stated change/portion was independently read back; `unchanged` when existing settings were checked without editing them; `not_changed` when no configuration was performed for that requirement; `unknown` when action/save status cannot be established. Never infer this from “partially verified” alone. `verified_changed` requires `saved`; `verified_existing` requires `unchanged`.
- `nextAction`: one short remaining action (aim for12 words or fewer; maximum160 characters), or an empty string if none. Prefer “Check the price in preview” to an explanation of the checking process. Separate a business decision from a missing tool capability or untested behavior. Never turn an uncertain write into a routine missing-input note.
- Optional `issueKey`: a short stable letters/numbers/underscore/hyphen key for requirements sharing the same evidenced issue. Use an identical summary/next action only when it truly describes all of them. The current UI retains each requirement individually, including identical issues; don't merge different causes merely to reduce counts.

### Separate an existing configuration match from unfinished preview verification

If saved settings match but required registration-preview behavior remains untested, keep status `partially_verified`, retain the readback in `verification`, and always give a concise truthful `reason` identifying the untested requirement. Keep the named item and unfinished check together in `presentation.summary` and give the exact next step. Do not emit the optional configurationStatus/remainingCheck facets for new results: the deployed UI can move those facets out of its attention list. Do not remove a real reason to obtain prettier grouping. For example (synthetic, not an RR default):

```json
{"label":"Admission price","status":"partially_verified","verification":"Saved price independently read back.","reason":"Registration-preview pricing behavior remains untested.","presentation":{"status":"partially_verified","summary":"Admission price matches; registration-preview verification is unfinished.","action":"unchanged","nextAction":"Check the price in registration preview"}}
```

Count the requirement once and keep it unfinished. Saved configuration alone is not full verification; `unchanged` alone proves neither correctness nor completion. Apply the same precise reason/next-step discipline to unresolved mappings, partial field readback, unknown actions and additional dependencies. Never hide uncertainty in an ordinary preview note. The dashboard keeps partial preview work in Needs attention; this status cannot be promoted to completed by friendlier wording. Source, action, readable reason and next step should be visible in the result row, with longer evidence retained in its disclosure. Do not rewrite old records to improve display. Maintain complete, truthful new ledger entries and let raw statuses, INCOMPLETE and STOPPED remain authoritative.

Examples of tone: “Admission saved. Check its price in preview.” / “The price matches. Confirm the pass.” / “Discount dates still need verification against the workbook.” These are examples, not workbook-specific defaults or evidence. Do not claim the whole requirement complete if only saved fields were checked and required behavior remains untested. Legacy records without these fields must stay honest; do not rewrite old reports or manufacture missing actions just for display.

Before meaningful batches, update currentStage, currentAction and ISO updatedAt.
Include the requirement/purpose and prefix the action with READ, EDIT,
SAVE_PENDING, VERIFY or LOCAL. These are agent-reported progress, not independent
write counters. Keep output concise and avoid dumping the whole ledger per turn.

## Result

Write reports/final-report.md and reports/final-report.json. Markdown includes
the event ID/name, workbook/checksum, verified changes/matches, source-referenced
blockers and untested behavior, exclusions, source-backed mappings, evidence
references and observed Draft state. Retain separate internal names, display text,
source codes and observed resource IDs. Unresolved aliases are blockers, not accepted
inferred mappings. Include optional settings preserved and approved-baseline
provenance in applicability notes, without completion credit for unrequested work.
For a material source conflict, identify both interpretations/locations, the exact
decision needed and affected dependents; distinguish missing essential input,
unsupported capability and uncertain write outcomes. No secrets or attendee data.

Minimum successful JSON:

```json
{"eventId":"<authorizedEvent.apiEventId>","status":"DONE","completion":{"requirements":true,"draft":true},"blockers":[],"untested":[]}
```

DONE means every applicable RR requirement and relationship is independently
verified saved, required behavior checks passed, Draft is verified and nothing
remains uncertain. Once all independently executable work is processed, otherwise
use INCOMPLETE with accurate boolean flags and nonempty blockers/untested as applicable;
use STOPPED for interruption/uncertainty. Do not settle early for an ordinary blocker.
Do not disguise unsupported in-scope work as an exclusion or omit unattempted work.

Record unresolved writes in unresolved-changes.json as
{"uncertainWrites":[...]} with observed IDs and evidence. Never clear a hold or
replay a mutation to finish the report. If Stop prevents reporting, stop anyway.
The controller makes the terminal decision after settlement and cleanup; native
exit alone does not prove DONE. It stops Pi and Steel while retaining evidence.
