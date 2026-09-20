// Explicit read-only scope audit; never run as part of npm test.
// CVENT_CREDENTIALS_FILE=... node test/live-api-scope-audit.mjs
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { CventConnection, ApiFailure } from "../app/cvent-api.mjs";

const target = { apiEventId: "e712e34c-6117-4d13-bf4c-8ed54cf2b495", name: "(C+D) Medtrade Testing Clone 2" };
const eventPath = `/events/${target.apiEventId}`;
const root = join(homedir(), ".cvent-pi-agent/rr-runs");
await mkdir(root, { recursive: true, mode: 0o700 });
const dir = await mkdtemp(join(root, "api-scope-audit-"));
const save = (name, data) => writeFile(join(dir, name), JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
const paths = new Map([
  [eventPath, false], ["/admission-items", true], ["/event-questions", true],
  ...["registration-paths", "registration-types", "fee-items", "vouchers", "discounts", "discounts/agenda-items", "quantity-items", "donation-items", "features"].map(p => [`${eventPath}/${p}`, false]),
]);
const http = [], results = [];
let operation = "preflight", auth, questions = [];
const api = new CventConnection({ fetcher: async (input, init) => {
  const url = new URL(input), method = (init.method || "GET").toUpperCase();
  assert.ok(url.pathname.startsWith("/ea/"), "Expected Cvent API prefix");
  const path = url.pathname.slice(3);
  if (!(method === "POST" && path === "/oauth2/token")) {
    assert.equal(method, "GET", "Scope audit forbids all Cvent mutations");
    assert.ok(paths.has(path), "Request must use an approved event-scoped read route");
    assert.ok([...url.searchParams.keys()].every(k => ["limit", "token", "filter"].includes(k)), "Unexpected query parameter");
    assert.ok([...url.searchParams.keys()].every(k => url.searchParams.getAll(k).length === 1), "Repeated parameter");
    if (paths.get(path)) assert.equal(url.searchParams.get("filter"), `event.id eq '${target.apiEventId}'`, "Exact event filter required");
    else assert.ok(!url.searchParams.has("filter"), "Unexpected filter on event-scoped path");
  }
  const response = await fetch(input, init);
  http.push({ operation, method, path: url.pathname, status: response.status, requestId: response.headers.get("x-request-id") || response.headers.get("x-cvent-request-id") });
  await save("http-receipts.json", http);
  return response;
} });
const summary = { target, startedAt: new Date().toISOString(), phase: "READ_AUDIT", results, mutations: 0, paidRRExecution: false, choicesExcludedForSessions: 0 };
await save("summary.json", summary);
async function readPages(path) {
  assert.ok(paths.has(path));
  const first = new URL(auth.credentials.baseUrl + path);
  first.searchParams.set("limit", "100");
  const records = [], seen = new Set();
  let token;
  for (let i = 0; i < 200; i++) {
    assert.ok(!seen.has(token || ""), "Repeated pagination cursor");
    seen.add(token || "");
    const url = new URL(first);
    if (token) url.searchParams.set("token", token);
    const response = await api.transport(url, { headers: { authorization: `Bearer ${auth.token}`, accept: "application/json" } });
    const body = await response.json();
    assert.ok(Array.isArray(body.data), "Expected a collection, not partial success");
    assert.ok(body.data.every(item => item && typeof item === "object" && !Array.isArray(item)), "Invalid record");
    assert.ok(body.data.every(item => item.event?.id == null || item.event.id === target.apiEventId), "Wrong-event record");
    records.push(...body.data);
    token = body.paging?.nextToken;
    assert.ok(token == null || typeof token === "string", "Invalid cursor");
    const href = body.paging?._links?.next?.href ?? body._links?.next?.href;
    if (href != null) {
      assert.ok(typeof href === "string" && href.length > 0, "Invalid pagination link");
      const linked = new URL(href, url);
      assert.ok(linked.origin === first.origin && linked.pathname === first.pathname && !linked.username && !linked.password && !linked.hash, "Foreign pagination link");
      assert.ok([...linked.searchParams].every(([key, value]) => linked.searchParams.getAll(key).length === 1 && (key === "token" || value === first.searchParams.get(key))), "Conflicting pagination scope");
      const next = linked.searchParams.get("token");
      assert.ok(next && (!token || next === token), "Inconsistent pagination cursor");
      token = next;
    }
    if (!token) return records;
  }
  throw new Error("Bounded pagination exhausted; no partial success");
}
async function capture(name, action, file = `${name}.json`) {
  operation = name;
  try {
    const data = await action();
    await save(file, data);
    results.push({ operation: name, status: "PASS", ...(Array.isArray(data) ? { count: data.length } : {}) });
    await save("summary.json", summary);
    return data;
  } catch (error) {
    results.push({ operation: name, status: "BLOCKED", ...(error instanceof ApiFailure ? { httpStatus: error.status, message: error.message, diagnostic: error.diagnostic } : { message: "Local response/scope validation failed; no partial success" }) });
    await save("summary.json", summary);
    if ([401, 429].includes(error.status)) throw error;
    return null;
  }
}
try {
  const { event: before } = await api.assertTarget(target);
  await save("baseline.json", before);
  for (const name of ["getEvent", "listAdmissionItems", "listRegistrationPaths", "listRegistrationTypes", "listQuestions", "listFees", "listVouchers"]) {
    const value = await capture(name, () => api.execute(target, name));
    if (name === "listQuestions" && value) questions = value;
  }
  auth = await api.authenticate();
  for (const [name, path] of [["listDiscounts", "discounts"], ["listDiscountedAgendaItems", "discounts/agenda-items"], ["listQuantityItems", "quantity-items"], ["listDonationItems", "donation-items"], ["listEventFeatures", "features"]]) {
    await capture(name, () => readPages(`${eventPath}/${path}`));
  }
  const choiceQuestions = questions.filter(q => ["SingleChoice", "MultiChoice"].includes(q.type) && !q.session?.id);
  summary.choicesExcludedForSessions = questions.filter(q => ["SingleChoice", "MultiChoice"].includes(q.type) && q.session?.id).length;
  assert.ok(choiceQuestions.length <= 200, "Question probe bound exceeded");
  for (const q of choiceQuestions) {
    assert.equal(q.event?.id, target.apiEventId, "Question must belong to the approved event");
    assert.match(q.id, /^[0-9a-f-]{36}$/i);
    const path = `/event-questions/${q.id}/choices`;
    paths.set(path, false);
    await capture(`questionChoices:${q.id}`, () => readPages(path), `choices-${q.id}.json`);
  }
  operation = "final-state";
  const after = await api.execute(target, "getEvent");
  await save("after.json", after);
  assert.ok(isDeepStrictEqual(before, after), "Event changed during read-only audit");
  summary.eventUnchangedVerified = true;
  summary.phase = results.every(r => r.status === "PASS") ? "PASSED" : "COMPLETED_WITH_BLOCKERS";
} catch (error) {
  summary.phase = "BLOCKED";
  summary.error = error instanceof ApiFailure ? { httpStatus: error.status, message: error.message, diagnostic: error.diagnostic } : { message: "Preflight, scope or final-state validation failed" };
}
summary.finishedAt = new Date().toISOString();
await save("summary.json", summary);
console.log(JSON.stringify({ evidence: dir, phase: summary.phase, operations: results.filter(r => !r.operation.startsWith("questionChoices:")), choiceRequests: results.filter(r => r.operation.startsWith("questionChoices:")).length, choiceFailures: results.filter(r => r.operation.startsWith("questionChoices:") && r.status !== "PASS").length, eventUnchangedVerified: summary.eventUnchangedVerified, mutations: 0, error: summary.error }, null, 2));
if (summary.phase !== "PASSED") process.exitCode = 1;
