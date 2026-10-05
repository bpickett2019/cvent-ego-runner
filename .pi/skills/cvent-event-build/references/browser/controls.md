# Assigned Ego/Steel controls

Read [Steel bridge](references/steel-bridge.md) and [assigned runtime](references/assigned-runtime.md) first. Use [API signatures](references/api.md) or `help()` for method syntax; documented SDK capabilities do not expand the assigned host's permissions. These are the controls for the existing RR browser, not desktop installation/profile instructions. Never install, upgrade, clear credentials or create another browser. Reuse unchanged reference guidance already in context; read again only when needed after context loss.

## Run browser scripts

Run JavaScript through a heredoc:

```bash
"$EGO_BROWSER_BIN" nodejs <<'EOF'
const task = await taskSpace(1246080070);
const active = (await task.tabs()).find(tab => tab.active);
if (!active) throw new Error("Assigned page unavailable; do not create a replacement");
const page = active.label ? task.page(active.label) : await task.adopt(active.page);

console.log({ taskSpaceId: task.spaceId, page: page.label });
console.log(await page.snapshot());
EOF
```

In some sandbox environments, heredoc input may not work; use `-e` instead:

```bash
"$EGO_BROWSER_BIN" nodejs -e '
const task = await taskSpace(1246080070);
const active = (await task.tabs()).find(tab => tab.active);
if (!active) throw new Error("Assigned page unavailable; do not create a replacement");
const page = active.label ? task.page(active.label) : await task.adopt(active.page);
console.log({ taskSpaceId: task.spaceId, page: page.label });
console.log(await page.snapshot());
'
```

In Bash/Zsh, use single quotes around the code and double quotes for JavaScript
strings. Single quotes within the code require shell quoting.

The script always runs in Node.js, not in the web Page. Browser helpers and
Node.js APIs belong in the script; Page globals such as `window`, `document`,
`location`, and DOM APIs do not. Put browser-side JavaScript inside
`page.evaluate()`. Do not import Playwright or launch another browser.

The Node.js runtime uses ESM. When a script needs local files, load built-ins
with dynamic imports such as `await import("node:fs/promises")`.

Ego-browser deliberately exposes a small custom API. It is not Playwright, even
where method names and options look similar. Use only the TaskSpace, Page,
FileChooser, mouse, and keyboard APIs explicitly listed in this Skill. Do not
infer Playwright methods such as `locator()`, `getByRole()`, `context()`,
`expect()`, or `route()`. Use documented `page.evaluate()` or `page.cdp()` only within existing host permissions; missing/denied support is not permission to bypass a guard. All examples below illustrate syntax only: use observed selectors and authorized source values, never example references/values as live configuration.

Pointer actions accept an optional `label` with a concise 3-6 word description.
Pass it with clicks, hovers, drags, or scrolling to keep the action text next to
the visible agent cursor in sync with the action.

Use the assigned executable in RR_WORKSPACE only while the app grants control. A missing executable/session is an operator prerequisite, not permission to install a browser or attach elsewhere.

## Spaces, rounds, and pages

- Resume the existing assigned TaskSpace1246080070 and its single tab. Never create another space or tab for this build.
- Never use a new TaskSpace to recover from a stuck, blocked, timed-out, or
  unexpected Page. Recover within the existing space; if it cannot continue,
  stop and ask the user.
- Every invocation starts a new Node.js process. Task spaces, tabs, and Page labels
  persist; JavaScript variables do not.
- Inspect the assigned tab's current label before using a Page handle; do not assume an untracked tab already has label p1.
- Reuse that Page for observed, authorized navigation within the bound event. Never switch to an unassigned target.
- All time values are milliseconds.

```js
// Later round: resume the assigned space and the Page label observed earlier.
const resumed = await taskSpace(1246080070);
const source = resumed.page("p1"); // Only if p1 was confirmed as the assigned label.
console.log(await source.snapshot());
```

This run never selects a desktop profile. The application owns the job's fresh Steel profile and login/identity checks. Do not enumerate, create, clear or substitute profiles.

Supported TaskSpace API:

- State: `spaceId`, `name`, `ownership`, `page(label)`, `userPage()`
- Pages: `await task.pages()`, `await task.tabs()`, `adopt(page, { as? })` for the already assigned tab only
- Completion: `finish({ keep })` retaining that assigned Page; app controls own human handoff
- Advanced: `cdp(method, params, options)`

