# Native Pi connection

Transport and lifecycle only. Native Pi owns reasoning, tools, planning, compaction and execution. Scope/operator rules are in [README.md](README.md); activation and evidence are in [MVP-HANDOFF.md](MVP-HANDOFF.md) CURRENT. Older implementations are [archived](docs/history/README.md), not alternative modes.

## One launch path

`upload → Start clean Steel → human login → verified Return → fresh Pi/RPC → execute/verify → settle → stop Pi and Steel`

- Upload stores immutable workbook bytes/name/hash. Preview/edits are local and versioned. No Pi process or paid prompt runs during upload or login preparation.
- Start provisions an empty per-job profile/container using the existing local pinned Steel image. Bootstrap only opens the neutral Cvent entry page; it never types credentials or configures an event.
- Human Return verifies login, explicit incident attestation when required, exact API/browser event identity, ownership, source integrity and resource/accounting safety. From the neutral Events list, restricted navigation may open only the API-confirmed event. Wrong-event navigation is not silently corrected.
- One native process launches with required `PI_PROVIDER` / `PI_MODEL`, operator-selected `PI_THINKING_LEVEL` (defaults to `high`; invalid values fail before launch), project `bin` on PATH, `--no-context-files`, and the explicitly pinned Ego skill. Native system prompt, tools and extensions remain unchanged; development context files are excluded.
- RPC confirms an idle, empty, changed session with zero messages/pending work/cost before the sole execution prompt. `app/native-task.md` and `app/standing-sow.md` are captured as the job's `runner-prompt.md` and `approved-sow.md`. The sole task points to that scope file; `app/run-policy.mjs` appends only authoritative job inputs. Neither API-first routing nor editor order is prescribed. Historical conversations, reports, recovery tasks and budget coaching are not injected.
- The app waits for native `agent_settled`, not intermediate `agent_end`. No paid intake, prepared-session pool, replacement executor, automatic continuation, completion audit or second agent. Human `steer`/`follow_up` messages use the same live session.
- At most one executing job. Duplicate handoffs and Stop/provision/Return races are guarded. Missing login-first dependencies fail at mount rather than enabling a legacy path.

Saved Cvent state is inspected against each fresh RR; “fresh” does not delete/reset/clone the event. Prior-run write uncertainty is historical evidence, not a new-run prerequisite/task. Current-run uncertainty and resource/accounting failures remain blockers.

## Dashboard progress contract

Maintain `state.json.requirements` as an array, using stable IDs and concise human-readable labels. Example shape (not an actual RR requirement):

```json
{"requirements":[{"id":"sheet:cell-or-stable-id","label":"Requirement description","status":"unverified","verification":"","reason":""}]}
```

- Initialize the array from all identified in-scope RR requirements before the first Cvent inspection. Include source cells, target values and stages as supporting fields; never fabricate coverage or count workbook templates as requirements. The task requires a requirement-scoped inspect/edit/save/readback loop, not a full live inventory before writing.
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

Pi determines which requirements apply within the standing SOW; `requirements` attests they are implemented, connected and independently verified. No category flags or widget checklist are imposed. Explain genuinely non-applicable areas in Markdown; Draft always requires verification. Blocked/untested work is not N/A. Unrelated RR/whole-project exclusions belong separately in Markdown, not JSON blocker arrays. An in-scope dependency needing prohibited work remains blocked.

After native settlement and cleanup, DONE requires the bound event ID, explicit DONE, both strict `true` flags, empty blocker/untested arrays, and no retained current-run uncertainty/operation locks or cleanup/metering failures. Missing, malformed, oversized, linked, wrong-event or contradictory results cannot pass. Ordinary incomplete results become INCOMPLETE; interruptions/cleanup failures are STOPPED. Historical FINISHED/REVIEW_REQUIRED labels display as INCOMPLETE without rewriting saved history. Legacy reports using website/registration/dependencies/draft flags retain their old interpretation.

