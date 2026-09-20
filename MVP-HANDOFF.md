# MVP review and continuation handoff

## Subsequent source-checkpoint update

The user subsequently approved creating a private GitHub repository to preserve the work: https://github.com/bpickett2019/cvent-ego-runner. The source checkpoint includes the bounded privacy slice (140 offline tests), complete runtime-tree Git exclusions, payload-free SSE and blocked raw-progress downloads. Private runtime artifacts remain local. The source changes have not been activated by an app restart. The earlier no-remote/no-commit statements below describe the historical handoff, not the later checkpoint; use Git/GitHub to verify current commit and push status. Deadline, users/concurrency, deployment scope and live acceptance approval remain unconfirmed. See `README.md` and the newest `RPC-CONNECTION.md` section.

## User request / next-session mandate

Review the entire project and recent changes, identify real MVP release blockers, then continue finalizing it for people to use and eventually push it to a repository. Time is limited. Do not confuse passing local tests, API reads, or a running dashboard with a production-ready end-to-end builder. Freeze cosmetic work; prioritize safety, accurate capability/status reporting, required coverage, reproducible deployment and real acceptance.

The previous assistant recommended a supervised single-operator pilot before unattended/team deployment. **The user has not yet confirmed that reduced release scope, the deadline, number of users, deployment host, Git remote or repository visibility.** Clarify these after presenting a short evidence-based critical path. Do not silently call a local pilot a multi-user production release.

Work in `/Users/bailey/cvent-ego-runner`. Read applicable AGENTS instructions. No workers or paid acceptance runs are in flight as of this handoff. Keep work bounded; do not autonomously consume an indefinite backlog or launch nested agents. Review before modifying, preserve the current baseline, and do not push private artifacts or credentials.

## Verified handoff snapshot

- App: `http://127.0.0.1:8788/`, PID **66266**, recorded in `data/rr-connection.lock`. Recheck; PIDs are historical observations, not authorization to kill arbitrary processes.
- No active jobs and no `*operation.lock` under `data` at handoff.
- Assigned browser ownership **USER**, runtime ID/job `88758a4b-46bf-4bf8-a80a-b422ddbf0b22`.
- Steel session `d81f7788-5fe1-4890-aac4-87ecf534fb82`, target `66C3818336AF4742191C21B550981A22`. Reverify identities rather than adopting another tab.
- A security-acknowledgment field is now present in the runtime. Older documents saying the incident is necessarily still unresolved are stale; examine the explicit acknowledgment evidence before making any claim. Never fabricate/clear incident attestation. A fresh browser does not revoke an old session.
- Last run `88758a4b-46bf-4bf8-a80a-b422ddbf0b22`, requested target **(C+D) Medtrade Testing Clone 2**, stopped on explicit user instruction: `STOPPED_REQUIRES_REVIEW`, **$5.682544** run cost, **$23.427518** target-attributed cumulative cost, no Stop failures or unreconciled spending.
- Global recorded spending also includes another event, so global and target totals differ. Do not erase or reset either.
- Git branch `main`, **no remote configured**. Status reported 19 untracked entries and 2 other changes. Much of the project predates this handoff as untracked work. No destructive Git cleanup or blanket `git add -A`; inspect source-only changes and artifact exclusions.
- Latest full suite: **138 passing**, `logs/api-item-writes-full-tests.log`.
- Latest activation: `logs/api-item-writes-activation-20260920T015938Z/receipt.json`; 135 preservation hashes, zero implementation paid prompts or live Cvent mutations.
- Restart history for transparency: 55122 → 65715 loaded the update, but verification found ownership still AGENT after Stop. With no active processes/jobs, explicit Take Control restored USER; preserved restart 65715 → 66266 then passed. Neither browser/profile was restarted or logged out. Review Stop/ownership semantics for MVP; do not hide this operational distinction.

## Intended product and fixed authorization

Upload RR + explicitly name existing target → START BUILD → genuinely clean local Steel browser → human login → RETURN TO AGENT → deterministic safety/identity/budget checks → one fresh native Pi executes the permitted RR.

