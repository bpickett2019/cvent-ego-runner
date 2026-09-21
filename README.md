# Cvent RR runner — pre-release

Upload an RR, name an existing event, log in, and let one native Pi session build and verify the permitted configuration as Draft. Supported Cvent APIs first; pinned Ego + local Steel for documented gaps.

**No full RR acceptance has passed. Not approved for team/public production.** This is a trusted-local, single-operator installation, not an authenticated or multi-tenant service.

## Use

1. Upload the `.xlsx`, preview/edit it, and explicitly name the target event. Originals are immutable; edits create saved versions. Workbook text cannot change the selected target.
2. **Start Build** provisions an empty per-job Steel browser. Upload and login preparation start no Pi process or paid prompt.
3. Log in manually, then **Return to Agent**. API access, login, event identity, ownership and safety checks must pass before one fresh Pi session starts.
4. Pi interprets the RR, executes applicable requirements and verifies saved results. It chooses its own plan; there is no required ledger, second agent, automatic audit, retry run or paid reprompt.
5. Inspect the result: **DONE**, **INCOMPLETE**, or **STOPPED**. Settlement and Stop shut down that job's Pi and Steel, retaining profiles and evidence.

**Take Control** means Stop, not pause/resume or a browser kept running for manual editing. Stop cannot retract a submitted request or roll back a save. Cleanup failures remain blockers; never clear locks/uncertainty to force another run.

**Clear / New RR** ends the selected context and clears the form after successful cleanup. Selecting another Excel preserves the target and old workbook until replacement succeeds; a failed upload cannot undo an already completed Stop. Active runs/unsaved edits require confirmation. Pending Start/Return must settle first; Stop stays available. Reload restores the selection, not a fresh context.

Each run starts from its uploaded workbook and current saved Cvent state—not an old conversation, plan or recovery task. Historical write uncertainty does not block fresh runs; current-run uncertainty, live processes, unfinished locks, cleanup and metering failures still do. Clear/upload never resets accounting or deletes saved event configuration.

## Scope and safety

- Configure only applicable RR requirements and necessary dependencies within the event-build SOW: website/theme/header/footer/widgets, registration, admissions, pricing, paths, optional items, vouchers and advanced rules. No default category/widget work. Site Designer last; **Continue**, never Restore.
- Create or modify existing **event-only** objects/settings/relationships, including admissions and ordinary event prices. Keep the selected event's name/identity fixed and leave it unpublished as Draft.
- Protect existing shared/account-wide definitions. Reuse exact matches; separate shared creation requires proven isolation and tool support. Event URLs/new templates alone do not prove scope. No isolated shared-create API is currently established.
- Preserve RR names, codes and values exactly. No invented defaults/suffixes, duplicate workarounds, unverified writes or bypassing explicit API/tool denials. Missing capability is not broader permission.
- Never delete/archive anything—including widgets, links or newly created objects—or publish, send communications, access attendees, configure sessions/speakers, change another event, administer accounts, provision payment accounts, or change credentials/integration identifiers. Shared payment/tax/currency settings remain unchanged.
- Login and incident attestations are human-only. No cookies/storage, hidden credentials, raw credential-bearing network content or secret exposure. Use only the assigned local Steel runtime, not Steel Cloud or unrelated browsers.
- A known pre-execution gap blocks dependent work only. Uncertain execution/save, crash/disconnect, identity/ownership loss, expired login, exposed secrets and operator Stop stop the whole run. Never replay uncertain writes or bypass failed API writes through UI.

These are instructions plus concrete guards, **not an arbitrary-shell/browser-object security sandbox**. Full executable SOW coverage and shared-object isolation remain unproven.

## Delivery scope

Keep workbook uploads and one native executor. Structured intake/no-chat, operator template cloning, Azure/M365 deployment/review/Outlook/triage, the original $30 ceiling/$9–12 estimate, retry-from-failed-step, and separate guardrail/audit-trail/reference-event-acceptance deliverables are excluded. This does not remove existing safety protections, saved-result verification or cost tracking. RR-required event details, supplied branding/assets and widget types remain in scope; no all-widget default checklist.

## Results and accounting

DONE requires every applicable SOW requirement implemented, connected, verified and saved as Draft. Missing/blocked/unverified in-scope work is INCOMPLETE; interruptions and failed cleanup are STOPPED. Unrelated RR requests and whole-project deliverables are reported separately as exclusions, never used to disguise an in-scope blocker.

Pi writes the saved-result report; the wrapper checks its structure and safety state, not semantic RR completeness. See [RPC-CONNECTION.md](RPC-CONNECTION.md) for the exact result contract. No normal native exit alone proves DONE.

The execution target is about 90 minutes, not a deadline or permission to skip requirements. The dashboard clock uses the existing `aiStartedAt` timestamp, excluding human login/setup, and freezes at settlement. Older records without an AI timestamp retain a labelled setup-inclusive duration; history is not rewritten. Supported event-only differences must lead to edits, not comparison-only reports or duplicate creations. Guides prioritize cached comparisons and independent API work before unrelated UI exploration; dependencies may require UI first.

