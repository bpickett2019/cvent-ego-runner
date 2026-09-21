# Cvent RR runner — pre-release

Native Pi + pinned Ego + local Steel. **No full RR acceptance has passed. Not approved for team/public production.** A supervised, sequential, single-operator pilot is the recommended first target, but its scope and deployment still need user agreement.

Private source checkpoint: https://github.com/bpickett2019/cvent-ego-runner. This backs up source, documentation, tests, the upstream vendor pin and its patch—not private runtime artifacts or a portable ready-to-deploy installation. Checkpoint `63a8c64` was pushed before the user-requested budget reset/simplification. It includes completion safeguards, evidence tools and Steel lifecycle cleanup; see `RPC-CONNECTION.md` for current test/activation evidence. Check Git for later commit/push status.

## Native execution

Upload RR + name event → Start → human login/Return → one fresh native Pi session receives one task through RPC. `app/runner-prompt.md` is a concise request to execute the workbook in the assigned event using Ego/local Steel: reuse exact RR matches, create separate RR-compliant objects for any differences or missing requirements, preserve originals and report saved results/blockers. The uploaded path and verified event are appended as job inputs; no example workbook/event is hardcoded.

Pi chooses its plan, workbook-reading approach and working notes. There is no required ledger schema, section checklist, audit command, post-run audit process or automatic reprompt. Native tools, system prompt, compaction/retries and the pinned Ego skill remain; the app waits for `agent_settled`, not merely `agent_end`. Supported Cvent API operations remain available and are preferred; the compact evidence helper is optional. API/browser preservation, ownership, human-only login, uncertainty, Stop and cumulative spending gates remain unchanged. There is no mandatory review phase. DONE means Pi verified the RR-required website (theme/branding, header/footer, all six body-widget types), registration (admission items, pricing, paths, optional items, vouchers, advanced rules), and dependencies saved and connected in Cvent, still Draft. Missing, blocked or unverified work is INCOMPLETE; interruptions/cleanup failures are STOPPED. A normal native exit alone never becomes DONE.

There is one launch path only: no paid intake/clarification stage, legacy direct execution, idle prepared-session pool or session-restoration helper. Upload starts no Pi process; verified Return launches it. The old `/start` and `/continue` endpoints only reject requests. The upload UI, fresh-session isolation and browser provisioning are unchanged. Source simplification does not repair the earlier renderer crash or certify browser authoring, live discount creation, deployment or a 90-minute completion target. See `RPC-CONNECTION.md` for verification and activation history.

## Every RR starts fresh

Every successful Return starts directly in EXECUTING from that upload's workbook and current live saved Cvent state. No prior plan, unfinished step, browser position or task is resumed. Historical reports/receipts remain app-side evidence and accounting, not model-facing task inputs. Fresh does not mean deleting, resetting or cloning the event: inspect saved configuration against the new RR.

Prior-run uncertainty is not a startup prerequisite or executor task. The historical browser/API uncertainty gate, operator-decision requirement, recovery prompt, request fence, promotion command and legacy reconciliation flags have been removed. This applies to every execution entry path. Old reports and costs remain historical evidence only; no verification or repair is fabricated. Current-run uncertain writes still stop that run and prevent replay/false DONE. Live processes, unfinished operation locks, cleanup failures, spending, security and identity checks still apply.

## Execution efficiency and accounting

Keep the existing flow: compact Python/RR extraction → supported API operations → focused Ego work → saved verification. Retain full source/receipt evidence on disk, print relevant fields/exceptions, reuse unchanged observations and group predictable observed actions. Check shared-setting/uniqueness dependencies early. No output interception, extra planner, reviewer, required ledger or automatic paid continuation was added; smaller live context and full-run price still require measurement.

A user-authorized, operator-only budget reset records credits in private `data/budget-reset.json` plus an immutable reset receipt. Future accounting subtracts only those captured native costs; new spending still accumulates under the $60 allowance/$10 reserve. Historical jobs, reported costs and uncertainty stay untouched. Clear/New RR never resets billing. Resetting accounting neither refunds provider charges nor reconciles uncertain Cvent saves; fresh authoring remains blocked until existing safety conditions are met; no new executor is assigned historical recovery work. Stop the app and confirm settled native processes before maintenance resets; do not reset during a run.

## Safety contract

- Upload an RR and explicitly name the existing unpublished event. Never infer or change the target from workbook text.
- Production Start Build creates an empty per-job browser. Human login and explicit Return to Agent precede Pi launch or paid prompts. Settlement, Stop/Clear, failed startup, native failure and graceful app shutdown stop that job's Steel container and verify process exit. Profiles, container filesystem and evidence remain on disk; the browser no longer consumes memory. Cleanup failures remain durable and block clean completion.
- Reuse only exact RR matches. Any specified letter, number, formatting or relationship difference calls for a separate RR-compliant object, leaving the original untouched. Do not invent values/suffixes or bypass Cvent uniqueness/singleton constraints; report that concrete blocker and continue independent work. API guards are not an arbitrary-shell or browser-object sandbox.
- No publishing, deletion/archival, communications, attendees, other events, account-global or merchant setup, or integration-identifier changes. Login and incident attestations are human-only.
- A stopped run is not rollback. No automatic resume, retry of uncertain writes, or replay of old conversations. Preserve all originals, versions, profiles, receipts and costs.
- Paid/live acceptance requires separate explicit approval of the executable RR, target, spend and permanent creations. Never execute the prohibited mock identified in `MVP-HANDOFF.md`.

