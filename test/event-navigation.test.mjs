import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SteelEgoHost, isApprovedEventNavigation } from "../ego-bridge/host.mjs";

const id = "e712e34c-6117-4d13-bf4c-8ed54cf2b495";
const other = "11111111-1111-4111-8111-111111111111";
const name = "(C+D) Medtrade Testing Clone 2";
const list = "https://app.cvent.com/Subscribers/Events2/EventSelection";
const overview = `https://app.cvent.com/Subscribers/Events2/Overview/Overview/Index/View?evtstub=${id}`;
const details = `https://app.cvent.com/Subscribers/Events2/Details/EventDetails/Index?evtstub=${id}`;
const runtime = { ownership: "AGENT", activeTargetId: "target", expectedEvtstub: id, expectedEventName: name, apiEvent: { id, name } };

async function fixture(currentUrl = list, ownership = "AGENT") {
  const dir = await mkdtemp(join(tmpdir(), "cvent-navigation-"));
  const path = join(dir, "runtime.json");
  await writeFile(path, JSON.stringify({ ...runtime, ownership }));
  const client = { setExternalSink() {}, async request(method) {
    if (method === "Target.getTargets") return { targetInfos: [{ type: "page", targetId: "target", url: currentUrl }] };
    return { result: { value: "Save" } };
  } };
  return { host: new SteelEgoHost(client, path), dir };
}

test("API-confirmed overview/details navigation can start at Events list", async () => {
  assert.equal(isApprovedEventNavigation(runtime, list, overview), true);
  assert.equal(isApprovedEventNavigation(runtime, overview, details), true);
  assert.equal(isApprovedEventNavigation(runtime, list, overview.replace("Subscribers", "subscribers")), true);
  const { host } = await fixture();
  await host.assertOperationAllowed({ method: "Page.navigate", params: { url: overview } });
  await assert.rejects(host.assertOperationAllowed({ method: "Input.dispatchMouseEvent", params: { x: 1, y: 1 } }), /expected evtstub/);
});

test("navigation exception never guesses identity or permits other-event recovery", () => {
  for (const from of [overview.replace(id, other), "https://app.cvent.com/Subscribers/Admin", "https://example.com", list + `?evtstub=${other}`]) {
    assert.equal(isApprovedEventNavigation(runtime, from, details), false, from);
  }
  for (const to of [overview.replace(id, other), overview + `&evtstub=${other}`, overview + "&action=save", overview + "#fragment", overview.replace("https:", "http:"), overview.replace("app.cvent.com", "evil.example"), overview.replace("app.cvent.com", "user@app.cvent.com"), list, `https://app.cvent.com/Other?evtstub=${id}`]) {
    assert.equal(isApprovedEventNavigation(runtime, list, to), false, to);
  }
  for (const change of [{ apiEvent: null }, { expectedEventName: "Other" }, { expectedEvtstub: other }, { apiEvent: { id: other, name } }]) {
    assert.equal(isApprovedEventNavigation({ ...runtime, ...change }, list, overview), false);
  }
});

test("USER, RETURNING, login, uncertainty and forbidden-action guards still precede navigation", async () => {
  for (const owner of ["USER", "RETURNING"]) {
    const { host } = await fixture(list, owner);
    await assert.rejects(host.assertOperationAllowed({ method: "Page.navigate", params: { url: overview } }), /User owns|read-only/);
  }
  const login = await fixture("https://login.app.cvent.com/login");
  await assert.rejects(login.host.assertOperationAllowed({ method: "Page.navigate", params: { url: overview } }), /authentication input is human-only/);
  const uncertain = await fixture();
  await writeFile(join(uncertain.dir, "api-write-uncertain.json"), "{}");
  await assert.rejects(uncertain.host.assertOperationAllowed({ method: "Page.navigate", params: { url: overview } }), /API write is uncertain/);
  const { host } = await fixture();
  await assert.rejects(host.assertOperationAllowed({ method: "Runtime.evaluate", params: { expression: "document.querySelector('#delete').click()" } }), /prohibited Cvent action/);
});

test("being on the approved event never authorizes navigating to a foreign event", async () => {
  for (const from of [list, overview, overview.replace(id, other)]) {
    const { host } = await fixture(from);
    await assert.rejects(host.assertOperationAllowed({ method: "Page.navigate", params: { url: overview.replace(id, other) } }), /navigation requires/);
  }
  const wrong = await fixture(overview.replace(id, other));
  await assert.rejects(wrong.host.assertOperationAllowed({ method: "Page.navigate", params: { url: details } }), /navigation requires/);
});

test("ordinary same-event navigation still works, but duplicate IDs and foreign destinations fail", async () => {
  const current = `https://events.app.cvent.com/events/home?evtstub=${id}`;
  const { host } = await fixture(current);
  await host.assertOperationAllowed({ method: "Page.navigate", params: { url: details } });
  for (const url of [details + `&evtstub=${other}`, details.replace('https:', 'http:'), details.replace('app.cvent.com', 'other.example'), `https://app.cvent.com/delete?evtstub=${id}`]) {
    await assert.rejects(host.assertOperationAllowed({ method: "Page.navigate", params: { url } }), /navigation requires/);
  }
});
