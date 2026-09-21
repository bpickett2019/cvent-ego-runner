import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { ApiFailure, CventConnection } from "./cvent-api.mjs";
import { assertProcessGone } from "./event-history.mjs";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const read = async path => JSON.parse(await readFile(path, "utf8"));
const save = async (path, value) => {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
};

// Maintenance-only access check. It deliberately cannot upload records, start,
// cancel, inspect someone else's job, or accept caller-supplied destinations.
export async function probeEmptyBulkJob({ api, target, checkControl, record }) {
  if (!UUID.test(target?.apiEventId) || !target.name?.startsWith("(C+D)")) throw new ApiFailure("Bulk probe requires the selected (C+D) event");
  await checkControl();
  const { receipt: event } = await api.assertTarget(target);
  const { credentials, token } = await api.authenticate();
  const body = { url: `/events/${target.apiEventId}/discounts`, operation: "POST", description: "RR runner empty access probe; do not upload or run" };
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" };
  await checkControl();
  await record({ phase: "CREATE_INTENT", event, request: body });
  // No data property: Cvent documents that supplying data auto-starts execution.
  const response = await api.transport(`${credentials.baseUrl}/bulk-jobs`, { method: "POST", headers, body: JSON.stringify(body) });
  if (response.status !== 201) throw new ApiFailure("Unexpected bulk-create acknowledgment; do not repeat the probe");
  let created;
  try { created = await response.json(); } catch { throw new ApiFailure("Invalid bulk-create JSON; do not repeat the probe"); }
  if (!UUID.test(created?.id)) throw new ApiFailure("Bulk-create acknowledgment lacks a job identity; do not repeat the probe");
  // Retain the identity even when later validation/read access fails. Never keep
  // arbitrary response fields (headers/data may contain sensitive material).
  await record({ phase: "CREATED", bulkJobId: created.id });
  const verify = job => {
    if (job?.id !== created.id || job.url !== body.url || job.operation !== body.operation || !["PENDING", "READY"].includes(job.status) || job.totalRecords !== 0 || job.started || job.completed || (job.successful ?? 0) !== 0 || (job.failed ?? 0) !== 0 || (job.data != null && (!Array.isArray(job.data) || job.data.length))) throw new ApiFailure("Bulk job is not independently confirmed empty and unstarted; stop, do not replay");
    return { id: job.id, url: job.url, operation: job.operation, status: job.status, totalRecords: job.totalRecords };
  };
  verify(created);
  await checkControl();
  const result = await api.transport(`${credentials.baseUrl}/bulk-jobs/${created.id}`, { headers });
  if (result.status !== 200) throw new ApiFailure("Unexpected bulk-read response");
  let saved;
  try { saved = await result.json(); } catch { throw new ApiFailure("Invalid bulk-read JSON"); }
  const metadata = verify(saved);
  await checkControl();
  return { bulkJob: metadata, bulkReadAccess: true, bulkCreateAccess: true, destinationWriteAccess: "UNTESTED", eventWritesSubmitted: 0, recordsUploaded: 0, runRequested: false };
}

export async function runBulkAccessProbe({ root, confirmed = false, env = process.env, apiFactory = options => new CventConnection(options) }) {
  if (!confirmed || env.RR_WORKSPACE) throw new ApiFailure("Human maintenance only: probeBulkAccess --confirm-empty-job, outside an RR executor");
  const current = join(root, "data/current"), jobs = join(root, "data/jobs");
  const initial = await read(join(current, "runtime.json"));
  const target = { apiEventId: initial.apiEvent?.id, name: initial.expectedEventName };
  if (!UUID.test(target.apiEventId) || target.name !== initial.apiEvent?.name) throw new ApiFailure("Selected API event identity/name is not confirmed");
  const checkControl = async () => {
    const runtime = await read(join(current, "runtime.json"));
    if (runtime.ownership !== "USER" || runtime.runtimeId !== initial.runtimeId || runtime.expectedEventName !== target.name || !isDeepStrictEqual(runtime.apiEvent, initial.apiEvent)) throw new ApiFailure("Bulk maintenance requires idle USER ownership and unchanged selected event");
    for (const workspace of [current, ...(await readdir(jobs)).map(id => join(jobs, id))]) {
      if (["operation.lock", "api-operation.lock"].some(file => existsSync(join(workspace, file)))) throw new ApiFailure("Unsettled operation blocks bulk maintenance");
      if (!existsSync(join(workspace, "job.json"))) continue;
      const job = await read(join(workspace, "job.json"));
      if (["PREPARING", "STARTING", "RUNNING", "STOPPING"].includes(job.status) || job.spendingUnreconciled || job.stopFailures?.length) throw new ApiFailure("Unsettled RR job blocks bulk maintenance");
      assertProcessGone(job.ownedPid);
    }
  };
  await checkControl();
  const directory = join(root, "logs/bulk-access");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const receiptPath = join(directory, "receipt.json"), lockPath = join(directory, "operation.lock");
  const lock = await open(lockPath, "wx", 0o600);
  let receipt, intent = false;
  try {
    if (existsSync(receiptPath)) throw new ApiFailure(`Bulk probe already recorded at ${receiptPath}; inspect it, do not automatically repeat`);
    receipt = { operation: "probeBulkAccess", eventId: target.apiEventId, startedAt: new Date().toISOString(), eventWritesSubmitted: 0, recordsUploaded: 0, runRequested: false, status: "CHECKING" };
    await save(receiptPath, receipt);
    const api = apiFactory({ mutationGuard: async () => { if (!intent) throw new ApiFailure("Bulk probe requires durable intent"); await checkControl(); } });
    const result = await probeEmptyBulkJob({ api, target, checkControl, record: async evidence => {
      (receipt.evidence ??= []).push(evidence);
      if (evidence.bulkJobId) receipt.bulkJobId = evidence.bulkJobId;
      await save(receiptPath, { ...receipt, status: "EMPTY_JOB_OUTCOME_UNCONFIRMED" });
      if (evidence.phase === "CREATE_INTENT") intent = true;
    } });
    await save(receiptPath, { ...receipt, status: "ACCESS_CONFIRMED", completedAt: new Date().toISOString(), result });
    return { receipt: receiptPath, ...result };
  } catch (error) {
    if (receipt) await save(receiptPath, { ...receipt, status: intent ? "ACCESS_NOT_CONFIRMED_DO_NOT_REPEAT" : "BLOCKED", httpStatus: error.status ?? null, diagnostic: error instanceof ApiFailure ? error.diagnostic : undefined, message: error instanceof ApiFailure ? error.message : "Bulk access probe failed; inspect receipt, do not repeat" });
    throw error;
  } finally { await lock.close(); await unlink(lockPath); }
}
