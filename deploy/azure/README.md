# Azure three-instance deployment preparation

## Staging AI enabled — CURRENT (2026-09-21 21:29 UTC)

**Activated** https://staging.app-chartsdarts-dashboard.com/ on explicit user request.
All three workspaces load team Claude Sonnet 5 (`claude-sonnet-5`) and Cvent API
configuration, with `executionEnabled:true`. One paid build at a time across all
workspaces. No automatic build, native session, model spend or Cvent authoring.
Users upload a real RR, Start Build, sign in manually and Return to Agent.
Full saved/unpublished-Draft RR acceptance remains unproven.

`activate-ai.py` performed an exact-old-hash, one-time source/config upgrade with
private intents/backups. Gateway stopped during backend activation; only verified
synthetic previews were stopped through their controllers. Profiles/evidence
retained; 14 post-cleanup non-profile data files per host byte-preserved. Current
backend PIDs16030/15557/15570, USER/browser stopped/$0. Actual process credentials
and model checked without exposing values. Source overlay hashes in receipts;
the earlier archive/source-manifest describes the prior baseline, not this overlay.
Gateway now loads both modules, durable slot env and narrow systemd writable path.

Local app4846→80045 now rejects new AI503 while dashboard8788 remains available;
1,113 protected files and $103.476558 unchanged. Interactive local previews remain
running unchanged with fail-closed native launchers. Local disablement evidence:
`logs/local-ai-disable-t2h3eplw/receipt.json`.

Caddy/Basic unchanged, real anonymous TLS401 checks pass, cloud external listeners
SSH22 only, legacy service inactive. Live legacy/bypass/unowned RPC denials pass;
production slot empty. Shared Basic login is not per-user authorization. Access
expires **2026-10-05T21:49:22.218610+00:00**, following the user's explicit
14-day request (counted from September21 21:49 UTC). Only gateway expiry config
changed and gateway restarted. Loaded expiry, unchanged Caddy/login/source/slot
and backend runtime/jobs verified; anonymous HTTPS401 reverified. Receipt:
`logs/ai-go-live/access-14d-renewal-receipt.json`. Never replay the private
`extend-access-14d-once.py` or clear remote renewal backups/intent at
`/var/lib/cvent-ego-access-renewal-20260921-14d/`. No automatic further extension.
Authenticated rendered cloud UI/input and full RR acceptance are not newly claimed.

Evidence `logs/ai-go-live/`: activation-dispatch.log, gateway-ai-live-receipt.json,
per-host final-security logs and public-auth-verification.json. Runtime360-test
results reused unchanged; deployment27 tests pass. Source remains uncommitted.
Never replay private disable-local-once.py / activate-staging-once.py or clear
local/remote intents. Remote backups: `/var/lib/cvent-ego-ai-activation/` on all
four hosts. Durable gateway claim directory:
`/var/lib/cvent-ego-gateway/execution-slot/`. Claims never expire automatically;
release requires positive process/browser/spending/uncertainty clearance. Do not
clear a claim after a crash or uncertain write simply to allow another build.
New-install preparation tools remain prohibited as live-upgrade substitutes.
No operations in flight. Next: human MVP use, not an automatic paid trial.

## Shared-slot launch policy — prior, source only (2026-09-21)

User authorized necessary go-live work, including blocking new local paid builds
while preserving dashboards/previews. Conservative launch policy is **one paid
build at a time across three workspaces**, not concurrent paid builds. Implemented
and offline-tested, **not deployed or activated**; credentials below remain staged,
cloud AI disabled, local paid execution not yet blocked.

`execution-slot.mjs` persists a non-expiring claim before a login-first handoff.
Concurrent attempts, alternate route spellings and legacy execution are rejected;
RPC requires ownership. Stop, human control, upload and preview remain available.
No automatic dispatch retry or release after crash/timeout. The backend clearance
endpoint checks terminal settlement, native PID absence, stopped assigned browser,
reconciled spending and absence of unresolved/uncertain work or operation locks.
Only positive proof releases a claim, with the old claim retained as evidence.
Uncertainty requires deliberate operator reconciliation. Do not delete claims to
force a new run. This is managed gateway admission, not per-user authorization or
protection against arbitrary trusted-admin/direct executors.

Production gateway startup requires `CVENT_EXECUTION_SLOT_DIR`. Deploy BOTH gateway
modules, an owner-only state directory and a narrow systemd `ReadWritePaths` for it.
Backend rollout requires `app/execution-clearance.mjs` and updated server. Existing
Cvent command locking/spacing and no automatic write retries remain. The single
active model session limits concurrency, not spending; $60 remains only a target.
**360 runtime / 24 deployment tests pass**, including local HTTP contention tests.
No live rollout/disablement/restart/model/browser action in this step.

