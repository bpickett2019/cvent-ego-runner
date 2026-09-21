# API availability review — 2026-09-21

## Findings

- Re-fetched Cvent's [published SDK OpenAPI](https://github.com/cvent/rest-sdks/blob/main/cvent-public-spec/openapi.yaml): **469 operations, 356 paths, 238 documented scopes**. It is byte-identical to the previously reviewed file (SHA-256 `8f0c0de7517d17ce347cf27cc1b39bbfe8ad3c91a7ad5141a1f817b22f513f66`). Repository main was `4a23ecdaf43a6464f49261c750fc498d7cf91209`, dated September 8. The npm registry reports `@cvent/sdk` **1.6.2** as latest. No package was installed/upgraded. This establishes freshness against those published sources, not undocumented Cvent features or every developer-portal page.
- Obtained a fresh token through the existing adapter and app configuration. Its `scp` metadata lists **75 documented scopes; neither `bulk/bulk-jobs:read` nor `bulk/bulk-jobs:write` appears**. Scope names only were retained; no token, credentials or raw claims were logged. JWT metadata was decoded locally, not independently signature-verified; actual GET authorization was checked separately.
- The initial cropped screenshot showed both bulk checkboxes selected. The subsequently supplied six-page PDF (Downloads, `screencapture-developers-app-cvent-admin-integrations-restapi-workspaces-edit-7cf893c0-1ecc-4045-b93d-affe9fab0133-2026-09-21-00_34_24.pdf`) identifies the screen as **Edit workspace**, with both Bulk boxes selected on page 2. This is workspace configuration, not the credential-bearing application's scope configuration. Cvent's current [Developer Quickstart](https://developers.cvent.com/docs/rest-api/tutorials/developer-quickstart) separately instructs assigning scopes to the Machine to Machine application and saving it. Next check that existing application's assigned scopes/workspace; no credential rotation is indicated by this evidence. The PDF does not prove saved application grants. The configured connection uses its credentials file, **without client-ID/secret environment overrides**, against `https://api-platform.cvent.com/ea`. Its current token metadata and the earlier bulk-create 403 disagree with the screenshot's apparent grants. Reconcile which application is configured and whether changes were saved/applied; do not assume merely selecting the boxes changed the runner's access. This check does not establish the exact reason for the mismatch.
- **All 15 exposed read operations passed**: selected-event identity/Draft verification plus 14 catalog operations. Complete collection pagination was used; question-choice access was sampled using one event-owned question. No attendee/contact records, sessions, speakers, account-admin data or arbitrary bulk jobs were accessed.
- Token scope metadata matches at least one documented client-credentials alternative for **201 public operations**. That is **not** 201 usable/authorized runner tools: many are out of scope, need additional semantics/entitlements or have no adapter implementation. No write was tested in this audit.

## Event-build availability

| Area | Current result |
|---|---|
| Event details | Read passed; event-write scope listed. Guarded event-only `updateEvent` / `updateEventBasics` already exposed. |
| Registration types | Read passed; write scope listed. Event assignment availability/dates/capacity update exposed; no shared-definition changes. |
| Discounts / volume discounts / additive item links | Catalog reads passed; destination write scope listed. Existing guarded configure operations remain available. |
| Website / Registration feature flags | Feature read passed; write scope listed. Existing guarded enablement exposed. This is not Site Designer authoring. |
| Admissions, ordinary fee schedules, paths, questions/choices, optional-item definitions, vouchers | Reads passed. Still no reviewed public catalog-authoring routes; POST `/filter` is a read filter, not creation. |
| Quantity-item PUT | Scope listed, but this changes **attendee registration**, not the catalog definition. Still excluded. |
| Shared contact types / Event custom-field definitions | Reads passed. Contact-type authoring absent; custom-field write scope does not prove isolated creation. Existing scope restrictions remain. |
| Site Designer / branding / layouts | No authoring route found in the reviewed public spec. Existing browser workflow limitations remain. |
| Bulk | Six documented lifecycle operations. Both bulk scopes absent from the fresh token's documented scope metadata. Previous empty-job create returned 403. No new create/upload/run/cancel request; real record submission remains unimplemented. |

## Evidence and boundaries

Private local evidence is under `logs/api-access-review/`:

- `live-access.json`: sanitized live read results, scope names and connection-source booleans.
- `all-api-inventory.md` / `public-operations.json`: all 469 documented operations and scope comparison, including out-of-SOW APIs for documentation only.
- `public-scopes.json`, `runner-capabilities.json`, `summary.json`.
- `read-only-audit.mjs`: one-shot human-authorized maintenance through the existing adapter; all non-OAuth mutations prohibited. It is not an RR tool or an instruction to repeat the audit.

The live audit made 51 requests including OAuth and pagination. No event/bulk mutation, permission change, browser launch, paid session, restart or spending reset. Budget unchanged; app remained USER-owned with browser stopped. Historical bulk/site-designer uncertainty and receipts were not changed. No runtime source changes for this review; prior 305-test evidence was not rerun because only maintenance evidence/documentation was added.