- **One native Pi**, original tools and pinned Ego skill; no second intake agent, replacement framework, saved-transcript restoration or replay browser automation.
- Upload-bound `requestedEventName` is authoritative, even when the workbook has a different event name. Never rename or switch the target.
- **Create-only preservation remains in force.** Reuse existing/default/prior-run items unchanged. Confirm absence with a complete scoped lookup before creating. Report existing differences as unresolved, not satisfied. Never duplicate/replace/disable to evade preservation. Follow-on initial configuration of an object newly created inside the same guarded API command is narrowly allowed; later calls cannot edit that existing object.
- This scope cannot promise complete RR compliance when existing settings differ. Changing the policy requires explicit user authorization, not an API-routing fix.
- Skip ordinary ambiguous/missing values and dependent work, record omissions, continue independent requirements. Pause for authorization, security, identity, ownership, uncertainty, budget or human login. Never invent financial/application values.
- No deletion/archival, publishing, communications, attendee access, session/speaker configuration, other events, account-global or merchant/financial-account setup, or integration identifier changes.
- Authentication and session-revocation attestation are human-only. Never inspect cookies/storage, hidden/password/token inputs, page source or raw credential-bearing network content.
- Local Steel only. Do not touch unrelated browser services or use Steel Cloud.
- Preserve originals, workbook versions, profiles, reports, costs and uncertain-write evidence. Stopped runs require a fresh upload/native session; no automatic resume/replay.
- Budget: $60 cumulative allowance with $10 external reserve, effectively $50 AI allowance including prior target-attributed spending. Not a promise that the whole RR completes below $60.
- Coding/test authorization is **not** authorization for a paid RR acceptance run or live Cvent mutations. Obtain bounded explicit approval for those and any permanent new test items.

## Read these first

1. `RPC-CONNECTION.md` — newest sections first; old sections describe superseded behavior.
2. `CLEAN-BUILD-PLAN.md` — implemented login-first lifecycle and initial activation evidence.
3. `CVENT-API.md` and `CVENT-API-COVERAGE.md` — current writes, limitations, official routes and historical audits.
4. `E2E-ACCEPTANCE.md` — acceptance framework, **some rows/statuses are stale** (see corrections below).
5. `BROWSER-SESSION.md` and `.pi/skills/ego-browser/references/steel-bridge.md` — distinguish historical shared profile from current per-build provisioning.
6. `package.json`, deployment/configuration files, `.gitignore`, `app/`, `ego-bridge/`, `public/`, and tests. Inspect actual working-tree/untracked changes; documentation is not a substitute for code review.

Do not dump native transcripts or broad JSON datasets. Historical traces include exposed authentication material. Use narrow, redacted evidence and metadata; never put raw tool output/private reasoning in a user activity feed.

## Implemented baseline

### Login-first clean browser

- `app/clean-browser.mjs`: owner-only empty per-job profile, uniquely named Docker container, pinned existing local Steel image, dynamic loopback API/CDP ports, bounded non-model readiness and identity checks. No old-cookie copying, old-profile fallback or destruction.
- Image pinned to `sha256:21cf2a5785aa9478d0f7933c04bce96ca79f3d7a93d9824ea184800d29d3cd02`.
- `app/rr-connection.mjs`: production upload stores only; Start provisions/waits with **zero Pi launch/RPC/prompt**. Verified Return starts one empty native session and one execution prompt. Rechecks assigned browser after preparation, handles duplicate Return/Stop/provision races and blocks legacy prelaunch execution paths. Legacy fixtures still exercise old lifecycle paths; distinguish them from production wiring.
- `app/server.mjs`: setup, API/browser identity, incident acknowledgment, history/budget gates, assigned runtime viewer proxy.
- `ego-bridge/host.mjs`: BOOTSTRAPPING only navigates the assigned fresh blank page to the neutral Cvent entry URL. It does not type/login or authorize configuration.
- Real isolated provisioning + Ego-bootstrap probe passed without AI/authentication actions or touching the assigned browser: `logs/clean-browser-bootstrap-probe-03b59f62-09b5-47d4-837a-cc879de249ff/receipt.json`. Owned probe containers were stopped, not deleted; profiles/evidence retained.
- Old per-build containers/profiles are retained; retirement/resource limits are operator-managed, not a finished production lifecycle.

