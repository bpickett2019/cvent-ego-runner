# RR API coverage and remaining browser work

Validated 2026-09-19 against **(C+D) Medtrade Testing Clone 2**. This is a capability audit with representative reversible writes, **not a completed RR or exhaustive write test of every field**. Native Pi remains the execution backend. No paid RR was started, and nothing was published, deleted or sent to attendees.

## Current production policy and acceptance status

The audit below predates the create-only preservation policy. Historical reversible writes are evidence, not permission to replay updates. The production CLI now rejects legacy event/registration/custom-field updates before network access. `configureDiscount` reuses existing codes unchanged (reporting differences separately from satisfied requirements) and allows only confirmed-missing complete creation. API-side mock tests do not certify live creation or Ego object preservation. The complete SOW checklist and remaining browser/API/deployment gates are tracked in [E2E-ACCEPTANCE.md](E2E-ACCEPTANCE.md).

## Current API-write routing correction

Stopped run `88758a4b-46bf-4bf8-a80a-b422ddbf0b22` at user request: $5.682544, no stop failures or unreconciled spending. Its route plan identified item-association integration as a blocker for discount work; the former adapter supported only final-total creation. API reads alone were not full write coverage.

`configureDiscount` now supports complete **new item-scoped code creation**: scoped admission/quantity lookup, inactive creation, new-code-only association PUTs, finalizing PUT, complete saved readback, durable uncertainty throughout, and no replay. Existing codes and their links remain immutable. `listQuantityItems` and `listDonationItems` are now exposed. The prompt requires distinct read/write routes and eligible API writes before unrelated browser work, while allowing documented read dependencies. Volume discount creation remains unintegrated; arbitrary eligibility semantics remain unsupported. Do not label these API gaps browser-only or claim all requirements are now writable.

**138 offline tests pass** in `logs/api-item-writes-full-tests.log`. No live Cvent mutation or paid acceptance build was performed. See [CVENT-API.md](CVENT-API.md) for the exact contract. The historical audit below is evidence, not current permission to edit existing objects.

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

## Configuration routing

“Browser-required” below means no corresponding event-configuration write route was found in the reviewed official public OpenAPI, supported by the existing UI field inventory. It is not proof about private or future Cvent APIs, nor proof that our browser automation has completed those workflows.

| RR area | API role | What Ego in the assigned Steel browser still needs to configure |
|---|---|---|
| Event basics | Connected read/merge/PUT. Event-note persistence proven; supported event fields include description, dates, timezone, venue and capacity, subject to retained policy/validation guards. | Event-local settings absent from the update schema; verify displayed content. A blocked rename or protected deadline is a policy/integration issue, **not** browser permission. |
| Theme and branding | Feature status can be read; feature switches are not a website builder API. | Theme, colors, typography, logos, background/header/footer and layout. |
| Website pages/content | No page/widget authoring routes found. | Pages/navigation, text/images/video, contact/FAQ/hotel/policy links, countdown/social/Already Registered widgets and workbook-specified copy. |
| Registration types | Connected update supports capacity, open-for-registration and automatic opening/closing dates. Capacity write/restore proven. Name/code/description/virtual are read-only in the update schema. | Event-local presentation, assignments and other unsupported setup. Do not create or edit account-global type definitions; escalate those requirements. |
| Admission items | Readable; no catalog creation/update routes found. | Create/edit items, labels/descriptions, availability and path/type associations. |
| Fees and pricing | Fee items readable; no fee-configuration authoring routes found. | Fee amounts, date-based pricing, member/nonmember tiers and their associations. These are distinct from API-supported discounts. |
| Discounts | Public create/update and item-association endpoints exist. Existing-discount note PUT is live-proven. **Discount codes are connected** through `configureDiscount`, including initial admission/quantity associations on a newly created code. Volume writes are not integrated; existing-code updates remain policy-blocked. | Do not classify supported discount work as browser-only. Use the connected code adapter; report the remaining integration gaps. |
| Registration paths | Readable; no path authoring routes found. | Path flow, pages, selection/visibility, redirects, privacy/acceptance and path-level settings. |
| Questions and choices | Both readable; no event-question/choice authoring routes found. | Create/edit text, choices, order, requiredness, display and conditional logic. |
| Optional quantity/donation items | Catalogs readable; no corresponding catalog authoring routes found. | Item creation/editing, pricing, availability, placement and selection rules. |
| Vouchers | Readable; no voucher-definition write routes found. | Voucher creation/configuration and associated restrictions. |
| Advanced rules and policy content | No general registration-rules/site-content authoring routes found. Discount rules remain a separate API-supported subset. | Conditional registration behavior, dependencies, path restrictions, terms/privacy acceptance and cancellation/refund copy—not merchant or financial-account setup. |
| Event custom fields | Connected answer PUT; only same-value behavior proven here. | Not a browser gap. A safe disposable field is needed for changed-value validation; do not change integration identifiers to test it. |

### Avoid two misleading API matches

1. `PUT /quantity-items/{quantityItemId}` updates **an attendee's registered quantity**, with attendee/send-email inputs. It is **not** a quantity-item catalog editor. It is outside this RR's no-attendee/no-communications scope and was not tested or connected.
2. Feature update/launch endpoints do **not** author Website Designer pages or registration flows. Feature reads passed; feature changes were not tested. Launch/publishing remains prohibited.

## Remaining API integration work, not browser fallback

The runtime adapter exposes the operations documented in [CVENT-API.md](CVENT-API.md). The subsequent discount integration reused existing transport/identity/receipt mechanisms and the installed client's field allowlist/polling pattern, without SDK migration.

- Discount, association, quantity-item and donation-item catalog reads are connected. Question-choice and feature-state reads still need integration where the workbook requires them; standalone audit access is not runner integration.
- Discount-code matching/deduplication, baseline preservation, durable intent/acknowledgment, bounded readback polling, uncertainty handling and job-local verified identities are connected. The unconditional-create helper is deliberately not called.
- Discount creation and new-code initial association mutations have offline coverage but still need explicitly authorized live acceptance if required. Volume creation remains an integration gap; existing volume/code updates are prohibited. Avoid disposable objects that cannot be removed within the approved policy.
- Feature changes are documented API capabilities, not live-proven writes or permission to launch.
- Browser work needs its own saved-result verification and end-to-end validation. Successful API reads alone do not prove complete registration configuration.

## Repeating the read-only audit

```sh
CVENT_CREDENTIALS_FILE=/path/to/existing.env node test/live-api-scope-audit.mjs
```

This explicitly invoked script permits only approved event-scoped GETs and OAuth token POSTs, uses bounded pagination, saves private receipts, verifies unchanged event state, and exits nonzero on any incomplete/blocked audit. It is intentionally excluded from `npm test`. The single-use discount mutation scripts are retained only in the private evidence directory; **do not rerun them**.

Sources: Cvent's official [`cvent/rest-sdks` OpenAPI](https://github.com/cvent/rest-sdks/blob/main/cvent-public-spec/openapi.yaml), reviewed local copy `/tmp/cvent-sdk-review/cvent-public-spec__openapi.yaml`, existing installed clients, and `~/cvent-ui-automation/docs/cvent-portability-inventory.md` plus its skill field mappings. API authentication, permission, validation, rate-limit and uncertain-write failures are never reasons to bypass the API through a browser.