Per-run and historical native costs remain tracked, sampled every two seconds and settled on Stop. **Automatic dollar thresholds are removed and the authorized app restart is verified; see CURRENT in MVP-HANDOFF.md.** Unknown/lost metering still stops. Legacy allowance/reserve fields are metadata; external charges and delayed provider usage are not a complete billing meter. No completed-RR price/latency guarantee exists.

Only an explicitly authorized operator maintenance reset may credit captured historical costs. It requires stopped/settled execution, retains costs and immutable reset evidence, does not refund charges, and does not resolve uncertain saves. Clear/New RR never resets billing.

## Installation and checks

This is **not a validated clean-clone deployment recipe**. Required locally:

- Node 24+ (tested on 25), Python 3 + `openpyxl==3.1.5`, Docker, native Pi with configured authentication/model/pricing.
- Existing clients/dependencies in `~/cvent-agent` and `~/cvent-ui-automation`, or absolute `CVENT_AGENT_ROOT` / `CVENT_UI_AUTOMATION_ROOT` overrides. They are external prerequisites, not downloaded by this project.
- Ego pinned at `dca7003349c5f7132189ba00547cbbd7ff8e597e`, built assets and `ego-bridge/patches/steel-session-ledger.patch`. Do not reset the intentional dirty vendor checkout. See the [Steel bridge guide](.pi/skills/ego-browser/references/steel-bridge.md).
- The existing local image pinned in `app/clean-browser.mjs`. `docker-compose.yml` describes the historical shared browser, not current per-build provisioning.
- Externally provisioned Cvent credentials (`CVENT_CREDENTIALS_FILE`, owner-readable only), `PI_PROVIDER`, `PI_MODEL`, and private bootstrap state. No secrets in Git.

On a **new host only**, install Node dependencies with `npm ci` and Python dependencies with `python3 -m pip install -r requirements.txt`, then provision the prerequisites above. Check locally:

```sh
npm test                    # offline fixtures; external fetch denied
npm run check:installation  # prerequisite presence, not live authentication/acceptance
npm run check:repository    # indexed artifact paths, not secret/content/history scanning
```

The installation check does not prove Docker/image readiness, provider pricing/authentication, credentials, or vendor patch/build equivalence. `test/live-*` scripts are excluded from `npm test` and require separate review/authorization.

Start with `PORT=8788 npm start` **only after verifying exclusive ownership and authorizing startup/restart**. Never start a second server or steal a stale lock. Preserve the existing credential/model environment in memory during maintenance. The listener is loopback-only (CLI default 8787); Host/Origin checks are not authentication. Other local users/processes can access customer data. Never expose the app through a public listener, tunnel or reverse proxy; Steel ports/viewer are trusted-local surfaces too.

## Development and release

Keep changes surgical: state assumptions, remove actual duplication, preserve behavior, run focused checks, and report evidence/limits. Do not add abstractions, fallback modes or workflow stages for hypothetical needs. Runtime instructions remain in `app/runner-prompt.md`; development docs are not injected into Pi.

Read [MVP-HANDOFF.md](MVP-HANDOFF.md) **CURRENT** before continuing. Preserve existing uncommitted work, pinned vendor modifications, workbooks, profiles, costs and receipts. Paid runs, live mutations, browser launches, restarts, resets and commit/push each need separate authorization. Never execute the prohibited MOCK_ONLY workbook identified in the handoff.

Private source repository: https://github.com/bpickett2019/cvent-ego-runner. Source checkpoints are not releases or deployment acceptance. Before an authorized commit/push, verify destination/privacy, inspect individual changes and staged content (including vendor), run relevant checks, and stage only reviewed source paths—never blanket `git add -A` or force-add private artifacts. `data/`, `logs/`, workbooks, credentials and native sessions stay private. Raw progress is retained locally but not downloadable over HTTP; allowlisted SSE metadata excludes native payloads. Reports/replies/job state still contain private customer data, not generally sanitized output.

## Reference map

- [MVP-HANDOFF.md](MVP-HANDOFF.md): current evidence, activation, protected resources and next decision.
- [RPC-CONNECTION.md](RPC-CONNECTION.md): lifecycle, endpoints, completion and cleanup contract.
- [CVENT-API.md](CVENT-API.md) / [CVENT-API-COVERAGE.md](CVENT-API-COVERAGE.md): exact supported operations, scopes and gaps.
- [RR-EVIDENCE.md](RR-EVIDENCE.md): optional cached extraction/comparison tools; original-workbook inspection remains necessary for uncaptured visual/formula semantics.
- [E2E-ACCEPTANCE.md](E2E-ACCEPTANCE.md): verification status, not a formal acceptance deliverable; local tests are not live proof.
- [Historical notes](docs/history/README.md): superseded milestones and evidence pointers, not current instructions.
