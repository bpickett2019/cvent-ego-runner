# Cvent API first; Steel/Ego only for unsupported capabilities

This is a native Pi tool connection, not another agent. The installed Cvent clients are reused from:
- `~/cvent-agent/src/cvent/api.ts` (event reads and custom-field answer updates; its event PATCH helper is not used)
- `~/cvent-ui-automation/src/cvent-api.ts` (verified event PUT and registration-type updates)

The runner keeps the same Pi model, workbook tools and assigned Steel/Ego bridge. API credentials use Cvent OAuth client credentials (`CVENT_CLIENT_ID`, `CVENT_CLIENT_SECRET`, `CVENT_API_BASE_URL`), not a browser password. `CVENT_CREDENTIALS_FILE` names the existing local `.env` containing those fields. Only those fields are loaded; never print the file, keys, Basic header or bearer tokens. The server and tool read them locally. No keys are sent to the dashboard, job prompt, or receipts.

## Production RR exact-match / separate-creation policy — current

The production CLI is **read/reuse/create-only**. Its `capabilities` output separates allowed `operations` from `blockedOperations`. All legacy `updateEvent`, `updateEventBasics`, `updateRegistrationType` and `updateEventCustomFieldAnswers` requests are rejected before network access: no event rename, event-setting update or existing-item edit. The underlying adapter retains legacy helpers for separate integrations and historical regression tests; that is not an RR authorization or a browser-fallback reason.

Reuse only exact RR matches. Any RR-specified difference requires a separate RR-compliant object, leaving the original unchanged. Similar purpose or approximate spelling is not satisfaction. `configureDiscount` and `configureVolumeDiscount` never edit existing objects: matching supplied values yield `action: unchanged, requirementsSatisfied: true`; differing supplied fields yield `action: creation-required, requirementsSatisfied: false`, `differences`, an adapter `limitation`, and receipt status `CREATION_REQUIRED`. Comparisons cover the supplied fields, not complete workbook interpretation; supply/check all RR-required values and relationships. The `verified` flag means the saved identity/state was read, not full RR completion.

This adapter supports POST only when its requested identity is absent. Volume names now match exactly (case and internal whitespace included); an equivalent rule with another name does not block creation. Discount codes retain conservative case-insensitive collision detection, but different literal spelling is reported as a difference, never satisfaction. **Same-identity variant creation is an unsupported authoring capability in this adapter.** Ego may create a separate object for this gap only when Cvent permits it without altering RR names/codes or modifying originals. A singleton setting or enforced unique-key collision is a concrete blocker, not permission to invent a suffix, overwrite, bypass a rejection or stop independent work.

For item-scoped creation, the same command may link explicitly resolved admission/quantity items and finalize that newly created discount, after proving its identity from this command's POST and saved readback. This is bounded initial configuration of a new object, not a standalone update/link grant for existing codes. The production before-dispatch guard rejects all other mutations before durable write intent. These are production tool guards, not a shell sandbox or proof of object-level Ego enforcement. See [E2E-ACCEPTANCE.md](E2E-ACCEPTANCE.md) for the remaining SOW gates.

The historical write audits below predate this preservation policy and must not be replayed.

## Preflight and event identity

**Find event via API** authenticates and searches exact event names using read-only API requests. Full pagination must finish; zero matches or duplicate names block selection. API authentication failure does not silently become a UI lookup.

The production login-first flow provisions a clean browser at Start Build with no Pi process or paid prompt. Verified human Return to Agent precedes paid local RR reading. Human Cvent login in the assigned Steel browser happens before Cvent configuration. Return to Agent confirms the displayed event name and API/browser identity. Currently, the browser URL's event UUID must equal the API event UUID; differing/legacy evtstub values are blocked until a verified mapping is available. No mapping is guessed. Setup performs an API identity and unpublished-status read plus browser login verification before the execution prompt; local-only intake has no authoring permission.

## Pi tool usage

First read and understand this job's actual RR locally. Then read this guide and run:

```sh
"$CVENT_API_BIN" capabilities
"$CVENT_API_BIN" getEvent </dev/null
"$CVENT_API_BIN" listRegistrationTypes </dev/null
```

