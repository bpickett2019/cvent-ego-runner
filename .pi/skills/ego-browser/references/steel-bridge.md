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
- Viewport (default) and full_page snapshots cover the top document only.
  To inspect an observed iframe, request `page.snapshot({scope:"subtree",root:"@12"})`
  using its actual ref. The bridge supports attached same-renderer iframe documents
  and returns frame-scoped refs, not unscoped CSS locators. Nested frames are not
  expanded; out-of-process, detached or unverified frames remain unsupported, with
  no extra target attachment. Do not assume missing text means a frame is empty.
  Screenshots can aid visual inspection, but frame authoring/saved verification is
  not live-proven. If unavailable frame inspection prevents reliable verification
  before any write, block the affected requirement and continue independent safe
  work; do not begin a write you cannot verify. If a current-run write may have
  executed and its saved result cannot be verified, use global Stop below.
- Keep observations focused: reuse the previous post-action snapshot rather than
  taking another unchanged one. Prefer `page.snapshot({scope:"subtree",root:"@12"})`
  for an observed relevant top-document or supported iframe-owner ref (replace @12
  with the actual ref).
  Use full_page only when needed to locate missing content; never interpret a
  subtree as a complete inventory. Group predictable observed actions, wait for
  their final expected state and print the next focused snapshot in one invocation.
  Inspect unfamiliar dialogs/transitions before continuing; save/readback checks
  are not optional. Do not batch across uncertainty or replay mutations.
- Await saves; inspect validation. Treat a responsive UI's `Saving...` as pending,
  not proof of success or failure. Use bounded read-only observation with documented
  waits for observable completion or explicit validation before classifying a normal
  pending save as uncertain. Do not close, navigate, refresh or repeat Save while
  pending. Inspect visible validation messages, not just an icon/count; a validation
  indicator alone does not prove that nothing persisted. After confirmed completion,
  independently verify persisted values and connections. If the bounded wait cannot
  establish the outcome, stop and retain uncertainty without replay. This does not
  defer Stop for crash/disconnect, unconfirmed tool execution, identity/ownership loss,
  expired login, exposed secrets or operator Stop, or reopen a previously stopped save.
- Project save helpers (not upstream Page methods): prefer `saveOnce(page, saveRef, options)`
  for a new Save in project `ego-browser nodejs` scripts. Preserve exact intended
  values, relationships and relevant defaults in workspace evidence first. Ground
  the Save locator and actual CSS selectors from the current UI **before** saving.
  Supply `completionSelector` and, when observed, `pendingSelector`,
  `validationSelector`, `rejectionSelector`; `timeoutMs` defaults to 60000
  (1000–120000 permitted). Example with observed selectors:
  `console.log(await saveOnce(page, saveRef, {completionSelector, pendingSelector,
  validationSelector}));` Do not invent selectors. The helper waits for a visible
  Save locator and checks the top-document baseline. Invalid/ambiguous selectors,
  pending writes or already-visible completion/rejection prevent submission.
  It clicks once and observes; it never retries Save, reloads, closes or navigates.
  If Save was already clicked, call `observeSave(page, options)` immediately instead;
  never call `saveOnce` or click again. Both helpers observe through the assigned Page.
  Only destroyed/missing execution contexts and not-ready documents allow bounded
  read-only re-observation, checking control/session/target/event continuity before
  and after reads. Ownership loss, crash/disconnect, operation timeout, possible
  late execution, selector errors and unknown errors remain terminal after Save.
  A persistent transition still exhausts the original deadline; it is not proof
  of navigation or persistence. Diagnostics retain phase, attempts/polls, sanitized
  category/type and error fingerprint, never raw exception messages. It also recognizes visible
  `Saving...` / `Saving…` text. The host blocks input/navigation while that text is
  visible, even if the helper was not called. This is not an all-frame/canvas detector.
  Completion/rejection results have `verified: false`: inspect validation and
  independently establish saved values/connections before proceeding. A rejection
  selector must identify an explicit save rejection, not merely a validation count.
  Correct an RR-backed issue only when the UI establishes the prior save was rejected
  without persistence; a validation indicator or helper result alone grants no replay.
  No observable outcome, contradictory signals, loss of control or observation error
  causes `BrowserSaveUncertainError` and a private `browser-save-uncertain.json` marker.
  That marker blocks both browser/API writes and DONE; read-only evidence remains
  available. The controller checks the current job's marker at tool/settlement
  boundaries and on its two-second monitor, independently of shell exit status.
  A successful later command cannot mask it; quoted stdout alone cannot create it. Never delete it, reopen the stopped save, or use the helper as a repair
  tool for historical uncertainty. The app's uncertainty stop has no automatic retry.
- Across the entire approved event-build SOW, create or modify existing objects,
  settings and relationships only when their effects are confined to the selected
  event, including admission items and pricing. Never modify existing shared/account-wide
  objects or definitions. Reuse an exact shared match; if none exists, create a
  separate RR-compliant shared build object only without changing existing shared
  objects, global defaults or other events. Prove scope before writing: an event
  URL or a newly created template alone does not prove isolation. Event-only type/path
  assignments differ from shared contact-type definitions. Unknown scope blocks
  the affected change; continue independent safe work.
  Never delete/archive anything, including new objects, widgets, rules or links.
  This authorization does not unlock blocked navigation or operations. Do not probe
  or bypass a guard; report the specific tool limitation. Keep the event Draft.
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
  text rather than native desktop paste. A known unsupported capability before
  any possible execution is a local blocker, not a whole-run Stop. Report the
  affected requirement; use a documented supported alternative within scope or
  continue independent safe work. Never assume an error means nothing executed.
  Uncertain execution/save, page crash, disconnect, identity/ownership loss,
  expired login, exposed secrets or operator Stop still require global Stop.
  Do not bypass API failures, replay writes, clear uncertainty or replace the
  assigned browser to work around a capability gap.
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
