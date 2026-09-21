import assert from "node:assert/strict";
import test from "node:test";
import { CventConnection } from "../app/cvent-api.mjs";

const eventId = "11111111-1111-1111-1111-111111111111", id = "22222222-2222-2222-2222-222222222222", itemId = "33333333-3333-3333-3333-333333333333";
const event = { id: eventId, title: "(C+D) Test", status: "Pending" }, target = { apiEventId: eventId, name: event.title };
const patch = { active: true, stackable: false, method: { type: "BY_PERCENTAGE", value: 10 }, thresholdType: "AFTER_THRESHOLD_LIMIT", thresholdLimit: 5, interval: 1, includePrimaryRegistrant: false };
const input = () => ({ name: "Group rate", createIfMissing: true, patch: structuredClone(patch) });
const existing = () => ({ ...patch, name: "Group rate", id, level: "EVENT", type: "VOLUME_DISCOUNT" });
const item = { id: itemId, type: "AdmissionItem" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
function fixture(options = {}) {
  let row = options.row ? structuredClone(options.row) : null, links = structuredClone(options.links || []), scans = 0;
  const otherRows = structuredClone(options.otherRows || []);
  const writes = [], intents = [], evidence = [];
  const api = new CventConnection({ intervalMs: 0, discountPollDelaysMs: [0, 1, 2], sleeper: async () => {}, credentials: async () => ({ baseUrl: "https://api-platform.cvent.com/ea", clientId: "dummy", clientSecret: "dummy" }),
    clientFactory: async () => ({ getEvent: async () => ({ ...event, ...options.event }) }),
    fetcher: async (value, init = {}) => {
      const u = new URL(value), method = init.method || "GET", root = `/ea/events/${eventId}/discounts`;
      if (u.pathname.endsWith("/oauth2/token")) return json({ access_token: "dummy" });
      if (u.pathname === "/ea/admission-items") {
        assert.equal(method, "GET"); assert.equal(u.searchParams.get("filter"), `event.id eq '${eventId}'`);
        return json({ data: options.missingItem ? [] : [{ id: itemId, event: { id: options.foreignItem ? itemId : eventId } }] });
      }
      if (u.pathname === root + "/agenda-items") {
        assert.equal(method, "GET");
        return json({ data: options.badLinks ? [{}] : options.staleLinks ? [] : links });
      }
      if (method === "GET") {
        assert.equal(u.pathname, root);
        if (!u.searchParams.has("filter") && ++scans === 2 && options.concurrent) row = existing();
        if (options.wrongRead && writes.length) return json({ data: [{ ...row, type: "DISCOUNT_CODE" }] });
        const rows = options.stale ? [] : [...otherRows, ...(row ? options.duplicate ? [row, row] : [row] : [])];
        return json({ data: u.searchParams.has('filter') ? rows.filter(r => u.searchParams.get('filter') === `id in ('${r.id}')`) : rows });
      }
      assert.equal(intents.length, writes.length + 1);
      const phase = method === "POST" ? "create" : u.pathname.includes("/agenda-items/") ? "link" : "finalize";
      const body = init.body ? JSON.parse(init.body) : null;
      writes.push({ phase, method, body, path: u.pathname });
      if (options.fail === phase) return json({ message: "Denied" }, 403);
      if (options.loss === phase) throw new Error("Connection lost");
      if (phase === "link") {
        assert.equal(u.pathname, `${root}/${id}/agenda-items/${itemId}`); assert.equal(method, "PUT"); assert.equal(row.active, false);
        links.push({ ...item, discount: { id } }); return new Response(null, { status: 204 });
      }
      assert.equal(u.pathname, phase === "create" ? root : `${root}/${id}`);
      assert.equal(body.type, "VOLUME_DISCOUNT"); assert.equal(body.code, undefined); assert.equal(body.capacity, undefined); assert.equal(body.applyToAllAgendaItems, undefined);
      const saved = { ...body, id, level: "EVENT" };
      if (!(phase === "finalize" && options.staleFinal)) row = saved;
      return json(options.wrongAck ? { ...saved, id: itemId } : saved, phase === "create" ? 201 : 200);
    } });
  return { writes, intents, evidence, get row() { return row; }, otherRows, run: (data = input(), stopAt) => api.execute(target, "configureVolumeDiscount", data, async p => { if (p.phase === stopAt && stopAt) throw new Error("Stop/takeover"); intents.push(p); }, async e => evidence.push(e)) };
}
test("volume creation supports all documented threshold types and independent readback", async () => {
  for (const thresholdType of ["ALL", "AFTER_THRESHOLD_LIMIT", "BEFORE_THRESHOLD_LIMIT", "EVERY_NTH_REGISTRANT"]) {
    const f = fixture(), data = input(); data.patch.thresholdType = thresholdType;
    if (thresholdType === "BEFORE_THRESHOLD_LIMIT") data.patch.includePrimaryRegistrant = true;
    if (thresholdType === "EVERY_NTH_REGISTRANT") data.patch.interval = 3;
    data.patch.effectiveFrom = "2027-01-01"; data.patch.effectiveTo = "2027-03-01";
    const result = await f.run(data); assert.equal(result.action, "created"); assert.equal(result.requirementsSatisfied, true);
    assert.equal(f.writes.length, 1); assert.equal(f.evidence.at(-1).matched, true);
    assert.equal((await f.run(data)).action, "unchanged"); assert.equal(f.writes.length, 1);
  }
});
test("volume initial item configuration shares inactive creation/link/finalize preservation guards", async () => {
  const f = fixture(), data = { ...input(), agendaItems: [item] };
  const result = await f.run(data); assert.equal(result.initialConfigurationComplete, true); assert.equal(result.saved.active, true);
  assert.deepEqual(f.writes.map(w => w.phase), ["create", "link", "finalize"]); assert.equal(f.writes[0].body.active, false);
  assert.equal((await f.run(data)).action, "unchanged");
  const difference = await f.run(input()); assert.equal(difference.requirementsSatisfied, true); assert.deepEqual(difference.differences, []);
  assert.equal(f.writes.length, 3);
});
test("existing event volume differences use a verified update, not duplicate creation", async () => {
  const f = fixture({ row: existing() }), data = input(); data.patch.method.value = 25;
  const result = await f.run(data); assert.equal(result.action, "updated"); assert.equal(result.requirementsSatisfied, true);
  assert.equal(f.row.method.value, 25); assert.equal(f.writes.length, 1); assert.equal(f.writes[0].method, 'PUT');
});
test("volume identity collisions, incomplete catalogs and drift fail before intent", async () => {
  for (const options of [{ row: existing(), duplicate: true }, { row: { ...existing(), level: "ACCOUNT" } }, { row: { ...existing(), type: "DISCOUNT_CODE", code: "GROUP" } }, { row: { ...existing(), name: null } }, { concurrent: true }, { badLinks: true }, { event: { status: "Active" } }, { event: { title: "Wrong target" } }]) {
    const f = fixture(options); await assert.rejects(f.run()); assert.equal(f.writes.length, 0); assert.equal(f.intents.length, 0);
  }
});
test("different RR spelling creates a separate volume rule despite identical terms; originals and reruns are preserved", async () => {
  for (const name of ['Group ratE', 'Group rate1', 'Group  rate']) {
    const original = { ...existing(), id: '44444444-4444-4444-4444-444444444444' };
    const f = fixture({ otherRows: [original] }), data = { ...input(), name };
    const result = await f.run(data);
    assert.equal(result.action, 'created'); assert.equal(result.saved.name, name);
    assert.equal(f.writes.length, 1); assert.deepEqual(f.otherRows, [original]);
    assert.equal((await f.run(data)).action, 'unchanged'); assert.equal(f.writes.length, 1);
  }
});
test("volume fields are bounded, explicit and reject code-only or arbitrary eligibility settings", async () => {
  for (const change of [{ thresholdLimit: 0 }, { thresholdLimit: 1.5 }, { thresholdType: "INVENTED" }, { interval: 11 }, { interval: 2 }, { includePrimaryRegistrant: true }, { active: null }, { method: { type: "BY_PERCENTAGE", value: 101 } }, { effectiveFrom: "2027-02-30" }, { effectiveFrom: "2027-03-01", effectiveTo: "2027-01-01" }, { autoApply: true }, { capacity: { total: 50 } }, { name: "Rename" }, { registrationTypeIds: [itemId] }]) {
    const f = fixture(); await assert.rejects(f.run({ ...input(), patch: { ...patch, ...change } })); assert.equal(f.writes.length, 0);
  }
  for (const key of ["active", "stackable", "method", "thresholdType", "thresholdLimit", "interval", "includePrimaryRegistrant"]) {
    const f = fixture(), data = input(); delete data.patch[key]; await assert.rejects(f.run(data)); assert.equal(f.writes.length, 0);
  }
  for (const data of [{ ...input(), discountId: id }, { ...input(), code: "BAD" }, { ...input(), createIfMissing: false }, { ...input(), agendaItems: [] }, { ...input(), agendaItems: [{ ...item, type: "Session" }] }]) {
    const f = fixture(); await assert.rejects(f.run(data)); assert.equal(f.writes.length, 0);
  }
});
test("volume failure, stale state, wrong identity and takeover never replay mutations", async () => {
  for (const options of [{ fail: "create" }, { loss: "create" }, { stale: true }, { wrongRead: true }, { wrongAck: true }, { fail: "link" }, { loss: "link" }, { staleLinks: true }, { fail: "finalize" }, { staleFinal: true }, { missingItem: true }, { foreignItem: true }]) {
    const f = fixture(options); await assert.rejects(f.run({ ...input(), agendaItems: [item] }));
    assert.equal(new Set(f.writes.map(w => w.method + w.path)).size, f.writes.length); assert.ok(f.writes.length <= 3);
  }
  for (const phase of ["LINK_NEW_DISCOUNT_ITEM", "FINALIZE_NEW_DISCOUNT"]) {
    const f = fixture(); await assert.rejects(f.run({ ...input(), agendaItems: [item] }, phase), /Stop/); assert.equal(f.row.active, false);
    assert.equal(f.writes.length, phase === "LINK_NEW_DISCOUNT_ITEM" ? 1 : 2);
  }
});
