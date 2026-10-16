# Native Pi connection

Transport and lifecycle only. Native Pi owns reasoning, tools, planning, compaction and execution. The RR supplies requirements; the project-local [cvent-event-build skill](.pi/skills/cvent-event-build/SKILL.md) and its references supply expertise and operating boundaries. There is no SOW input. Operator rules are summarized in [README.md](README.md); activation and evidence are in [MVP-HANDOFF.md](MVP-HANDOFF.md) CURRENT. Older implementations are [archived](docs/history/README.md), not alternative modes.

## One launch path

`upload → Start clean Steel → human login → verified Return → fresh Pi/RPC → execute/verify → settle → stop Pi and Steel`

- Upload stores immutable workbook bytes/name/hash. Preview/edits are local and versioned. No Pi process or paid prompt runs during upload or login preparation.
- Start provisions an empty per-job profile/container using the existing local pinned Steel image. Bootstrap only opens the neutral Cvent entry page; it never types credentials or configures an event.
- Human Return may include an optional `eventName` correction only while the same job is waiting for setup, before any native session/prepared target/AI execution exists. The corrected operator selection and prior names are recorded; the workbook and browser are retained. Human Return then verifies login, explicit incident attestation when required, exact API/browser event identity, ownership, source integrity and resource/accounting safety. No naming prefix is required; missing/ambiguous or inaccessible names are rejected, not guessed. From the neutral Events list, restricted navigation may open only the API-confirmed event. Wrong-event navigation is not silently corrected.
- One native process launches with required `PI_PROVIDER` / `PI_MODEL`, operator-selected `PI_THINKING_LEVEL` (defaults to `high`; invalid values fail before launch), project `bin` on PATH, `--no-context-files`, and `--no-skills` plus one explicit `--skill` for `cvent-event-build`. Its17 supporting reference documents are not separate skills or agents, including the optional-to-consult private Registration Type Mapping Guide v2. Consult CURRENT for deployment status; the guide does not override event-specific RR requirements. Native system prompt, tools and extensions remain unchanged; development context files are excluded.
- RPC confirms an idle, empty, changed session with zero messages/pending work/cost before the sole execution prompt. `app/native-task.md` is captured as the job's `runner-prompt.md`; no `approved-sow.md` is created and no SOW text/path enters the prompt. `app/run-policy.mjs` appends only authoritative job inputs, including workbook SHA-256 and bound event. Pi loads the single build skill and relevant bundled references as needed; do not reread unchanged guidance already in context unless it is needed after context loss. The latest source task requires verified event selection, then RR-required registration types, then remaining dependency-ordered configuration; exact UI controls are discovered rather than scripted. Check MVP-HANDOFF CURRENT for activation. Discounts use the guarded API adapter for reads/writes; other configuration uses the assigned browser. Backend API preflight is unchanged. Historical conversations, reports, recovery tasks and budget coaching are not injected.
- The app waits for native `agent_settled`, not intermediate `agent_end`. No paid intake, prepared-session pool, replacement executor, automatic continuation, completion audit or second agent. Human `steer`/`follow_up` messages use the same live session.
- At most one executing job per workspace. With coordinated `CVENT_CONCURRENT_WORKSPACES=3`, the gateway permits three different-event builds across the three backends. A private backend preflight resolves the current job/context and exact API event UUID; serialized gateway admission persists a workspace/event lease before forwarding. The backend independently requires that lease to match its current context and API/browser-verified target before any Pi launch/prompt. Same-event overlaps are refused. Legacy single-slot mode remains only for explicit older configuration/migration. Check CURRENT for activation.
- Concurrent JOB capabilities disable shared contact-type creation; reuse existing definitions and report missing types for operator provisioning outside overlapping builds. The assigned-browser guard also denies recognized new-contact-type actions. This is not an arbitrary-shell security sandbox or a new shared-object authoring API.
- Duplicate handoffs and Stop/provision/Return races are guarded. Missing login-first dependencies fail at mount rather than enabling a legacy path.

