# Local Cvent browser login persistence

The runner's dedicated `cvent-ego-runner-steel` container now sets
`CHROME_USER_DATA_DIR=/data/chrome`. Compose mounts that path from
`data/steel-user-data/`. Previously Chrome used `/tmp/steel-chrome`, outside
that mount.

The existing logged-in profile was copied from the stopped container before
recreation. The local profile uses owner-only directory/file permissions
(0700/0600), is ignored by Git, and has Chrome's restore-on-startup preference
enabled. It contains sensitive session data: do not upload, commit, log, or
share it. This is browser-session persistence, not an application password
vault or a guarantee of encrypted storage. Cvent/SSO expiration, logout,
revocation, or MFA policy can still require human login.

## Verified 2026-09-19

- Recreated only the runner's dedicated Steel container using the existing image.
- Opened the previously visited Event Information URL after recreation.
- Assigned Ego independently read the exact event title and UUID-bearing URL
  without another login. Session persistence survived container recreation.
- Rebound runtime metadata to the new Steel session and CDP target, then verified
  Return to Agent through the UI: API and browser agreed on
  `(C+D) Medtrade Testing Clone 2`, UUID
  `e712e34c-6117-4d13-bf4c-8ed54cf2b495`.
- No RR execution or Cvent business-data write occurred. Uploads were preserved.
- 36 regression tests passed.

Sanitized receipt:
`~/.cvent-pi-agent/rr-connection/profile-migration-20260919T170326Z/receipt.json`.

## Return to Agent

The Events list is not a selected event. Open the selected event's Details →
Event Information page before returning control. The resolver supports both
`app.cvent.com` and `events.app.cvent.com`, retains exact name/UUID checks,
and reads the scoped `EventInputModel_Title` display rather than the generic
page heading or a planner's Title field.

Browser login persistence and browser target identity are separate. A container
replacement changes Steel session and CDP target IDs; reconcile runtime metadata
and reverify the selected event before execution. Do not reuse stale identity
verification or silently attach to unrelated tabs. The migration above performed
that reconciliation explicitly; general automatic restart recovery is not yet
implemented.
