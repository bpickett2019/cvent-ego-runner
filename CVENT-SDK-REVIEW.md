# Official Cvent SDK and quickstart review

Reviewed 2026-09-19. **No SDK installed or integrated.** The initial review changed no runtime source or dependencies. The subsequently authorized, minimal runner-side read fixes are documented below.

## Sources

- Official repository: https://github.com/cvent/rest-sdks
- OpenAPI: https://github.com/cvent/rest-sdks/blob/main/cvent-public-spec/openapi.yaml
- Event update implementation: https://github.com/cvent/rest-sdks/blob/main/packages/typescript/src/funcs/eventsUpdateEvent.ts
- Input schema: https://github.com/cvent/rest-sdks/blob/main/packages/typescript/src/models/components/eventupdateinput.ts
- Examples: https://github.com/cvent/rest-sdks/blob/main/packages/typescript/docs/sdks/events/README.md#updateevent
- Quickstart (read in rendered browser): https://developers.cvent.com/docs/rest-api/tutorials/developer-quickstart

## Findings

The official TypeScript package is `@cvent/sdk`. Its generated models, OpenAPI specification, operation implementations and examples are useful references for auditing the existing adapter; adopting the package does not require replacing Pi or the browser/workbook tools.

### Authentication

The quickstart confirms the current OAuth flow: machine-to-machine application, HTTP Basic containing base64(client_id:client_secret), form body `grant_type=client_credentials&client_id=...`, then Bearer authentication. Tokens last 60 minutes. The regional `/ea` base URL and per-operation scopes matter. No new credentials or application were created, and no real credentials were entered into the documentation site's simulations.

### Event update

- Method/path: **PUT `/events/{id}`**, not PATCH.
- Required scope: `event/events:write`.
- Required input: `title`, `format`, `timezone`, `languages`, `planners`, `type`.
- `note`, `start`, `end`, `closeAfter`, `archiveAfter` and other documented fields are optional. Optional does **not** establish that omission preserves an existing field; no such guarantee was found in the reviewed endpoint/schema/examples. No omission experiment was performed.
- TypeScript date inputs are `Date` objects serialized to ISO strings. Copying GET JSON directly into the typed SDK would need conversion and writable-field filtering.
- The language field supports reading multiple languages but writing only one. Essential-only fields also have event-type restrictions. A blanket copy of arbitrary GET fields is not a safe SDK migration.

### Three read-route discrepancies found (subsequently fixed)

| Existing helper | Old installed-client route | Official SDK / corrected runner route |
|---|---|---|
| `listQuestions` | `/questions?filter=...` | `/event-questions` (`eventsGetEventQuestions`) |
| `listFees` | `/fees?eventId=...` | `/events/{id}/fee-items` (`eventsListFeeItems`) |
| `listVouchers` | `/vouchers?eventId=...` | `/events/{id}/vouchers` (`eventsListEventVouchers`) |

These were integration errors, not reasons to fall back to browser writes. After user approval, the runner stopped using the stale collection helpers and now uses a small shared reader with official routes and a matching scope guard. The installed clients remain unchanged and are still reused for their working operations. Query/filter/pagination behavior is regression-tested and all exposed reads now pass live.

### Safety requirements before any SDK adoption

The generated event-update function defaults to backoff retries for connection errors and HTTP 502/503/504, with up to 40 seconds of backoff; its default timeout is unspecified/unbounded at this call site. Disable mutation retries, set explicit timeouts, and retain current rate pacing, event scoping, intent receipts, uncertainty blocking, Stop handling and independent readback. The SDK does not provide RR approval, budget control or verified completion.

## Authorized live validation

Target: `(C+D) Medtrade Testing Clone 2`, UUID `e712e34c-6117-4d13-bf4c-8ed54cf2b495`.

The user authorized correcting the registration deadline if the SDK documentation did not resolve the blocker. The prior deadline was `2026-11-16T06:58:00.000Z`, after the event's end (`2026-09-04T21:00:00.000Z`). Using the existing scoped configuration client, a one-off authorized correction set `closeAfter` to **`2026-09-04T20:00:00.000Z`**, one hour before the end. The RR tool's normal scheduling restrictions were not relaxed.

Then the existing runner's `updateEvent` operation successfully wrote the internal test note, independently read it back, restored the exact original note, and independently verified restoration. Final state differs from the original baseline only by the authorized deadline correction and normal modification audit metadata. No publishing, communications, deletion, other-event changes, browser mutation, SDK installation or paid RR execution occurred.

Evidence directory:
`~/.cvent-pi-agent/rr-runs/api-note-test-7f65725d-c2e3-4477-9371-c36aadf34e04/sdk-reviewed-deadline-and-note-test/`

Result: **PASSED_AND_RESTORED**. Separate baseline, correction payload, correction readback, test readback, restoration readback and request receipts are retained. No uncertainty marker remains. This proves the event-update path, not all API operations or a complete RR.

## Completed read-route follow-up

The user authorized fixing the known API issues while reusing working pieces and keeping the implementation simple. No SDK migration was needed.

- Fixed question, fee-item and voucher routes in the runner, including its HTTP scope guard.
- Shared bounded pagination across all seven collection operations; kept working installed-client event reads and write paths.
- Live Cvent next links for questions and sessions omitted the filter and limit. The reader now retains the original query and advances only the cursor, matching the official SDK. Foreign/conflicting links, malformed responses and repeated cursors remain blocked; no partial result is reported as success.
- **31 regression tests pass.** All eight exposed API reads pass live: event details, 33 admission items, 13 registration paths, 36 registration types, 117 questions, 290 sessions, 271 fee items and 2 vouchers.
- Event state was verified unchanged. No new live mutation or paid RR execution occurred; the existing successful event-note write/restoration evidence remains valid.

Read evidence: `~/.cvent-pi-agent/rr-runs/api-read-validation-henHcx/`.
Read-only repeatable check: `CVENT_CREDENTIALS_FILE=/path/to/existing.env node test/live-api-reads.mjs`.

At this stage, validation covered the exposed reads and event-note update. The subsequent authorized write checks below add registration-type coverage, not an entire RR workflow.

## Additional write checks

The existing installed clients required no runtime fix or SDK migration for these tests. Two native-client regression cases were added, bringing the passing suite to **33 tests**.

- Registration-type capacity (`Attendee- New`): **100 -> 101 -> 100**, HTTP 200 for the change and restoration, with independent readback and preservation checks across all registration types and event fields.
- Event custom-field answers: **HTTP 200 for a same-value PUT**, followed by readback. This proves endpoint access/acceptance, not persistence of a changed value. The fields are integration identifiers and A2Z sync is enabled, so no identifier or sync setting was modified merely to test.
- All pre-test business state was verified restored/preserved. No uncertainty marker remains. No paid RR execution was started; Pi remains the native RPC backend.

Evidence: `~/.cvent-pi-agent/rr-runs/api-note-test-7f65725d-c2e3-4477-9371-c36aadf34e04/additional-writes/`, phase `PASSED_WITH_CUSTOM_FIELD_NOOP_LIMITATION`.

Changed-value custom-field persistence still needs a safe disposable field. API write operations outside the exposed adapter and complete RR execution remain unvalidated.