### API-first reads AND writes — latest change

The stopped run did perform eight successful API reads before browser work. It did not prove API-write coverage. Its `route-plan.json` explicitly blocked item-scoped discounts on a missing association integration. This was a real adapter gap, not proof that APIs were read-only.

Files: `app/cvent-api.mjs`, `app/cvent-api-cli.mjs`, `app/runner-prompt.md`, `test/item-discounts.test.mjs`, `test/discount-cli.test.mjs`, `test/runner.test.mjs`.

- `configureDiscount` already created missing final-total codes and preserved existing ones.
- It now accepts `agendaItems: [{id, type: "AdmissionItem" | "QuantityItem"}]` for **initial new-code configuration**. Resolves 1–100 unique item UUIDs against complete event-scoped catalogs; no session/attendee/registration-type-ID substitution.
- Creates inactive/final-total temporarily, verifies the new ID, links each explicitly requested item via documented PUT, polls authoritative complete association reads, then finalizes RR values with item application enabled and independently verifies all saved state.
- Every mutation has durable intent; the whole command retains one uncertainty marker until completion. The CLI permits follow-on PUTs only for the same-command verified new ID, rechecks Stop/ownership/target and marker ownership, and never exposes a standalone existing-code link/update grant.
- Existing codes/associations, including prior-call creations, remain immutable. Differences are `PRESERVED_DIFFERENCE`, not compliance. Failed/partial creations remain uncertain and must not be replayed, deleted or repaired automatically.
- Added `listQuantityItems` and `listDonationItems`; donation linking is not supported.
- Capability output now explains write support/limits. Legacy `updateEvent`, `updateEventBasics`, `updateRegistrationType`, `updateEventCustomFieldAnswers` remain blocked in production. Historical low-level helpers are not grants.
- Prompt requires separate per-requirement read/write routes and eligible independent API writes before unrelated browser exploration, with specific read-only UI dependencies allowed. This is a routing instruction, **not proof every future model run follows it**.
- **Volume discount writes remain unintegrated.** Arbitrary eligibility semantics are not implemented by item associations. Question-choice/feature-state read gaps and browser workflows still require review against the chosen MVP RR.
- 138 offline tests pass, including production CLI multi-step writes, preservation, scoped lookup, Stop/takeover, foreign uncertainty, stale readback and no replay. **No live item-discount creation acceptance has occurred.** Review official semantics, partial-failure handling and guard boundaries before claiming production certainty.

### UI/workbook/security baseline

- Forge-style RR editor and dashboard: `public/{index.html,app.js,styles.css}`.
- Workbook preview/edit/versioning: `app/workbooks.mjs`, `app/workbook-editor.py`; immutable originals, checksum provenance, formula read-only, archive/XML safety, stale-save and active-run write guards. No paid prompt merely to preview/edit.
- One ownership toggle: AGENT → TAKE CONTROL (Stop/handoff); USER → RETURN TO AGENT (only a live setup-waiting run). Not pause/resume of stopped jobs.
- `app/session-security.mjs`: durable explicit incident acknowledgment with read-only authenticated assigned-page verification; multiline DOM login detection regression fixed. Review broad password-string denial for false positives without weakening actual login/MFA/expiry checks.
- Production Pi uses `--no-context-files --append-system-prompt app/runtime-policy.md`, pinned Ego skill, low thinking. Preserve native execution, not a replacement agent architecture.

## Known MVP risks / unfinished work

