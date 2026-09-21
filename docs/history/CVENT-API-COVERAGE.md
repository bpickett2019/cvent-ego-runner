# RR API coverage and remaining browser work

Validated 2026-09-19 against **(C+D) Medtrade Testing Clone 2**. This is a capability audit with representative reversible writes, **not a completed RR or exhaustive write test of every field**. Native Pi remains the execution backend. No paid RR was started, and nothing was published, deleted or sent to attendees.

## Scoped API expansion — current

The executable contract is now [CVENT-API.md](CVENT-API.md), not the create-only milestone below. Enabled existing **event-only** event basics/deadline/venue changes, registration-type availability/dates/capacity, discount and volume-rule value updates and additive admission/quantity links. Added Website/Registration feature enablement (not disable/launch) and shared contact-type/event-custom-field definition reads. Durable intent, acknowledgment, saved preservation verification, operation locks, immutable target/name, AGENT ownership and current-run uncertainty remain enforced. No shared-definition edits or deletion. The user also removed automatic dollar stops; per-run/historical cost tracking and lost-metering Stop remain. App restart for that monitor change is pending authorization.

### Reviewed route/schema inventory

Source: existing local official OpenAPI `/tmp/cvent-sdk-review/cvent-public-spec__openapi.yaml` (SHA-256 `8f0c0de7517d17ce347cf27cc1b39bbfe8ad3c91a7ad5141a1f817b22f513f66`), installed clients named below. No endpoint discovery or live write was used. Availability is distinct from authorization and tenant OAuth grants.

| SOW/dependency | Supported implementation / concrete gap |
|---|---|
| Event basics, dates/location | PUT `/events/{id}`, Event/EventUpdate/Venue/Planner schemas; guarded patch-to-full-body merge, fixed title, preserved planners/languages/type/archive schedule; no collection deletion |
| Registration assignment settings | PUT `/events/{id}/registration-types/{registrationTypeId}`, RegistrationType1/Capacity1; event availability/dates/capacity only; shared name/code/description/virtual read-only |
| Discounts/volume pricing rules | POST/PUT `/events/{id}/discounts[/{discountId}]`; existing `level: EVENT` updates and absent-identity creation; exact RR identity; no account discounts |
| Connections | PUT discount `/agenda-items/{agendaItemId}`; additive selected-event admission/quantity links; desired full set cannot omit existing links |
| Website/Registration prerequisite | PUT `/events/{id}/features/{type}`, FeatureUpdate; enable only, unchanged tier/config; no launch/disable or payment configuration inputs |
| Shared contact types | GET `/contact-types`; public spec has no POST/PUT creation route. New separate creation is authorized in principle but no supported API route established |
| Shared event custom-field definitions | GET `/custom-fields` with fixed Event category. POST exists but active/required/wizard/page visibility may affect account forms/other events; isolation not established. Creation/edits blocked, not falsely advertised as isolated |
| Event custom-field answers | PUT exists but integration/sync identifiers cannot be reliably classified. Blocked before network; read through getEvent |
| Admissions, optional catalogs, fee/pricing definitions, paths, questions/choices, vouchers, general advanced rules | Existing catalog reads; no relevant catalog authoring routes found in reviewed public spec. Documented Ego gaps, not arbitrary HTTP permission |
| Site Designer/theme/header/footer/widgets | No public authoring route found; documented Ego gap, Site Designer last |
| Attendee quantity/voucher operations | Not catalog editors; attendee/communications scope excluded |
| Sessions/speakers, account/payment provisioning, publish/delete/archive | Prohibited; no enabled routes |

No safe shared-create operation was established: this is a concrete remaining integration/scope-proof gap, not a claim that authorization is create-only or shared creation is universally forbidden. There are no invented endpoints or global HTTP tools. New capabilities have offline coverage, not live acceptance. See CURRENT in MVP-HANDOFF.md for final verification and residual risks.

## Historical production policy and acceptance status (superseded)

