# State-reset boundaries for the assigned browser

Read [Steel bridge](steel-bridge.md) and [assigned runtime](assigned-runtime.md). This is the RR runner's browser, not a desktop profile under the skill's control.

## Use application controls, not cookie or target commands

- Human login/MFA and login reset belong to the operator through the supported app controls. The agent must not inspect/export cookies, storage, passwords, tokens or credential-bearing network content.
- Do not call browser-wide cookie/cache clearing, origin-storage clearing or cookie-deletion commands. Even a command sent through a Page can affect the entire profile; choosing that Page does not prove narrower scope.
- A rejected command is not permission to call it through another entry point, raw CDP, Page JavaScript or a different browser.
- Do not reload, navigate, close, clear state or replace a tab to recover a pending/uncertain Save or possible late execution. Preserve evidence and obey Stop. A confirmed safe read/navigation failure may be handled only within the existing bridge rules.

## Clear / New RR is a different operation

The dashboard's Clear or replacement upload asks the controller to stop/cancel its own workspace's run, prove cleanup/accounting, reset context and release only its verified-idle execution reservation. It does not erase saved Cvent changes, historical costs or event uncertainty, and it cannot stop another workspace. The skill never writes ownership, job, lock or uncertainty files to imitate this operation.

A new Start Build creates a new assigned browser. A stopped container/session is never restarted by the skill. A safe Take Control/Return pause retains the same session only through the app's explicit identity/control checks; it is not a fresh context.

Generic desktop cookie-management examples are intentionally not instructions for this build. The complete upstream API reference remains available for signatures; it does not grant permission to perform these operations or change the pinned runtime.
