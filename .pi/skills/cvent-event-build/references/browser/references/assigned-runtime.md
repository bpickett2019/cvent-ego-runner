# Assigned runtime only

This build uses the application's already-provisioned local Steel browser through "$EGO_BROWSER_BIN". It does not use or install the desktop Ego application. Read [Steel bridge](steel-bridge.md) and [controls](../controls.md).

The runner owns provisioning, login handoff, identity checks, native execution and cleanup. Do not install/upgrade an SDK, change profiles, launch a server/browser or take over another session to repair connectivity. Do not read cookies, credentials, environment files or tokens. Generic upstream setup/profile/cache recipes are not authorized operations on this assigned runtime.

If the executable/session or a required capability is unavailable, retain the diagnostic category without secret-bearing output, report the precise blocker and obey Stop/ownership. A stopped or uncertain job is not recovered by recreating a task space. Known unsupported pre-write work can be blocked locally; possible late effects, disconnect or unconfirmed execution require global Stop and operator reconciliation.