Current authorization is in `app/runner-prompt.md` and [CVENT-API.md](CVENT-API.md): across the event-build SOW, event-only objects/settings/relationships may be created or modified. Existing shared/account-wide objects must remain unchanged; reuse an exact shared match or create a separate required shared build object if absent, without changing existing shared objects, global defaults or other events. Prove scope before writing. No deleting/archiving anything. Explicitly blocked routes remain blocked; this prompt update does not change executable guards. The audit below is historical evidence, not permission to replay updates. The production CLI now rejects legacy event/registration/custom-field updates before network access. `configureDiscount` / `configureVolumeDiscount` reuse exact supplied-value matches only; differences return `creation-required`, not satisfaction. The adapter creates absent identities with complete values. Exact volume names may differ from otherwise equivalent rules. Same-identity variant creation is an adapter authoring gap, not a mandate to duplicate every differing event-only object. Never bypass a blocked update through Ego or invent RR identifiers to evade uniqueness. API-side mock tests do not certify live creation or shared-object isolation. Historical acceptance notes and remaining browser/API/deployment evidence are tracked in [E2E-ACCEPTANCE.md](E2E-ACCEPTANCE.md).

## Historical API-write routing correction (create-only milestone)

Stopped run `88758a4b-46bf-4bf8-a80a-b422ddbf0b22` at user request: $5.682544, no stop failures or unreconciled spending. Its route plan identified item-association integration as a blocker for discount work; the former adapter supported only final-total creation. API reads alone were not full write coverage.

`configureDiscount` now supports complete **new item-scoped code creation**: scoped admission/quantity lookup, inactive creation, new-code-only association PUTs, finalizing PUT, complete saved readback, durable uncertainty throughout, and no replay. Existing codes and their links remain immutable. `listQuantityItems` and `listDonationItems` are now exposed. The current concise prompt gives an API-read/API-write/browser capability map; Pi chooses work order without a mandatory route-plan schema or forced write sequencing. `configureVolumeDiscount` now supports new named volume rules, all four public threshold types, and initial admission/quantity associations using the same guarded lifecycle. Question-choice and feature-status reads are integrated. Arbitrary eligibility semantics remain unsupported. Do not label these API gaps browser-only or claim all requirements are now writable.

The initial item-code milestone passed **138 offline tests** (`logs/api-item-writes-full-tests.log`); the current expansion passes **188** (`logs/api-expansion-full-tests.log`). No live Cvent mutation or paid acceptance build was performed. See [CVENT-API.md](CVENT-API.md) for the exact contract. The historical audit below is evidence, not current permission to edit existing objects.

## Historical create-only write audit — superseded by scoped expansion

Reviewed the official public OpenAPI's RR-relevant operation paths and discount schemas, not merely installed helper availability:

| Operation family | Create-only SOW decision |
|---|---|
| Discount POST (`DISCOUNT_CODE`, `VOLUME_DISCOUNT`) | Integrated for absent identities; exact matches reused, differences require separate creation (same-identity variant gap documented) |
| Discount PUT / agenda-item link PUT | Only initial configuration of the ID newly created and read back in the same CLI invocation; no standalone grant |
| Event / registration-type / custom-field-answer updates | Existing configuration changes; production-blocked |
| Account custom-field definition/choice writes | Account-global; excluded, not event-question authoring |
| Feature settings / launch | Existing settings or publishing; excluded |
| Attendee quantity items / vouchers / registrations | Attendee actions, not catalog authoring; excluded |
| Event create/copy, sessions/speakers, communications, financial-account setup | Outside approved target/SOW; excluded |
| Admission/optional catalogs, fee definitions, paths, event questions/choices, voucher definitions, site pages/widgets, general registration rules | No corresponding in-scope create route found in the reviewed public spec; retain documented browser coverage, not arbitrary HTTP discovery |

This adds the remaining clearly identified permitted write family, **not a claim that every RR requirement is API-writable or that private/newer APIs do not exist**. Volume-rule exact-name/type/account collisions, incomplete catalogs, lost ownership, missing RR evidence and uncertain partial writes fail closed in the adapter. Equivalent rules under a different exact RR name no longer prohibit separate creation. New read operations are `listQuestionChoices` (complete event membership first) and `listEventFeatures` (status only). Exact schemas/limits: [CVENT-API.md](CVENT-API.md). No live request, paid prompt or Cvent mutation was used for this expansion; live volume financial behavior and full RR acceptance remain unproven.

## Integration audit history