Next use a NEW controlled upgrade with exclusive intents/backups after fresh
activity/expiry checks. Never replay preparation/publication/credential dispatchers.
`prepare-gateway.py` now also copies sibling `execution-slot.mjs` and configures
state for NEW installs only; it is not an existing-gateway updater. Preserve all
profiles/evidence/accounting. Settle only still-synthetic preview jobs before any
necessary restart; do not interrupt real user jobs. Expiry remains
2026-09-22T16:18:42.211242+00:00. No automatic paid trial. See CURRENT handoffs.

## AI runtime preparation — prior (2026-09-21)

User explicitly requested AI enablement. **Credentials/model installed and verified,
paid execution still disabled** pending collision/shared-quota safeguards. Each
backend's existing `/etc/cvent-ego/runner.env` is root-only 0600 and now holds
Anthropic provider/model plus the team key and the three previously approved
Cvent API configuration fields. No personal Pi OAuth or human-login credentials.
Encrypted pinned SSH stdin only; no values in argv, logs, source or Git.

Pinned Pi 0.85.1 lacked Sonnet5 in its shipped catalog. Owner-only
`/home/egorunner/.pi/agent/models.json` uses the maintained Pi Anthropic catalog
entry for `claude-sonnet-5`, corroborated by Anthropic's model detail API:
adaptive thinking, 1M context, 128K output, nonzero catalog costs 2/10/0.2/2.5
USD/MTok input/output/cache-read/cache-write. No dependency upgrade or pricing
invention; config contains no secret. Vault rotations need a controlled refresh.

All three hosts passed 20 installation checks, pinned-Pi offline registration,
actual Anthropic model authentication (no inference) and Cvent OAuth. App PIDs,
browsers, runtime identities and $0 model cost unchanged. No restart or paid run.
Evidence `logs/ai-activation/`. `prepare-ai-runtime.py` is a one-time, stage-only
operator tool; never replay the private `stage-credentials-once.py` dispatcher
or remove remote `/var/lib/cvent-ego-ai-preparation/` intents/backups/receipts.

Before enabling: approved disjoint event assignments or coordinated exclusion
including local/other executors, shared API/model concurrency policy, tests and
controlled activation. The still-usable local executor cannot be ignored merely
because it is idle now; original local processes/previews remain untouched.
Spending limits remain disabled by existing product policy, not an enforced $60
cap. No build may start automatically. Existing restricted-access expiry remains
2026-09-22T16:18:42.211242+00:00. Older sections describe prior credential state.

## Published restricted staging preview — prior (2026-09-21)

**Live:** `https://staging.app-chartsdarts-dashboard.com/` redirects to workspace 1;
`/workspaces/1/`, `/workspaces/2/`, `/workspaces/3/` route to separate ARM64 VMs.
Existing Caddy HTTPS/Basic account retained. The approved 24-hour access window
expires **2026-09-22T16:18:42.211242+00:00**; gateway fails closed and disconnects
viewer sockets at expiry. Shared Basic login permits all workspaces and is **not
per-user authorization**. Do not silently extend expiry or call this multi-tenant
production security.

Three app services enabled/running, USER ownership, one synthetic preview job
and fresh browser each, **AI disabled**, $0 model spend. Return/answer/execution
routes reject 503; no team/personal model credentials or Cvent credentials copied.
Team secret `kvcventstg729` / `anthropic-api-key` is now uploaded/enabled.
A non-inference Anthropic Models API check at 2026-09-21T19:51:55Z verified the
credential and exact **Claude Sonnet 5 ID `claude-sonnet-5`**. The key was used
only in process memory, not printed/persisted or installed on these VMs; no
runtime change or paid request. Evidence:
`logs/anthropic-preflight/model-check-cux0oz7k/receipt.json`. Secure runtime
configuration, installed Pi/provider support, event exclusion and shared quotas
remain before paid activation; never start a paid trial automatically.
User-authorized vault firewall addition `47.151.24.159/32` preserves deny/default,
existing IP/VNet rules and IAM; receipt `logs/key-vault-network/allow-client-y7qo20h7/receipt.json`.