Pages receive permanent labels. Reuse the observed assigned label rather than assigning a new one. The runtime permits one Page. `task.newPage()`, `page.close()` and raw target creation/deletion are not permitted for this build even though they exist in the upstream schema.

`await task.pages()` returns managed Pages. `await task.tabs()` returns every tab in the
space as `{ label?, page, targetId, title, url, active, openedBy }`. A tab
without a label is unmanaged; adopt it before operating:

```js
const active = (await task.tabs()).find((item) => item.active);
if (active && !active.label) {
  const page = await task.adopt(active.page);
  console.log({ page: page.label, url: await page.url() });
}
```

Do not release or close the assigned Page to change ownership. The application's Take Control/Return/Stop operations, not tab manipulation, govern ownership and cleanup.

## Page operations

The following Page API remains subject to the assigned host's scope and capability checks:

- State and observation: `label`, `spaceId`, `openedBy`, `targetId`, `url()`,
  `title()`, `info()`, `snapshot()`, `screenshot()`
- Navigation and waits: `goto()`, `reload()`, `waitForURL()`,
  `waitForEvent()`, `waitForSelector()`, `waitForLoadState()`,
  `waitForFunction()`, `waitForTimeout()`
- Elements: `click()`, `dblclick()`, `hover()`, `dragAndDrop()`, `fill()`,
  `selectOption()`, `focus()`, `press()`, `setInputFiles()`,
  `waitForFileChooser()` (file actions require separately authorized, verified support)
- Dialogs: `acceptDialog(promptText?)`, `dismissDialog()`
- Pointer: `mouse.click()`, `move()`, `down()`, `up()`, `wheel()`
- Keyboard: `keyboard.down()`, `up()`, `press()`, `type()`, `insertText()`
- Page code and protocols: `evaluate(fnOrString, argument)`,
  `fetch(url, options)`, `cdp(method, params, options)`

`page.evaluate()` callbacks run only inside the Page; they cannot read variables
or Node.js modules from the surrounding script. Define browser-side helpers
inside the callback or pass one JSON-serializable value as its second argument.

Work efficiently:

- Each time you observe, collect only the cheapest page state sufficient to
  choose the next action. Use a snapshot for semantic or locator ground truth
  and a screenshot for visual confirmation; do not request both by default.
- If an action does not produce the expected result, inspect the current page
  before deciding whether to retry. Do not blindly repeat it or immediately
  fall back to coordinates or raw CDP.
- Once the page clearly shows the requested result, stop; do not confirm the
  same result through multiple surfaces.

### Semantic pages: snapshot and selectors

Prefer snapshots and semantic selectors for ordinary DOM pages. Use screenshots
and coordinates only when useful DOM semantics are unavailable.

Before choosing an unfamiliar target, take a snapshot. When the current state
is sufficient to plan several actions on the same Page, complete them in one
script invocation, then observe the result once. Observe between actions only when an
intermediate result changes what should happen next. Keep the action sequence,
the wait for its final expected state, and the next snapshot in the same
script invocation. Print the snapshot last so the next round can act on it directly.
The final snapshot is the next round's starting view of the changed page;
without it, that round usually has to spend a separate browser call observing
before it can choose the next target, which wastes compute.

Wait for the expected result: use `waitForURL()` for navigation,
`waitForSelector()` for element state, or `waitForFunction()` for application
state. Avoid fixed delays when an observable condition exists. A snapshot
captures the current moment; it does not wait for the page to become stable.
`page.snapshot()` captures the current viewport. For content outside it, use
`page.snapshot({ scope: "full_page" })`.

The assigned bridge's default viewport snapshot covers the top document. It supports only verified attached same-renderer frame observations as described in the Steel bridge reference; do not assume generic SDK iframe coverage. To inspect a supported observed frame, reuse its actual iframe ref:

```js
console.log(await page.snapshot({ scope: "subtree", root: "@12" }));
```

Use the refs returned by the subtree for actions inside the iframe. A subtree
snapshot does not scope later locator actions; they still prefer actionable
matches in the top document before searching frames.

`waitForLoadState()` defaults to `load`. `waitForFunction()` follows the
Playwright argument order; pass `undefined` before options when there is no Page
argument:

