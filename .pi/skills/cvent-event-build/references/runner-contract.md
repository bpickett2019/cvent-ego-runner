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
executable work. Account for the registration-types-first pass before later authoring.
Do not count clicks, Save dispatches, tool success or filesystem writes as saved Cvent changes.

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