Topology: Caddy authenticates and overwrites `X-Cvent-Staging-User`; loopback
`gateway.mjs` on 8890 verifies host/origin/identity/expiry, strips credentials and
normalizes upstream requests without weakening the backend's loopback guard.
Per-workspace path/config/viewer/WebSocket routing and session-storage namespacing.
Pinned SSH forwards on gateway loopback 18781/18782/18783 reach each app's 8788;
new `egoproxy` accounts allow only local forwarding to that destination, no shell,
remote forwarding, agent forwarding or TTY. Gateway forwarding private key never
exported. NSG addition permits only gateway `57.154.50.217/32` TCP22. Backend,
viewer, CDP and Docker remain non-public; no DNS/IAM change.

Six old waiting jobs settled through canonical `ControlStore.finish`, preserving
uncertainty/artifacts: five `failed_prewrite`, one `failed_recoverable`; **2,053
historical job files unchanged**, DB/Caddy backups retained. Legacy service
stopped/disabled, not deleted; `/pi` offline route preserved, old viewer retired
with 410. No existing operations replayed.

Source archive `4e1a410dfa79bf497e741a5ddc055eb367276511a171dac6c62eceb19604ade0`;
private receipts `logs/staging-cutover/`. 353 offline tests, 21 deployment tests
at activation; local three-browser lifecycle PASS. Live asset/API/config checks,
foreign job read/Stop denial, disabled AI, distinct identities/$0 accounting,
loopback listeners, absent model credentials and all three WebSocket 101 upgrades
passed. Anonymous HTTPS endpoints return 401. **Authenticated rendered cloud UI
and interactive input still need the human's existing login**; a 101 handshake
is not video-frame, Cvent-login or full RR acceptance.

`prepare-gateway.py`, `activate-preview.py`, `publish-gateway.py` are one-time
operators' tools, not replayable installers. Keep gateway preparation, per-host
activation, source-refresh and root-cutover intents/receipts intact. On any
failure inspect state; never clear markers, automatically retry or roll back.
Gateway policy: `/etc/cvent-ego-gateway.env`. Backend gates:
`/etc/cvent-ego/{runner.env,activation-approved}`. Read CURRENT handoffs before
changes; earlier sections below are historical and no longer describe live state.
Leave local original/interactive previews untouched.

## Requested public staging cutover — prior (2026-09-21)

User authorized replacing `https://staging.app-chartsdarts-dashboard.com/` with
this three-workspace UI and pushing the source to private GitHub. Provider choice:
**Anthropic Sonnet 5**, team Key Vault secret to be supplied in the morning.
Verify exact model ID/availability before enabling paid execution; never copy
personal OAuth or automatically start a paid trial.

**Not published yet.** The existing hostname terminates at Caddy on
`cvent-pi-dev-vm`, with one Basic account and an existing Python app at loopback
8877. Its separate restricted-access policy has expired. Six persisted jobs are
`login_required`, with zero worker/event leases; that is not six verified active
paid workers. Approval is needed to settle those waiting jobs preserving all
evidence and renew the restricted-access window (proposed 24 hours) before
cutover. Do not drop the expiry merely because Caddy Basic auth still works.
No cloud config/service/network/IAM/auth mutation has been made. Sanitized
preflight evidence: `logs/azure-staging-ui/` (private).

The new local switcher is loopback-only. Public publication still requires
protected routing, per-workspace API/viewer/WebSocket and client-storage
separation, and backend loopback isolation; it cannot just expose local ports.
The old gateway host is AMD64; retain the pinned ARM64 Steel image on the three
dedicated ARM VMs. Source staging below predates the latest clickable UI.

## Current source refresh (2026-09-21)

User requested this exact simplified setup for three users. All three existing
staged VMs now contain the current native-Pi launcher, **318-word task**, standing
SOW, unchanged pinned Ego/Steel bridge and supported API tools. The missing
`bin/rr-evidence` packaging entry was added. **15 source files changed per VM**;
all manifested source hashes match the new snapshot, dependencies/vendor/image
remain unchanged, and each VM's existing data is byte-identical. No local runtime
source, process, active build, personal Pi authentication or existing Azure service
was modified. This is not three-user live acceptance.

Snapshot SHA256:
`c4085c0457ab458bc8f324f09139cafd6c996682ffe84159afe05e269bc8b302`.
Private receipts/logs: `logs/azure-native-pi/`. **21 deployment tests pass**;
18 dependency checks pass on each VM; read-only native policy/SOW import and
workbook-helper startup pass on all three. The 334 runtime / 74 focused test
evidence is reused because runtime source was not changed by this deployment.
Services remain disabled/inactive, with no credentials, activation gates, jobs,
containers, paid prompts or browser launches. Network rules remain admin-SSH-only.

