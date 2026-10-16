# Assigned Cvent discount API

Business policy is [.pi/skills/cvent-event-build/SKILL.md](.pi/skills/cvent-event-build/SKILL.md).
This guide describes executable inputs and evidence, not additional business rules.
Use only `"$CVENT_API_BIN"`; it is bound to the current RR_WORKSPACE/job and event.
Credentials are supplied privately. Never inspect/print credential files or tokens.
Browser login and verified Return are separate prerequisites from OAuth.

## Available operations

`"$CVENT_API_BIN" capabilities` reports the installed operation map without a live
write. The RR CLI permits configureDiscount and configureVolumeDiscount authoring;
the current skill uses only configureDiscount. Other library writers are rejected
before credentials, OAuth, locks, receipts or network dispatch. Their existence does
not authorize importing the library, raw HTTP or a browser fallback after API denial.

Catalog reads (no attendee records):

| Operation | Input and binding |
| --- | --- |
| getEvent | Bound selected event. |
| listAdmissionItems, listRegistrationPaths, listRegistrationTypes | Bound event catalogs. |
| listQuestions | Bound event questions. |
| listQuestionChoices | data.questionId; complete event-question membership is checked. |
| listFees, listVouchers, listDiscounts, listDiscountedAgendaItems | Bound event catalogs. |
| listQuantityItems, listDonationItems, listEventFeatures | Catalogs, not attendee quantities; capability does not expand scope. |
| listContactTypes, listEventCustomFieldDefinitions | Read-only shared definitions, not contacts. |

Complete pagination preserves filters and rejects malformed/foreign pages, repeated
cursors and more than 200 pages. Use needed catalogs, not indiscriminate bulk output.
The human-only probeBulkAccess maintenance operation is not an RR tool or bulk authoring
capability. No bulk submission is implemented. Do not run or replay historical probes.

## Calls

```sh
"$CVENT_API_BIN" capabilities
"$CVENT_API_BIN" getEvent </dev/null
"$CVENT_API_BIN" listRegistrationTypes </dev/null
```

Writes take JSON on stdin:

```json
{"rrReferences":["<actual sheet!cell>"],"data":{"code":"<intended code>","discountId":"<observed UUID if existing>","patch":{}}}
```

Placeholders illustrate syntax, not executable values. data supports code, patch,
discountId, createIfMissing, agendaItems and removeAgendaItems. rrReferences retain
actual source provenance even when a policy rule supplies the intended value.
Output is a concise private receipt pointer. Receipts retain baseline, body,
acknowledgment and independent saved readback; do not dump entire private logs.

## configureDiscount schema

The selected event must match its bound UUID/name and remain unpublished; no naming
prefix is required. Complete inventory rejects ambiguous codes, UUID duplicates,
account-level/type collisions, unknown baseline fields or foreign event claims.
Only EVENT-level discounts can be updated. Code matching is exact; case-insensitive
collisions do not authorize changing the literal supplied code. No rename is exposed.

Supported patch fields:
- name: nonempty, at most 50 characters; code at most 30 characters.
- active, stackable, includeGuestsTowardsCapacity, autoApply: explicit booleans on creation.
- method: {type: BY_AMOUNT | BY_PERCENTAGE | FLAT_PRICE, value: nonnegative number};
  percentages cannot exceed 100.
- audienceType: PRIMARY, GUEST or ALL. These are not registration-type filters.
- capacity: {total: integer from -1 through 32767}, not below observed usage.
- note: nonempty when changed, at most 300 characters.
- effectiveFrom, effectiveTo: valid YYYY-MM-DD or explicit null for clearing.

No code/type/level/used edits or arbitrary patch properties. Registration-type Advanced
Filters are not exposed: block unsupported required eligibility before writing, rather
than creating a broader discount. Policy-derived values remain subject to validation.

Exact supplied-value matches return unchanged. Existing differences use a preserved
PUT and return updated only after verification. Missing identities require
createIfMissing:true plus complete values. Previously verified IDs are retained locally;
a stale catalog must not cause duplicate creation.

## Dates and item relationships

Omitted date patch keys preserve existing bounds; a date sets the bound; null clears
it. Blank strings, date-times, invalid/reversed dates and other types are rejected.
The adapter translates null intent into omission of only that date from the full
preserved PUT body, not a nullable wire value. Cvent resets omitted PUT fields to their
defaults, so unrequested writable settings must be carried forward. Readback requires
each cleared bound absent/null, exact set dates and preserved other fields/links.
Already unrestricted bounds are no-ops. Setting new business intent follows the skill.

agendaItems contains 1–100 unique {id,type} entries, with actual event catalog UUIDs
and type AdmissionItem or QuantityItem. The skill determines which are in scope.
No sessions, attendee, donation or unsupported links. Supplied items select item-scoped
application; there is no independent input for simultaneous final-total application.
For date/property-only updates, omit agendaItems to preserve links.

For existing discounts, supplied agendaItems is the full nonempty desired set.
Removing a current link requires observed discountId and explicit removeAgendaItems,
1–100 unique supported entries, disjoint from the desired set and exactly matching
current links omitted from it. createIfMissing:true is forbidden with removals.
The adapter rechecks event/item/discount baselines, dispatches each DELETE once,
requires HTTP204 and verifies the full set before additions/property updates.
Unknown, foreign, shared or session links block the operation. Unlinking preserves
both the discount and item; whole-discount deletion is not implemented.

An active rule must not pass through an empty linked set. Full retargeting therefore
requires an authorized, verified deactivation first, link reconciliation while inactive,
then verified final activation. Record intermediate states as unfinished if interrupted.
Removal codes must already be item-scoped. Unknown active state and empty final sets
are unsupported. Already-absent removals with an incomplete desired set block rather
than trigger guessed recovery.

For new item discounts, the adapter creates inactive, verifies the ID, adds links,
then finalizes desired values; codes begin in final-total mode and switch to item mode.
Do not manually replay this lifecycle. Failure can leave a real partial object.

## Safety and evidence

The adapter requires a compatible RUNNING job and matching AGENT/runtime/tab/session
identity before intent and again at paced dispatch. Kernel flock owns the persistent
api-operation.guard inode; never unlink or replace it. An unheld guard file is not an
active operation, but every legacy api-operation.lock remains blocking. Lock release
does not clear durable intent, uncertainty or unfinished read receipts.

Write intent and api-write-uncertain.json precede dispatch. Acknowledgment is not
verification. Bounded read-only polling runs through 60 seconds; it never retries a
mutation. Saved values, full item links and unrequested business fields must verify.
Ownership loss, Stop, wrong IDs, stale/conflicting readback or incomplete execution
retain uncertainty. browser-save-uncertain.json also blocks API writes. No marker
clearance, intent replay, alternate transport or stopped-session recovery.

Public APIs provide no atomic uniqueness/ETag guarantee here; fresh checks reduce
but do not eliminate concurrent-edit risk. A verified receipt proves the checked
operation, not the full workbook or registration behavior. Passing offline tests
is not tenant permission or live acceptance. Follow the [runner contract](.pi/skills/cvent-event-build/references/runner-contract.md)
for final requirement-level evidence and remaining work.
