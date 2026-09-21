# Supported Cvent API tools

## Current authorization and executable contract

Use `"$CVENT_API_BIN" capabilities` for the production operation map. Pi chooses between these supported tools and Ego/Steel; there is no API-first requirement. One fresh native Pi session owns RR interpretation and execution; this adapter is transport/validation/evidence, not another agent or SDK-building task.

Across the entire approved event-build SOW, create or modify existing objects, settings and relationships when event-only, including admissions. Reuse exact RR matches. Never modify existing shared/account-wide objects or definitions; reuse an exact shared match or create a separate required shared build object only when its isolation is established. An event URL, label, catalog membership or new template alone is not proof. Event-only registration availability/capacity differs from shared contact-type names/codes. **Never delete/archive anything**, including new objects and links. No replacement payload may silently remove existing configuration. Fixed selected-event identity/name, Draft, no other-event changes, communications, attendee/registrant access or sessions/speakers work remain mandatory.

Authorization is not API availability. The reviewed public specification exposes no isolated contact-type creation route; custom-field definition POST is account-wide and cannot establish that existing events/forms/defaults are unaffected. These remain explicit tool blockers, not a blanket prohibition on required shared creation. Existing shared definition edits are never exposed. Event custom-field answer PUT remains blocked: no reliable classification distinguishes ordinary build answers from integration identifiers. Do not blindly enable legacy helpers.

RR-required prices, fees, discounts and surcharges may be modified, including on existing items, when their effects are confined to the selected event. A monetary value alone is not a prohibited merchant/payment change. An RR-required event-only surcharge is assessed by its actual scope and supported workflow. Existing shared/account-wide payment, tax and currency configuration remains protected. No account administration, merchant/payment-account provisioning, banking/settlement, credentials or integration-identifier changes. Never infer missing amounts, dates, eligibility or required creation fields; use supported routes, not an invented API method or a bypass of a failed API write.

## Connection and usage

The installed clients are at `~/cvent-agent/src/cvent/api.ts` and `~/cvent-ui-automation/src/cvent-api.ts`. The former supplies event reads; the latter's reviewed field projections/route semantics inform guarded writes. Installed-client fetch is read-only (plus OAuth); legacy mutators cannot dispatch through it. The adapter reuses its scoped collection reader, paced transport and durable CLI receipts for explicit writes. No arbitrary HTTP operation is exposed.

OAuth credentials remain local: `CVENT_CLIENT_ID`, `CVENT_CLIENT_SECRET`, `CVENT_API_BASE_URL`, optionally loaded from `CVENT_CREDENTIALS_FILE`. Never print credentials/files/headers/tokens. Human browser authentication and verified Return to Agent are still required. A running job and AGENT ownership bind the tool to `$RR_WORKSPACE/job.json`; callers cannot select a different event or override its name using historical `api-current-event.json`.

```sh
"$CVENT_API_BIN" capabilities
"$CVENT_API_BIN" getEvent </dev/null
"$CVENT_API_BIN" listRegistrationTypes </dev/null
```

Writes take `{ "rrReferences": ["<actual sheet!cell>"], "data": <operation input> }` on stdin. References must identify this RR's requirements; examples are syntax, never invented input values. Outputs are concise receipt pointers. Full baselines, outgoing bodies, acknowledgment and saved readbacks stay in private `receipts/api-<uuid>.json`. `verified` means verification of supplied operation values/preservation, not semantic completion of the workbook.

### Bulk API access — blocked in the current connection

`"$CVENT_API_BIN" capabilities` now lists a separate human maintenance command: `probeBulkAccess --confirm-empty-job`. It is **not a runtime RR operation or bulk authoring tool**. It requires idle USER ownership outside `RR_WORKSPACE`, an unchanged selected API event and no unsettled jobs/operation locks. It confirms the event is unpublished, requests one empty POST bulk job with a fixed selected-event discount destination, then reads only the returned job ID. No data, upload, run, cancellation, arbitrary destinations/IDs, account administration or event writes are exposed. Providing data when creating a Cvent bulk job automatically starts it; the probe never includes that property.