**This checks report consistency and safety, not semantic RR truth.** Pi must independently verify saved results. Offline tests do not prove full live SOW completion.

## Stop, failure and accounting

1. Revoke job and matching shared browser ownership before cancellation; delayed handoffs cannot regrant it.
2. Acknowledge native `clear_queue`, then `abort` and `abort_bash`. If queue clearing fails, terminate owned execution without unsafe abort sequencing.
3. Snapshot native costs and terminate only the owned Pi process group. Await pending browser provisioning before cleanup.
4. Stop only the provenance-verified job Steel container by immutable ID and verify exit. Preserve profiles, container filesystem, receipts and uncertainty. Cleanup failures are durable, not clean completion.

Settlement, Stop/Clear, startup/native failures and graceful shutdown share cleanup. Take Control ends the run; it is not pause/resume. A stopped run may lack a final report. Hard process/host failure or unavailable Docker can prevent cleanup and require ownership-verified operator reconciliation. Do not steal a lock, adopt another browser or resume an old job.

Recognized unconfirmed browser execution stops immediately and retains evidence. Three recognized unresponsive-browser failures within ten minutes also Stop, even with successful observations between them. Ordinary selector/stale-ref errors do not count. This is a known-error-signature guard, not a browser-health/progress detector or automatic recovery loop.

Native costs are sampled every two seconds and settled on Stop; historical totals/reset credits remain. There is no automatic dollar threshold in current source, but unknown/lost metering still fails closed. Missing pricing blocks prompts. External charges/delayed usage are not fully metered. **The authorized app restart activated threshold removal; receipt and current status are in MVP-HANDOFF.md.**

## Local HTTP contract

Loopback address/Host/Origin checks are not app authentication. POST bodies are JSON except upload's multipart `rr`. Job routes below use `/api/jobs/:id`.

| Route | Behavior |
| --- | --- |
| `POST /api/jobs` | Save RR and create job; no Pi launch/prompt. |
| `GET /api/jobs`, `GET /api/jobs/:id` | History summary / durable ledger. |
| `POST …/read` | Start Build: provision browser and wait for human login. |
| `POST …/answer` | Explicit human Return for the active setup-waiting job; verify before launch. |
| `POST …/start`, `POST …/continue` | Reject (409); no legacy execution or stopped-session continuation. |
| `POST …/rpc` | Native `get_state`, `get_session_stats`, `get_last_assistant_text`, `get_commands`, `steer`, `follow_up` only. Messages are bounded plain text, not slash commands. |
| `POST …/stop` | Stop and release owned resources. |
| `GET …/events` | Live-only SSE with sequence IDs and allowlisted payload-free metadata; no transcript replay. |
| `GET …/results/:file` | Allowlisted `job.json`, `state.json`, `result.json`, `final-report.json`, `final-report.md`. Missing files return 404. Raw `progress.jsonl` is private disk evidence, not downloadable. |
| `POST /api/new-rr` | Serialized context reset after successful Stop/cleanup; no replacement Pi, deletion or accounting reset. |

Reset/model changes/arbitrary shell RPC/ungated prompts are not exposed. Interactive extension-dialog responses are not provided by this HTTP surface; stop and resolve blockers rather than leaving paid execution unattended. Structured reports/replies/job state remain private customer data despite payload-free activity projection.

## Maintenance

The server binds `127.0.0.1` (CLI default 8787; this installation uses 8788). An exclusive `data/rr-connection.lock` prevents a second owner; stale locks are never automatically stolen. Persisted unsettled jobs block new execution after restart. Startup does not automatically recover orphaned work or reconcile billing.

Use the [installation/runbook](README.md#installation-and-checks), not historical launch recipes. Source edits do not alter an already running server. New API CLI invocations load current code; fresh Start captures the current prompt. Restart, browser launch and paid/live acceptance each need explicit authorization. Preserve the running credential/model environment and private state; never log secrets.