The one-time `refresh-stage.py` validates the approved archive, refuses runtime
artifacts, links, source drift, source removal and dependency changes, verifies
unused/disabled/unconfigured state before writing, backs up replaced source, and
retains exclusive per-snapshot intent/receipts under
`/var/lib/cvent-ego-source-refresh/<archive-sha>/`. It does not run old installers,
activate services, clear failures or retry. Never replay the private dispatcher
`logs/azure-native-pi/refresh-approved-three.py` or remove local/remote intents.
After any failure, inspect retained state; do not automatically roll back/replay.

Remaining: assign restricted operator access; enforce disjoint event assignments
or coordinated leases (including local builds); coordinate shared quotas; securely
configure the chosen team model and Cvent credentials; then explicitly activate
and test three concurrent sessions and independent Stop/viewer/cleanup. The user
will supply the team model credential at the end; do not copy personal OAuth or
ask for it prematurely. See blocking decisions below.

**Status: three Azure VMs provisioned, current source/dependencies verified;
app services disabled. NOT activated or team-ready.** User selected a team-funded
model API credential and will provide it at the end; do not ask for or copy a
personal OAuth login. No existing Azure service or local runner was restarted.
No credentials, paid Pi sessions, browser sessions or Cvent changes were created.

Deployment: `cvent-ego-pilot-20260921`, existing staging resource group
`rg-chartdarts-stg`; VMs `cvent-ego-1`, `cvent-ego-2`, `cvent-ego-3`. The current
Azure identity has staging-resource-group permissions but no subscription-wide
permissions to create a resource group. Only separately named new resources were
created; existing Cvent VM/Caddy/network resources were not changed. No IAM
escalation or access-policy changes. VMs are running and accruing Azure charges.
Receipt: `logs/azure-deploy/receipt.json`; private addresses/verified SSH host keys
are in `logs/azure-deploy/hosts.json` and `known_hosts` (not team credentials).

## Selected minimal topology

Three dedicated ARM64 Ubuntu VMs, one per user. Each gets a separate disk,
application tree, process controller, data/accounting, Pi authentication and
Docker/Steel browser runtime. The application retains its loopback-only binding
and single-build guard. Do not expose dashboard, viewer, Docker or CDP ports.

Initial access is an authenticated SSH tunnel bound to the user's own loopback
interface, e.g. after provisioning and host-key verification:

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8788:127.0.0.1:8788 USER@ASSIGNED_VM
```

This is **not** Entra/browser SSO. The infrastructure template initially accepts
only the administrator's public key from one public IPv4 `/32`. Team access still
requires user-specific keys/access rules and restricted tunnel-only accounts
(no shared administrator credential). Never disable SSH host-key verification.
No VM should have access to another user's runtime or browser ports.

## Verified preflight (2026-09-21)

- Azure subscription authenticated: `Azure Subscription 1 via Paragon Micro`.
- Existing `cvent-pi-dev-vm` in `rg-chartdarts-stg` already hosts a different
  running Cvent service; leave it and Caddy untouched.
- Existing Steel pin is Linux ARM64:
  `ghcr.io/steel-dev/steel-browser@sha256:21cf2a5785aa9478d0f7933c04bce96ca79f3d7a93d9824ea184800d29d3cd02`.
- `Standard_D4ps_v6` has no listed subscription restrictions in `westus3`.
  Family quota: 0/350 vCPUs; regional total: 8/50. Three VMs request 12 vCPUs.
  Quota is not a reservation or capacity guarantee.
- Ubuntu ARM image: `Canonical:ubuntu-24_04-lts:server-arm64:24.04.202609040`.
- Azure retail compute price: $0.14/hour each, **$0.42/hour total** (~$306.60
  per 730-hour month), excluding disks, IPs/networking and model charges.
  This is a public list price, not a subscription billing quote.
- Initial Azure template validation succeeded; subsequent explicitly authorized
  deployment also succeeded. Receipts: `logs/azure-preflight/azure-validation.json`
  and `logs/azure-deploy/deployment-result.json`.
- Source hashes, Ego pin/patch, ARM Steel image, disabled app service and empty
  jobs/workbooks verified on each VM. **18 dependency checks passed per VM**;
  model selection and Cvent credential configuration remain intentionally blocked.
- **12 local deployment tests passed**, shell syntax and whitespace checks passed.
  Existing runtime test evidence was reused; no local runtime code changed.
- Verified network policy: administrator SSH `/32` only, deny all other inbound
  including VNet peers. Only SSH and Ubuntu's loopback DNS/containerd listeners
  are present; no app/Docker API/CDP listener or browser container.

## Local tools

Both scripts are standard-library Python and make no Azure calls. Run from the
repository root. Output files must not already exist. Keep outputs private.

```sh
umask 077
python3 deploy/azure/plan.py \
  --ssh-public-key /absolute/path/to/admin.pub \
  --admin-cidr ADMIN_PUBLIC_IPV4/32 \
  --output /private/path/infrastructure.json

