# Whole-run acceptance contract

This defines the finish line; it does not claim a run has reached it. Business policy
remains the exact client `.pi/skills/cvent-event-build/SKILL.md`. Technical guidance,
tests and UI categories cannot add scope, waive a required saved value or change that
policy. The agent leaves registration testing to humans and the event in Draft.

## One acceptance target

Before freezing a workbook-specific requirement map, record the exact original
workbook/version and SHA-256, the operator-selected event name/API UUID and the skill
hash. Use the current job's binding at execution time. A similarly named workbook,
a matching sample of cells or a historical job does not establish that binding.

Discover included business sections by names, headers and content, not worksheet
position or numeric prefix. Workbook layout may change; execution order always comes
from SKILL.md. Reordering alone is not a blocker or a request for approval. Logical
ordering is normally sufficient; any useful derived working view keeps its source
mapping and never replaces or rewrites the bound original.

Inventory all included rows, Notes instructions, fields and relationships from the
original workbook under the skill's scope and filters. Retain original values,
policy-derived intent and source references separately. Historical requirement IDs
can guide discovery but are not proof that every included workbook requirement was
captured. A previous run's count is not a completion target or denominator for a new
run until source coverage is reconciled.

For each requirement, record: source → approved intended result → supported operation
→ saved verification → remaining dependency. This is an acceptance checklist, not a
new runner, permission system or mandatory extra agent.

## Pass conditions

| Check | Required evidence |
| --- | --- |
| Source coverage | Every included workbook requirement is accounted for, including Notes and relationships. Exclusions cite the skill rather than a tool limitation. |
| Correct target | Current event ID/name match the job binding and the event remains unpublished/Draft. No other-event or account-wide changes. |
| Saved configuration | Every included requirement is verified_existing or verified_changed against approved intent, with saved readback/evidence. |
| Relationships | Required type/item/fee/path/question/choice/footer associations and saved conditions are verified, not only object names or existence. |
| Honest decisions | Every approved fill-in and judgment retains original versus chosen values and its governing rule. Unsupported operations, missing assets and unresolved identities are not replaced by invented placeholders. |
| Preservation | Existing blank fields and unlisted configuration are preserved under the skill; relevant unrequested settings and unnamed-path footer effects are checked where changes could affect them. |
| No unfinished work | No included unverified, partially_verified or blocked requirement remains; Not done is empty. A skipped ambiguous fee/assignment is not silently marked satisfied or reclassified as out of scope. |
| No uncertainty | No unresolved current-run writes or controller holds remain. No replay, marker deletion or stopped-session resumption was used to obtain completion. |
| Truthful report | Required report sections disclose changed versus checked-existing settings, defaults, judgments, warning-saves, exclusions and registration testing not performed. |
| Settled run | The controller confirms terminal settlement and cleanup/accounting. A model report alone does not grant DONE. |

A concurrent-editor warning alone follows the skill's save-and-disclose rule, but
saved readback is not proof that another editor's unrelated work was preserved.
Ordinary pre-write blockers permit independent work; they do not count as completed
requirements. Stop and uncertainty restrictions always retain their existing force.

## What Saved means

Changed settings and settings already correct in Cvent both count when fully verified.
Keep their action descriptions truthful: saved by this run versus checked unchanged.
The existing UI may group a partially verified item under Saved when a portion has
evidence. That display is not whole-item acceptance. Full completion is based on all
required saved configuration, never on moving every row into a particular UI group.
Do not promote or rewrite historical statuses/reports to satisfy this contract.

When every pass condition holds, use the skill's exact result:

> Configuration saved under the approved build rules. Registration testing was not performed.

Otherwise report INCOMPLETE or STOPPED as the skill/controller require. No automatic
next build is authorized by an incomplete result or by a coding-session Goal.

## Evidence levels and approval gates

- **Source inspection:** instructions/capabilities exist in a particular snapshot.
- **Offline tests:** fixtures establish only the behavior those tests exercise.
- **Installation:** reviewed source hashes are installed; this is not a Cvent build.
- **Live saved evidence:** actual bound configuration and relationships were reread.
- **Human acceptance:** authorized testers assess the result separately.

An upload test establishes upload/parsing, not configuration or registration behavior.
The agent does not run registration previews, submit registrations, publish or claim
commercial acceptance. Deployment, paid builds and human-access operations retain
the separately approved gates in the [readiness plan](END-TO-END-READINESS.md).

## Step 1 completion gate

The finish-line definition above is established. The workbook-specific Step 1 is
complete only when the original workbook/version and event are explicitly selected,
the original checksum is recorded, and the complete included requirement map has a
proposed operation, saved-proof route and explicit dependencies for each requirement.
Until then, any map made from historical results is provisional. Do not mark Step 1
complete merely because this document exists.
