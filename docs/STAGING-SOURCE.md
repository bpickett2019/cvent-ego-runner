# Staging source checkpoint — 2026-10-16

This checkpoint precedes the client configuration-only policy update. Read-only
inspection on October 15 at approximately 23:58–23:59 UTC established identical
selected application source hashes across all three staging backends and verified
the gateway source against its installed hashes. All three workspaces were idle at
that inspection. This is point-in-time evidence, not permission to run or deploy.

`deploy/staging-source-manifest.json` lists the selected deployed source hashes and
maps the gateway's installed files to `deploy/azure/`. The gateway login retains
Referrer-Policy same-origin and strict Origin/CSRF checks. The current gateway is
not the older local prototype. Do not deploy an entire checkout indiscriminately.

Included source covers the active task/skill, backend modules, frontend, assigned
browser bridge, executable wrappers and gateway modules/assets. Credential-dump
prevention, save-observer loading recovery, fresh-context hold retirement, stable
dashboard polling, individual results and item-association replacement are included.

This is not a machine backup, complete infrastructure export or validated clean-clone
installation. Installed external Cvent clients, native Pi, compiled vendor artifacts,
private configuration and container images remain prerequisites. The committed Ego
submodule pin and reviewed bridge patch are preserved. Existing tests/development
scripts are retained but not represented as a fresh full-suite pass.

No credentials, environment files, sessions, customer workbooks, job/report data,
costs, browser profiles, claims, private incident evidence or one-time deployment
scripts are published. Local source-pattern checks found no credential literals in
the newly captured source; this is not a universal secret-detection guarantee.

Source syntax checks are not model, rendered-browser or saved-Cvent acceptance. No
Cvent mutation, browser launch, paid build or stopped-session resumption is part of
this source checkpoint.