The helper gets the immutable event UUID from `$RR_WORKSPACE/job.json`. An API caller cannot supply a different event. It requires a RUNNING job and AGENT ownership. Read commands remain available after an uncertain write to reconcile the same event. No arbitrary endpoint, delete, publish, feature launch, communication, event create or event copy method is exposed.

Write inputs arrive on stdin, with source evidence references and an operation-specific `data` object:

```sh
"$CVENT_API_BIN" configureDiscount <<'JSON'
{"rrReferences":["Discounts!B2"],"data":{"code":"WORKBOOK_CODE","patch":{"note":"Workbook-required note"}}}
JSON
```

This is a syntax example, **not authorization to overwrite an existing code**. It will leave a found code untouched and report whether new creation is required; a missing code blocks without explicit complete creation data. Only execute values explicitly required by this job's workbook and approved SOW.

Supported adapter operations:

| Operation | Purpose / data |
|---|---|
| `getEvent` | Read the approved event |
| `listAdmissionItems` | Read event-scoped admission items |
| `listRegistrationPaths` / `listRegistrationTypes` | Read event-scoped registration configuration |
| `listQuestions` / `listSessions` | Read `/event-questions` or `/sessions` with the approved event filter; sessions remain outside the RR SOW |
| `listQuestionChoices` | `{questionId}`: first prove membership in the complete approved-event question catalog, then paginate `/event-questions/{questionId}/choices`; scope `event/events:read` |
| `listEventFeatures` | Read `/events/{id}/features`; scope `event/event-features:read`; no feature setting/launch writes |
| `listFees` / `listVouchers` | Read `/events/{id}/fee-items` or `/events/{id}/vouchers` |
| `listDiscounts` / `listDiscountedAgendaItems` | Fully paginated event-scoped discount catalog and discount/item links |
| `listQuantityItems` / `listDonationItems` | Fully paginated event-scoped optional-item catalogs; these are not attendee quantity updates |
| `updateEvent` / `updateEventBasics` | **Blocked in production:** existing event settings and name are preserved |
| `updateRegistrationType` | **Blocked in production:** reuse the existing type unchanged |
| `updateEventCustomFieldAnswers` | **Blocked in production:** preserve existing answers/integration identifiers |
| `configureDiscount` | `{code, patch, discountId?, createIfMissing?, agendaItems?}`; reuse an existing code unchanged or create a confirmed-missing event-level code with complete explicit data; optional items are `{id, type: "AdmissionItem" | "QuantityItem"}`; see below |
| `configureVolumeDiscount` | `{name, patch, discountId?, createIfMissing?, agendaItems?}`; same create-only lifecycle for named event volume rules; see volume contract below |

The retained `(C+D)` guard is **not permission to rename an event or bypass the API through UI**. If that client refuses the target, report an integration/policy blocker. The failed live event PATCH route is disabled. An invalid preserved registration deadline/end-date combination blocks PUT before write intent; correcting scheduling requires separate explicit authorization. Client method availability is not a guarantee that every tenant exposes the same operations. A non-2xx response is not automatically an unsupported-capability determination.

Outputs are concise receipt pointers. Full API results and verification evidence are in `receipts/api-<uuid>.json`; inspect only relevant fields with the existing file/workbook tools rather than repeating expensive calls or dumping large responses into context. Mock tests do not certify live writes. Event-note and registration-type capacity write/restore tests pass. The custom-field endpoint accepted an unchanged-value PUT; changed-value custom-field persistence and full RR execution remain unvalidated. The API returns no ETag for this target: fresh baseline checks minimize, but cannot eliminate, the concurrent-edit window.

### Live diagnosis: Medtrade Testing Clone 2

The event PATCH returned HTTP 404. The PUT route accepts authentication but returns HTTP 400: **Registration Deadline should be before Event End Date**. This clone ends `2026-09-04T21:00:00.000Z`, while its existing registration deadline (`closeAfter`) is `2026-11-16T06:58:00.000Z`. Preserving those values causes Cvent validation to reject the update. No dates were altered to force the test through. Authoritative readback confirmed the original note and unrelated fields; restoration was unnecessary. This was the initial blocker. Following explicit user approval and review of the official SDK documentation, the deadline was corrected to `2026-09-04T20:00:00.000Z`. The existing `updateEvent` operation then successfully wrote and independently verified the test note, restored the original note, and independently verified restoration. Only the authorized deadline correction and normal audit metadata changes remain; all unrelated event fields were verified unchanged.

