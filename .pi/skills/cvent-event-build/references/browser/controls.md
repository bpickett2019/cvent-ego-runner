# Assigned browser controls

Read the [Steel bridge](references/steel-bridge.md) for save handling and host limits.
Use the [API reference](references/api.md) only when a method's syntax is needed:
upstream methods are not proof that the assigned host supports or permits them.
[SKILL.md](../../SKILL.md) supplies business policy, not this control guide.

## Open the assigned page

Run scripts through "$EGO_BROWSER_BIN" in RR_WORKSPACE while the app grants control:

```bash
"$EGO_BROWSER_BIN" nodejs <<'EOF'
const task = await taskSpace(1246080070);
const active = (await task.tabs()).find(tab => tab.active);
if (!active) throw new Error("Assigned page unavailable; do not create a replacement");
const page = active.label ? task.page(active.label) : await task.adopt(active.page);
console.log(await page.snapshot());
EOF
```

`nodejs -e '...JavaScript...'` is also supported. Each invocation is a new Node ESM
process; variables do not persist, but the TaskSpace, page label and refs do. Inspect
the label instead of assuming p1. Use dynamic imports for Node built-ins when needed.
Do not install anything, import Playwright, launch a browser or select another profile.

This build has one assigned page. newPage, close/release, other targets and profile
changes are not permitted for this build. The application's supported Take Control/Return
flow owns login and handoff; SDK claim/takeover calls cannot override USER ownership.
Missing session/executable support is a prerequisite, not permission to repair runtime
files or start another browser. See [assigned runtime](references/assigned-runtime.md).

## Observe, act, save, read back

Use a snapshot for observed controls or a screenshot when visual inspection is needed;
do not request both routinely. Reuse the last post-action observation while it remains
current. Before unfamiliar actions inspect the control. Batch predictable field edits
within one editor, not across uncertainty, then inspect the resulting page.

```js
await page.fill("@21", "approved value"); // Replace example ref/value with observed intent.
console.log(await page.snapshot());
```

A snapshot does not wait for stability. Use observed conditions with waitForSelector,
waitForURL or waitForFunction. All times are milliseconds. Example argument order:
`await page.waitForFunction(() => document.readyState === "complete", undefined, {timeout:10000});`
This example establishes document readiness, not save completion.

Save once. While pending, observe the same page; never navigate, reload or repeat Save.
Use the bridge's optional saveOnce/observeSave helpers or documented observations.
A settled completion signal is not persistence evidence: then reopen/reload and check
saved fields and relationships. Unknown effects require Stop, not another approach.

## Selectors and controls

- Use observed refs (`@21`/`ref=21`), `text=...`, `loc=css:`, `loc=role:`, `loc=href:`,
  XPath or CSS. Actions require exactly one actionable match. Refresh refs after changes.
- Only a small Playwright-like selector subset is supported (`css=`, terminal
  `:has-text`/`:text-is`, `>> nth=N`). No locator(), getByRole(), context() or route().
- Common actions: click, dblclick, hover, dragAndDrop, fill, selectOption, focus, press.
  Selector actions bring targets into view; do not pre-scroll merely to do that.
- `selectOption(selector, {label:"..."})` or a value/index selects an option;
  arrays select multiple values and null/[] clears selection where supported.
- Mouse and keyboard actions use CSS coordinates/observed controls. Use
  keyboard.insertText for plain text, not native desktop paste. Move the pointer over
  the intended scrollable area before mouse.wheel. Inspect screenshots before using
  coordinates; coordinate input is not a workaround for a denied operation.
- Rich-text/canvas editing requires a supported observed control and visible/saved
  verification. Check a small change before repeating it at scale.

Default/full_page snapshots cover the top document. For an observed iframe owner,
`page.snapshot({scope:"subtree", root:"@12"})` supports only the bridge's verified
attached same-renderer frames. Use its frame-scoped refs. Nested/out-of-process frames
are not automatically covered. Subtree observations are not a complete inventory.
If a required field cannot be verified before writing, block that item rather than
start a write with no verification route.

## Less common operations

page.evaluate runs in the page, not Node. Pass one JSON-serializable argument; do not
expect it to capture script variables. Use bounded read-only extraction, not hidden
API authoring, credential/cookie extraction or guard bypasses. CDP signatures in the
API reference do not grant raw connections or broader permissions. A timeout with
unconfirmed execution/possible late effects requires Stop, not reload or replay.

Handle a returned JavaScript dialog through acceptDialog/dismissDialog after observing
its meaning. Do not deliberately create popups; an unexpected popup is not permission
to adopt another target. Stop if event/control identity is lost.

File chooser/upload signatures do not implement transfer to the remote browser.
Use only authorized source assets and verified staging/host support; otherwise record
the missing asset/operation or use supported human handoff. No general human-upload
business prerequisite is added here. Desktop clipboard and remote download artifact
transfer are not implemented. Never upload workbooks, reports, secrets or unrelated files.

No raw POST/PUT/PATCH, custom cookies/headers or standalone helpers for Cvent authoring.
Use the assigned discount adapter for its authorized operations. Never change transport
to bypass a denial or uncertainty. Do not use cookie/storage reset recipes; see
[state boundaries](references/clearing-state.md).

## Finish

After successful browser work, retain the assigned page:

```js
await task.finish({ keep: [page.label] });
```

Do not finish on errors or human-control loss. The app owns container cleanup; retaining
a page does not promise a live browser after settlement. Do not restart a stopped
session, press Return for the user or upgrade the pinned SDK during a build.