Saved Cvent state is inspected against each fresh RR; “fresh” does not delete/reset/clone the event. Prior plans never become a new-run task. Prior same-event write uncertainty blocks native preparation independently of resource/accounting proof; unknown event identity stays blocking. Structured clearance distinguishes those conditions. The deployed gateway permits resource-only capacity transfer only with mandatory all-workspace event protection, repeated cleanup proof and retained old claims/uncertainty. Explicit same-workspace Clear archives its own verified-idle reservation without a replacement claim; it never clears another workspace or reconciles saved-write evidence. In concurrent mode, each workspace has its own durable reservation in `workspace-active.json`; prior revisions are retained under `workspace-history/`. A clean stopped same-event owner is not an indefinite event lock, but its saved uncertainty still blocks that event. Unknown-scope holds or unavailable peer safety evidence still deny unsafe new handoffs. Existing single-slot evidence is archived byte-for-byte only after verified cleanup; no TTL, startup deletion or automatic paid retry. See [deployed reset behavior](docs/WORKSPACE-RESET-AND-SLOT-RELEASE.md).

## Dashboard progress contract

Maintain `state.json.requirements` as an array, using stable IDs and concise human-readable labels. Example shape (not an actual RR requirement):

```json
{"requirements":[{"id":"sheet:cell-or-stable-id","label":"Requirement description","status":"unverified","verification":"","reason":""}]}
```

- Initialize the array from all identified in-scope RR requirements before the first Cvent inspection. Include source cells, target values and stages as supporting fields; never fabricate coverage or count workbook templates as requirements. The build skill guides inspect/edit/save/readback, not a full live inventory before writing.
- Before each meaningful browser batch update `currentStage`, `currentAction` and ISO `updatedAt`. Prefix the action with `READ`, `EDIT`, `SAVE_PENDING` or `VERIFY` and identify the requirement/purpose; use `LOCAL` for workbook/report work. With a requirements array, the UI displays these as agent-reported activity. This is not an independently measured read/write counter: local file writes and Save dispatches are not verified Cvent writes. Native payload-free tool activity remains separate.
- Use `unverified` until checked, `partially_verified` for incomplete readback, and `blocked` with a specific `reason` for missing inputs/capability or prohibited work.
- Use `verified_changed` only after an edit is saved and independently read back; use `verified_existing` only after an existing match is verified. Supply a concise `verification` describing persisted values and dependencies. A click, Save dispatch or tool success is not verification.
- Use `excluded` with a reason only for genuinely out-of-scope work, never an in-scope blocker. Exclusions are displayed separately and are not completed requirements.
- Update the affected entry after each verified change/match or discovered blocker; preserve other entries. Before a new edit to a previously verified requirement, mark it unverified again until the new state is verified.
- The UI derives Completed and Remaining from these statuses; it does not infer success from Ego actions or native tool logs. Unknown/missing statuses stay Remaining. Existing `evidence`/`blocker` strings are supported for older requirement records.
- When the array exists it is authoritative, even when empty. Historical records without it retain their legacy `completed`/`pending` checkpoints, labelled as agent-reported rather than independently accepted. No saved job data is rewritten by rendering.

Counts cover reported entries only, not proven whole-RR coverage. This progress display does not change the final completion or Stop gates below.

## Completion contract

Pi saves `state.json`, receipts, unresolved changes when needed, and `reports/final-report.md` / `reports/final-report.json`. The minimum DONE result is:

```json
{"eventId":"<authorizedEvent.apiEventId>","status":"DONE","completion":{"requirements":true,"draft":true},"blockers":[],"untested":[]}
```

Pi determines which RR requirements apply within the skills' operating boundaries; `requirements` attests they are implemented, connected and independently verified. The JSON schema has no hardcoded category flags. The skill's agreed category checklist accounts for applicable requirements and omissions without requiring every feature to be enabled. Explain genuinely non-applicable areas in Markdown; Draft always requires verification. Blocked/untested work is not N/A. Unrelated RR/whole-project exclusions belong separately in Markdown, not JSON blocker arrays. An in-scope dependency needing prohibited work remains blocked.

After native settlement and cleanup, DONE requires the bound event ID, explicit DONE, both strict `true` flags, empty blocker/untested arrays, and no retained current-run uncertainty/operation locks or cleanup/metering failures. Missing, malformed, oversized, linked, wrong-event or contradictory results cannot pass. Ordinary incomplete results become INCOMPLETE; interruptions/cleanup failures are STOPPED. The UI displays DONE as Done — verified complete, INCOMPLETE as Done — unfinished items, and STOPPED as Stopped. Historical FINISHED/REVIEW_REQUIRED display as Ended — completion unverified without rewriting saved history. Contradictory/unitemized progress is disclosed, not promoted to completion. Legacy reports using website/registration/dependencies/draft flags retain their old interpretation.