Initial failure evidence: `~/.cvent-pi-agent/rr-runs/api-note-test-7f65725d-c2e3-4477-9371-c36aadf34e04/put-test-validation-detail/`.
Successful correction/test/restoration evidence: the sibling `sdk-reviewed-deadline-and-note-test/` directory, phase `PASSED_AND_RESTORED`. No paid RR execution or browser fallback occurred.

See [CVENT-SDK-REVIEW.md](CVENT-SDK-REVIEW.md) for the official SDK/quickstart review and subsequent route fixes. The three read-route discrepancies are now corrected in this runner, without modifying the installed upstream clients or adding an SDK dependency.

### Live read validation

All eight exposed read operations passed on this clone: event details, 33 admission items, 13 registration paths, 36 registration types, 117 questions, 290 sessions, 271 fee items and 2 vouchers. Event state was unchanged. Evidence: `~/.cvent-pi-agent/rr-runs/api-read-validation-henHcx/`.

All exposed collection operations share a small official-route reader. It preserves the event filter and page size while advancing only the cursor, matching the official SDK behavior. Cvent's token-only next links do not remove event scope. Malformed pages, conflicting/foreign links, repeated cursors and more than 200 pages fail rather than return a misleading partial success. HTTP errors are not retried or treated as browser-fallback permission. Questions require `event/events:read`, per the official specification.

`npm test` covers the adapter, durable CLI receipts and the runner. Live tests below are separate. To explicitly repeat the read-only smoke test (not part of `npm test`):

```sh
CVENT_CREDENTIALS_FILE=/path/to/existing.env node test/live-api-reads.mjs
```

That script is fixed to the authorized testing clone and permits only GET requests and OAuth token POSTs. It writes private per-run results/HTTP receipts and verifies the event is unchanged. The read validation performed no mutations. Subsequent explicitly authorized write tests are recorded below.

### Additional live write validation

On the same unpublished, test-mode clone:

- **Registration type:** `Attendee- New` capacity changed from **100 to 101**, was independently verified, then restored to **100** and verified again. Both PUTs returned HTTP 200. Other registration types, availability flags, scheduling and unrelated event fields were preserved.
- **Event custom-field answers:** a PUT of the existing `Franchise Product with Year` value returned HTTP 200 and passed independent readback. This was deliberately a **same-value write**, not a changed-value persistence test: existing free-text fields are integration identifiers and `Sync event to A2Z` is enabled. No identifiers or sync settings were changed. A safe disposable field is needed to test an actual custom-field value change.
- All business state matched the immediate pre-test baseline after completion; only normal audit metadata may differ. No unresolved write marker remains. The prior authorized registration-deadline correction remains in place.

Evidence: `~/.cvent-pi-agent/rr-runs/api-note-test-7f65725d-c2e3-4477-9371-c36aadf34e04/additional-writes/`, phase `PASSED_WITH_CUSTOM_FIELD_NOOP_LIMITATION`.

The same existing API adapter used by Pi executed these tests. Pi remains the native RPC backend; no replacement agent, SDK migration, publishing, deletion, explicit communications or paid RR execution occurred. A complete RR workflow and API writes outside the exposed capabilities are not certified by these tests.

## Expanded API/browser coverage audit

See [CVENT-API-COVERAGE.md](CVENT-API-COVERAGE.md) for the broader live audit, exact browser configuration backlog and remaining integration gaps. Discounts, discount-item associations, quantity/donation catalogs, features and all 77 eligible question-choice lists were read successfully. A separate inactive-discount note write/restore test passed, including full discount/association preservation checks. Discount-code configuration is exposed as `configureDiscount`, including initial item associations on a code newly created in the same command. `configureVolumeDiscount` now exposes new named volume rules and their initial item associations. Modifying any existing discount or association remains prohibited.

That test confirmed delayed discount readback after HTTP 201. An immediately unchanged search result is not proof that an accepted write did nothing. Keep uncertainty until bounded read-only polling verifies saved state; never resend a mutation to overcome stale readback.

## Discount-code configuration