The authorized live probe on **2026-09-21** reached event verification, then `POST /bulk-jobs` returned **403, “Access is forbidden”**. No records or run request were submitted. Receipt: `logs/bulk-access/receipt.json`; Cvent request ID `76f730d3-d192-4733-aedf-a7fbbfd7da34`. This proves the current connection's create request was denied, not the precise missing permission. Bulk read access and destination execution remain untested. A Cvent administrator must check `bulk/bulk-jobs:read`, `bulk/bulk-jobs:write` and destination write permissions; do not change credentials/permissions here or bypass the denial through UI imports.

Follow-up authorized read-only audit obtained a fresh token whose `scp` metadata listed 75 documented scopes, **neither bulk scope**. All 15 exposed reads passed. The credentials file has no client-ID/secret environment overrides. The user's screenshot shows both checkboxes selected, so reconcile the exact configured application and saved/applied grants; the screenshot alone does not identify the client, and the mismatch's exact cause is unproven. The current published SDK OpenAPI is unchanged from the reviewed file. See [the full API review](docs/API-ACCESS-REVIEW.md) and `logs/api-access-review/live-access.json`. No bulk retry or permissions/credential changes were made.

The receipt prevents repeat probes, including after timeouts or missing acknowledgments; do not delete it to retry. No app restart, paid RR session, browser launch or budget reset accompanied this check. Actual bulk submission/result handling/cancellation/saved verification is **not implemented or advertised as available**. Bulk wraps supported public destination writes; it does not provide missing admission/fee/path/question/designer authoring APIs. A later implementation must handle asynchronous Stop/cancellation (not rollback), partial/per-record failures and independent saved verification before exposing record submission.

### Read operations

| Operation | Reviewed route / binding |
|---|---|
| `getEvent` | GET `/events/{selectedEvent}` |
| `listAdmissionItems` | GET `/admission-items`, fixed `event.id` filter |
| `listRegistrationPaths`, `listRegistrationTypes` | GET selected-event `/registration-paths`, `/registration-types` |
| `listQuestions` | GET `/event-questions`, fixed event filter |
| `listQuestionChoices` | `{questionId}`; complete event-question membership proof, then GET `/event-questions/{questionId}/choices` |
| `listFees`, `listVouchers` | GET selected-event `/fee-items`, `/vouchers` |
| `listDiscounts`, `listDiscountedAgendaItems` | GET selected-event `/discounts`, `/discounts/agenda-items` |
| `listQuantityItems`, `listDonationItems` | GET selected-event optional-item catalogs, not attendee quantities |
| `listEventFeatures` | GET selected-event `/features` |
| `listContactTypes` | GET `/contact-types`: shared definitions only, no contact/attendee records |
| `listEventCustomFieldDefinitions` | GET `/custom-fields`, fixed `category eq 'Event'`: shared definitions only |

Complete pagination preserves original filters/limits and advances only the cursor. Foreign/conflicting links, malformed pages, repeated cursors and >200 pages fail without partial results. Historical `listSessions` is now explicitly blocked as outside SOW. New shared-catalog scopes are `event/contact-types:read` and `event/custom-fields:read`; actual tenant grants require live validation. Read-only inspection of the selected event remains available after current-run uncertainty, never as authorization to continue writes.

### Event basics: `updateEvent` / `updateEventBasics`

Input is a nonempty patch. Supported changes: `description`, `note`, `start`, `end`, `closeAfter` (registration deadline), `timezone`, `format`, `capacity`, `venues`, `showVenueLocation`, `showPointOfContact`. The retained `(C+D)` guard applies. `title` may only equal the current title; planners, languages and event type may only be supplied unchanged. `archiveAfter` is carried forward unchanged, never edited; status/publish/launch/payment fields are not writable.

