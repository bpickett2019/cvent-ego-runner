# Current API coverage and browser gaps

The executable contract is [CVENT-API.md](CVENT-API.md). Existing selected-event objects/settings/relationships may be modified; this is **not create-only**. Exact matches are reused, missing required objects created, and supported existing differences updated. No duplicate/suffix workarounds, deletion, publishing or changes to existing shared definitions. Explicit tool denials are never browser permission.

## Reviewed capabilities

| RR area | Supported adapter / remaining gap |
|---|---|
| Event details | `updateEvent` / `updateEventBasics`: description/note, dates/deadline, timezone, format, capacity, merged single venue/location and visibility. Fixed title; preserved planners/languages/type/archive schedule. Retained `(C+D)` name restriction. |
| Registration-type assignments | `updateRegistrationType`: event-only availability, opening/closing dates and capacity. Shared names/codes/definitions unchanged. |
| Bulk API | Human-only `probeBulkAccess --confirm-empty-job` exposed separately; live empty-job create denied HTTP 403 on 2026-09-21. No bulk record submission/execution exposed. Bulk cannot add missing destination authoring APIs. See `CVENT-API.md`. |
| Discounts/volume pricing | `configureDiscount` / `configureVolumeDiscount`: exact-match reuse, missing-identity creation, existing event-level updates and additive admission/quantity links. Complete existing links preserved. Unsupported eligibility is a blocker, not a UI bypass. |
| Feature prerequisites | `enableEventFeature`: existing unlocked Website/Registration enablement only, preserving configuration. Registration needs a complete pricing baseline. No disable/launch/payment edits. |
| Contact types | Shared-definition reads through `listContactTypes`; public schema is GET-only. No supported isolated creation route established. |
| Event custom fields | `listEventCustomFieldDefinitions` reads definitions. Account-wide creation has unproven isolation. Answer writes remain blocked because integration identifiers cannot safely be distinguished. |
| Admissions, fee schedules, registration paths, questions/choices, optional items, vouchers, general advanced rules | Catalog reads where documented; no reviewed public catalog-authoring routes. Use assigned Ego for supported event-only workflows, including existing admission edits. Browser permission is not proof of workflow coverage. |
| Website, branding/assets, theme/header/footer, RR-required widgets | No reviewed public authoring route. Assigned Ego; Pi chooses editor order. Continue retains current work; do not Restore historical state as a workaround. Build only RR-required widget types, not every available widget. |
| Attendee operations, sessions/speakers, account/payment provisioning, communications, publish/delete/archive | Outside scope; no enabled authoring routes. |

All API mutations retain fresh baselines, event/resource binding, RR references, durable intent, ownership checks, acknowledgment, saved verification, locks and uncertainty/no replay. Unknown or potentially lossy baselines fail closed. No unrestricted HTTP transport or invented endpoints.

## Concrete browser limitation

Top-document snapshots do not automatically include frame contents. An explicit iframe-owner subtree now supports attached **same-renderer** documents, checks frame identity and returns frame-scoped refs. Out-of-process, detached and nested-frame expansion remain unsupported; no additional target is attached. See the [bridge guide](.pi/skills/ego-browser/references/steel-bridge.md). This is offline-tested inspection support, **not proof of Site Designer editing or saved verification**.

Missing scope proof, required shared definitions, inaccessible controls or unverifiable saved fields block the dependent requirement. Continue independent executable work unless a safety/uncertainty stop applies. No-delete may prevent exact compliance when existing content/links must be removed. The selected testing event satisfies `(C+D)`; arbitrary event names remain restricted. Neither restriction was removed by this cleanup.

## Evidence and limits

Reviewed local official OpenAPI: `/tmp/cvent-sdk-review/cvent-public-spec__openapi.yaml`, SHA-256 `8f0c0de7517d17ce347cf27cc1b39bbfe8ad3c91a7ad5141a1f817b22f513f66`; installed clients in `~/cvent-agent` and `~/cvent-ui-automation`. Route presence is distinct from tenant permissions and verified behavior.

Historical representative reads/writes and their receipts are preserved in [the coverage archive](docs/history/CVENT-API-COVERAGE.md). Its create-only policies, counts and remaining-work statements are obsolete, not current instructions or permission to replay tests. Current checks/activation are in [MVP-HANDOFF.md](MVP-HANDOFF.md). Offline passing tests do not prove complete RR execution, isolated shared creation, financial semantics, lower cost or a 90-minute completion. Live requests/runs require separate authorization.
