---
name: cvent-discounts
description: Configure Cvent discount codes and group or volume discounts from an Emerald RR workbook using the Cvent API. Use to map exact discount values, resolve event and item eligibility, prevent duplicates, create or update authorized discounts, and independently verify saved discount behavior. Requires documented API schemas, credentials and explicit target-event scope.
---

# RR discounts through the Cvent API

Read [runner integration](../cvent-rr-build/references/runner-integration.md) and [RR interpretation](../cvent-rr-build/references/rr-interpretation.md). Use "$CVENT_API_BIN" and "$CVENT_API_GUIDE" for actual calls, not a standalone HTTP helper. The adapter accepts any operator-selected event name; its verified UUID/name binding, ownership, supported patch fields and no-replay rules remain in force. Registration-type Advanced Filters are not exposed: block discounts requiring them before any write rather than create broader eligibility. This file supplies configuration instructions, not an executable discount engine or standing write authorization.

## Work as a broad specialist

Read [operating model](../cvent-rr-build/references/operating-model.md). Pi loads this skill when discount requirements or dependencies make it useful—not necessarily first. Keep ordinary codes, group rules and volume discounts in one domain skill. Derive the mapping from the actual workbook and current API schema, not fixed sheet names, columns, example payloads or an assumed set of code types.

The checklist below describes fields to consider where applicable; it is not permission to invent values or configure every discount feature. Pi chooses the supported calls and their dependency order. Carry the coordinator's exact target, source cells and already verified resource IDs forward. If required admissions or optional items don't exist yet, use the registration skill to resolve that prerequisite before dependent discount writes; do not launch another agent.

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
4. Read fresh baseline state before a write. For replacement-style PUT, retain unrequested writable properties and existing links unless the user has separately authorized removing them. If existing conflicting links prevent an exact match under the no-delete scope, report it; don't silently keep them and claim compliance.
5. Prepare the documented payload with the required fields only. Do not assume the API supports every eligibility condition in the workbook. A missing endpoint/schema feature is a blocker, not license to send guessed properties.
6. Execute one intended write. If creation/linking/activation requires several calls, treat each as a separate state transition with acknowledgment and independent readback. Do not activate a partly configured rule. Do not toggle an existing active discount unnecessarily.
7. Read the saved discount and relationship set independently. Account for documented eventual consistency with bounded read-only checks, not repeated POST/PUT. Verify unchanged properties were preserved as well as requested properties saved.

Acknowledge partial success explicitly. If a later link fails, retain the created object's observed ID and unresolved state; don't delete it as cleanup or repeat creation. Following a timeout, denial, lost acknowledgment or contradictory readback, stop further mutations and reconcile. Do not switch to Ego to bypass an API rejection.

## Routes and known limits

The previously reviewed local public API used event-scoped routes under `/events/{event-id}/discounts` and item association routes under the selected discount. Treat these as lookup hints: confirm the current official method, payload, schema and link semantics before execution. Never copy a historical write payload or private receipt and replay it.

No bulk submission, attendee record access, session/speaker configuration, publishing or shared/account definition changes are included here. A Session-type discount dependency is outside this build's operating boundaries. Do not equate 'API supports it' with 'authorized for this build'.

## Completion evidence

For each RR discount: source cells, observed resource ID, action (matched/created/updated), exact verified values and eligibility, saved associations, and any unresolved condition. Pass that to `cvent-rr-verify`. HTTP 200/201, an assigned ID, or a discount appearing in a list is not proof its full behavior matches the RR.

No live discount execution has been proven by installing this skill. Skills cannot grant missing OAuth scopes or replace mutation uncertainty handling in the actual tool.