## Native execution result

The existing `reports/final-report.json` carries a small completion result, not a requirement ledger:

```json
{"eventId":"<authorizedEvent.apiEventId>","status":"DONE","completion":{"website":true,"registration":true,"dependencies":true,"draft":true},"blockers":[],"untested":[]}
```

Set DONE only after verifying all RR-required configuration above. Exact existing matches count; no forced write is needed when all requirements already match. Otherwise report INCOMPLETE with false/unverified areas and concrete blockers or untested work. Pi continues independent executable work before settling; it does not ask for a review.

The connection interprets the report after native process/ownership cleanup. DONE requires the bound event ID, explicit DONE, all four strict `true` values, empty blockers/untested arrays, and no retained uncertainty/operation locks or cleanup/spending failures. Missing, malformed, oversized, linked, wrong-event or contradictory completion data cannot become DONE. No extra paid turn, audit CLI or review step runs. This validates the agent's result structure, not semantic truth independently; live correctness still depends on Pi's saved-result verification and its receipts. Broader product/release acceptance is separate.

## Current installation limits

This is **not yet a clean-clone deployment recipe**. The existing installation uses:

- Node (audit environment: 25.8.1), Python 3 + openpyxl (3.1.5), Docker and native Pi with configured provider/model/pricing.
- Existing Cvent clients and `tsx`, defaulting to `~/cvent-agent` and `~/cvent-ui-automation`. Set absolute `CVENT_AGENT_ROOT` / `CVENT_UI_AUTOMATION_ROOT` to install them elsewhere; these clients are still external prerequisites, not downloaded or replaced by the runner.
- Pinned Ego submodule `dca7003349c5f7132189ba00547cbbd7ff8e597e`, the session-ledger patch and built vendor assets; see `.pi/skills/ego-browser/references/steel-bridge.md`.
- The existing local Steel image digest in `app/clean-browser.mjs`. `docker-compose.yml` describes the historical shared browser, **not** production per-build provisioning. Do not recreate it to install this update.
- Private runtime/bootstrap state and externally provisioned Cvent/Pi credentials. No credentials belong in this repository.

Do not run a second server against this checkout. The existing server owns an exclusive lock. A stale lock must never be removed merely to make startup work. `npm run check:installation` checks local prerequisite presence without starting Pi, Docker, a browser or Cvent requests. It is not authentication, image/daemon, vendor-patch, saved-state or fresh-install acceptance; those checks remain release gates.

### Minimal installation preparation (new host only)

1. Install Node 24+ (tested locally on 25), Python 3, Docker and native Pi. Use `npm ci` for the locked Node dependencies. In a Python environment visible on the server's PATH, run `python3 -m pip install -r requirements.txt` (openpyxl 3.1.5).
2. Provision the existing API clients/dependencies at the defaults above or set their absolute root variables. Provision the pinned Ego revision **with the existing reviewed session-ledger patch and built assets**; do not reset the current dirty vendor checkout. The offline check verifies the revision and entry point, not patch/build equivalence.
3. Provision Cvent credentials outside Git (`CVENT_CREDENTIALS_FILE`, owner-readable only), and Pi's own authentication. Set `PI_PROVIDER` and `PI_MODEL` to the approved configured model. Never print credentials or copy runtime/browser profiles as installation fixtures.
4. Run `npm run check:installation`, `npm test` and `npm run check:repository`. Review remaining unverified prerequisites: local Docker daemon and the exact Steel image from `app/clean-browser.mjs`, provider pricing/authentication, credential validity/permissions and vendor patch/build. No automatic downloads, remote Docker operation or live smoke tests are performed by the installation check.
5. Only after verifying exclusive server ownership and resolving—not deleting—any stale lock/uncertainty, start `PORT=8788 npm start`. Keep the existing loopback binding; no public listener/tunnel/proxy. **Do not run this against an already running installation.** A new host/fresh install is not accepted until independently exercised with explicit live authorization.

No completion audit is required or launched by the connection. Optional local evidence/review tools are documented in [RR-EVIDENCE.md](RR-EVIDENCE.md); they do not control Pi's execution. Fresh approvals capture the live prompt. No restart is performed by these commands or the evidence CLI; verify loaded server code before any controlled maintenance.

## Local operator runbook

Only after installation and server ownership are verified: open the loopback dashboard, preview/edit a workbook (immutable original retained), name the target, Start Build, log in manually, then Return to Agent. Inspect saved-result evidence and exceptions after settlement. DONE is derived from the native agent's saved-verification result, not a second agent or audit. Historical FINISHED/REVIEW_REQUIRED labels display as INCOMPLETE (old interrupted runs as STOPPED); saved history is not rewritten.

