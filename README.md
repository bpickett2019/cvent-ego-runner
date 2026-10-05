# Cvent RR runner — source checkpoint

A supervised, pre-release runner for configuring an explicitly selected unpublished Cvent event from an uploaded registration-requirements (RR) workbook.

This public checkpoint contains application source, skills, tests and reusable deployment tooling. Customer workbooks, native transcripts, browser profiles, credentials, run data, costs, private operator handoffs and one-time incident/recovery scripts are not part of the checkpoint. Source publication is not live deployment or commercial acceptance.

## Workflow

1. Upload an XLSX workbook, preview it and explicitly select an existing event by its exact name. Original uploads are immutable; edits create versions.
2. Start Build provisions a fresh assigned local Steel browser. It does not launch Pi or a paid model prompt.
3. A human signs in and explicitly returns control. Source integrity, event/API/browser identity, ownership and safety are verified before one fresh Pi session starts.
4. One `cvent-event-build` skill and its16 references guide interpretation, registration-types-first configuration, remaining dependency-ordered work and saved verification. Clear source differences are implemented; missing essential inputs and unsupported operations block their dependents while independent work continues.
5. Review the result: DONE, INCOMPLETE or STOPPED. Processing finished is not the same as full completion. The runner checks report consistency and safety; an agent's report is not independent commercial sign-off.

## Workspace isolation and concurrency

Each workspace has its own backend, browser, job context and accounting. Coordinated `CVENT_CONCURRENT_WORKSPACES=3` configuration on the gateway and all three backends permits three different-event builds, one per workspace. The gateway reserves API-resolved event UUIDs; backends independently verify leases before paid execution. Same-event edits cannot overlap. Legacy single-slot behavior remains available only for explicitly configured compatibility/migration.

Clear/New RR replaces only its own workspace after verified cleanup. It retains prior workbooks, saved Cvent changes, receipts, costs and genuine write-uncertainty evidence. Scoped uncertainty blocks its event; unknown scope or unavailable peer safety proof still fails closed. Stop cannot undo submitted changes, and stopped jobs do not resume.

Take Control attempts a verified safe pause of the same Pi/browser session. Return rechecks identity and safety. Known in-flight tools can refuse pause before cancellation; unsafe or uncertain interruptions require Stop and reconciliation. Settled model-request errors may retain a proven-safe pause; there is no automatic paid rerun.

Concurrent mode disables shared contact-type creation: reuse exact existing definitions and report missing types for operator provisioning outside overlapping builds. Event-local registration configuration remains separate from shared definitions and attendee records.

The authenticated staging gateway's shared login is not per-person authorization or hostile multi-tenant isolation. The core service remains trusted-local. Never expose the core app, Steel, CDP or Docker directly, weaken authentication, or replay deployment scripts to work around an ownership/safety refusal.

## Tools and boundaries

- One Pi process/session and one assigned Ego/local Steel browser per build; no additional review agent or wrapper-driven reprompt.
- The native launcher explicitly loads only `.pi/skills/cvent-event-build/SKILL.md`, excluding unrelated/global skills and development context files.
- The guarded API executable authorizes discount/volume-discount writes and supported dependency reads. Broader library methods are not RR tool permissions. Other authorized configuration uses the assigned browser.
- No publishing, attendee creation/access, communications, payments, session/speaker authoring, arbitrary account administration, deletion/archive, event retargeting or bypass of tool denials.
- Human login and incident attestations remain human actions. Do not extract cookies or credentials.
- Missing business values are not guessed. Names, codes, display text, formulas, comments and field-specific blank conventions retain source-backed meaning. Optional unrequested settings are preserved and disclosed, not fabricated requirements or completed-work credit.
- Genuine uncertain writes, identity/control loss, cleanup failure and unknown spending remain safety stops. A note in a report cannot clear them.

These instructions and guards are not an arbitrary-shell security sandbox.

## Results and costs

The existing UI distinguishes verified completion, finished processing with unfinished items, and stopped execution. It currently exposes detailed requirement evidence; the proposed natural-language results redesign is **not included** in this checkpoint.

Native costs are sampled and retained per run and historically. Automatic dollar limits are disabled. Legacy allowance/reserve fields and time/cost targets are metadata, not enforced caps. Native Pi/provider retries and compaction may consume tokens. Multiple simultaneous builds incur independent charges; hosting and delayed external usage are not a complete part of the model meter.

## Prerequisites and checks

This is **not a validated clean-clone deployment recipe**. It requires:

- Node24+ (validated backend environment: Node25), Python3 with `openpyxl==3.1.5`, Docker and native Pi.
- The externally installed Cvent clients selected by `CVENT_AGENT_ROOT` and `CVENT_UI_AUTOMATION_ROOT` (see `app/cvent-api.mjs`).
- Ego pinned at `dca7003349c5f7132189ba00547cbbd7ff8e597e`, its built assets, and `ego-bridge/patches/steel-session-ledger.patch`. Preserve the intentional patch; do not reset the vendor checkout.
- The pinned local Steel image and approved private configuration for the Cvent API and Pi/provider/model/pricing. Do not put secrets in Git or assume credential presence proves live access.

On a newly provisioned development host, install the declared Node/Python dependencies and the external prerequisites before using the checks:

```sh
npm test
npm run check:repository
npm run check:installation
python3 -m unittest discover -s deploy/azure -p 'test_*.py'
```

`npm test` uses an offline network guard. One historical test requires private `data/current/rr-plan.json`, intentionally absent from this public checkpoint; the missing fixture is reported rather than replaced with customer data or silently skipped. Fixture tests do not prove full live RR completion, browser/SSO reliability, all template variants or production acceptance. Live test scripts require separate review and explicit authorization.

Starting/restarting a service, launching an assigned browser, applying a deployment or making a paid request requires current activity/ownership checks and appropriate authorization. Do not steal a stale lock or modify files underneath an active run. The reusable deployment preparation copies the gateway's required modules, but coordinated configuration and quiescent activation are still operator responsibilities.

## Known limits

Dedicated asset metadata fields and voucher/rule switches are pending intake work. Image upload is currently human-owned. Discount-date clearing and registration-type Advanced Filters are not supported by the current adapter. Safe preview coverage, Save-observer recovery, SSO lifetime, shared-definition provisioning and representative multi-build saved-result acceptance remain separate concerns; source tests and capacity configuration do not resolve them automatically.

## Source reference map

- `.pi/skills/cvent-event-build/`: the active skill and its self-contained reference graph.
- `RPC-CONNECTION.md`: job lifecycle, pause/Return, results and cleanup contracts.
- `CVENT-API.md` / `CVENT-API-COVERAGE.md`: executable API authorizations and limitations.
- `app/rr-connection.mjs`: controller and canonical job/workbook-generation handling.
- `app/shared-event-safety.mjs`: backend event-safety enforcement.
- `deploy/azure/workspace-slots.mjs`: concurrent workspace/event reservations.
- `deploy/azure/gateway.mjs`: authenticated, expiring gateway and upstream routing.
- `public/`: existing operator UI and result/readiness presentation.
- `test/`: synthetic offline regression coverage, not customer execution evidence.

Private deployment handoffs and receipt locations referenced by historical operator documentation are deliberately not newly published. Consult the authorized operator for live state; Git HEAD is not a deployment manifest. Preserve private evidence and review individual paths/content before future commits—never blanket-stage runtime artifacts.
