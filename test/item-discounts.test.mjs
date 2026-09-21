import assert from "node:assert/strict";
import test from "node:test";
import { CventConnection } from "../app/cvent-api.mjs";

const eventId = "11111111-1111-1111-1111-111111111111", discountId = "22222222-2222-2222-2222-222222222222";
const admissionId = "33333333-3333-3333-3333-333333333333", quantityId = "44444444-4444-4444-4444-444444444444";
const event = { id: eventId, title: "(C+D) Test", status: "Pending" };
const target = { apiEventId: eventId, name: event.title };
const items = [{ id: admissionId, type: "AdmissionItem" }, { id: quantityId, type: "QuantityItem" }];
const patch = { name: "New scoped code", active: true, stackable: false, method: { type: "BY_PERCENTAGE", value: 10 }, audienceType: "ALL", includeGuestsTowardsCapacity: false, autoApply: false, capacity: { total: 100 } };
const input = () => ({ code: "NEW", createIfMissing: true, patch: structuredClone(patch), agendaItems: structuredClone(items) });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function fixture(options = {}) {
  let row = options.existing ? { ...patch, id: discountId, code: "NEW", type: "DISCOUNT_CODE", level: "EVENT", applyToAllAgendaItems: true, capacity: { total: 100, used: 0 } } : null;
  let links = structuredClone(options.links ?? []), pendingLink, linkReads = 0;
  const writes = [], evidence = [], intents = [], requests = [];
  const api = new CventConnection({ intervalMs: 0, discountPollDelaysMs: [0, 1, 2], sleeper: async () => {}, credentials: async () => ({ baseUrl: "https://api-platform.cvent.com/ea", clientId: "dummy", clientSecret: "dummy" }),
    clientFactory: async () => ({ getEvent: async () => structuredClone(event) }),
    fetcher: async (value, init = {}) => {
      const u = new URL(value), method = init.method || "GET", root = `/ea/events/${eventId}/discounts`;
      requests.push({ path: u.pathname, method });
      if (u.pathname.endsWith("/oauth2/token")) return json({ access_token: "dummy" });
      if (u.pathname === "/ea/admission-items" || u.pathname === `/ea/events/${eventId}/quantity-items`) {
        assert.equal(method, "GET");
        const admission = u.pathname === "/ea/admission-items";
        if (admission) assert.equal(u.searchParams.get("filter"), `event.id eq '${eventId}'`);
        const item = { id: admission ? admissionId : quantityId, event: { id: options.foreign ? quantityId : eventId }, name: "Approved item" };
        if (options.changedItem && writes.length) item.name = "Changed externally";
        return json({ data: options.missing ? [] : options.duplicateCatalog ? [item, item] : [item] });
      }
      if (u.pathname === `${root}/agenda-items`) {
        assert.equal(method, "GET");
        if (pendingLink && ++linkReads > (options.staleLinks ? 99 : 1)) { links.push(pendingLink); pendingLink = null; }
        return json({ data: options.malformedLinks ? [{ id: "bad" }] : links });
      }
      if (method === "GET") { assert.equal(u.pathname, root); return json({ data: row ? [row] : [] }); }
      assert.equal(intents.length, writes.length + 1, "durable intent must precede each mutation");
      const phase = method === "POST" ? "create" : u.pathname.includes("/agenda-items/") ? "link" : "finalize";
      writes.push({ phase, method, body: init.body ? JSON.parse(init.body) : null, path: u.pathname });
      if (options.failAt === phase) return json({ message: "Denied" }, options.httpStatus || 403);
      if (options.transportAt === phase) throw new Error("Connection lost");
      if (phase === "link") {
        const id = u.pathname.split("/").at(-1), item = items.find(item => item.id === id);
        assert.ok(item); if (!options.existing) { assert.equal(row.active, false); assert.equal(row.applyToAllAgendaItems, false); }
        pendingLink = { ...item, discount: { id: discountId } }; linkReads = 0;
        if (options.extraLink) links.push({ ...items[1], discount: { id: discountId } });
        return new Response(null, { status: 204 });
      }
      assert.equal(u.pathname, phase === "create" ? root : `${root}/${discountId}`);
      const body = JSON.parse(init.body);
      const saved = { ...body, id: discountId, type: "DISCOUNT_CODE", level: "EVENT", capacity: { ...body.capacity, used: 0 } };
      if (!(phase === "finalize" && options.staleFinal)) row = saved;
      return json(options.wrongAck && phase === "finalize" ? { ...saved, id: quantityId } : saved, phase === "create" ? 201 : 200);
    }
  });
  return { api, writes, evidence, intents, requests, get row() { return row; }, run: (data = input(), hook) => api.execute(target, "configureDiscount", data, async prepared => { if (hook) await hook(prepared); intents.push(prepared); }, async e => evidence.push(e)) };
}
test("item-scoped code is created inactive, linked via API, finalized once, and independently verified", async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.action, "created"); assert.equal(result.initialConfigurationComplete, true);
  assert.equal(result.saved.active, true); assert.equal(result.saved.applyToAllAgendaItems, true);
  assert.deepEqual(f.writes.map(w => w.phase), ["create", "link", "link", "finalize"]);
  assert.equal(f.writes[0].body.active, false); assert.equal(f.writes[0].body.applyToAllAgendaItems, false);
  assert.deepEqual(f.intents.map(x => x.phase ?? "CREATE"), ["CREATE", "LINK_NEW_DISCOUNT_ITEM", "LINK_NEW_DISCOUNT_ITEM", "FINALIZE_NEW_DISCOUNT"]);
  assert.equal(f.evidence.at(-1).phase, "FINAL_READBACK"); assert.equal(f.evidence.at(-1).matched, true);
  assert.equal((await f.run()).action, "unchanged"); assert.equal(f.writes.length, 4, "repeat never adds or changes links");
});
test("existing event discounts receive additive links without deleting or duplicating objects", async () => {
  const f = fixture({ existing: true }); const before = structuredClone(f.row);
  const result = await f.run(); assert.equal(result.action, "updated"); assert.equal(result.requirementsSatisfied, true);
  assert.deepEqual(f.row, before); assert.deepEqual(f.writes.map(w => w.phase), ['link', 'link']);
  await assert.rejects(f.run({ ...input(), agendaItems: [items[0]] }), /Removing\/replacing/);
  assert.equal(f.writes.length, 2);
});
test("missing, foreign, duplicate or malformed catalogs block before discount creation", async () => {
  for (const options of [{ missing: true }, { foreign: true }, { duplicateCatalog: true }, { malformedLinks: true }]) {
    const f = fixture(options); await assert.rejects(f.run()); assert.equal(f.writes.length, 0); assert.equal(f.intents.length, 0);
  }
});
test("unsupported types, attendee/session IDs, empty or repeated item sets cannot be supplied", async () => {
  for (const agendaItems of [[], [...items, items[0]], [{ id: admissionId, type: "Session" }], [{ id: "bad", type: "AdmissionItem" }], [{ ...items[0], eventId: quantityId }], Array(101).fill(items[0])]) {
    const f = fixture(); await assert.rejects(f.run({ ...input(), agendaItems })); assert.equal(f.writes.length, 0);
  }
});
test("link/finalization denial, loss or stale readback never replays or falls back to browser", async () => {
  for (const options of [{ failAt: "link" }, { failAt: "finalize" }, { transportAt: "link" }, { transportAt: "finalize" }, { staleLinks: true }, { staleFinal: true }, { wrongAck: true }, { extraLink: true }, { changedItem: true }]) {
    const f = fixture(options); await assert.rejects(f.run());
    assert.equal(f.writes.filter(w => w.phase === "create").length, 1);
    assert.ok(f.writes.filter(w => w.phase === "finalize").length <= 1);
    assert.ok(f.writes.filter(w => w.phase === "link").length <= 2);
    assert.equal(new Set(f.writes.map(w => w.method + w.path)).size, f.writes.length);
  }
});
test("Stop/takeover before linking or finalization prevents the next write", async () => {
  for (const phase of ["LINK_NEW_DISCOUNT_ITEM", "FINALIZE_NEW_DISCOUNT"]) {
    const f = fixture(); await assert.rejects(f.run(input(), async prepared => { if (prepared.phase === phase) throw new Error("Stop/takeover"); }), /Stop/);
    assert.equal(f.writes.length, phase === "LINK_NEW_DISCOUNT_ITEM" ? 1 : 3);
    assert.equal(f.row.active, false);
  }
});
