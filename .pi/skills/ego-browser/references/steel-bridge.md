# Assigned Steel session: project restrictions

The unmodified Ego v2.0.0 skill and API reference run on upstream Ego commit
`dca7003349c5f7132189ba00547cbbd7ff8e597e`, through the existing Steel host.
This is not the desktop Ego Lite application. Do not install, upgrade, launch,
or select another browser or profile to resolve a missing host capability.

- Use the project `bin/ego-browser nodejs` (stdin or `-e`). Native Pi's PATH and
  `$EGO_BROWSER_BIN` point here, not the globally installed desktop executable.
- Resume `await taskSpace(1246080070)` (name `cvent-ego-runner` on first use).
  There is one assigned tab. Inspect `task.tabs()`; if its active tab is unmanaged,
  adopt `active.page` and reuse the returned label. Never create another space/tab.
- Page labels and snapshot refs persist in a session-specific directory under
  `data/ego-v2/`. The single upstream patch makes `runtimeInstanceId()` accept
  `EGO_BROWSER_INSTANCE_ID`, supplied by the bridge from the Steel session ID.
  Different per-command shell parents must not invalidate the same browser's state.
- Use documented v2 Page operations and milliseconds. The old `agent_helpers.js`
  facade is archived as `agent_helpers.v1.js`, not loaded or reimplemented.
- Take Control / Return to Agent in the app own the human-login and identity gates.
  A skill claim/takeover cannot change USER, RETURNING or LOCATING ownership to AGENT.
  During Return, the app checks the API identity and current browser location, then
  uses v2 taskSpace/Page navigation in a restricted LOCATING state to open the
  selected event's Details page. Only approved overview/details navigation is
  allowed there; input, reload, other routes and authoring are blocked. The SDK
  sees delegated agent control, but host policy remains navigation-only until
  exact displayed name/UUID and login verification pass. Login is human-only;
  the user does not need to find the event. A wrong event stops the handoff.
- Keep the assigned result Page on successful completion:
  `await task.finish({keep:[page.label]})`. Do not finish on errors or user control.
  Tab/session deletion and creation are blocked, including raw CDP equivalents.
  After native settlement or Stop, the app (not the agent) terminates the job's
  Steel container. Keeping the result Page does not keep the environment running;
  profiles and evidence are retained on disk. Never restart a settled container.
- Snapshot scopes support the top document: viewport (default), full_page and
  AX subtrees. Snapshot output explicitly excludes iframe contents; an iframe
  subtree is unsupported. Use a screenshot for visual inspection. Do not assume
  missing snapshot text means an iframe has no content. Frame authoring is not
  acceptance-tested; stop if this prevents reliable verification.
- Keep observations focused: reuse the previous post-action snapshot rather than
  taking another unchanged one. Prefer `page.snapshot({scope:"subtree",root:"@12"})`
  for an observed relevant top-document ref (replace @12 with the actual ref).
  Use full_page only when needed to locate missing content; never interpret a
  subtree as a complete inventory. Group predictable observed actions, wait for
  their final expected state and print the next focused snapshot in one invocation.
  Inspect unfamiliar dialogs/transitions before continuing; save/readback checks
  are not optional. Do not batch across uncertainty or replay mutations.
- Complete, save and independently verify one object and its dependencies before
  exploring unrelated editors. Check uniqueness, type assignment and shared/global
  settings before authoring; creating a new template does not prove field isolation.
  A concrete blocker skips dependent work, not independent executable requirements.
- Every upload is a fresh execution from its workbook and live saved event state,
  not a continuation of earlier tasks or browser position. Historical evidence
  does not instruct this run. Never change uncertainty records or ownership gates.
- Recover ordinary selector/navigation failures using the skill and fresh evidence.
  There is no fixed selector-retry quota. Unconfirmed page execution/possible late
  effects require global Stop and uncertainty review: do not automatically reload,
  close or replace the assigned page. Three recognized renderer/CDP/unresponsive
  failures within ten minutes trigger runner Stop; selector errors do not count.
- Desktop-only profile/clipboard integrations and remote-browser download
  artifact transfer are not implemented here. Use keyboard.insertText for plain
  text rather than native desktop paste. Stop and report unsupported operations.
- The skill's general fetch/CDP examples do not authorize custom API authoring,
  direct connections, prohibited actions, unassigned targets or bypassing guards.
  Supported Cvent operations use the existing `$CVENT_API_BIN` adapter first;
  only documented API-unsupported work uses Ego. The job's approved SOW governs
  authorization; SDK capabilities do not expand it.

The patch is also saved as `ego-bridge/patches/steel-session-ledger.patch` so
it survives a fresh submodule checkout. From the project root, on an unpatched
checkout of the pinned commit, apply it once with
`git -C vendor/ego-lite apply ../../ego-bridge/patches/steel-session-ledger.patch`.
Build after changing the vendor pin or applying the patch:
`cd vendor/ego-lite/package/ego-browser && npm run build`.
Tests: project `npm test`; upstream page-model/page-ledger/API tests are mocked,
not a Cvent saved-result acceptance test. Preserve uploads, sessions and evidence.