Following this audit, the runner gained `listDiscounts`, `listDiscountedAgendaItems` and `configureDiscount` for event-level discount codes. It matches existing codes before writing, requires explicit complete configuration for creation, preserves settings, polls delayed readback, retains durable uncertainty/evidence and remembers verified IDs per job. See [CVENT-API.md](CVENT-API.md) for inputs and limits. All 49 regression tests pass, including 12 new discount/CLI tests. All 1,251 code discounts in the saved live snapshot also passed an offline no-op compatibility check. No new live write or RR execution was performed. At that milestone, volume-discount and association writes remained unconnected; see the current correction above.

## Live evidence

Private evidence: `~/.cvent-pi-agent/rr-runs/api-scope-audit-PSdqaZ/`.

| API read | Result |
|---|---|
| Event details | Pass |
| Admission items | 33 |
| Registration paths | 13 |
| Registration types | 36 |
| Event questions | 117 |
| Choice lists | All 77 eligible question reads passed; one initial transport timeout passed a separate read-only recheck |
| Fee items | 271 |
| Vouchers | 2 |
| Discounts | 1,255: 1,251 codes and 4 volume discounts |
| Discount-to-item associations | 1,575 |
| Quantity-item catalog | 9 |
| Donation-item catalog | 0; endpoint access proven, no populated-record behavior proven |
| Event features | 12 |

Collections were fully paginated, not counted from a first page. The initial read-only audit verified unchanged event state. Its original `summary.json` retains the timeout; `choice-recheck.json` records the successful recheck. `conclusion.json` combines the evidence without erasing the original failure.

Previously verified write receipts were reused, not replayed:

- Event internal note: changed, independently read back, restored and verified. An earlier separately authorized registration-deadline correction remains in place.
- Registration-type capacity: 100 → 101 → 100, with saved-state verification and preservation checks.
- Custom-field answer: unchanged-value PUT accepted and independently read back. This does **not** prove changed-value persistence. Existing fields are integration identifiers; A2Z synchronization is enabled, so identifiers and synchronization were not changed.

The event and registration-type snapshots from this audit still matched those earlier restored business states.

### New discount write test

An existing **inactive, unused event-level discount code** with an existing internal note was selected. Only a temporary note marker was requested; prices, code, activation, eligibility and capacity were retained.

- Both update and restoration returned HTTP **201**.
- Independent readback eventually verified the changed note, then the restored original note.
- All **1,255 discounts**, **1,575 associations**, and event business fields matched the pre-test baseline after restoration, excluding normal discount modification audit metadata.
- No unresolved write or test-operation lock remains.
- Evidence: `discount-write/summary.json`, phase `PASSED_AND_RESTORED`.

**Important integration finding:** an immediately following discount search returned stale, pre-write data after HTTP 201. A delayed read exposed the accepted change. The initial test's immediate “original state reconciled” conclusion was therefore invalid and was explicitly superseded; uncertainty and execution blocking were reinstated until the write and restoration were independently verified. A future adapter must poll bounded read-only requests after acceptance. It must never interpret an immediate old value as proof of no mutation, clear uncertainty on that basis, or resend the write. This test did not certify discount creation, changing financial values, volume-discount writes or association writes.

## Historical configuration routing (current API changes are tabulated above)

“Browser-required” below means no corresponding event-configuration write route was found in the reviewed official public OpenAPI, supported by the existing UI field inventory. It is not proof about private or future Cvent APIs, nor proof that our browser automation has completed those workflows.

