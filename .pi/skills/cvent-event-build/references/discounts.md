# RR discounts through the Cvent API

Read [runner integration](runner-integration.md) and [RR interpretation](rr-interpretation.md). Use "$CVENT_API_BIN" and "$CVENT_API_GUIDE" for actual calls, not a standalone HTTP helper. The adapter accepts any operator-selected event name; its verified UUID/name binding, ownership, supported patch fields and no-replay rules remain in force. Registration-type Advanced Filters are not exposed: block discounts requiring them before any write rather than create broader eligibility. This file supplies configuration instructions, not an executable discount engine or standing write authorization.

## Missing values are item-specific blockers, not defaults

A blank “Automatically apply this discount” does not mean No/false. Creation requires an explicit source-backed application flag; record the named discount, field, worksheet/cell and required Yes/No decision in Needs attention before any write, then continue independent complete discounts. For a genuinely optional unrequested setting on an existing discount, omit that patch key and preserve the observed value; do not count preservation as a supplied RR choice. Do not coerce null/empty text to false, and never submit an incomplete create as a test of Cvent defaults. The adapter's validation remains authoritative.

Blank capacities/usage limits do not become 100,000 or unlimited. Keep these distinct from the approved blank optional-date rule below. Known missing data or unsupported eligibility blocks the affected discount/dependents; a possibly executed or uncertain API write still stops all mutations.

## Align discount dates with the RR

Use the installed adapter's documented `effectiveFrom`/`effectiveTo` patch semantics for codes and volume rules: omit a key to preserve its current value, supply an exact `YYYY-MM-DD` to set it, or supply explicit `null` to clear that restriction. Apply the standing optional-date default in [RR interpretation](rr-interpretation.md): a genuinely blank optional start means no start restriction; a genuinely blank optional end means no expiration; both blank means no date window. For each such blank bound, send explicit `null`, not an omitted key that would retain a conflicting existing restriction. Preserve exact nonblank dates. Resolve formulas/references first; missing or unread fields and `TBD` are not confirmed blank optional dates. This default applies to requested in-scope discounts, not other blank properties, quantities or usage limits; a different rule requires explicit operator approval for this bound job. If a bound cannot be cleared through the supported adapter, report the capability blocker rather than inventing a date or bypassing a denial.

For a date-only correction, omit `agendaItems` and unrelated patch properties. The adapter reads and preserves the existing eligibility/links, application flags, amounts, limits and active state. It converts null intent into omission of just the date fields in a full preserved Cvent PUT and independently checks that the requested dates are saved or the cleared restrictions are absent. Do not issue raw PUTs, delete/recreate a discount, toggle it unnecessarily, substitute show dates or bypass a denial through the browser. If a saved value does not verify, preserve uncertainty and stop mutations; do not replay. Date support does not resolve another eligibility or item-scoping blocker, and it does not authorize changing unrelated event dates.

## Use this reference within the single build

Read [operating model](operating-model.md). Follow the full process order: Event, Registration Types, Admission Items, skipped Sessions, Optional Items and Fees precede Discount Codes; Volume Discounts follows Discount Codes, before Website. Use verified mappings and required admissions/item links before dependent discount writes. Read-only prerequisite discovery is not permission to start with discount authoring. Keep ordinary codes, group rules and volume discounts in one domain reference. Derive the mapping from the actual workbook and current API schema, not fixed sheet names, columns, example payloads or an assumed set of code types.

The checklist below describes fields to consider where applicable; it is not permission to invent values or configure every discount feature. Pi chooses supported calls within each scheduled stage; do not move discount authoring ahead of the earlier stages. Carry the coordinator's exact target, source cells and already verified resource IDs forward. If required admissions or optional items remain blocked after their scheduled stages, keep the dependent discount blocked; do not create substitute items, bypass the order or launch another agent.

## Before calls

- Confirm the chosen RR/version and event API UUID/displayed name. Preserve the selected event's identity and unpublished state.
- Determine whether each row requests a discount code, a volume/group rule, an example, or duplicated template guidance. Do not create rows containing placeholders or blindly merge `Group Discounts` with `Group_Volume Discounts`.
- Resolve every required value and dependency before dispatch. Missing admission/quantity-item IDs may require browser configuration first. Do not invent IDs or create unrelated objects solely to satisfy a request body.
- Use the current official Cvent endpoint/schema and documented account grants. The guarded adapter supplies event-bound pagination, validation, durable intent and readback, but its verified result is not proof of complete RR business semantics. Use configureDiscount/configureVolumeDiscount and only the related reads listed in runner integration. Let the adapter perform each supported create/link/finalize transition; do not issue raw HTTP steps. All required fields must be representable before any write; missing capability is a blocker, never a browser fallback.

