import assert from "node:assert/strict";
import test from "node:test";
import { CventConnection, CAPABILITIES } from "../app/cvent-api.mjs";

const eventId = "11111111-1111-1111-1111-111111111111";
const discountId = "22222222-2222-2222-2222-222222222222";
const otherId = "33333333-3333-3333-3333-333333333333";
const target = { apiEventId: eventId, name: "(C+D) Approved Event" };
const event = { id: eventId, title: target.name, status: "Pending" };
const credentials = { baseUrl: "https://api-platform.cvent.com/ea", clientId: "test-id", clientSecret: "test-secret" };
const baseline = () => ({ id: discountId, level: "EVENT", type: "DISCOUNT_CODE", name: "Test discount", code: "EXISTING", active: false, stackable: false, method: { type: "BY_PERCENTAGE", value: 10 }, note: "Original", audienceType: "ALL", includeGuestsTowardsCapacity: false, autoApply: false, applyToAllAgendaItems: false, capacity: { total: 100, used: 3 }, created: "2025-01-01", lastModified: "2026-01-01" });
const patch = { note: "Requested" };
const fullPatch = () => { const { id, level, type, code, created, lastModified, applyToAllAgendaItems, ...p } = baseline(); return { ...p, capacity: { total: 100 } }; };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function fixture(options = {}) {
  let rows = structuredClone(options.rows ?? [baseline()]), pending, polls = 0, scans = 0, intent = false;
  const writes = [], evidence = [], requests = [];
  const connection = new CventConnection({ credentials: async () => credentials, intervalMs: 0, discountPollDelaysMs: [0, 1, 2], sleeper: async () => {},
    clientFactory: async () => ({ getEvent: async () => structuredClone(options.event ?? event) }),
    fetcher: async (input, init) => {
      const url = new URL(input), method = init.method || "GET";
      assert.equal(url.origin, new URL(credentials.baseUrl).origin);
      assert.equal(init.redirect, "error"); requests.push({ method, path: url.pathname });
      if (url.pathname.endsWith("/oauth2/token")) return json({ access_token: "test-token" });
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer test-token");
      if (["PUT", "POST"].includes(method)) {
        assert.equal(intent, true, "intent must precede network mutation");
        assert.equal(url.pathname, `/ea/events/${eventId}/discounts${method === "PUT" ? `/${discountId}` : ""}`);
        const body = JSON.parse(init.body); writes.push({ method, body });
        if (options.writeError) return json({ message: "Denied" }, options.writeError);
        if (options.transportError) throw new Error("lost response");
        pending = method === "PUT" ? { ...rows.find(r => r.id === discountId), ...body, capacity: { ...rows[0].capacity, ...body.capacity }, lastModified: "2026-02-01" } : { ...body, id: otherId, level: "EVENT", capacity: { ...body.capacity, used: 0 } };
        Object.assign(pending, options.changedFields);
        return json(options.badAck ? {} : { ...pending, id: options.ackId ?? pending.id }, 201);
      }
      assert.equal(method, "GET"); assert.equal(url.pathname, `/ea/events/${eventId}/discounts`);
      assert.equal(url.searchParams.get("limit"), "100");
      if (url.searchParams.has("filter")) {
        polls++;
        assert.equal(url.searchParams.get("filter"), `id in ('${pending?.id ?? discountId}')`);
        if (options.readError) return json({ message: "Read denied" }, options.readError);
        if (pending && polls > (options.stalePolls ?? 1)) rows = [...rows.filter(r => r.id !== pending.id), pending];
        if (options.pollRows) return json({ data: options.pollRows });
        return json({ data: rows.filter(r => r.id === pending?.id) });
      }
      scans++;
      if (scans === 2 && options.concurrent) rows = options.concurrent(rows);
      if (pending && options.duplicateAfterWrite && polls > 0) return json({ data: [...rows, { ...pending, id: "44444444-4444-4444-4444-444444444444" }] });
      return json({ data: rows });
    } });
  return { connection, writes, evidence, requests, get polls() { return polls; },
    run: (input = { code: "EXISTING", patch }, hook) => connection.execute(target, "configureDiscount", input, async prepared => { if (hook) await hook(); intent = true; evidence.push({ prepared }); }, async value => evidence.push(value)) };
}