PUT `/events/{selectedEvent}` uses fresh read/merge state, required baseline fields and the installed client's nested writable projections. UTC date-times must be valid, scheduling ordered, numeric/boolean fields typed, text nonempty/bounded. Languages must contain exactly one baseline language (public API supports writing one), planners at most one. Unknown baseline/nested fields fail before intent rather than risk lossy replacement.

`venues` accepts exactly one **patch to the existing single event venue** (or a new single venue if none exists). Name/address changes merge existing nested fields; empty arrays/nulls and shared venue IDs are rejected. Address keys: address1/2/3, city, regionCode, countryCode, postalCode. Existing street/other fields remain. Read-only geocoding and region/country display labels may change with requested address codes; writable codes and all other business fields must verify. No planner/contact-definition mutation is granted. If baseline requirements or preservation cannot be met, block before writing.

### Event registration assignment: `updateRegistrationType`

Input: `{registrationTypeId, patch}`. Supported patch keys: `openForRegistration`, `automaticOpenDate`, `automaticEndDate`, `capacity: {total}`. Resolve the ID uniquely in the complete selected-event registration-type catalog. The documented `RegistrationType1` schema marks name/code/description/virtual read-only; the writable availability/dates/capacity are event registration settings, **not shared contact-type definitions**, even when IDs coincide.

PUT `/events/{selectedEvent}/registration-types/{id}` preserves all other writable baseline fields. No name/code/definition edits, deletion, empty date clearing, arbitrary IDs or extra fields. Capacity is an integer >= -1 (-1 unlimited), never below observed consumed capacity. Saved verification checks the entire registration-type catalog, including unchanged shared labels and unrequested settings; only audit fields and mathematically derived remaining capacity may differ.

### Build feature enablement: `enableEventFeature`

Input: `{type: "Website" | "Registration"}`. Enables an existing unlocked feature via PUT `/events/{selectedEvent}/features/{type}` with `enabled: true`, preserving baseline tier/config. Already enabled is a no-op. No disable, launch/publish, Marketing/Agenda/Speakers, tier changes or merchant/payment/currency configuration inputs. Registration enablement requires a complete existing pricing baseline (enabled, invoicePrefix, revenueGoal, merchantAccount, currency, allowedPaymentMethods); otherwise it blocks before intent instead of inventing payment defaults. Complete feature readback must equal the baseline plus enablement and event must remain unpublished. A successful acknowledgment with absent feature identity (null or a partial object containing only known feature fields) now requires that same full independent readback rather than stopping solely because type is absent. Foreign type/identity, unknown shape/fields or conflicting acknowledged values still stop immediately; stale/conflicting readback retains uncertainty. No HTTP failure or mutation is replayed. This is not a Site Designer authoring API.

### Discounts: `configureDiscount` / `configureVolumeDiscount`

Code input: `{code, patch, discountId?, createIfMissing?, agendaItems?}`. Volume input substitutes exact `name` for `code`. Scans the complete event discount catalog; UUID duplicates, ambiguous identities, account-level/type collisions, unknown baseline fields and wrong event claims block before intent. Only `level: EVENT` can be updated. Supply observed `discountId` when available. Case-insensitive code collision detection never substitutes different literal RR spelling; no code rename or invented suffix. Volume names match exactly, not approximate spelling or rule equivalence.