**This checks report consistency and safety, not semantic RR truth.** Pi must independently verify saved results. Offline tests do not prove full live RR completion.

## Stop, failure and accounting

1. Revoke job and matching shared browser ownership before cancellation; delayed handoffs cannot regrant it.
2. Acknowledge native `clear_queue`, then `abort` and `abort_bash`. If queue clearing fails, terminate owned execution without unsafe abort sequencing.
3. Snapshot native costs and terminate only the owned Pi process group. Await pending browser provisioning before cleanup.
4. Stop only the provenance-verified job Steel container by immutable ID and verify exit. Preserve profiles, container filesystem, receipts and uncertainty. Cleanup failures are durable, not clean completion.

Settlement, Stop/Clear, startup/native failures and graceful shutdown share cleanup. A stopped run may lack a final report. Hard process/host failure or unavailable Docker can prevent cleanup and require ownership-verified operator reconciliation. Do not steal a lock, adopt another browser or resume a stopped job.

**Operator pause (deployed):** Take Control binds the current job/context, revokes browser ownership, uses native Pi cancellation, and confirms same-session idle, no outstanding tools/holds, browser identity and spending. A confirmed pause retains Pi, Steel and the shared paid slot. An interrupted external tool remains unresolved even if native abort returns idle; failed safety proof invokes full Stop. Explicit token-bound `/resume` re-verifies the same event and sends one short handoff prompt, not a new session or stage-based replay. Failed human login verification may retain a proven safe pause for another explicit attempt. Stop wins pending pause/Return; restart cannot restore paused jobs. Ordinary INCOMPLETE, native/RPC, abort-only and uncertainty cleanup is unchanged. Take Control refuses a known in-flight tool before cancellation; wait for a tool boundary or use explicit Stop. This is not permission to interrupt an uncertain Save.

**Model-error retention (deployed):** after `agent_settled`, assistant request errors may retain a USER-owned same-session pause only after reconciled spending and the same idle/browser/no-holds checks. No prompt, cancellation or replacement process is sent by this path. `/resume` is still explicit/token-bound and retains the existing shared-slot claim. Sanitized `modelFailureHistory` persists; `modelFailure` clears only after a later completed successful native response. Each Return captures the prior report revision; a stale final report cannot produce DONE. Report freshness is not semantic saved-state proof. The paused error is not published as a terminal `result.json`; job/state retain the reason. Failed proof invokes existing full Stop.

Recognized unconfirmed browser execution stops immediately and retains evidence. Three recognized unresponsive-browser failures within ten minutes also Stop, even with successful observations between them. Ordinary selector/stale-ref errors do not count. This is a known-error-signature guard, not a browser-health/progress detector or automatic recovery loop.

Native costs are sampled every two seconds and settled on Stop; historical totals/reset credits remain. There is no automatic dollar threshold; legacy allowance/reserve fields are metadata and $60/~90minutes are targets, not limits or promises. Unknown/lost metering still fails closed. Native Pi/provider retries and compaction remain distinct from forbidden mutation replay or wrapper-driven new-run retries. Missing pricing blocks prompts. External charges/delayed usage are not fully metered. **The authorized app restart activated threshold removal; receipt and current status are in MVP-HANDOFF.md.**

## Local HTTP contract

Loopback address/Host/Origin checks are not app authentication. POST bodies are JSON except upload's multipart `rr`. Job routes below use `/api/jobs/:id`.