Use **CLEAR / NEW RR** below the Excel upload to end the selected context and clear the form, workbook preview, target, replies and saved UI selection. Choosing another Excel ends the old agent context but preserves the entered target and keeps the prior workbook/edits until the replacement saves successfully. The upload area shows `Saved: filename`, including after reload. Only the explicit Clear button blanks the target and preview; a failed upload retains the prior selection (but cannot undo a completed Stop). Active runs and unsaved edits require confirmation. Reset awaits native Stop/cleanup (or releases a never-prompted prepared session); cleanup/spending failures keep the old selection for reconciliation. Pending Start/Return must settle first; Stop remains available. No Pi process, model prompt or browser reset is created by Clear. The next explicit Start/login/Return creates a distinct empty conversation. Saved files, receipts, uncertainty and cumulative event spending are retained; a fresh context does not reset the budget or skip resource-cleanup checks. Historical write uncertainty does not block it. Page reload alone restores the selected run, not a new context.

Use **Take Control** to Stop execution. Under the current lifecycle policy, ending the run also shuts down its Steel browser; it does not keep a live browser available for manual editing. Stop revokes both job and matching shared browser ownership before native cleanup; cancelled handoffs cannot regrant control. Verify USER ownership and inspect cleanup/spending warnings before another run. These races are covered by offline fixtures, not yet a full live acceptance. Stop cannot retract a submitted request. Never delete a partial item or clear uncertainty to continue. Reconcile authoritative saved state read-only and obtain approval for any repair. Automatic cleanup checks job/container provenance and stops only that container's immutable ID—never other applications. It does not delete profiles, clear uncertainty or retry execution. Hard SIGKILL, host failure or an unavailable Docker daemon can prevent cleanup; those require ownership-verified reconciliation before restarting. Stopped container/profile disk retention remains separate from live-memory cleanup.

During execution, a conservative browser-failure guard invokes Stop after **3 recognized unresponsive-browser failures within 10 minutes** (renderer/CDP/navigation timeouts, not ordinary selector/stale-ref errors), even with successful observations between them. Recognized unconfirmed page execution stops that run immediately and retains its evidence. A later fresh upload does not inherit its uncertainty or tasks. These are known SDK error-message signatures, not a full browser-health check, sandbox or semantic progress detector; successful but unproductive reading is not automatically detected. No automatic retry or browser reset is performed. A stopped run may lack an agent final report; review retained evidence and Stop reason instead.

The server binds loopback and checks Host/Origin, but has **no app authentication**. Other local users/processes can access it. Do not expose it through a public listener, tunnel or reverse proxy. Direct Steel ports and viewer interaction are trusted local surfaces, not tenant-isolation boundaries.

## Verification and release preparation

```sh
npm test                  # offline fixtures; no paid model run or live Cvent writes
npm run check:repository  # index artifact-path gate; not a secret/content scan
npm run check:installation # local prerequisites only; no paid/network/browser calls
```

Live-read scripts under `test/live-*` are intentionally excluded from `npm test`; do not substitute them for offline checks without reviewing their fixed target and authorization.

`data/`, `logs/`, native JSONL, workbooks and common secret/archive types are ignored in full. Existing private files are retained, not deleted. Raw native progress stays on disk; the updated source denies its HTTP download and exposes only allowlisted, payload-free SSE activity. **Activated by a preservation-verified app-only restart.** Structured reports, assistant replies and job state still contain private customer data and are not generally credential-sanitized; all HTTP surfaces remain trusted-local only.

Before each commit/push:

1. Verify the destination and private visibility. The user approved the private source checkpoint above; deadline, intended users/concurrency and deployment scope remain unconfirmed.
2. Review source/docs/tests individually. Do not use blanket `git add -A`. Never stage runtime artifacts or customer workbooks, even with `-f`.
3. Stage only reviewed source paths. Reconcile the staged submodule pin with the tested pin; retain the local vendor patch as source rather than silently discarding it.
4. Run the index path gate, inspect staged content for credentials/customer information, and review submodule content separately. The gate does not scan contents, Git history or nested repositories and cannot certify secret-free publication.
5. Run relevant offline checks. A source-only checkpoint does not authorize a paid/live acceptance or release. Separately approved live acceptance and human review/signoff precede release; preserve private evidence outside Git.

## Evidence and next decisions

Audit baseline: 138 offline tests passed again; no active job/operation lock or live recorded Pi process. Last run stopped; browser USER-owned. Explicit incident acknowledgment exists; it is not independent proof of remote token revocation. See `MVP-HANDOFF.md` for private evidence locations and protected resources.

Live-proven historically: scoped API reads, representative old-policy reversible writes, isolated clean-browser/bootstrap probes. Mocked: current create-only discount creation/linking and lifecycle races. Unproven: full RR acceptance, browser existing-object preservation, saved-result coverage across SOW, cost/latency targets, fresh installation and multi-user isolation.

Shortest remaining path: agree release scope → address installation blockers → map only that RR's required gaps → authorize one bounded acceptance → inspect saved-state/preservation/cost evidence → approve release and push. No promise of full compliance where preservation requires unresolved differences.
