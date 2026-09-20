# RR end-to-end acceptance checklist

Status: **not accepted for end-to-end or general team deployment**.
Owner: the active coding session. One native Pi executor, existing API adapter and pinned Ego skill; no new agent framework or browser replay scripts.

## Fixed outcome and constraints

Complete every permitted requirement from the actual approved RR. Never rename the event. Reuse existing items unchanged, including defaults and previous-run creations. Create only confirmed missing, RR-required items within scope. An existing mismatch is a preserved difference, not successful implementation; do not manufacture a duplicate to work around it. Selecting an existing reference in a new item is not permission to edit the referenced item. If fulfilling a relationship requires changing an existing object, report that dependency rather than silently expanding scope.

Original workbooks, prior saves, evidence, uncertain-write records and cumulative costs must remain intact. No publishing, communications, attendee access, other events, account-global resources, merchant configuration, deletion or archival. Authentication is human-only. Stopped jobs require a fresh upload/session. API failures and policy denials never authorize browser bypass.

## Prerequisites for live acceptance

- [ ] Reverify incident state and authenticated handoff for acceptance. Read-only audit found the historical incident in `securityAcknowledgedJobs`, timestamp `2026-09-20T01:37:20.724Z`; do not demand or fabricate a new attestation for that same incident. This is human attestation, not independent remote revocation proof. New incidents still block.
- [ ] Identify an approved test RR and the exact existing unpublished test event. The Downloads `Medtrade_Testing_Clone_2_MOCK_ONLY_New_RR.xlsx` is preserved and must not be applied: it expressly prohibits execution. Do not infer authorization to override its warning.
- [ ] User authorizes a bounded paid acceptance run and any permanent new test items. No cleanup/deletion is permitted; choose useful, approved creations rather than disposable clutter.
- [ ] RR supplies concrete required values, suitable existing/missing-item cases and approved financial values; resolve only genuine ambiguities.
- [ ] No live job, stale operation lock, unresolved write or unreconciled spending. Record current ownership, exact target, allowance/reserve and cumulative cost before execution.

## SOW coverage, based on current code and evidence

Historical API write tests are not permission to change existing objects under the new policy. Read audits do not prove browser authoring. See `CVENT-API.md` and `CVENT-API-COVERAGE.md` for sources.

| SOW area | Current permitted route | Remaining acceptance/gap |
|---|---|---|
| Event identity/details | API read; event name immutable; production CLI rejects event-setting updates conservatively | Verify identity unchanged. Existing differing settings are exceptions, not automatic edits. |
| Theme/branding, header/footer/body widgets | Ego for documented API gaps, only permitted missing content | Existing branding/widgets stay unchanged. Prove a genuinely missing addition can be saved without changing existing items. |
| Website pages/navigation/content | Ego for documented API gaps | Missing-page/content creation, existing-page reuse, independent reopen/readback; modifying an existing page is not automatically allowed. |
| Registration types | API catalog read; existing types reused | Prove any event-local missing-type setup is possible without account-global definitions or editing existing items. Otherwise block. |
| Admission items | API read, Ego creation for documented API gap | Create missing item, reuse existing type/path references where allowed, verify saved fields and preservation. |
| Fees/pricing | API read, Ego creation for documented API gap | Create missing approved fees/tiers; verify exact amounts, dates, currencies and associations. No guessing financial values. |
| Discount codes | API reuse or complete, confirmed-missing creation | Mocked CLI creation/readback/retry/preservation tested. Live creation and financial fields remain unproven. |
| Volume discounts and discount-item associations | New-code initial admission/quantity links connected; volume writes not connected | Initial links have offline mocked coverage only, not live acceptance. No standalone existing-code link/update grant. Integrate volume support only if required by the approved RR; no browser bypass. |
| Registration paths | API read, Ego for documented API authoring gap | Create missing path/flow, reuse existing items, verify navigation and settings without editing existing paths. |
| Questions/choices | Question catalog API read; Ego authoring gap | Connect question-choice reads where needed; prove missing questions/choices/logic and reuse without changing existing questions. |
| Optional quantity/donation items | Scoped catalog reads connected; Ego authoring gap | Verify permitted creation, pricing and selection rules. Donation linking is unsupported. Never use attendee quantity endpoints. |
| Vouchers | API read, Ego for documented API authoring gap | Missing-voucher creation and restrictions, existing-voucher reuse and independent readback. |
| Advanced rules/privacy/policy content | Ego for documented gaps; API-supported discount subset separate | Verify missing-rule creation and dependencies without overwriting existing rules/content or financial-account settings. |
| Event custom-field answers/integration identifiers | Read/reuse only under preservation; CLI updates blocked | Report differing answers; never change integration IDs or synchronization to satisfy a test. |

