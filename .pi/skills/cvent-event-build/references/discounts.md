# Discount codes: existing guarded adapter

[SKILL.md](../SKILL.md) defines business values, defaults and item-first resolution of
Final total conflicts. [Runner integration](runner-integration.md) binds the tool.
Read "$CVENT_API_GUIDE" for the actual input schema; this file adds no API capability.
Volume Discounts, Session/Optional Item columns and non-admission fees are excluded.
Do not call configureVolumeDiscount merely because the adapter still exposes it.

## Resolve then call

Use "$CVENT_API_BIN" only. Confirm the bound unpublished event, complete event
inventory and unique discount identity before creation. Resolve listed Admission
Items to actual event UUIDs. Preserve unrelated writable fields/associations on
updates. A blank existing field is not a request to reset it; a required blank on
creation uses the skill's approved default, including explicit No booleans and -1
unlimited discount capacity. Rejecting a supplied/defaulted value remains a tool
limitation, not permission to patch the adapter or claim it saved.

Dates: omit a patch key to preserve, give YYYY-MM-DD to set, or explicit null to
clear an existing restriction for source "None". A blank existing optional date now
preserves. On creation, optional blank dates are omitted; use the approved date
fallback only if actually required. Preserve valid nonblank dates, applying the
skill's reversed-range decision and recording original versus chosen values.

For the approved Final total + Admission Items conflict, attach the listed items.
The installed adapter selects item-scoped application when agendaItems are supplied;
do not claim it independently configured both modes. Record the item-first decision.
Do not invent an unsupported patch property. Unsupported registration-type Advanced
Filters still cannot be simulated by audience flags or item links.

## Input and safety

Write JSON uses actual rrReferences and data with code, patch, optional discountId,
createIfMissing, agendaItems and removeAgendaItems under the documented schema.
Codes/names are not UUIDs. Source references remain mandatory technical provenance
even when a chosen value comes from an approved default rather than the cell literal.
Record that rule in the ledger; never manufacture a cell containing the default.

Use createIfMissing only after absence is established. The adapter's existing
create/link/finalize lifecycle and durable intent/readback remain unchanged. It may
create inactive, attach items and finalize the approved state; do not manually replay
these transitions. A failure can leave a real partial object: retain IDs/evidence,
stop if effects are uncertain and never issue a duplicate create as cleanup.

Existing association replacement requires observed discountId, a nonempty complete
desired agendaItems set, explicit disjoint removeAgendaItems, and the adapter's
baseline/event-scope checks. AdmissionItem links are the in-scope desired links in
this build. Do not delete optional/session objects or silently ignore conflicting
existing effects. An active discount cannot pass through an empty link set: follow
the documented supported deactivation/readback conditions if required for an authorized
replacement, then verify its final active state. Do not bypass a refusal. These
operations unlink associations, not whole discounts or items.

## Evidence and completion

Inspect the adapter's private receipt for relevant saved properties, event identity
and complete item links, not credential-bearing/raw bulk logs. Verify the result
matches the approved derived intent, including scope and preserved properties. Use
bounded read-only checks where supported; never retry an unknown write. Successful
HTTP alone is not saved configuration proof. Record field-specific Not done items
and continue independent work only when no unresolved effects remain.

No registration preview or test registration is part of this build. Do not add a
preview-only blocker or claim discount behavior was exercised. Pass source values,
approved decisions, saved evidence and each unfinished field to [runner contract](runner-contract.md).
