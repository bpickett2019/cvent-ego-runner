# Cvent RR runner — pre-release

Native Pi + pinned Ego + local Steel. **No full RR acceptance has passed. Not approved for team/public production.** A supervised, sequential, single-operator pilot is the recommended first target, but its scope and deployment still need user agreement.

Private source checkpoint: https://github.com/bpickett2019/cvent-ego-runner. This backs up source, documentation, tests, the upstream vendor pin and its patch—not private runtime artifacts or a portable ready-to-deploy installation. The current checkpoint passes 140 offline tests; the running app has not been restarted to activate the privacy changes.

## Safety contract

- Upload an RR and explicitly name the existing unpublished event. Never infer or change the target from workbook text.
- Production Start Build creates an empty per-job browser. Human login and explicit Return to Agent precede Pi launch or paid prompts.
- Reuse existing items unchanged. Create only confirmed-missing, approved requirements. Existing differences are exceptions, not successful RR implementation. API guards are not an arbitrary-shell or browser-object sandbox.
- No publishing, deletion/archival, communications, attendees, other events, account-global or merchant setup, or integration-identifier changes. Login and incident attestations are human-only.
- A stopped run is not rollback. No automatic resume, retry of uncertain writes, or replay of old conversations. Preserve all originals, versions, profiles, receipts and costs.
- Paid/live acceptance requires separate explicit approval of the executable RR, target, spend and permanent creations. Never execute the prohibited mock identified in `MVP-HANDOFF.md`.

## Current installation limits

This is **not yet a clean-clone deployment recipe**. The existing installation uses:

- Node (audit environment: 25.8.1), Python 3 + openpyxl (3.1.5), Docker and native Pi with configured provider/model/pricing.
- `~/cvent-agent` (including its `tsx` installation) and `~/cvent-ui-automation` API clients, loaded by absolute home-relative paths.
- Pinned Ego submodule `dca7003349c5f7132189ba00547cbbd7ff8e597e`, the session-ledger patch and built vendor assets; see `.pi/skills/ego-browser/references/steel-bridge.md`.
- The existing local Steel image digest in `app/clean-browser.mjs`. `docker-compose.yml` describes the historical shared browser, **not** production per-build provisioning. Do not recreate it to install this update.
- Private runtime/bootstrap state and externally provisioned Cvent/Pi credentials. No credentials belong in this repository.

Do not run a second server against this checkout. The existing server owns an exclusive lock. A stale lock must never be removed merely to make startup work. A portable dependency/bootstrap check and fresh-install validation remain release blockers.

## Local operator runbook

Only after installation and server ownership are verified: open the loopback dashboard, preview/edit a workbook (immutable original retained), name the target, Start Build, log in manually, then Return to Agent. Inspect saved-result evidence and exceptions after settlement. `REVIEW_REQUIRED` does not mean success.

Use **Take Control** to Stop and return the browser to the human. The audited build's job Stop endpoint revokes job ownership but can leave the shared dashboard ownership stale; verify USER ownership, using Take Control if necessary. Stop cannot retract a submitted request. Never delete a partial item or clear uncertainty to continue. Reconcile authoritative saved state read-only and obtain approval for any repair. Retained containers/profiles require manual, ownership-verified resource management; no blanket Docker cleanup.

The server binds loopback and checks Host/Origin, but has **no app authentication**. Other local users/processes can access it. Do not expose it through a public listener, tunnel or reverse proxy. Direct Steel ports and viewer interaction are trusted local surfaces, not tenant-isolation boundaries.

## Verification and release preparation

```sh
npm test                  # offline fixtures; no paid model run or live Cvent writes
npm run check:repository  # index artifact-path gate; not a secret/content scan
```

Live-read scripts under `test/live-*` are intentionally excluded from `npm test`; do not substitute them for offline checks without reviewing their fixed target and authorization.

`data/`, `logs/`, native JSONL, workbooks and common secret/archive types are ignored in full. Existing private files are retained, not deleted. Raw native progress stays on disk; the updated source denies its HTTP download and exposes only allowlisted, payload-free SSE activity. **The running server does not acquire this fix until a verified restart.** Structured reports, assistant replies and job state still contain private customer data and are not generally credential-sanitized; all HTTP surfaces remain trusted-local only.

Before each commit/push:

1. Verify the destination and private visibility. The user approved the private source checkpoint above; deadline, intended users/concurrency and deployment scope remain unconfirmed.
2. Review source/docs/tests individually. Do not use blanket `git add -A`. Never stage runtime artifacts or customer workbooks, even with `-f`.
3. Stage only reviewed source paths. Reconcile the staged submodule pin with the tested pin; retain the local vendor patch as source rather than silently discarding it.
4. Run the index path gate, inspect staged content for credentials/customer information, and review submodule content separately. The gate does not scan contents, Git history or nested repositories and cannot certify secret-free publication.
5. Run relevant offline checks. A source-only checkpoint does not authorize a paid/live acceptance or release. Separately approved live acceptance and human review/signoff precede release; preserve private evidence outside Git.

## Evidence and next decisions

Audit baseline: 138 offline tests passed again; no active job/operation lock or live recorded Pi process. Last run stopped; browser USER-owned. Explicit incident acknowledgment exists; it is not independent proof of remote token revocation. See `MVP-HANDOFF.md` for private evidence locations and protected resources.

Live-proven historically: scoped API reads, representative old-policy reversible writes, isolated clean-browser/bootstrap probes. Mocked: current create-only discount creation/linking and lifecycle races. Unproven: full RR acceptance, browser existing-object preservation, saved-result coverage across SOW, cost/latency targets, fresh installation and multi-user isolation.

Shortest remaining path: agree release scope → fix Stop/status and installation blockers → map only that RR's required gaps → authorize one bounded acceptance → inspect saved-state/preservation/cost evidence → approve release and push. No promise of full compliance where preservation requires unresolved differences.