- Exact supplied-value matches return `action: unchanged`. Existing event-only differences now use a preserved **PUT**, return `action: updated` after saved verification, and never force duplicate creation.
- Missing identities require `createIfMissing: true` plus complete values; one POST, followed by acknowledgment and independent bounded readback. Verified IDs are retained job-locally in `api-discounts.json` / `api-volume-discounts.json`; a stale later catalog cannot turn a known ID into creation.
- Code patch keys: name, active, stackable, method, effectiveFrom, effectiveTo, note, audienceType, includeGuestsTowardsCapacity, autoApply, capacity. Method requires `{type: BY_AMOUNT|BY_PERCENTAGE|FLAT_PRICE, value: <nonnegative number>}`; percentages <=100. Capacity contains only total, integer -1..32767, not below observed used capacity. Audience is PRIMARY/GUEST/ALL. Availability/application booleans must be explicit for creation. Dates are valid YYYY-MM-DD and ordered; note <=300 characters, nonempty when changed. Name <=50, code <=30. No code/type/level/used edits.
- Volume patch keys: active, stackable, method, effectiveFrom, effectiveTo, note, thresholdType, thresholdLimit, interval, includePrimaryRegistrant. Threshold types: ALL, AFTER_THRESHOLD_LIMIT, BEFORE_THRESHOLD_LIMIT, EVERY_NTH_REGISTRANT. Threshold is positive integer; interval 1..10, meaningful only for EVERY_NTH_REGISTRANT (otherwise 1). Primary-registrant inclusion is meaningful only for BEFORE_THRESHOLD_LIMIT (otherwise false). All meaningful values must come from the RR. Names cannot be renamed. Volume bodies never acquire code-only capacity/audience/application fields.
- `agendaItems` is 1–100 unique `{id, type: AdmissionItem|QuantityItem}` references resolved through complete selected-event catalogs. No sessions, attendees, donation or unsupported membership links. Membership is established by documented event-owned admission/quantity catalog semantics, not an arbitrary URL claim.
- For **existing** discounts, omitted agendaItems preserves existing links. Supplied agendaItems is the desired full set: it must include every current link. Missing links are added once via PUT `/events/{event}/discounts/{discount}/agenda-items/{item}` with independent full link readback after each. Removal/replacement is prohibited. Code item-scoping sets applyToAllAgendaItems true only with the explicit item set. An existing active rule stays at its original availability until any requested final value update; no unsolicited deactivate/reactivate writes.
- For **new** item discounts, the retained bounded lifecycle creates inactive, verifies the new ID, adds each link, then finalizes desired values. Codes initially use final-total mode, then item mode; volumes have no code application flag. No standalone arbitrary link tool. A failure anywhere leaves the entire partial operation uncertain; no cleanup deletion.

Polling is bounded, read-only, with increasing delays through 60 seconds. All unrequested discount business fields and links must remain unchanged. HTTP 201/200 is acknowledgment, not saved verification. Stale reads, wrong IDs, conflicting state or exhausted polling never cause mutation retries. Public APIs provide no ETag/atomic uniqueness guarantee here: fresh checks reduce, not eliminate, concurrent-edit/stale-catalog risk.

## Coverage gaps and native execution

See [CVENT-API-COVERAGE.md](CVENT-API-COVERAGE.md) for the route/schema inventory. This adapter exposes scoped event/registration/discount/feature writes, not question, admission-item, registration-path or layout creation. Missing methods do not prove Cvent cannot create those objects. Always distinguish an absent authoring helper from an explicitly blocked operation. For documented gaps, inspect the assigned Ego UI workflow after proving event-only effects or isolated new shared creation. A rejected API write or uncertain result never authorizes browser fallback. Explicitly blocked updates must not be rerouted through Ego.

Use current documentation/catalog evidence, not assumptions or speculative save attempts. Under the SOW, missing RR-required shared types may be created separately without editing existing definitions or affecting other events, but only through actually supported, non-blocked, scope-proven workflows. No new account-global navigation grant is implied. A blocked dependency only blocks requirements that actually depend on it. Continue independent safe work; report precise missing inputs, scope restrictions and unsupported operations. Do not perform it, bypass a guard, or treat a general instruction to finish as authorization. No additional approval endpoint, replacement process or automatic reprompt is implied.

Turn comparison into execution: reuse verified exact matches; update supported existing event-only differences; create only genuinely missing required objects with complete inputs. Do not stop at a comparison report or duplicate an existing admission to avoid editing it. Admission-item authoring is a documented API gap: use the supported assigned Ego workflow after proving scope, not an invented API call. Compare all applicable values and relationships, not just names/IDs. Verify saved fields and connections after each change; clicks, toasts and accepted requests are not proof.