## Ordered implementation and verification

1. **Production API preservation gate — implemented, local verification.** CLI excludes legacy updates from allowed capabilities and rejects direct requests before network access. A before-dispatch check permits confirmed-missing discount POSTs and narrowly guarded same-command initial linking/finalization of the verified new object. Existing discount values never change; differences are returned and receipted as such. Newly created codes are reused on subsequent calls, not overwritten. Low-level legacy helpers remain outside the production CLI; this is not a general shell sandbox.
2. **Ego existing-object protection — pending.** Current guards enforce identity, ownership, prohibited actions and uncertainty, but do not prove object-level create-only behavior. Establish a concrete mechanism against observed Cvent workflows; do not claim generic DOM/button filtering can guarantee preservation. Keep the pinned skill and real native interaction, not replay automation.
3. **Required API integration gaps — pending approved-RR mapping.** Determine which catalog reads and missing discount/link capabilities are actually required, then implement from documented event-scoped routes with deduplication, durable intent, independent readback and failure tests. Do not expand to unrelated APIs or exempt existing items from preservation.
4. **Supervised live acceptance — blocked by prerequisites.** Fresh upload and native session; local workbook reading before agent Cvent access; guarded login/event setup; API-first execution and Ego only for documented gaps. Stop on security, identity, ownership, uncertainty or budget conditions. Do not automatically start a second run.
5. **Human review and limited pilot — pending acceptance.** Inspect all meaningful changes and exceptions. A sequential local pilot is distinct from concurrent team deployment; authentication/access control, user/session isolation and sensitive-output protection remain deployment gates.

## Required acceptance cases and evidence

For each requirement, keep the RR sheet/cell reference, object identity, desired state, before-state/absence evidence, route and reason, action, independent saved-state evidence and final disposition in the existing route plan/receipts/final report. Use explicit dispositions: `VERIFIED_EXISTING`, `VERIFIED_CREATED`, `PRESERVED_DIFFERENCE`, `BLOCKED`, `NOT_APPLICABLE`, `UNTESTED` or `UNCERTAIN`. A preserved mismatch or unsupported dependency is not a verified requirement. Do not declare the whole SOW complete while required work remains blocked/unverified.

- [ ] Target-bound upload and Start Build launch no Pi process/RPC/prompt while waiting for login. One verified Return creates one fresh native session and execution prompt; no old conversation restoration.
- [ ] Compact all-sheet inventory precedes agent Cvent work; ambiguous/missing ordinary values skip dependent work while independent requirements continue. Authorization/security/identity/uncertainty still pause.
- [ ] API/browser identity agree before mutations; workbook rename request cannot rename or switch the event.
- [ ] Login is human-only; no sensitive hidden/password/token inspection; takeover shields/ownership work.
- [ ] Existing identical item is reused with no write; existing differing item stays byte-for-byte/business-state unchanged and is reported as different.
- [ ] Missing item is confirmed against complete scoped lookup, created exactly once, independently reopened/read and verified.
- [ ] Duplicate/ambiguous identity or incomplete lookup blocks creation. A retry, stale read or later requirement never creates a duplicate or overwrites a prior creation.
- [ ] All required SOW areas above have real persisted-result evidence or an explicit exception; no untested area silently passes.
- [ ] Before/after inventories show only approved new records and necessary permitted relationships. Existing business values/event name are unchanged; normal audit metadata is distinguished.
- [ ] Stop/takeover before dispatch prevents a write. Interruption after dispatch leaves uncertainty and never causes blind replay or browser fallback.
- [ ] Authentication, permission, rate-limit, server and validation failures are not treated as unsupported API capabilities.
- [ ] Cost display and final ledger include prior spending, current session and external reserve; unknown billing or exhaustion stops safely.
- [ ] Original workbook, prior reports/receipts and uncertainty evidence are preserved; final report honestly distinguishes completion from partial results.

## Current evidence

- Earlier instruction/lifecycle/UI baseline: 98 passing tests, no full live RR acceptance.
- Preservation implementation: local test logs `logs/create-only-narrow-tests.log` and `logs/create-only-full-tests.log`; see the activation receipt referenced in `RPC-CONNECTION.md` for final count and preserved-file hashes.
- Read-only continuation audit reran the 138-test baseline successfully. Current discount-link writes remain mocked; no full RR acceptance exists.
- The privacy slice adds full runtime-tree Git exclusions, an index artifact-path check, payload-free SSE projection and denial of raw progress downloads. It preserves private native evidence on disk. Deployment requires a verified restart; it does not sanitize all assistant reports or supply authentication.
- No paid prompt or Cvent mutation was used for this implementation. Historical incident acknowledgment is present (see prerequisite above). The mock workbook remains prohibited; no execution approval has been inferred.
