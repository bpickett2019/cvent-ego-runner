# Discount tool

Use [SKILL.md](../SKILL.md) for business decisions and [runner integration](runner-integration.md)
for binding. Read "$CVENT_API_GUIDE" for the actual input schema, then use only
"$CVENT_API_BIN". This reference adds no authoring capability.

## Prepare

Resolve the intended discount uniquely in the complete bound-event catalog and
resolve required items to actual event UUIDs. Preserve unrelated writable fields
and associations. Use createIfMissing only after absence is established.

Inputs contain actual rrReferences and data with code, patch, optional discountId,
createIfMissing, agendaItems and removeAgendaItems. Record policy-derived values
separately; do not manufacture a workbook cell containing the default.

Date patch keys: omission preserves, YYYY-MM-DD sets, explicit null clears a bound.
The adapter translates clearing into its preserved full PUT; it does not send null
dates on the wire. Derive the desired intent from the skill, not this transport rule.

Supplying agendaItems selects item-scoped application; the adapter cannot independently
configure both final-total and item-scoped modes. Registration-type Advanced Filters
are not exposed. Audience flags and item links are not substitutes for those filters.
Unsupported required eligibility blocks the discount before writing.

## Execute and verify

The adapter owns OAuth, pagination, durable intent, dispatch and bounded readback.
Its create/link/finalize lifecycle can leave a real partial object on failure. Retain
IDs and evidence; never duplicate-create, replay transitions or delete as cleanup.

Association replacement needs observed discountId, a complete nonempty desired
agendaItems set and explicit disjoint removeAgendaItems matching the omitted links.
An active rule must not pass through an empty link set. Full retargeting requires
prior authorized, verified deactivation and final reactivation under the API guide.
Unlinking does not delete a discount or its items. Do not bypass a refusal.

Inspect the private operation receipt for saved properties and complete links.
HTTP success alone is not saved verification. A verified result covers the adapter's
checked values/preservation, not all workbook semantics or registration behavior.
Unknown effects stop further writes; a known pre-write limitation leaves independent
work available. No raw HTTP or browser discount fallback after denial.

Record saved evidence and field-specific remaining work using the
[result contract](runner-contract.md). Do not add preview-only completion gates.