Use `listDiscounts` first and reconcile by **code**, not display name. `configureDiscount` accepts only event-level `DISCOUNT_CODE` records on the guarded unpublished `(C+D)` event. It scans the complete event catalog; case/whitespace-equivalent duplicate codes, duplicate IDs, account-level matches and identity conflicts block writes. Existing code spelling is preserved, never renamed. Supplying the observed `discountId` is recommended and prevents creation if that record disappears.

```sh
"$CVENT_API_BIN" configureDiscount <<'JSON'
{"rrReferences":["Discounts!B2"],"data":{"code":"WORKBOOK_CODE","discountId":"00000000-0000-0000-0000-000000000000","patch":{"note":"Exact workbook-required note"}}}
JSON
```

This is syntax, not authorization or a real target ID. Use only values required by the workbook. The patch allowlist is `name`, `active`, `stackable`, `method`, `effectiveFrom`, `effectiveTo`, `note`, `audienceType`, `includeGuestsTowardsCapacity`, `autoApply`, `capacity`. Methods require both `type` (`BY_AMOUNT`, `BY_PERCENTAGE`, `FLAT_PRICE`) and numeric `value`; capacity accepts only `total`. Effective dates use `YYYY-MM-DD`; clearing dates is not supported. Read-only fields, code/type changes, changes to existing associations and unknown fields are rejected. Initial links for a new code must be supplied separately as `agendaItems`, not in the patch.

- Existing records are never written. A matching request returns `action: unchanged, requirementsSatisfied: true`; a differing request returns `action: creation-required, requirementsSatisfied: false` with differing field names and the same-identity adapter limitation. Both retain the authoritative saved state and identity. Even a code created earlier in this job is immutable on subsequent calls.
- A missing code blocks unless `createIfMissing: true` is explicit and `discountId` is absent. Creation additionally requires a complete patch: name, active, stackable, full method, audienceType, includeGuestsTowardsCapacity, autoApply and capacity.total. No availability or financial values are inferred. Without `agendaItems`, creation is final-total (`applyToAllAgendaItems: false`); dates/note are optional. With `agendaItems`, this command performs initial item-scoped creation as described below. Volume rules use the separate `configureVolumeDiscount` contract; standalone association writes are not exposed.
- Event identity/status and code matching are checked again before durable intent. There is no server-side ETag or atomic uniqueness guarantee: these checks reduce but cannot eliminate concurrent external edits or stale searches.
- For confirmed-missing creation, exactly one POST is dispatched; existing codes dispatch no mutation. New item-scoped codes additionally use one PUT per confirmed-missing link and one finalizing PUT, never repeating a sent mutation. The original baseline, full outgoing body, acknowledgment ID/status and poll snapshots are retained in the receipt. HTTP 201 is acceptance, **not** verification.
- Bounded read-only polling follows the installed client's increasing-delay pattern, extended to 60 seconds. It preserves uncertainty through stale reads and rejects unexpected changes. A final complete catalog scan checks code uniqueness and saved state. HTTP failures are not retried. Request/pagination time can extend elapsed time beyond the polling schedule; allow sufficient Bash time (e.g. 180 seconds), and reconcile any timeout instead of replaying.
- Verified identities are saved in private job-local `api-discounts.json`. Later calls must match those IDs; a stale catalog cannot silently turn a previously verified update into a create. Stop or failed verification keeps the existing uncertainty marker, blocking API and browser writes while allowing reconciliation reads.

Verification: offline mocked create/reuse/difference, update-denial, deduplication, stale-read, preservation, failure and CLI durability tests; all 1,251 code discounts in the saved live snapshot passed an **offline no-op compatibility check**. The prior live note write/restore proves that endpoint, not every financial field or creation. This integration made no new live mutations. Creation, financial-value changes and volume/association writes are not live-certified.

## Initial item-scoped discount creation

`configureDiscount` now accepts `agendaItems: [{"id":"<approved item UUID>","type":"AdmissionItem"}]` (also `QuantityItem`). Supply this alongside the complete RR-backed patch and `createIfMissing: true`. This uses the reviewed official `PUT /events/{id}/discounts/{discountId}/agenda-items/{agendaItemId}` and discount PUT routes, not UI fallback.

