# Verification status

No complete saved/connected Draft RR run has been proven. Offline tests verify instructions and mocked behavior, not live Cvent workflow coverage or semantic RR completeness. Passing report validation alone does not establish DONE.

Current scope and execution instructions are in [README.md](README.md), [app/native-task.md](app/native-task.md), [app/standing-sow.md](app/standing-sow.md) and [CVENT-API.md](CVENT-API.md). Evidence, activation and protected resources are in **CURRENT** in [MVP-HANDOFF.md](MVP-HANDOFF.md).

A formal reference-event acceptance program, compliance/audit layer, additional review agent and retry-from-failed-step framework are **not deliverables**. Existing saved-result verification, Draft/no-delete/event identity, human-login, ownership and Stop protections remain. No paid run, browser launch, mutation or restart is authorized by this document.

When separately authorized, execute the actual uploaded RR in one fresh native session and report verified saved results, measured cost/time and concrete blockers. This is ordinary execution verification, not an extra acceptance workflow or a promise of ~90-minute completion.

## Interactive local workspaces (2026-09-21)

User clarified the last RR was **intentionally stopped**, not a failure they want diagnosed. Three local previews are now left running for human interaction; see CURRENT handoff for URLs, supervisor identity and private receipts. Sidebar USER 1/2/3 buttons switch separate loopback apps/browsers, not a cosmetic shared profile. Verified actual click-through 1 → 2 → 3 → 1, selected labels/active-job controls and live Cvent login viewer rendering. No automated login, Return, Cvent editing or model execution. Do not stop/restart these while the user tests them.

For a separately authorized fresh preview (never create duplicates while one is running):

```sh
node scripts/validate-three-local.mjs --interactive
```

This leaves three apps/browsers running until the owner supervisor receives SIGINT/SIGTERM; normal shutdown stops its own current jobs and preserves profiles/evidence. Source-copy HOME/data are isolated; installed dependencies/OS identity are shared. Generated local-only navigation config carries no authentication and never makes this a secure multi-tenant dashboard. Paid execution is disabled. Synthetic starter jobs can be cleared through the UI before previewing another workbook.

**347 offline tests pass** including strict loopback workspace config validation. A fresh real lifecycle/cleanup check also passes (`logs/local-three-I4wex5/receipt.json`). UI screenshots and handoff: `logs/local-workspace-ui/`. This is click-around readiness, not full authenticated RR/Draft or Azure acceptance.

## Three-instance local lifecycle evidence — prior (2026-09-21)

`logs/local-three-JtGQC6/receipt.json`: **PASS**, three simultaneous real app/browser instances with separate source copies, HOME, data, uploads, jobs, fresh profiles, sessions, page targets, loopback ports and Ego ledgers. Foreign job reads/Stop and foreign Origin requests were rejected; viewer HTML used each local cast proxy. Stopping one left the other two running. All test processes/browsers were stopped; profiles/evidence retained. No credentials, native sessions, model spend, human login/Return or Cvent authoring; original dashboard/accounting unchanged.

Opt-in reproduction, only when another local browser test is authorized:

```sh
node scripts/validate-three-local.mjs --run
```

The script uses the deployment source allowlist and shares installed dependencies; it does not install software or copy private runtime state. It requires the original dashboard idle with its browser stopped and local Docker available. Evidence goes to a fresh private `logs/local-three-*` directory. Never resume its stopped jobs. A failed receipt requires inspection, not replay of an uncertain operation.

**337 offline tests pass**, including three mocked native controllers with independent sessions, Stop and cost accounting. These are distinct from the real browser-only lifecycle check. Remaining unproven: OS-user/remote access security, authenticated login and interactive viewer stream/input, full RR saved relationships/Draft, real concurrent model execution, same-event collision prevention and shared quota behavior. Local lifecycle PASS is not rollout approval. Latest actual RR was INCOMPLETE at $23.176562; a $60 full-build estimate/cap is not established.

Earlier acceptance checklists, create-only rules, activation receipts and investigation notes are preserved unchanged in [the historical archive](docs/history/E2E-ACCEPTANCE.md). They are evidence pointers, not current execution requirements.