Pi chooses tool order and task grouping, without batching across uncertain execution or skipping per-write verification. A concrete blocked workflow need not be repeatedly probed without new input/evidence; continue independent requirements instead. This does not certify browser coverage or change any denial/Stop rule.

Fetch each needed complete catalog and compare RR rows locally with Python/`rr-evidence`, explicit field mappings and exceptions-only output; complete evidence stays local. Separate literal display text from embedded authoring instructions. Identity matches alone are not satisfaction. Refresh for saved-state verification. No mandatory route plan, ledger schema, checklist engine or automatic audit. In Site Designer, Continue retains current work; do not Restore historical state as a workaround. Run DONE concerns only applicable event-build SOW work, connected, verified and saved Draft; broader project delivery is not a prerequisite.

## Stop, evidence, privacy and activation

The CLI requires RR references, RUNNING state and matching AGENT/runtime/tab/session identity before intent and again at actual paced mutation dispatch. Each command owns an exclusive operation lock; stale locks are never stolen. Durable intent and `api-write-uncertain.json` precede the network request. Every mutation path is sent at most once within a command. Acknowledgment and independent readback are retained. Ownership/Stop/foreign-marker changes at completion prevent clearing uncertainty. Errors retain credential-redacted diagnostics; no OAuth body or raw non-JSON response is persisted. The scoped-write dispatcher now also retains bounded, credential-redacted JSON acknowledgment bodies (or an invalid-JSON classification), including request ID and shape, before identity validation. This provides future diagnostic evidence; it does not recover the missing historical feature response or prove its exact failure cause.

A current-run `browser-save-uncertain.json` also blocks API mutations, including at paced dispatch; reads remain available. The project browser save helper and pending-save guard are documented in `.pi/skills/ego-browser/references/steel-bridge.md`. It never verifies persistence merely from a UI completion signal. The server-side immediate uncertainty-stop classifier and DONE marker gate require an authorized app restart; CLI/bridge changes load on invocation. No restart accompanies this implementation.

Current-run uncertainty stops the run and blocks both API and Ego writes; read-only observation is allowed. Crashes, disconnect, identity/ownership loss, expired login, secrets and operator Stop remain global stops. Never clear uncertainty to continue, replace the browser or replay an uncertain save. Fresh jobs inherit no historical repair task or uncertainty gate; historical evidence/costs remain untouched. These are cooperative tool guards, not a hostile-shell sandbox.

User removed the automatic dollar threshold. Costs still sample every two seconds and settle per run; historical totals/reset credits remain intact. Unknown/lost metering still fails closed. No budget reset or paid authorization is implied. CLI code loads on invocation; **the spending-monitor change requires an authorized app restart**. No restart was performed for implementation.

## Historical live evidence (not current permission or replay instructions)

No full event-build acceptance has passed. Historical Medtrade Clone 2 API reads covered event details, admissions, registration paths/types, questions/choices, fees, vouchers, discounts/links, optional catalogs and features. The earlier session read audit predates the current no-sessions restriction. Event note and registration-type capacity write/restore tests passed; a separately authorized registration-deadline correction remains. Custom-field answer testing was unchanged-value only, not evidence to edit integration identifiers. An inactive discount note update/restoration passed with delayed readback, demonstrating why acknowledgment is not verification.

Private evidence remains at `~/.cvent-pi-agent/rr-runs/api-read-validation-henHcx/`, `api-scope-audit-PSdqaZ/`, and `api-note-test-7f65725d-c2e3-4477-9371-c36aadf34e04/` under the same root. Do not rerun historical mutation scripts. Sources and prior counts remain in CVENT-API-COVERAGE.md, CVENT-SDK-REVIEW.md and MVP-HANDOFF.md. New scoped capabilities are offline-tested, not live-certified; no completed-RR or cost guarantee follows from mocks.