- Resolve all 1–100 distinct item UUIDs through complete event-scoped admission/quantity catalogs. Registration-type IDs, session/attendee IDs, guessed values, malformed/partial catalogs and foreign-event items are rejected. Donation reads are available, but the reviewed discount association `EntityType1` enum does not include DonationItem, so donation linking is not exposed. Session/session-bundle associations remain outside this SOW; membership associations lack an approved event-bound catalog route in this adapter.
- Create the absent code **inactive** and final-total temporarily. Verify its new identity, then link only the explicit scoped items while still inactive. Read back the complete link set after each PUT. Finally PUT the requested complete values with `applyToAllAgendaItems: true`, including the RR's desired active value, and independently verify the discount, exact links and unchanged item catalogs.
- This is one initial configuration command, not a resumable series of arbitrary update calls. The CLI accepts follow-on PUTs only for the ID proven newly created by that command, checks ownership/target and its own uncertainty marker before each write, and retains all intent/acknowledgment/readback phases in one receipt. An existing code—including one created in an earlier call—is never edited or given new links.
- Stop, HTTP failure, missing/stale readback or conflicting state retains uncertainty for the **whole creation**, including an inactive partial object. Do not replay, complete it with another command, delete it or switch to a browser. Reconcile uncertain saved state; never replay it.
- Missing eligibility semantics and ambiguous values remain blockers for their dependent rows. Volume requirements use the supported contract below. Item links do not implement arbitrary registration-type eligibility. Independent fully specified rows should still proceed through supported API writes.
- Validation: **138 offline tests pass**, `logs/api-item-writes-full-tests.log`, including production CLI POST/link/finalization, immutable existing codes, source evidence, complete scoped lookup, wrong scope/IDs, Stop/takeover, foreign uncertainty, delayed readback, no-replay and failure preservation. These tests use mocked HTTP, not live creation certification. No paid build or live Cvent mutation was used to implement this change.

## Volume-discount configuration

`configureVolumeDiscount` uses the public discount POST with `type: VOLUME_DISCOUNT`, plus bounded initial link/finalization PUTs only when `agendaItems` are supplied. It requires the same approved unpublished `(C+D)` target, RR source references, AGENT ownership, complete catalogs, durable intent and independent saved-state verification as codes. No additional credentials or direct HTTP authoring are needed.

Input shape (placeholders describe syntax, not approved financial values):

```text
{rrReferences: ["<sheet!cell>"], data: {
  name: "<exact RR rule name>", createIfMissing: true,
  patch: {active: <boolean>, stackable: <boolean>,
    method: {type: "BY_AMOUNT|BY_PERCENTAGE|FLAT_PRICE", value: <number>},
    thresholdType: "ALL|AFTER_THRESHOLD_LIMIT|BEFORE_THRESHOLD_LIMIT|EVERY_NTH_REGISTRANT",
    thresholdLimit: <positive integer>, interval: <1–10>, includePrimaryRegistrant: <boolean>},
  agendaItems: [{id: "<verified item UUID>", type: "AdmissionItem|QuantityItem"}]
}}
```

- Omit `agendaItems` only for a rule requiring no item associations; saved associations must then be empty. Otherwise supply 1–100 explicit admission/quantity items. Create inactive, verify, link, then finalize the desired active value; volume bodies never include code-only `applyToAllAgendaItems`, capacity or audience flags.
- All shown patch fields are explicit. `interval` is meaningful only for `EVERY_NTH_REGISTRANT`; otherwise use the API's neutral value `1`. `includePrimaryRegistrant` is meaningful only for `BEFORE_THRESHOLD_LIMIT`; otherwise it must be `false`. Meaningful values must come from the RR, not guesses. Optional `effectiveFrom`/`effectiveTo` are valid `YYYY-MM-DD` dates; optional `note` is at most 300 characters. Names are nonblank, at most 50 characters. Method values must be nonnegative; percentages cannot exceed 100.
- Public semantics: `ALL` discounts all registrations once the ordered-item threshold is exceeded; `AFTER_THRESHOLD_LIMIT` discounts those beyond it; `BEFORE_THRESHOLD_LIMIT` discounts through the threshold, subject to primary-registrant inclusion; `EVERY_NTH_REGISTRANT` discounts every interval counting from the threshold. Do not infer these from a vague "group discount" label. Arbitrary registration-type eligibility is not implemented.
- Match by **exact name**, not normalized spelling or rule equivalence. A different name permits separate creation with complete RR-backed values, even if another rule has identical terms. Duplicate IDs/exact names, missing names and account/type collisions still block this adapter's writes; same-identity variant creation needs a supported Ego creation workflow. Never invent another name to evade a platform constraint.
- Existing rules and links are immutable, even earlier same-job creations. Differing requested fields or associations return `creation-required`, not satisfied. Retain verified IDs in private `api-volume-discounts.json`; supply observed `discountId` when available. No standalone update/link tool is exposed.
- Failures keep the shared uncertainty marker for the whole partial creation, blocking both code and volume writes. Never replay, clean up or complete a partial object through another call/browser. No atomic server-side uniqueness/ETag guarantee exists; stale catalogs or concurrent external edits remain residual risk.
- New volume creation and associations are **offline-tested, not live-certified**. Existing historical note write/restoration does not establish volume financial behavior or completed RR acceptance.