test("discount capabilities include safe reads and one explicit configure operation", () => {
  assert.equal(CAPABILITIES.listDiscounts, "api-read");
  assert.equal(CAPABILITIES.listDiscountedAgendaItems, "api-read");
  assert.equal(CAPABILITIES.configureDiscount, "api-write");
  assert.equal(CAPABILITIES.deleteDiscount, undefined);
});
test("existing code differences require creation, never silent reuse or an overwrite", async () => {
  const f = fixture(); const result = await f.run({ code: "existing", patch, createIfMissing: true });
  assert.equal(result.action, "creation-required");
  assert.match(result.limitation, /cannot create a second object with this identity/); assert.equal(result.requirementsSatisfied, false);
  assert.deepEqual(result.differences, ["note", "code"]);
  assert.deepEqual(result.saved, baseline());
  assert.equal(f.writes.length, 0); assert.equal(f.evidence.length, 0); assert.equal(f.polls, 0);
});
test("already-satisfied discounts are verified no-ops without intent or mutation", async () => {
  const f = fixture(); const r = await f.run({ code: "EXISTING", patch: { note: "Original" } });
  assert.equal(r.action, "unchanged"); assert.equal(r.verified, true);
  assert.equal(r.requirementsSatisfied, true); assert.deepEqual(r.differences, []);
  assert.equal(f.evidence.length, 0); assert.equal(f.writes.length, 0);
});
test("missing codes only create with explicit opt-in and complete fields; successful rerun deduplicates", async () => {
  const f = fixture({ rows: [] });
  const input = { code: "NEW", patch: fullPatch(), createIfMissing: true };
  const r = await f.run(input); assert.equal(r.action, "created"); assert.equal(r.discountId, otherId);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].method, "POST");
  assert.equal(f.writes[0].body.applyToAllAgendaItems, false);
  assert.equal(r.requirementsSatisfied, true);
  assert.equal(f.polls, 2); assert.equal(f.evidence[0].prepared.baseline, null);
  assert.equal(f.evidence[1].phase, "ACKNOWLEDGED_NOT_VERIFIED");
  assert.deepEqual(f.evidence.filter(e => e.phase === "READBACK").map(e => e.matched), [false, true]);
  assert.equal((await f.run(input)).action, "unchanged"); assert.equal(f.writes.length, 1);
  const changed = await f.run({ ...input, patch: { note: "A later conflicting requirement" } });
  assert.equal(changed.action, "creation-required"); assert.equal(changed.requirementsSatisfied, false);
  assert.equal(f.writes.length, 1, 'even a code created in this run must not be overwritten');
  for (const bad of [{ code: "NEW", patch }, { code: "NEW", patch, createIfMissing: true }]) {
    const denied = fixture({ rows: [] }); await assert.rejects(denied.run(bad)); assert.equal(denied.writes.length, 0);
  }
});
test("duplicate codes, account/volume scope, wrong IDs and concurrent edits block before intent", async () => {
  const cases = [
    { rows: [baseline(), { ...baseline(), id: otherId, code: "existing" }] },
    { rows: [baseline(), baseline()] },
    { rows: [{ ...baseline(), level: "ACCOUNT" }] },
    { rows: [{ ...baseline(), type: "VOLUME_DISCOUNT" }] },
    { rows: [{ ...baseline(), event: { id: otherId } }] },
    { rows: [{ ...baseline(), code: null }] },
    { rows: [{ ...baseline(), unknownSetting: true }] },
    { event: { ...event, status: "Active" } },
    { event: { ...event, title: "Wrong name" } },
  ];
  for (const options of cases) { const f = fixture(options); await assert.rejects(f.run()); assert.equal(f.writes.length, 0); assert.equal(f.evidence.length, 0); }
  const f = fixture(); await assert.rejects(f.run({ code: "EXISTING", discountId: otherId, patch }), /does not match/); assert.equal(f.writes.length, 0);
  const fresh = fixture({ rows: [], concurrent: () => [baseline()] });
  await assert.rejects(fresh.run({ code: "EXISTING", patch: fullPatch(), createIfMissing: true }), /changed during/); assert.equal(fresh.writes.length, 0);
});
test("discount validation refuses unknown/readonly fields, association edits, malformed dates and financial values", async () => {
  const patches = [ {}, { id: otherId }, { type: "VOLUME_DISCOUNT" }, { code: "RENAME" }, { level: "ACCOUNT" }, { sendEmail: true }, { applyToAllAgendaItems: true }, { method: { value: 10 } }, { method: { type: "BY_PERCENTAGE", value: 101 } }, { method: { type: "BY_AMOUNT", value: -1 } }, { method: { type: "BY_AMOUNT", value: "10" } }, { capacity: { total: 2 } }, { capacity: { total: 100, used: 0 } }, { capacity: { total: 40000 } }, { active: "false" }, { note: null }, { effectiveFrom: "2026-02-30" }, { effectiveFrom: "2027-01-01", effectiveTo: "2026-01-01" } ];
  for (const patch of patches) { const f = fixture(); await assert.rejects(f.run({ code: "EXISTING", patch })); assert.equal(f.writes.length, 0); }
});
test("bounded stale readback, unexpected preservation changes and duplicate final matches never trigger write retries", async () => {
  for (const options of [{ stalePolls: 99 }, { changedFields: { active: true } }, { duplicateAfterWrite: true }, { badAck: true }, { ackId: "not-a-uuid" }, { pollRows: [baseline(), baseline()] }]) {
    const f = fixture({ ...options, rows: [] }); await assert.rejects(f.run({ code: "NEW", patch: fullPatch(), createIfMissing: true })); assert.equal(f.writes.length, 1); assert.ok(f.polls <= 3);
  }
});
test("mutation and polling HTTP failures and transport loss remain failures without browser fallback/replay", async () => {
  for (const options of [...[400, 401, 403, 404, 429, 500].map(writeError => ({ writeError })), { transportError: true }, ...[401, 403, 429, 500].map(readError => ({ readError }))]) {
    const f = fixture({ ...options, rows: [] }); await assert.rejects(f.run({ code: "NEW", patch: fullPatch(), createIfMissing: true })); assert.equal(f.writes.length, 1);
    assert.equal(f.requests.filter(r => ["POST", "PUT"].includes(r.method) && !r.path.endsWith("oauth2/token")).length, 1);
  }
});
test("Stop/takeover at intent prevents discount dispatch", async () => {
  const f = fixture({ rows: [] }); await assert.rejects(f.run({ code: "NEW", patch: fullPatch(), createIfMissing: true }, async () => { throw new Error("ownership changed"); }), /ownership changed/);
  assert.equal(f.writes.length, 0);
});
test("filtered discount pagination retains exact UUID filter and rejects escaping links", async () => {
  for (const malicious of [false, true]) {
    let pages = 0;
    const connection = new CventConnection({ credentials: async () => credentials, intervalMs: 0, fetcher: async input => {
      const url = new URL(input);
      if (url.pathname.endsWith("oauth2/token")) return json({ access_token: "test-token" });
      assert.equal(url.searchParams.get("filter"), `id in ('${discountId}')`);
      if (++pages === 1) return json({ data: [], paging: { _links: { next: { href: `${credentials.baseUrl}/events/${eventId}/discounts?token=next${malicious ? "&filter=wrong" : ""}` } } } });
      return json({ data: [baseline()] });
    } });
    if (malicious) { await assert.rejects(connection.readCollection(eventId, "listDiscounts", discountId), /Unsafe/); assert.equal(pages, 1); }
    else { assert.equal((await connection.readCollection(eventId, "listDiscounts", discountId))[0].id, discountId); assert.equal(pages, 2); }
    await assert.rejects(connection.readCollection(eventId, "listVouchers", discountId));
  }
});
