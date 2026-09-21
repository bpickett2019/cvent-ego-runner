import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CventConnection } from "../app/cvent-api.mjs";
import { probeEmptyBulkJob, runBulkAccessProbe } from "../app/cvent-bulk-probe.mjs";

const eventId = "11111111-1111-1111-1111-111111111111", jobId = "22222222-2222-2222-2222-222222222222";
const target = { apiEventId: eventId, name: "(C+D) Test" };
const metadata = { id: jobId, url: `/events/${eventId}/discounts`, operation: "POST", status: "PENDING", totalRecords: 0, successful: 0, failed: 0 };
function fixture({ guard = async () => {}, createStatus = 201, readStatus = 200, create = metadata, saved = metadata } = {}) {
  const requests = [];
  const api = new CventConnection({ intervalMs: 0, mutationGuard: guard,
    credentials: async () => ({ baseUrl: "https://api-platform.cvent.com/ea", clientId: "dummy", clientSecret: "dummy-secret" }),
    clientFactory: async () => ({ getEvent: async () => ({ id: eventId, title: target.name, status: "Pending" }) }),
    fetcher: async (url, init = {}) => {
      const path = new URL(url).pathname;
      requests.push({ path, method: init.method || "GET", body: init.body });
      if (path === "/ea/oauth2/token") return Response.json({ access_token: "dummy-token" });
      if (path === "/ea/bulk-jobs") {
        assert.equal(init.method, "POST");
        const body = JSON.parse(init.body);
        assert.deepEqual(Object.keys(body).sort(), ["description", "operation", "url"]);
        assert.equal(body.url, metadata.url);
        assert.equal(body.operation, "POST");
        return Response.json(create, { status: createStatus });
      }
      assert.equal(path, `/ea/bulk-jobs/${jobId}`);
      assert.equal(init.method, undefined);
      return Response.json(saved, { status: readStatus });
    }
  });
  return { api, requests };
}
async function probe(f, checkControl = async () => {}) {
  const evidence = [];
  const result = await probeEmptyBulkJob({ api: f.api, target, checkControl, record: async row => evidence.push(row) });
  return { result, evidence };
}
test("bulk probe creates no records, reads only its own job, and does not claim destination write access", async () => {
  const f = fixture(), { result, evidence } = await probe(f);
  assert.equal(result.bulkReadAccess, true);
  assert.equal(result.destinationWriteAccess, "UNTESTED");
  assert.equal(result.runRequested, false);
  assert.equal(evidence[0].phase, "CREATE_INTENT");
  assert.equal(evidence[1].bulkJobId, jobId);
  assert.deepEqual(f.requests.map(r => r.path), ["/ea/oauth2/token", "/ea/bulk-jobs", `/ea/bulk-jobs/${jobId}`]);
});
for (const [label, options] of [
  ["create forbidden", { createStatus: 403 }], ["read forbidden", { readStatus: 403 }],
  ["missing ID", { create: {} }], ["foreign ID", { saved: { ...metadata, id: eventId } }],
  ["other route", { saved: { ...metadata, url: "/contacts" } }],
  ["unexpected operation", { saved: { ...metadata, operation: "DELETE" } }],
  ["started", { saved: { ...metadata, started: "2026-01-01T00:00:00Z" } }],
  ["records", { saved: { ...metadata, totalRecords: 1 } }],
  ["missing count", { saved: { ...metadata, totalRecords: undefined } }],
  ["running", { saved: { ...metadata, status: "RUNNING" } }],
]) test(`bulk probe rejects ${label} without retry`, async () => {
  const f = fixture(options);
  await assert.rejects(probe(f));
  assert.equal(f.requests.filter(r => r.path === "/ea/bulk-jobs").length, 1);
});
test("bulk probe rechecks ownership before create and at paced dispatch", async () => {
  let checks = 0;
  const f = fixture();
  await assert.rejects(probe(f, async () => { if (++checks === 2) throw Error("takeover"); }), /takeover/);
  assert.equal(f.requests.some(r => r.path === "/ea/bulk-jobs"), false);
  const g = fixture({ guard: async () => { throw Error("takeover"); } });
  await assert.rejects(probe(g));
  assert.equal(g.requests.some(r => r.path === "/ea/bulk-jobs"), false);
});
async function maintenance(t) {
  const root = await mkdtemp(join(tmpdir(), "bulk-probe-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "data/current"), { recursive: true });
  await mkdir(join(root, "data/jobs"));
  await writeFile(join(root, "data/current/runtime.json"), JSON.stringify({ ownership: "USER", runtimeId: "runtime", expectedEventName: target.name, apiEvent: { id: eventId, name: target.name } }));
  let requests;
  const options = { root, confirmed: true, env: {}, apiFactory: config => { const f = fixture({ guard: config.mutationGuard }); requests = f.requests; return f.api; } };
  return { root, options, requests: () => requests };
}
test("maintenance requires explicit human confirmation; cannot be invoked by RR executor", async t => {
  const f = await maintenance(t);
  await assert.rejects(runBulkAccessProbe({ ...f.options, confirmed: false }), /Human maintenance/);
  await assert.rejects(runBulkAccessProbe({ ...f.options, env: { RR_WORKSPACE: "/job" } }), /Human maintenance/);
  assert.equal(f.requests(), undefined);
});
test("maintenance records evidence without tokens and prevents repeated probes", async t => {
  const f = await maintenance(t);
  const result = await runBulkAccessProbe(f.options);
  const text = await readFile(result.receipt, "utf8");
  assert.equal(JSON.parse(text).status, "ACCESS_CONFIRMED");
  assert.doesNotMatch(text, /dummy-token|dummy-secret|authorization/i);
  assert.equal(existsSync(join(f.root, "logs/bulk-access/operation.lock")), false);
  const original = text;
  await assert.rejects(runBulkAccessProbe(f.options), /already recorded/);
  assert.equal(await readFile(result.receipt, "utf8"), original);
});
test("maintenance blocks active RR jobs and ownership mismatch before any API access", async t => {
  const f = await maintenance(t);
  await mkdir(join(f.root, "data/jobs/test"));
  await writeFile(join(f.root, "data/jobs/test/job.json"), JSON.stringify({ status: "RUNNING" }));
  await assert.rejects(runBulkAccessProbe(f.options), /Unsettled RR/);
  assert.equal(f.requests(), undefined);
});
test("failed read retains created identity and prevents automatic repetition", async t => {
  const f = await maintenance(t);
  f.options.apiFactory = config => fixture({ guard: config.mutationGuard, readStatus: 403 }).api;
  await assert.rejects(runBulkAccessProbe(f.options), /HTTP 403/);
  const receipt = JSON.parse(await readFile(join(f.root, "logs/bulk-access/receipt.json"), "utf8"));
  assert.equal(receipt.bulkJobId, jobId);
  assert.equal(receipt.httpStatus, 403);
  assert.equal(receipt.eventWritesSubmitted, 0);
  await assert.rejects(runBulkAccessProbe(f.options), /already recorded/);
});
