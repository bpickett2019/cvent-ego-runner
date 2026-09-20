import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CventConnection, loadCredentials, includesRequested, buildEventUpdate, verifyEventUpdate } from "../app/cvent-api.mjs";
import { SteelEgoHost } from "../ego-bridge/host.mjs";

const id = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const credentials = { baseUrl: "https://api-platform.cvent.com/ea", clientId: "private-id", clientSecret: "private-secret" };
const target = { apiEventId: id, name: "Approved Event" };
const writeTarget = { ...target, name: "(C+D) Approved Event" };
const baseline = () => ({ id, title: writeTarget.name, status: "Pending", format: "In-person", timezone: "America/New_York", type: "Conference", languages: ["en-US"], planners: [{ firstName: "A", lastName: "Planner" }], capacity: 10, note: "Original", closeAfter: "2030-01-01T00:00:00.000Z", archiveAfter: "2031-01-01T00:00:00.000Z", customFields: [{ id: "preserved" }], lastModified: "2026-01-01T00:00:00.000Z" });
const response = value => new Response(JSON.stringify(value), { status: 200 });
function api(options = {}) { return new CventConnection({ credentials: async () => credentials, intervalMs: 0, ...options }); }

test("API credentials fail closed without secret values and require a Cvent HTTPS endpoint", async () => {
  await assert.rejects(loadCredentials({}), /credentials are not configured/);
  await assert.rejects(loadCredentials({ CVENT_CLIENT_ID: "id", CVENT_CLIENT_SECRET: "secret", CVENT_API_BASE_URL: "https://attacker.example/ea" }), /approved HTTPS/);
  const got = await loadCredentials({ CVENT_CLIENT_ID: "id", CVENT_CLIENT_SECRET: "secret", CVENT_API_BASE_URL: credentials.baseUrl });
  assert.equal(got.clientId, "id");
});
test("API name lookup authenticates first, paginates and retains duplicate identities", async () => {
  const requests = [];
  const connection = api({ fetcher: async (url, init) => {
    requests.push({ url: String(url), method: init.method || "GET" });
    assert.equal(init.redirect, "error");
    if (String(url).endsWith("oauth2/token")) {
      assert.equal(init.body.get("client_id"), credentials.clientId);
      return response({ access_token: "private-token" });
    }
    if (new URL(url).searchParams.has("token")) return response({ data: [{ id: other, title: "Approved Event" }] });
    return response({ data: [{ id, title: "Approved Event" }, { id: "unrelated", title: "Another Event" }], paging: { nextToken: "next" } });
  } });
  const matches = await connection.findEvents("Approved Event");
  assert.deepEqual(matches.map(match => match.id), [id, other]);
  assert.equal(requests[0].method, "POST");
  assert.ok(requests.slice(1).every(request => request.method === "GET"));
});
test("API lookup never follows cross-origin pagination or treats auth failure as unsupported", async () => {
  let calls = 0;
  const connection = api({ fetcher: async () => ++calls === 1 ? response({ access_token: "private-token" }) : response({ data: [], paging: { _links: { next: { href: "https://attacker.example/ea/events" } } } }) });
  await assert.rejects(connection.findEvents("Approved Event"), /Unsafe/);
  assert.equal(calls, 2);
  const denied = api({ fetcher: async () => new Response("secret response body", { status: 403 }) });
  await assert.rejects(denied.findEvents("Approved Event"), error => error.status === 403 && !error.message.includes("secret response body"));
});
test("validation diagnostics retain arbitrary API error shapes with credentials redacted", async () => {
  const connection = api({ fetcher: async () => new Response(JSON.stringify({ error: { detail: `invalid ${credentials.clientId} / ${credentials.clientSecret} / private-token`, clientSecret: "other-hidden-value" } }), { status: 400, headers: { "x-request-id": "request-1" } }) });
  await assert.rejects(connection.transport(`${credentials.baseUrl}/events/${id}`, { method: "PUT", headers: { authorization: "Bearer private-token" } }), error => {
    assert.equal(error.status, 400);
    assert.equal(error.diagnostic.requestId, "request-1");
    assert.equal(error.diagnostic.validation.error.detail, "invalid [redacted] / [redacted] / [redacted]");
    assert.equal(error.diagnostic.validation.error.clientSecret, "[redacted]");
    assert.ok(!error.message.includes("private"));
    return true;
  });
  await assert.rejects(connection.transport(`${credentials.baseUrl}/oauth2/token`, { method: "POST" }), error => error.status === 400 && error.diagnostic.validation === undefined);
});
test("reused client fetch is restricted to this event and excludes publish/delete/send", async () => {
  let scoped, calls = 0;
  const connection = api({ clientFactory: async (_credentials, fetcher) => { scoped = fetcher; return {}; }, fetcher: async () => { calls++; return response({}); } });
  await connection.client(id);
  for (const [path, method] of [[`/events/${other}`, "GET"], [`/events/${id}/features/Website/launch`, "POST"], [`/events/${id}`, "DELETE"], [`/events/${id}`, "PATCH"], ["/emails", "POST"]]) {
    await assert.rejects(scoped(credentials.baseUrl + path, { method }), /scope/);
  }
  await assert.rejects(scoped(`https://attacker.example/ea/events/${id}`), /endpoint/);
  assert.equal(calls, 0);
  await scoped(`${credentials.baseUrl}/events/${id}`);
  assert.equal(calls, 1);
});
const collectionRoutes = {
  listAdmissionItems: ["/admission-items", true],
  listRegistrationPaths: [`/events/${id}/registration-paths`, false],
  listRegistrationTypes: [`/events/${id}/registration-types`, false],
  listQuestions: ["/event-questions", true],
  listSessions: ["/sessions", true],
  listFees: [`/events/${id}/fee-items`, false],
  listVouchers: [`/events/${id}/vouchers`, false],
  listDiscounts: [`/events/${id}/discounts`, false],
  listDiscountedAgendaItems: [`/events/${id}/discounts/agenda-items`, false],
};
test("all collection operations use official routes and retain event scope across empty pages", async () => {
  for (const [operation, [path, filtered]] of Object.entries(collectionRoutes)) {
    const cursors = [];
    const connection = api({ fetcher: async (input, init) => {
      const url = new URL(input);
      assert.equal(init.redirect, "error");
      if (url.pathname.endsWith("oauth2/token")) return response({ access_token: "private-token", expires_in: 3600 });
      assert.equal(init.method || "GET", "GET");
      if (url.pathname === `/ea/events/${id}`) return response(baseline());
      assert.equal(url.pathname, `/ea${path}`, operation);
      assert.equal(url.searchParams.get("filter"), filtered ? `event.id eq '${id}'` : null);
      assert.equal(url.searchParams.has("eventId"), false);
      assert.equal(url.searchParams.get("limit"), "100");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer private-token");
      const cursor = url.searchParams.get("token"); cursors.push(cursor);
      if (cursor === null) return response({ data: [{ id: "first", event: { id } }], paging: { nextToken: "next /+" } });
      if (cursor === "next /+") return response({ data: [], paging: { nextToken: "last" } });
      assert.equal(cursor, "last");
      return response({ data: [{ id: "last", event: { id } }], paging: {} });
    } });
    assert.deepEqual((await connection.execute(target, operation)).map(item => item.id), ["first", "last"]);
    assert.deepEqual(cursors, [null, "next /+", "last"]);
  }
});
test("collection scope rejects stale routes, wrong events and ambiguous query parameters", async () => {
  let scoped, calls = 0;
  const connection = api({ clientFactory: async (_credentials, fetcher) => { scoped = fetcher; return {}; }, fetcher: async () => { calls++; return response({ data: [] }); } });
  await connection.client(id);
  const filter = encodeURIComponent(`event.id eq '${id}'`);
  for (const path of [
    `/questions?filter=${filter}`, `/fees?eventId=${id}`, `/vouchers?eventId=${id}`,
    `/events/${other}/fee-items`, `/events/${other}/vouchers`, "/event-questions",
    `/event-questions?filter=${encodeURIComponent(`event.id eq '${other}'`)}`,
    `/event-questions?filter=${filter}&filter=${encodeURIComponent(`event.id eq '${other}'`)}`,
    `/events/${id}/fee-items?eventId=${other}`, `/events/${id}/vouchers?token=one&token=two`,
  ]) await assert.rejects(scoped(credentials.baseUrl + path), /scope/);
  assert.equal(calls, 0);
  for (const [path, filtered] of Object.values(collectionRoutes)) await scoped(credentials.baseUrl + path + (filtered ? `?filter=${filter}` : ""));
  assert.equal(calls, Object.keys(collectionRoutes).length);
});
test("collection pagination validates links and never exposes partial results after malformed pages", async () => {
  const first = new URL(`${credentials.baseUrl}/event-questions`);
  first.searchParams.set("limit", "100"); first.searchParams.set("filter", `event.id eq '${id}'`);
  const next = new URL(first); next.searchParams.set("token", "next");
  const foreign = new URL(next); foreign.searchParams.set("filter", `event.id eq '${other}'`);
  const doubled = new URL(next); doubled.searchParams.append("filter", `event.id eq '${other}'`);
  const cases = [
    { paging: {} }, { data: null }, { data: [null] }, { data: ["invalid"] },
    { data: [{ event: { id: other } }] },
    { data: [], paging: { nextToken: { invalid: true } } },
    { data: [], paging: { nextToken: "next" } }, // Repeated cursor on page two.
    ...["https://attacker.example/ea/event-questions?token=x", `${credentials.baseUrl}/events/${other}/vouchers?token=x`, foreign.href, doubled.href, `${next.href}#fragment`].map(href => ({ data: [], paging: { _links: { next: { href } } } })),
    { data: [], paging: { nextToken: "different", _links: { next: { href: next.href } } } },
  ];
  for (const badPage of cases) {
    let pages = 0;
    const connection = api({ fetcher: async url => {
      if (new URL(url).pathname.endsWith("oauth2/token")) return response({ access_token: "private-token" });
      pages++;
      return response(pages === 1 ? { data: [{ id: "partial" }], paging: { nextToken: "next" } } : badPage);
    } });
    await assert.rejects(connection.readCollection(id, "listQuestions"));
    assert.equal(pages, 2, "unsafe third request must never be sent");
  }
  let pages = 0;
  const valid = api({ fetcher: async url => {
    if (new URL(url).pathname.endsWith("oauth2/token")) return response({ access_token: "private-token" });
    return response(++pages === 1 ? { data: [], paging: { _links: { next: { href: next.href } } } } : { data: [{ id: "saved" }] });
  } });
  assert.deepEqual(await valid.readCollection(id, "listQuestions"), [{ id: "saved" }]);
});
test("Cvent token-only next links retain original filters and limits, like the official SDK", async () => {
  for (const includeNextToken of [true, false]) {
    let pages = 0;
    const connection = api({ fetcher: async input => {
      const url = new URL(input);
      if (url.pathname.endsWith("oauth2/token")) return response({ access_token: "private-token" });
      assert.equal(url.searchParams.get("filter"), `event.id eq '${id}'`);
      assert.equal(url.searchParams.get("limit"), "100");
      if (++pages === 1) return response({ data: [{ id: "first" }], paging: { ...(includeNextToken ? { nextToken: "next" } : {}), _links: { next: { href: `${credentials.baseUrl}/event-questions?token=next` } } } });
      assert.equal(url.searchParams.get("token"), "next");
      return response({ data: [{ id: "second" }] });
    } });
    assert.deepEqual((await connection.readCollection(id, "listQuestions")).map(item => item.id), ["first", "second"]);
    assert.equal(pages, 2);
  }
});
test("collection reads bound pagination and preserve HTTP failures without retries", async () => {
  let pages = 0;
  const endless = api({ fetcher: async url => {
    if (new URL(url).pathname.endsWith("oauth2/token")) return response({ access_token: "private-token" });
    return response({ data: [], paging: { nextToken: String(++pages) } });
  } });
  await assert.rejects(endless.readCollection(id, "listFees"), /bounded page limit/);
  assert.equal(pages, 200);
  for (const status of [401, 403, 404, 429, 500]) {
    let attempts = 0;
    const denied = api({ fetcher: async url => {
      if (new URL(url).pathname.endsWith("oauth2/token")) return response({ access_token: "private-token" });
      attempts++;
      return new Response(JSON.stringify({ error: { message: "Read refused" } }), { status });
    } });
    await assert.rejects(denied.readCollection(id, "listVouchers"), error => error.status === status);
    assert.equal(attempts, 1);
  }
});
test("API write records intent before mutation and requires authoritative readback", async () => {
  const calls = []; let saved = false;
  const connection = api({ clientFactory: async () => ({
    getEvent: async () => { calls.push("read"); return { ...baseline(), capacity: saved ? 50 : 10 }; },
    updateEventBasics: async (_id, body) => { calls.push("write"); assert.equal(body.closeAfter, baseline().closeAfter); assert.equal(body.archiveAfter, baseline().archiveAfter); saved = true; },
  }) });
  const result = await connection.execute(writeTarget, "updateEvent", { capacity: 50 }, async () => calls.push("intent"));
  assert.deepEqual(calls, ["read", "read", "intent", "write", "read"]);
  assert.equal(result.verified, true);
  assert.equal(result.method, "PUT");
  await assert.rejects(connection.execute(writeTarget, "updateEvent", { status: "Active" }), /prohibited/);
  const stale = api({ clientFactory: async () => ({ getEvent: async () => baseline(), updateEventBasics: async () => {} }) });
  await assert.rejects(stale.execute(writeTarget, "updateEvent", { capacity: 50 }), /did not verify/);
});
test("event PUT merges fresh fields without permitting scheduling, renaming or guard bypass", () => {
  const before = baseline();
  const body = buildEventUpdate(before, { note: "Test" });
  assert.equal(body.note, "Test");
  assert.equal(body.closeAfter, before.closeAfter);
  assert.equal(body.archiveAfter, before.archiveAfter);
  assert.equal(body.customFields, undefined);
  assert.equal(body.status, undefined);
  body.planners[0].firstName = "Changed";
  assert.equal(before.planners[0].firstName, "A");
  for (const changes of [{}, [], { closeAfter: before.closeAfter }, { archiveAfter: before.archiveAfter }, { launchAfter: null }, { status: "Active" }]) assert.throws(() => buildEventUpdate(before, changes), /prohibited/);
  assert.throws(() => buildEventUpdate(before, { title: "(C+D) Renamed" }), /existing event title/);
  assert.throws(() => buildEventUpdate({ ...before, title: target.name }, { note: "Test" }), /only \(C\+D\)/);
  assert.throws(() => buildEventUpdate({ ...before, planners: undefined }, { note: "Test" }), /required PUT fields/);
  assert.throws(() => buildEventUpdate({ ...before, end: "2029-01-01T00:00:00.000Z" }, { note: "Test" }), /registration deadline is after/);
});
test("invalid preserved registration scheduling blocks before intent or mutation", async () => {
  let writes = 0, intents = 0;
  const connection = api({ clientFactory: async () => ({ getEvent: async () => ({ ...baseline(), end: "2029-01-01T00:00:00.000Z" }), updateEventBasics: async () => { writes++; } }) });
  await assert.rejects(connection.execute(writeTarget, "updateEvent", { note: "Test" }, async () => { intents++; }), /registration deadline is after/);
  assert.equal(writes, 0); assert.equal(intents, 0);
});
test("event PUT verifies all unrequested state, allowing only normal audit changes", () => {
  const before = baseline();
  const after = { ...before, note: "Test", lastModified: "2026-02-01T00:00:00.000Z", lastModifiedBy: "API" };
  verifyEventUpdate(before, after, { note: "Test" });
  for (const changes of [{ closeAfter: null }, { archiveAfter: null }, { customFields: [] }, { status: "Active" }, { capacity: 99 }]) assert.throws(() => verifyEventUpdate(before, { ...after, ...changes }, { note: "Test" }), /unrequested field/);
});
test("event PUT refuses a baseline changed during preparation before recording write intent", async () => {
  let reads = 0, writes = 0, intents = 0;
  const connection = api({ clientFactory: async () => ({ getEvent: async () => ({ ...baseline(), note: ++reads === 1 ? "Original" : "Human edit" }), updateEventBasics: async () => { writes++; } }) });
  await assert.rejects(connection.execute(writeTarget, "updateEvent", { note: "Test" }, async () => { intents++; }), /changed during/);
  assert.equal(writes, 0); assert.equal(intents, 0);
});
test("installed clients use PUT (not PATCH), preserve scheduling and independently read back", async () => {
  for (const operation of ["updateEvent", "updateEventBasics"]) {
    let state = baseline(), intent = false;
    const requests = [];
    const connection = api({ fetcher: async (url, init) => {
      const method = init.method || "GET", path = new URL(url).pathname;
      requests.push({ method, path });
      if (path.endsWith("oauth2/token")) return response({ access_token: "private-token", expires_in: 3600 });
      assert.equal(path, `/ea/events/${id}`);
      if (method === "PUT") {
        assert.equal(intent, true);
        const body = JSON.parse(init.body);
        assert.equal(body.closeAfter, state.closeAfter);
        assert.equal(body.archiveAfter, state.archiveAfter);
        assert.equal(body.customFields, undefined);
        state = { ...state, ...body, lastModified: "2026-02-01T00:00:00.000Z" };
      } else assert.equal(method, "GET");
      return response(state);
    } });
    const result = await connection.execute(writeTarget, operation, { note: "Test" }, async () => { intent = true; });
    assert.equal(result.verified, true);
    assert.equal(result.saved.note, "Test");
    assert.equal(result.write.receipt.method, "PUT");
    assert.equal(requests.filter(request => request.method === "PUT").length, 1);
    assert.equal(requests.at(-1).method, "GET");
    assert.ok(!requests.some(request => request.method === "PATCH"));
  }
});
test("installed client last-moment guard rejects concurrent changes without a PUT", async () => {
  let state = baseline(), puts = 0;
  const connection = api({ fetcher: async (url, init) => {
    if (new URL(url).pathname.endsWith("oauth2/token")) return response({ access_token: "private-token", expires_in: 3600 });
    if (init.method === "PUT") puts++;
    return response(state);
  } });
  await assert.rejects(connection.execute(writeTarget, "updateEvent", { note: "Test" }, async () => { state = { ...state, capacity: 42 }; }), /changed immediately before PUT/);
  assert.equal(puts, 0);
});
test("installed registration-type client writes scoped capacity and verifies readback", async () => {
  let row = { id: other, event: { id }, name: "Test registration type", openForRegistration: true, capacity: { total: 100, consumed: 0, remaining: 100 } };
  let intent = false, puts = 0;
  const connection = api({ fetcher: async (input, init) => {
    const path = new URL(input).pathname, method = init.method || "GET";
    if (path.endsWith("oauth2/token")) return response({ access_token: "private-token", expires_in: 3600 });
    if (path === `/ea/events/${id}`) { assert.equal(method, "GET"); return response(baseline()); }
    if (path === `/ea/events/${id}/registration-types`) { assert.equal(method, "GET"); return response({ data: [row] }); }
    assert.equal(path, `/ea/events/${id}/registration-types/${other}`);
    assert.equal(method, "PUT"); assert.equal(intent, true); puts++;
    assert.deepEqual(JSON.parse(init.body), { id: other, openForRegistration: true, capacity: { total: 101 } });
    row = { ...row, capacity: { total: 101, consumed: 0, remaining: 101 } };
    return response(row);
  } });
  const result = await connection.execute(writeTarget, "updateRegistrationType", { registrationTypeId: other, patch: { openForRegistration: true, capacity: { total: 101 } } }, async () => { intent = true; });
  assert.equal(puts, 1);
  assert.equal(result.receipt.method, "PUT");
  assert.equal(result.polls.at(-1).matched, true);
  assert.equal((await connection.execute(writeTarget, "listRegistrationTypes"))[0].capacity.total, 101);
});
test("installed custom-field client PUTs an identified field and verifies saved values", async () => {
  const field = { id: other, name: "Disposable test field", type: "FreeText", value: ["Original"] };
  let state = { ...baseline(), customFields: [field] }, intent = false, puts = 0;
  const connection = api({ fetcher: async (input, init) => {
    const path = new URL(input).pathname, method = init.method || "GET";
    if (path.endsWith("oauth2/token")) return response({ access_token: "private-token", expires_in: 3600 });
    if (path === `/ea/events/${id}`) { assert.equal(method, "GET"); return response(state); }
    assert.equal(path, `/ea/events/${id}/custom-fields/${other}/answers`);
    assert.equal(method, "PUT"); assert.equal(intent, true); puts++;
    assert.deepEqual(JSON.parse(init.body), { id: other, type: "FreeText", value: ["Test"] });
    state = { ...state, customFields: [{ ...field, value: ["Test"] }] };
    return response(state.customFields[0]);
  } });
  const result = await connection.execute(writeTarget, "updateEventCustomFieldAnswers", { fields: [{ ...field, value: ["Test"] }] }, async () => { intent = true; });
  assert.equal(puts, 1);
  assert.equal(result.fields[0].verified, true);
  assert.equal(result.fields[0].write.method, "PUT");
  assert.deepEqual((await connection.execute(writeTarget, "getEvent")).customFields[0].value, ["Test"]);
});
test("API guards block wrong identity, published targets and unknown methods without writes", async () => {
  let writes = 0;
  for (const event of [{ id: other, title: target.name, status: "Pending" }, { id, title: "Wrong Name", status: "Pending" }, { id, title: target.name, status: "Active" }]) {
    const connection = api({ clientFactory: async () => ({ getEvent: async () => event, updateEvent: async () => { writes++; } }) });
    await assert.rejects(connection.execute(target, "updateEvent", { capacity: 50 }));
  }
  await assert.rejects(api().execute(target, "publishEvent"), /not exposed/);
  assert.equal(writes, 0);
});
test("API reads can reconcile a renamed event without authorizing a write", async () => {
  const connection = api({ clientFactory: async () => ({ getEvent: async () => ({ id, title: "Renamed Event", status: "Pending" }) }) });
  assert.equal((await connection.execute(target, "getEvent")).title, "Renamed Event");
  await assert.rejects(connection.execute(target, "updateEvent", { capacity: 50 }), /differs/);
  assert.equal(includesRequested({ nested: { value: [1, 2] } }, { nested: { value: [1, 2] } }), true);
  assert.equal(includesRequested({ nested: { value: [1] } }, { nested: { value: [1, 2] } }), false);
});
test("an uncertain API write blocks Steel UI mutation, not read-only observation", async t => {
  const dir = await mkdtemp(join(tmpdir(), "rr-api-guard-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runtimePath = join(dir, "runtime.json");
  await writeFile(runtimePath, JSON.stringify({ ownership: "AGENT" }));
  await writeFile(join(dir, "api-write-uncertain.json"), JSON.stringify({ receiptId: "uncertain" }));
  const host = new SteelEgoHost({ setExternalSink() {} }, runtimePath);
  await assert.rejects(host.assertOperationAllowed({ method: "Input.dispatchMouseEvent", params: { x: 1, y: 1 } }), /API write is uncertain/);
  await host.assertOperationAllowed({ method: "Runtime.evaluate", params: { expression: "document.title" } });
});