1. **No accepted full RR.** API read success and mocked API writes are not saved-result evidence for all SOW areas.
2. **Preservation vs “full configuration.”** Existing mismatches are intentionally not changed. Define honest MVP completion/exception semantics with the user.
3. **Browser authoring and object preservation unproven.** Identity/ownership/uncertainty guards are not a complete object-level create-only sandbox. Direct shell and retained low-level adapters also exist. Review least privilege and practical supervised safeguards.
4. **Deployment is local, not validated team isolation.** No completed authentication/access-control/multi-user isolation/security review. User 2/3 were deliberately unavailable rather than falsely isolated. Decide local supervised pilot vs concurrent users before deployment design.
5. **Portability/package dependencies.** Existing API clients are imported from `~/cvent-agent` and `~/cvent-ui-automation`; credentials file and runtime paths are local. Pi provider/auth, Docker availability, pinned image, viewer/WebSocket routing, startup/recovery and secrets provisioning need reproducible installation/deployment checks.
6. **Status/activity accuracy.** Last run's stage label stayed “Inventory RR” after API and browser work; an old security message remained after successful handoff. Earlier monitoring based on those labels was corrected using actual receipts. Fix misleading status before users rely on it. Rich timestamped actions/tools/results/skips/blockers with scrollback was requested but not implemented. Use safe structured summaries, not raw transcripts or private reasoning.
7. **Costs/performance unproven.** Incremental all-sheet inventory/source ledger is instructed, not yet demonstrated to meet full-RR cost/latency targets. Prior spending reduces remaining budget. Do not restart paid attempts merely to test UI fixes.
8. **Stop/crash/uncertain-write recovery.** Review partial multi-step creation, stale locks, orphaned processes, ownership flags, no replay, disconnects and delayed readback. Do not silently clear a lock or uncertainty marker.
9. **Browser retirement/resources.** Clean profiles are real, but retained old containers can accumulate resource consumption. Preserve evidence/profiles; agree on a safe lifecycle rather than blanket cleanup.
10. **Stale documentation.** E2E-ACCEPTANCE still describes some old paid-intake ordering, unconnected catalogs/associations and unresolved incident status. Update it from current verified evidence; do not simply tick all gates.

## Recommended next steps (bounded, not an endless backlog)

1. Read-only audit of code, tests, security boundaries, actual receipts, Git changes and deployment assumptions. Reconfirm no new active job before touching shared state. Produce a short P0/P1 blocker list distinguishing proven, mocked and untested behavior.
2. Confirm deadline, intended users/concurrency, hosting, accepted create-only scope and target repository/visibility. Recommend supervised single-operator MVP if time is short, but obtain agreement.
3. Select the smallest release-blocking implementation slice and its tests. Avoid cosmetic redesigns or integrating unrelated APIs. Keep one writer and review resulting changes.
4. Once code is ready, request authorization for ONE bounded live acceptance using an approved RR and explicit unpublished target with useful permanent missing items. Obtain approval for spend and creations; never use the prohibited mock below. Prove saved state, preservation, no duplicates, Stop/uncertainty behavior, cost accounting and honest final exceptions.
5. Stage source/docs/tests only after checking ignores, secrets and sensitive fixtures/history. No remote exists yet: ask for the intended repository and visibility before configuring/pushing. Do not push data, workbooks, profiles, logs, credential files, native sessions or customer traces. Do not rewrite history or clean untracked work destructively.
6. Final handoff/runbook: startup/login/use/Stop, known limitations, supported scope, recovery and human signoff. Passing local tests alone is not go-live approval.

## Protected resources

- Never execute, modify or delete `/Users/bailey/Downloads/Medtrade_Testing_Clone_2_MOCK_ONLY_New_RR.xlsx`. It explicitly prohibits execution. SHA256 `bb381b810379e26b3accf27d93234197f4550c5bacbe4fff0dfc0384128b98e7`.
- Preserve original shared container `cvent-ego-runner-steel`, old profiles, all build artifacts and the reference screenshot `/Users/bailey/Downloads/screencapture-127-0-0-1-28877-2026-09-19-17_02_54.png`.
- The separate Steel skill runtime at port 4310 is not this app's runtime. Do not use or stop it to repair Cvent.
- Historical security-sensitive job `0cd488a1-0209-461d-a556-69328bfe0334` contains exposed authentication material in native traces. Never dump or publish it. Use sanitized incident evidence only.

This is a durable handoff for the user's `/new`; it is not a claim that the next session has already taken control or that any release/push/paid acceptance has occurred.