python3 deploy/azure/bundle.py \
  --root "$PWD" \
  --clients-root /absolute/path/to/cvent-agent \
  --configuration-root /absolute/path/to/cvent-ui-automation \
  --output /private/path/source.tar.gz

python3 -m unittest discover -s deploy/azure -p 'test_*.py' -v
```

`refresh-stage.py` is only for a previously staged, unused, disabled installation
with unchanged dependencies. It must be accompanied by `bundle.py` and
`verify-stage.py`, with reviewed file hashes; it is not an active-service updater.
The initial bootstrap/stage scripts below must never be replayed for refreshes.

The source snapshot preserves current intentional edits and the exact upstream
Ego revision plus reviewed patch. It includes only explicit source paths and the
four external API-client source files, not their agents. It excludes runtime
roots, browser profiles, workbooks, credentials, global Pi state and historical
accounting. Its manifest records file hashes; this is not a full content/secret
audit. `bootstrap.sh` installs Node 24.13.0 (checksum checked), Pi 0.85.1,
Docker and the exact ARM Steel image without launching a browser. `stage.sh`
verifies/extracts the snapshot, installs app/Python/tsx dependencies, fetches and
compares upstream Ego source, applies the reviewed patch and builds it. Both are
one-time NEW-VM scripts: durable started markers refuse replay; never remove them
to rerun. Existing installations/data are rejected.

The staged `cvent-ego.service` runs as `egorunner`, uses private permissions,
`Restart=no`, and requires root-managed `/etc/cvent-ego/activation-approved` plus
`/etc/cvent-ego/runner.env`. Neither is created. Service is disabled/inactive.
`verify-stage.py` performs read-only verification without a Pi/browser/API call.
It is intended for the pre-activation state only.

The first bootstrap SSH wait timed out because a oneshot service waits for
completion. All three already-started units were observed, never replayed, and
finished successfully. Stage submissions used `--no-block`. An initial listener
check rejected Ubuntu's normal loopback containerd listener; inspected its process
owner, tightened the allowed-listener check to that exact service/binding, added
regressions and reran read-only verification. Original failure logs remain.

## Blocking decisions before activation

1. **Model authentication:** current local app uses `openai-codex` OAuth with
   model `gpt-6-astra`; no model API-key environment variable is configured.
   Do not copy this personal OAuth refresh state to three team instances.
   **User chose a team-funded API credential, to be supplied at the end.** Provider
   and model remain unspecified. Use a secure channel—not chat/cloud-init/ARM
   parameters or command-line arguments. Verify model availability/pricing on
   the new hosts; local availability is not cloud acceptance.
2. **User access:** assign the three users, keys and permitted source networks.
   Use one tunnel-only identity per VM; retain separate administrator access.
3. **Event collision prevention:** implement and test either centrally enforced
   event leases or disjoint, immutable approved-event assignments. Instructions
   to users alone are insufficient. Account for local/other executors too. The
   local trial ended INCOMPLETE during preparation; cleanup remains unreviewed.
4. **Shared limits:** establish Cvent/provider concurrency and rate-limit policy;
   separate VMs do not coordinate shared quotas or aggregate model charges.

## Remaining deployment/acceptance work

Infrastructure/dependency installation is complete within the permitted staging
resource group. Do not redeploy over these or existing services. Fresh data roots
were initialized without copying local historical jobs/accounting/authenticated
profiles. Existing Cvent credentials still need secure deployment without
rotation. No credential configuration or activation gate has been created.
Complete access, same-event and quota controls before approving activation; an
app service must not auto-restart/replay an interrupted build.

Then verify dependencies, authentication, host/network isolation, three
concurrent sessions, cross-user Stop/viewer isolation, same-event exclusion,
quota behavior, cost settlement and cleanup. Live Cvent login remains human-only;
paid build tests require separate explicit authorization. One full RR with
independent saved verification and unpublished Draft is still unproven.

Do not describe generated templates, a running dashboard, or three duplicated
VMs as end-to-end acceptance. Do not clear uncertainty markers or use the
prohibited MOCK_ONLY workbook to test deployment.
