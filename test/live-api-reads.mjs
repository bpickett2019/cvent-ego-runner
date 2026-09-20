// Explicit, read-only smoke test. Not included in npm test.
// CVENT_CREDENTIALS_FILE=... node test/live-api-reads.mjs
import assert from "node:assert/strict";
import { writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { CventConnection, CAPABILITIES, ApiFailure } from "../app/cvent-api.mjs";

const target = { apiEventId: "e712e34c-6117-4d13-bf4c-8ed54cf2b495", name: "(C+D) Medtrade Testing Clone 2" };
const root = join(homedir(), ".cvent-pi-agent/rr-runs");
await mkdir(root, { recursive: true, mode: 0o700 });
const dir = await mkdtemp(join(root, "api-read-validation-"));
const save = (name, data) => writeFile(join(dir, name), JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
const http = [], results = [];
let operation = "preflight";
const api = new CventConnection({ fetcher: async (url, init) => {
  const method = init.method || "GET";
  assert.ok(method === "GET" || (method === "POST" && new URL(url).pathname.endsWith("/oauth2/token")), "Live read validation forbids all mutations");
  const response = await fetch(url, init);
  http.push({ operation, method, path: new URL(url).pathname, status: response.status, requestId: response.headers.get("x-request-id") || response.headers.get("x-cvent-request-id") });
  await save("http-receipts.json", http);
  return response;
} });
const summary = { target, startedAt: new Date().toISOString(), phase: "READ_VALIDATION", results, mutations: 0, paidRRExecution: false };
await save("summary.json", summary);
try {
  const { event: before } = await api.assertTarget(target);
  await save("baseline.json", before);
  for (const [name, capability] of Object.entries(CAPABILITIES)) {
    if (capability !== "api-read") continue;
    operation = name;
    try {
      const data = await api.execute(target, name);
      await save(`${name}.json`, data);
      results.push({ operation: name, status: "PASS", ...(Array.isArray(data) ? { count: data.length } : {}) });
    } catch (error) {
      results.push({ operation: name, status: "FAIL", ...(error instanceof ApiFailure ? { message: error.message, httpStatus: error.status, diagnostic: error.diagnostic } : { message: "Installed client or local verification failed" }) });
    }
    await save("summary.json", summary);
  }
  operation = "final-state";
  const after = await api.execute(target, "getEvent");
  await save("after.json", after);
  assert.deepEqual(after, before, "Event changed during read validation");
  summary.eventUnchangedVerified = true;
  summary.phase = results.every(result => result.status === "PASS") ? "PASSED" : "BLOCKED";
} catch (error) {
  summary.phase = "BLOCKED";
  summary.error = error instanceof ApiFailure ? { message: error.message, httpStatus: error.status, diagnostic: error.diagnostic } : { message: "Local preflight/state verification failed" };
}
summary.finishedAt = new Date().toISOString();
await save("summary.json", summary);
console.log(JSON.stringify({ evidence: dir, ...summary }, null, 2));
if (summary.phase !== "PASSED") process.exitCode = 1;
