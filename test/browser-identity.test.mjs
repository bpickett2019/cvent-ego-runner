import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { collectEventNames, eventObservationProgram } from "../app/browser-identity.mjs";
import { formatCliLogValue } from "../vendor/ego-lite/package/ego-browser/dist/src/format.js";

const titleSelector = "#EventInputModel_Title-container .cv-value, #EventInputModel_Title";
const documentWith = entries => ({ querySelectorAll: selector => entries[selector] || [] });

test("Cvent Event Information title wins over generic page heading", () => {
  const doc = documentWith({
    [titleSelector]: [{ textContent: " (C+D) Medtrade Testing Clone 2 " }],
    'h1, [role="heading"][aria-level="1"]': [{ textContent: "Event Information" }],
  });
  assert.deepEqual(collectEventNames(doc), ["(C+D) Medtrade Testing Clone 2"]);
  // Server serializes this function into the browser; it must be self-contained.
  assert.deepEqual(new Function("document", `return (${collectEventNames.toString()})();`)(doc), collectEventNames(doc));
});

test("name extraction keeps conflicts for the resolver and ignores unrelated titles", () => {
  const doc = documentWith({
    [titleSelector]: [{ value: "Event A" }, { textContent: "Event A" }],
    label: [
      { textContent: "Event Name:", control: { value: "Event B" } },
      { textContent: "Title:", control: { value: "Planner Title" } },
    ],
  });
  assert.deepEqual(collectEventNames(doc), ["Event A", "Event B"]);
  assert.deepEqual(collectEventNames(documentWith({})), []);
  assert.deepEqual(collectEventNames(documentWith({'h1, [role="heading"][aria-level="1"]':[{textContent:'Personal Information'}]})), [], 'page headings are not conflicting event names');
});

test("Return observation produces strict JSON with Ego v2 logging and no control acquisition", async () => {
  const program = eventObservationProgram();
  assert.doesNotMatch(program, /(?:useOrCreateTaskSpace|taskSpace|claimTaskSpace|takeOverTaskSpace)\(/);
  const doc = documentWith({[titleSelector]: [{textContent:'User-selected Conference'}]});
  const info = {url:'https://app.cvent.com/?evtstub=selected'};
  const text = 'Event Details Registration';
  const output = [];
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction('js','pageInfo','snapshotText','cliLog',program)(
    async expression => new Function('document',`return ${expression}`)(doc),
    async () => info,
    async () => text,
    value => output.push(formatCliLogValue(value)),
  );
  assert.equal(output.length,1);
  assert.deepEqual(JSON.parse(output[0]),{info,snapshot:text,eventNames:['User-selected Conference']});
});

test("Steel profile configuration matches the persistent mount", async () => {
  const compose = await readFile(new URL("../docker-compose.yml", import.meta.url), "utf8");
  assert.match(compose, /CHROME_USER_DATA_DIR: \/data\/chrome/);
  assert.match(compose, /\.\/data\/steel-user-data:\/data\/chrome/);
});