## Exact mapping checklist

For each applicable row, determine from the actual RR and schema:

- Exact name and literal code (where a code exists); code versus volume type; event-level scope.
- Active state, stackability, fixed price versus amount reduction versus percentage reduction, and exact value/units.
- Effective start/end, any registration-open/show-close references, timezone/date boundaries as supported by the API.
- Audience: primary invitees, guests, or both; whether guests count toward usage/capacity.
- Usage/capacity limits, application/auto-apply behavior and eligibility restrictions.
- Final-total versus item-specific application; exact eligible items and all required relationships.
- For group/volume rules: threshold interpretation, included registrants, interval, primary-registrant inclusion and applicable items.
- Internal notes only where supplied or explicitly requested; do not publish internal instructions as display copy.

Inspect Excel percentage formatting. Do not send `0.1` as 0.1% if the workbook displays 10%. A '$1 testing' code is neither free nor permission to create a fake registration for testing. A label such as '3–5 registrants' must agree with the threshold fields and actual Cvent semantics; flag contradictions rather than using the name alone.

## Reconcile and execute

1. Read the complete event discount inventory with original query filters preserved across pagination. Read existing eligible-item relationships as needed. Keep account/shared discounts distinct from event-only resources.
2. Resolve identity uniquely. Check exact names/codes and potential case-insensitive collisions without rewriting the RR's literal spelling. If multiple candidates exist or scope is uncertain, stop that requirement for clarification.
3. Compare all supplied properties and existing relationships. Reuse an exact match. Update an authorized differing event-only discount rather than manufacturing a duplicate. Create only when complete inventory evidence establishes it is missing.
4. Read fresh baseline state before a write. Preserve unrequested writable properties and links. For an explicit RR-required event-only eligibility correction, supply the observed `discountId`, the nonempty desired full `agendaItems` set and exact `removeAgendaItems` list of removed AdmissionItem/QuantityItem references. The lists must be disjoint and removal must match the complete observed baseline; no implicit removal, empty final set, shared/session scope or create-if-missing request. The adapter dispatches each documented unlink once, checks HTTP204 and independently verifies the complete link set before additions/final updates. An active rule cannot pass through an empty item set: if full retargeting is necessary, first separately deactivate and verify through the supported update operation, record that intermediate state as unfinished, then reconcile links and verify the RR's final active state. Never invent that step for unrelated changes. Unknown state or partial recovery remains blocked. This is link replacement, not whole-discount deletion; do not silently substitute unlinking, disabling or hiding for a requested object deletion.
5. Prepare the documented payload with the required fields only. Do not assume the API supports every eligibility condition in the workbook. A missing endpoint/schema feature is a blocker, not license to send guessed properties.
6. Execute one intended write. If creation/linking/activation requires several calls, treat each as a separate state transition with acknowledgment and independent readback. Do not activate a partly configured rule. Do not toggle an existing active discount unnecessarily.
7. Read the saved discount and relationship set independently. Account for documented eventual consistency with bounded read-only checks, not repeated POST/PUT. Verify unchanged properties were preserved as well as requested properties saved.

Acknowledge partial success explicitly. If a later link fails, retain the created object's observed ID and unresolved state; don't delete it as cleanup or repeat creation. Following a timeout, denial, lost acknowledgment or contradictory readback, stop further mutations and reconcile. Do not switch to Ego to bypass an API rejection.

## Routes and known limits

The previously reviewed local public API used event-scoped routes under `/events/{event-id}/discounts` and item association routes under the selected discount. Treat these as lookup hints: confirm the current official method, payload, schema and link semantics before execution. Never copy a historical write payload or private receipt and replay it.

No bulk submission, attendee record access, session/speaker configuration, publishing or shared/account definition changes are included here. A Session-type discount dependency is outside this build's operating boundaries. Do not equate 'API supports it' with 'authorized for this build'.

## Completion evidence

For each RR discount: source cells, observed resource ID, action (matched/created/updated), exact verified values and eligibility, saved associations, and any unresolved condition. Pass that to the [verification reference](verification.md). HTTP 200/201, an assigned ID, or a discount appearing in a list is not proof its full behavior matches the RR.

No live discount execution has been proven by installing this reference. Skills cannot grant missing OAuth scopes or replace mutation uncertainty handling in the actual tool.