## Requirement routing

After reading the workbook, Pi keeps concise source-referenced coverage notes. A living `route-plan.json` is optional working memory, not a required schema, prescribed execution order or per-step approval gate. Useful fields include:
- workbook source reference and desired state;
- separate readOperation and writeOperation, plus API support/coverage evidence;
- disposition: exact-match, creation-required, created, dependent, integration-gap or browser-gap;
- if UI is necessary, the documented unsupported capability;
- saved-result verification route.

API-first includes **writes**, not merely collecting read snapshots. Use supported APIs for eligible creations and saved-state verification; choose work order from actual dependencies rather than a fixed API/browser sequence. Do not stop at an inventory: execute separate RR-compliant creation for differing objects through supported routes. Preserve originals and reuse exact matches. Prefer API readback to verify UI work too. Site Designer theme/layout/pages/widgets are browser-only in the installed client's coverage documentation. For those and other documented gaps, load the installed Ego skill and use **only** `$EGO_BROWSER_BIN nodejs` in the assigned Steel browser.

**This adapter is not the entire Cvent API.** Missing helper methods do not prove API absence. Discount-code configuration now uses a deduplicated adapter, not the installed client's unconditional-create workflow. Volume creation and new-code/new-volume initial item associations are integrated; existing-discount and standalone association updates remain blocked by preservation policy. Report blocked work rather than rebuilding an SDK or agent during an RR.

Never use UI to bypass missing credentials, 401/403, wrong identity, policy denial, rate limits, server failures, timeouts, or uncertain API writes. Unsupported API coverage and failed API execution are different states.

## Stop, evidence and uncertainty

The CLI writes a durable intent receipt and `api-write-uncertain.json` **before** a mutation, and clears the marker only after successful saved-result verification. Failure or process cancellation leaves it intact. The marker blocks further API writes and Ego UI mutations; read-only API reconciliation is still allowed. Legacy `api-current-event.json` evidence remains preserved; production event updates are now rejected and the approved event name is immutable.

One API operation runs at a time per job using `api-operation.lock`. A lock left by an interrupted process is not stolen: the operator must verify the owned process is gone and reconcile the receipt before removing it. The tool has no blind HTTP write retries. Public errors remain generic; bounded, credential-redacted API validation details and request IDs are retained in failure receipts. OAuth response bodies and raw non-JSON errors are not retained.

Native Pi launches the CLI through its existing Bash tool. Stop uses queue clearing, native cancellation and owned-process cleanup; a sent network request cannot be rolled back. Job ledgers retain any unresolved API receipt after Stop. Never clear uncertainty evidence merely to continue execution.

The routing plan is an execution policy, not a new shell sandbox. Pi retains its original shell tools; Cvent credentials must remain appropriately scoped. There is no mandatory review phase. Native Pi executes and reports saved results and concrete blockers; DONE requires the native final report to confirm all scoped website, registration and dependencies saved and verified, still Draft, with no blockers or untested work. Otherwise settlement is INCOMPLETE, not a success inferred from session exit. See README.md for the small final-result shape; it is not an independent semantic audit. Stop, ownership, security and uncertain-write reconciliation remain enforced.