```js
await page.waitForFunction(() => window.appReady, undefined, {
  timeout: 10_000,
});
```

```js
// Round 1: inspect and choose targets from this output.
const page = task.page("p1");
console.log(await page.snapshot());
```

```js
// Next round: act using the previous output, verify, then prepare the next round.
const page = task.page("p1");
await page.fill("@21", "Source-backed label"); // Observed authorized event field, not a login control.
// This confirms editing only. Use the bridge's Save-once/readback rules to persist it.
console.log(await page.snapshot());
```

Element actions accept:

- snapshot refs such as `@21` or `ref=21`
- `text=...` for page content
- `loc=css:`, `loc=role:`, and `loc=href:` locators
- `xpath=...`
- raw CSS selectors

Selector actions require exactly one match. Unquoted text normalizes whitespace,
ignores case, and matches a substring; quoted text such as
`text="Save changes"` is exact and case-sensitive.

A small Playwright-compatible selector subset is also accepted: `css=...`,
terminal `:has-text("...")` and `:text-is("...")`, `>> nth=N` after a CSS,
text, or href selector (`N` is `-1` or non-negative), plus
`loc=role:...[name*="..."]` for accessible-name substrings. Other Playwright
selector syntax is not supported.

When a selector identifies a wrapper, `focus()` and `press()` may use its
interactive ancestor or unique editable descendant; `fill()` and
`setInputFiles()` only continue to a unique compatible control.

`click()`, `fill()`, `hover()`, and `dragAndDrop()` automatically bring their
target into view with browser wheel input. Do not pre-scroll solely to make a
DOM target actionable.

Snapshot node names are accessibility roles. Use a ref now or `loc=...` to find
the element again. After the page changes, take a new snapshot. When a useful
node has no ref, construct a selector from its role, text, or surrounding
context. CSS searches nested open shadow roots. Actions use an actionable match
in the top document first, then search frames when the top document has none.
Multiple actionable matches in the selected document or frame are ambiguous.

Select options by value, visible label, or zero-based index. A string matches
either value or label; pass an array for a multiple select:

```js
await page.selectOption("select[name=month]", { label: "October" });
```

Pass `null` or `[]` to clear the current selection.

### Visual pages: screenshot, mouse, and keyboard

Use a screenshot with mouse and keyboard operations for canvas, rich-text,
spreadsheets, maps, and other interfaces that lack useful DOM semantics:

```js
const path = await page.screenshot({ path: "/absolute/path/before.png" });
await page.mouse.click(420, 260, { label: "open spreadsheet cell" });
await page.mouse.wheel(0, 600, { label: "scroll project board" });
await page.keyboard.insertText("Source-backed text");
console.log({ screenshot: path });
```

Inspect the screenshot with an image-viewing tool. Coordinates use CSS pixels;
keyboard names and `+`-separated chords follow Playwright syntax. Use
`ControlOrMeta` for portable shortcuts and verify the resulting page state.
`mouse.wheel()` performs a short wheel-input motion at the current mouse
position and resolves when that motion completes. In each script invocation, move or
click over the intended scrollable area before using it.

Use `keyboard.insertText()` for plain text on the assigned Steel runtime. Desktop clipboard/profile integrations are not implemented here. Rich-text operations require an observed supported editor control; do not infer HTML clipboard support from the upstream API.

For rich-text editors and editable grids, validate a small edit before repeating
it at scale. Canvas-backed editors may not expose visible content through DOM
text or selectors; verify those results with a screenshot or an
application-specific visible state.

### Page JavaScript and CDP

Use `page.evaluate()` for bulk extraction or complex in-page work. It accepts
one JSON-serializable argument and returns a JSON-serializable value:

```js
const rows = await page.evaluate(
  ({ selector, limit }) =>
    [...document.querySelectorAll(selector)].slice(0, limit).map((node) => ({
      text: node.textContent?.trim(),
      href: node.querySelector("a")?.href,
    })),
  { selector: "article", limit: 20 },
);
```

`page.evaluate()` has no timeout option. Keep long work in bounded calls; on a
safety timeout, use `executionStopped` and `mayHaveLateEffects` to decide
whether execution may have had late effects. Unconfirmed execution requires Stop and preserved evidence, not an automatic reload, close, retry or replacement Page.

