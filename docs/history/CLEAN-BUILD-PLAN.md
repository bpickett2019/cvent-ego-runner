# Approved direction: clean browser, login before AI

Status: ACTIVATED after explicit user restart approval. Stopped the newer waiting run `8e34cbc8-a107-4e84-adc0-b6a78ca22816` cleanly at $0.865944, with no stop failures or unreconciled spending. App-only restart: PID 36470 → 55122 on 8788. `/api/runtime` confirms `loginFirst: true`; served static asset hashes match the tested source. Receipt: `logs/login-first-activation-20260920T013425Z/receipt.json`. All 50 checked originals, ledgers/reports, workbook versions, browser runtime and reference files were unchanged across restart. Existing browser/profile was not reset or logged out. Zero implementation paid prompts or Cvent mutations; recorded cumulative Pi cost $18.844986. No active jobs remain. Refresh the app and make a fresh upload to use the new lifecycle. Real human login and a full paid RR acceptance run are still unverified.

## Implementation evidence / activation handoff

- `app/clean-browser.mjs`: fresh per-job empty profile and pinned-image Docker container, assigned loopback API/CDP ports, bounded non-AI health checks, identity receipts and fail-closed behavior. Never copies prior cookies or reopens a profile. Old containers/profiles are retained, not deleted; retirement/cleanup is operator-managed and can consume resources across repeated starts.
- Production `app/server.mjs` passes `provisionBrowser` to the existing RR connection. Browser bootstrap uses the existing Ego bridge under narrowly scoped BOOTSTRAPPING ownership: only the fresh assigned blank page may navigate to the neutral Cvent entry route; no input or other navigation. Viewer/proxy follow the assigned runtime's loopback origin. Incident acknowledgments carry forward, not cookies or previous event identity.
- `app/rr-connection.mjs`: production upload and Start create no Pi process. Return verifies target, history/budget and assigned fresh browser before creating one empty session; login is rechecked after session preparation before the first prompt. Setup denial, Stop/provisioning races and prelaunch uncertainty preserve zero model spend. Production legacy `/start` and prelaunch `/rpc` are blocked. Legacy non-production fixture paths remain for regression coverage.
- `public/app.js`: AI-not-started state, viewer rebinding when runtime changes, idle/waiting local GETs slowed to ten seconds. These are not Pi polls. Runner instructions now explicitly require incremental source-referenced RR coverage.
- Full tests: **129 passed**, `logs/login-first-full-tests.log`.
- Actual clean Docker startup without any model call: `logs/clean-browser-probe-57b852ab-3c58-496e-ad55-159aed60c45f/`.
- Actual clean startup plus existing Ego guarded Cvent-entry navigation: `logs/clean-browser-bootstrap-probe-03b59f62-09b5-47d4-837a-cc879de249ff/receipt.json`. Zero paid prompts, authentication actions or touches to the existing assigned browser. Both explicitly owned probe containers were stopped; their profiles/evidence remain. No human login or full paid RR acceptance run was performed.
- Activation completed after verifying no active jobs, live recorded Pi processes or operation locks. The old security incident remains unresolved; a fresh browser is not revocation. A first human handoff still requires the outstanding explicit incident confirmation.
- Residuals to review before broader deployment: old browser retirement is manual; no auth/multi-user deployment isolation; production host guards are not arbitrary-shell sandboxes. Test evidence is not proof of full-SOW completion.

## Required flow

1. Upload/stage the RR locally and bind the user's explicit existing target event. Preserve immutable originals and version history. No Pi process or model request yet.
2. START BUILD provisions a new local Steel browser with an empty, per-job profile. Never copy cookies, storage or a previous profile. Do not reset or replace an active job's assigned browser. Preserve prior profiles/evidence; never touch unrelated Steel services.
3. Display the new assigned browser for human login. State: WAITING FOR LOGIN / AI NOT STARTED / $0 this run. Keep historical spending visible separately. No periodic Pi RPC, model prompt, or automatic retry loop while waiting. Local browser health/UI updates are not model calls.
4. Explicit RETURN TO AGENT runs non-model checks: human security attestation if still required, assigned browser login, unique upload-bound target, unpublished status, saved-write uncertainty, ownership and cumulative budget. Failed checks retain the waiting job at zero model cost.
5. Only after successful handoff create one fresh native Pi session. Inventory all workbook sheets and global instructions compactly; read relevant ranges incrementally, retaining a concise source-referenced requirements/dependency ledger. Do not omit relevant requirements or safety instructions to save context. Use the same session for execution; no second intake agent or transcript restoration.
6. Preserve the existing API-first, create-only, saved-readback, cost and Stop protections. An expired login pauses model work rather than repeatedly asking the model to check login. No new RR is consumed automatically.

## Isolation / safety

- Fresh browser means a genuinely empty profile, not a new tab or new session ID attached to the old authenticated profile.
- Pin browser/job provenance and route viewer/CDP to that assigned runtime, with loopback-only endpoints. Current code hard-codes one persistent Steel service; this requires lifecycle work, not just a new button label.
- A clean browser does not revoke the historically exposed Cvent session. Never silently clear that incident or attest revocation for the human. Resolved acknowledgment should remain durable and not repeat per build; new incidents still block.
- Do not delete uploads, workbook versions, saved evidence, cost ledgers, previous browser profiles or the prohibited Downloads mock workbook.
- Do not stop the currently waiting job or replace its browser without explicit approval. A stopped job needs a fresh upload; never restore its Pi conversation.

## Acceptance checks

- Upload + Start + prolonged login wait: zero Pi launches, zero Pi RPC and zero paid prompts; displayed run cost remains zero.
- Repeated failed login/target/security checks: still zero Pi launches/prompts.
- One successful Return starts exactly one fresh native session; concurrent clicks, Stop races and uncertain prompt delivery cannot start/replay another.
- Consecutive jobs have distinct empty profiles and assigned browser identities; no login cookies/storage cross jobs.
- Provisioning failure retains artifacts and spends zero AI dollars; no fallback to the old browser or unrelated service.
- Complete scoped requirements ledger and compact incremental reads are tested without claiming real full-SOW acceptance from mocks.

## Investigation evidence

Current run `b8ba480a-ffab-47fb-bf2a-016f5c234cb6` spent $0.857928 on one intake invocation / nine model turns before the setup gate. Its durable progress log had zero events after the waiting transition at 2026-09-20T00:56:49.472Z. `waiting()` already clears the Pi cost-monitor timer; the UI's two-second local GET polling is not a model request. The avoidable cost is pre-handoff intake and repeated fresh attempts, not ongoing inference while this run waits.

Current implementation launches an empty Pi process at upload, prompts intake from `/read`, then verifies setup. The dedicated Steel container mounts `data/steel-user-data` persistently. Both lifecycle assumptions must change; no browser or app restart was performed while documenting this decision.
