# Azure three-instance deployment preparation

## Requested public staging cutover (2026-09-21)

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