Use documented Page methods first. If a wrapper is missing or does not work
reliably on the current page, use `page.cdp()` as a lower-level path for
diagnosis or control. It accepts Page, Runtime, DOM, Network, Input, and similar
commands; use `task.cdp()` for Target and Browser commands. Raw CDP invalidates
refs. Do not persist `page.targetId` across rounds.

## Action receipts, popups, and dialogs

Keep the build on the assigned Page; do not deliberately open a popup/new target or adopt one as a workaround. An unexpected `receipt.popups` is evidence to inspect under the bridge's identity rules, not permission to switch targets. Stop on lost or ambiguous event/control identity.

For uncommon protocol-event workflows, `await page.events()` returns and clears
the buffered event array; it is not an EventEmitter.

A synchronous JavaScript dialog may appear as `receipt.dialog` or in
`page.info()`. Handle it before continuing:

```js
await page.acceptDialog("prompt response");
// Or: await page.dismissDialog();
```

A receipt describes only the dispatched action and immediate popup or dialog
observations; it does not verify the resulting application state.

## Files and requests

The agreed image workflow is human upload, followed by verification of the asset and widget association. These SDK file examples document syntax only; they do not authorize automated upload or prove assigned-runtime transfer support. Use them only after separate authorization and verified file staging/host support. Never upload RR reports, credentials or unrelated files. Unsupported downloads/transfer remain blockers under the bridge contract.

Set an authorized existing file input with a verified staged image path:

```js
await page.setInputFiles("input[type=file]", ["/verified/staged/approved-image.png"]);
```

If a click creates the file input, start waiting before the click:

```js
const chooserPromise = page.waitForFileChooser({ timeout: 10_000 });
await page.click("button.upload");
const chooser = await chooserPromise;
const result = await chooser.setFiles("/verified/staged/approved-image.png");
```

An upload-triggered JavaScript dialog may be returned as `result.dialog`; when
present, handle it with the dialog methods above.

For a browser download, arm the event before the triggering action and save the
returned artifact to an absolute path in the same script:

```js
const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
await page.click("button.download");
const download = await downloadPromise;
console.log({
  url: download.url(),
  suggestedFilename: download.suggestedFilename(),
});
await download.saveAs("/absolute/path/report.pdf");
```

`download.saveAs()` waits for completion and creates missing parent
directories. `download.path()` returns the round-local temporary file;
`failure()`, `cancel()`, and `delete()` manage its lifecycle. Temporary download
files are removed when the SDK round is disposed, so call `saveAs()` before the
script ends. Do not set a global download directory with raw CDP; each download
wait configures and restores only the addressed Page session.

The SDK exposes `page.fetch()` and Node can make network requests, but neither is an alternative Cvent authoring transport. This build uses "$CVENT_API_BIN" for supported discount operations/dependency reads and the assigned browser for other configuration. No raw POST/PUT/PATCH, custom cookie/header extraction, standalone helper or transport switching after a denial. See the API reference for signatures, not expanded permission.

## User control and completion

Stop when the user takes control or the space is inactive or unassigned. Do not
retry or route around the stop. Permission prompts, device choosers, and
other browser-owned prompts require the user to handle them.

Human login and manual edits use the application's supported Take Control/Return flow. A safe pause may retain the same Pi/browser; explicit Return re-verifies ownership/event identity. SDK claim/takeover/wait calls cannot change USER ownership or resume a stopped job. Never press Return on the user's behalf, set runtime flags, type credentials or manufacture handoff state.

On successful browser work, retain the assigned result Page:

```js
await task.finish({ keep: [page.label] });
```

Do not finish on errors or human-control loss. Do not close/release the Page or delete tabs. The application, not this skill, stops the job's Steel container at settlement/Stop; retained profiles/evidence do not authorize restarting it. Keeping the Page is not a promise that the browser remains live after job settlement.

If a version notice appears, report it for operator maintenance. Do not run an upgrade in an active build; the vendored SDK and Steel image are pinned.

## References

- [Assigned runtime and connection](references/assigned-runtime.md)
- [API signatures and options](references/api.md)
- [State-reset boundaries](references/clearing-state.md) — app-owned cleanup only; no direct cookie/storage access or clearing.