| RR area | API role | What Ego in the assigned Steel browser still needs to configure |
|---|---|---|
| Event basics | Connected read/merge/PUT. Event-note persistence proven; supported event fields include description, dates, timezone, venue and capacity, subject to retained policy/validation guards. | Event-local settings absent from the update schema; verify displayed content. A blocked rename or protected deadline is a policy/integration issue, **not** browser permission. |
| Theme and branding | Feature status can be read; feature switches are not a website builder API. | Theme, colors, typography, logos, background/header/footer and layout. |
| Website pages/content | No page/widget authoring routes found. | Pages/navigation, text/images/video, contact/FAQ/hotel/policy links, countdown/social/Already Registered widgets and workbook-specified copy. |
| Registration types | Connected update supports capacity, open-for-registration and automatic opening/closing dates. Capacity write/restore proven. Name/code/description/virtual are read-only in the update schema. | Event-local presentation, assignments and other unsupported setup. Shared definitions cannot be edited; separately required shared creation needs an actually supported isolated workflow. |
| Admission items | Readable; no catalog creation/update routes found. | Create/edit items, labels/descriptions, availability and path/type associations. |
| Fees and pricing | Fee items readable; no fee-configuration authoring routes found. | Fee amounts, date-based pricing, member/nonmember tiers and their associations. These are distinct from API-supported discounts. |
| Discounts | Public create/update and item-association endpoints exist. Existing-discount note PUT is live-proven. **Discount codes are connected** through `configureDiscount`, including initial admission/quantity associations on a newly created code. New named volume rules and initial associations are connected through `configureVolumeDiscount`; all existing-discount updates remain policy-blocked. | Do not classify supported discount work as browser-only. Use the connected code/volume adapters; report unsupported eligibility rather than bypassing policy. |
| Registration paths | Readable; no path authoring routes found. | Path flow, pages, selection/visibility, redirects, privacy/acceptance and path-level settings. |
| Questions and choices | Both readable; no event-question/choice authoring routes found. | Create/edit text, choices, order, requiredness, display and conditional logic. |
| Optional quantity/donation items | Catalogs readable; no corresponding catalog authoring routes found. | Item creation/editing, pricing, availability, placement and selection rules. |
| Vouchers | Readable; no voucher-definition write routes found. | Voucher creation/configuration and associated restrictions. |
| Advanced rules and policy content | No general registration-rules/site-content authoring routes found. Discount rules remain a separate API-supported subset. | Conditional registration behavior, dependencies, path restrictions, terms/privacy acceptance and cancellation/refund copy—not merchant or financial-account setup. |
| Event custom fields | Connected answer PUT; only same-value behavior proven here. | Not a browser gap. A safe disposable field is needed for changed-value validation; do not change integration identifiers to test it. |

### Avoid two misleading API matches

1. `PUT /quantity-items/{quantityItemId}` updates **an attendee's registered quantity**, with attendee/send-email inputs. It is **not** a quantity-item catalog editor. It is outside this RR's no-attendee/no-communications scope and was not tested or connected.
2. Feature update/launch endpoints do **not** author Website Designer pages or registration flows. Feature reads passed; feature changes were not tested. Launch/publishing remains prohibited.

## Historical remaining API integration work (current contract above)

The runtime adapter exposes the operations documented in [CVENT-API.md](CVENT-API.md). The subsequent discount integration reused existing transport/identity/receipt mechanisms and the installed client's field allowlist/polling pattern, without SDK migration.

- Discount, association, quantity-item and donation-item catalog reads are connected. Question-choice and feature-state reads are now connected; question-only choice URLs require complete approved-event membership proof first.
- Discount-code matching/deduplication, baseline preservation, durable intent/acknowledgment, bounded readback polling, uncertainty handling and job-local verified identities are connected. The unconditional-create helper is deliberately not called.
- Discount creation and new-code initial association mutations have offline coverage but still need explicitly authorized live acceptance if required. Volume creation and initial item links now have offline adapter/production-CLI coverage; existing volume/code updates remain blocked by unchanged tool guards despite broader event-only authorization. Avoid disposable objects that cannot be removed within the approved policy.
- Feature changes are documented API capabilities, not live-proven writes or permission to launch.
- Browser work needs its own saved-result verification and end-to-end validation. Successful API reads alone do not prove complete registration configuration.

## Repeating the read-only audit

```sh
CVENT_CREDENTIALS_FILE=/path/to/existing.env node test/live-api-scope-audit.mjs
```

This explicitly invoked script permits only approved event-scoped GETs and OAuth token POSTs, uses bounded pagination, saves private receipts, verifies unchanged event state, and exits nonzero on any incomplete/blocked audit. It is intentionally excluded from `npm test`. The single-use discount mutation scripts are retained only in the private evidence directory; **do not rerun them**.

Sources: Cvent's official [`cvent/rest-sdks` OpenAPI](https://github.com/cvent/rest-sdks/blob/main/cvent-public-spec/openapi.yaml), reviewed local copy `/tmp/cvent-sdk-review/cvent-public-spec__openapi.yaml`, existing installed clients, and `~/cvent-ui-automation/docs/cvent-portability-inventory.md` plus its skill field mappings. API authentication, permission, validation, rate-limit and uncertain-write failures are never reasons to bypass the API through a browser.