| Route | Behavior |
| --- | --- |
| `POST /api/jobs` | Save RR and create job; no Pi launch/prompt. |
| `GET /api/jobs`, `GET /api/jobs/:id` | History summary / durable ledger. |
| `POST …/read` | Start Build: provision browser and wait for human login. |
| `POST …/answer` | Explicit human Return for the active setup-waiting job; optional `eventName` correction before native execution. Reverify the selected target before launch. |
| `POST …/start`, `POST …/continue` | Reject (409); no legacy execution or stopped-session continuation. |
| `POST /api/take-control` | `{jobId, contextId}` requests a verified live pause; never retargets or launches. |
| `POST …/resume` | `{returnControl:true, pauseId}` returns the same active paused Pi session after identity/safety checks. Gateway forwards only for the existing slot holder; no claim release/acquisition. |
| `POST …/rpc` | Executing jobs only. Native `get_state`, `get_session_stats`, `get_last_assistant_text`, `get_commands`, `steer`, `follow_up` only. Messages are bounded plain text, not slash commands. |
| `POST …/stop` | Stop and release owned resources. |
| `GET …/events` | Live-only SSE with sequence IDs and allowlisted payload-free metadata; no transcript replay. |
| `GET …/results/:file` | Allowlisted `job.json`, `state.json`, `result.json`, `final-report.json`, `final-report.md`. Missing files return 404. Raw `progress.jsonl` is private disk evidence, not downloadable. |
| `POST /api/new-rr` | With `replaceWorkspace:true` and current `contextId`, cancel/drain the canonical same-workspace run, verify cleanup and reset context. `prepareUpload:true` defers selection replacement until preview/save succeeds. Gateway archives only that workspace's proven-idle claim after backend acknowledgment; no replacement Pi, evidence deletion or accounting reset. |
| `POST /api/workbooks/:id/save` | current non-null `contextId`, selected workbook and current `sha256` required. Serialized preparation and final synchronous manifest commit; no late commit after cancellation/context drift. Original/prior versions retained. |

`GET /api/runtime` advertises `operatorPauseSupported:true`, `setupTargetEditable:true`, `workbookSaveContextRequired:true` and `workspaceResetSupported:true` on the deployed backends. Clients follow advertised capabilities and context generations; refresh after coordinated updates. The UI enables name corrections only for a USER-owned setup-waiting job before AI starts; older running backends retain the locked field and receive no unsupported parameter. Once native execution begins, the target stays locked.

Workbook saves send `contextId` when required, preserving older-backend compatibility. Old clients without the token are rejected by the new backend; refresh after activation. Legacy-null selections require explicit re-upload, not automatic adoption. Save does not create a new generation, clear history or start AI. Saves cannot change a workbook already bound to an unstarted uploaded job; use New RR. Temporary/immutable artifacts from cancelled preparation remain private and unselected.

Reset/model changes/arbitrary shell RPC/ungated prompts are not exposed. Interactive extension-dialog responses are not provided by this HTTP surface; stop and resolve blockers rather than leaving paid execution unattended. Structured reports/replies/job state remain private customer data despite payload-free activity projection.

## API ownership versus operation evidence (deployed)

API mutual exclusion now uses an OS lock on a stable private `api-operation.guard` inode. The persistent file is not a running-process marker: a shared helper checks actual kernel ownership without creating/deleting files. Descriptor release/process death cannot remove write uncertainty or upgrade an interrupted read. All legacy `api-operation.lock` files remain blocking; browser and runner locks are unchanged. No recovery daemon, automatic write replay or PID/age-based lock deletion. Explicit gateway Clear/transfer can archive a verified-idle claim; retained write evidence is not deleted.

Fresh backend-created jobs carry `apiOperationLocking: kernel-flock-v1`; new CLI/Start paths reject older/unmarked uploads. This prevents new CLI behavior from silently running under old loaded clearance logic. Local and actual Azure filesystem ownership checks passed during the September29 coordinated rollout; future incompatible changes still need quiescent rollout. See [API operation locking](docs/API-OPERATION-LOCKING.md). CLI changes take effect on invocation; never update incompatible CLI/controller checks underneath a running job.

## Maintenance

The server binds `127.0.0.1` (CLI default 8787; this installation uses 8788). An exclusive `data/rr-connection.lock` prevents a second owner; stale locks are never automatically stolen. Persisted unsettled jobs block new execution after restart. Startup does not automatically recover orphaned work or reconcile billing.

Use the [installation/runbook](README.md#installation-and-checks), not historical launch recipes. Source edits do not alter an already running server. New API CLI invocations load current code; fresh Start captures the current prompt. Restart, browser launch and paid/live acceptance each need explicit authorization. Preserve the running credential/model environment and private state; never log secrets.
