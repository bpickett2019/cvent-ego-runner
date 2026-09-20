import { readFile, writeFile, rename, mkdir, open } from "node:fs/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { CAPABILITIES, CventConnection, ApiFailure } from "./cvent-api.mjs";

// Production RR writes are create-only. Keep the underlying adapter's legacy
// update helpers for separate integrations, but never expose them as RR grants.
const operations = Object.fromEntries(Object.entries(CAPABILITIES).filter(([name, route]) => route === "api-read" || name === "configureDiscount"));
const blockedOperations = Object.fromEntries(Object.keys(CAPABILITIES).filter(name => !Object.hasOwn(operations, name)).map(name => [name, "Preserve existing items and event settings; updates are prohibited"]));
const read = async path => JSON.parse(await readFile(path, "utf8"));
async function save(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
}
async function main() {
  const operation = process.argv[2];
  if (operation === "capabilities") {
    console.log(JSON.stringify({ operations, blockedOperations, writeCapabilities: { configureDiscount: { mode: "create-only", supports: ["final-total codes", "new item-scoped codes with AdmissionItem/QuantityItem links"], existingItems: "preserve unchanged, including existing discount associations", verification: "complete API catalog and saved-state readback; never resend uncertain writes", limitations: ["volume discounts not integrated", "no standalone link/update of existing discounts", "1–100 explicit scoped items per new code"] } }, preservation: "Never rename the event. Reuse existing items unchanged; create only confirmed missing RR-required items. A preserved difference is not requirement satisfaction.", browser: "Only for documented unsupported operations; authentication, policy errors, rate limits and uncertain writes must not be bypassed", documentation: resolve(new URL("../CVENT-API.md", import.meta.url).pathname) }));
    return;
  }
  if (!Object.hasOwn(CAPABILITIES, operation)) throw new ApiFailure("Use a supported operation from cvent-api capabilities");
  if (!process.env.RR_WORKSPACE) throw new ApiFailure("A running approved RR job is required");
  const workspace = resolve(process.env.RR_WORKSPACE), runtimePath = join(workspace, "runtime.json");
  const job = await read(join(workspace, "job.json"));
  if (job.status !== "RUNNING" || !job.target?.apiEventId) throw new ApiFailure("Job is not running with a confirmed API event identity");
  const runtime = await read(runtimePath);
  if (runtime.ownership !== "AGENT") throw new ApiFailure("Browser/execution control belongs to the user; API execution stopped");
  const uncertainPath = join(workspace, "api-write-uncertain.json");
  const currentNamePath = join(workspace, "api-current-event.json");
  const discountStatePath = join(workspace, "api-discounts.json");
  if (existsSync(uncertainPath) && CAPABILITIES[operation] === "api-write") throw new ApiFailure("Prior API write is uncertain. Read authoritative state and request reconciliation; do not replay or use browser fallback");
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) { bytes += chunk.length; if (bytes > 100_000) throw new ApiFailure("API input too large"); chunks.push(chunk); }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  const receiptId = randomUUID(), receiptPath = join(workspace, "receipts", `api-${receiptId}.json`);
  await mkdir(join(workspace, "receipts"), { recursive: true, mode: 0o700 });
  // One API command at a time. A stale lock is evidence, not permission to steal it.
  const lockPath = join(workspace, "api-operation.lock");
  const lock = await open(lockPath, "wx", 0o600);
  await lock.writeFile(JSON.stringify({ pid: process.pid, operation, receiptId }));
  let dispatched = false;
  const receipt = { receiptId, operation, route: "api", eventId: job.target.apiEventId, rrReferences: input.rrReferences || [], startedAt: new Date().toISOString() };
  try {
    if (!Object.hasOwn(operations, operation)) throw new ApiFailure("RR preservation policy prohibits updating existing items or event settings; reuse unchanged. Do not bypass through Ego");
    const api = new CventConnection();
    const currentName = existsSync(currentNamePath) ? await read(currentNamePath) : null;
    if (currentName && currentName.eventId !== job.target.apiEventId) throw new ApiFailure("Saved API event name belongs to a different event");
    const target = { ...job.target, name: currentName?.name || job.target.name };
    const data = structuredClone(input.data ?? input);
    let discountState = null, discountKey = null;
    if (operation === "configureDiscount" && data && typeof data.code === "string") {
      discountKey = data.code.trim().toUpperCase();
      discountState = existsSync(discountStatePath) ? await read(discountStatePath) : { eventId: target.apiEventId, discounts: {} };
      if (discountState.eventId !== target.apiEventId || !discountState.discounts || typeof discountState.discounts !== "object" || Array.isArray(discountState.discounts)) throw new ApiFailure("Saved discount identities do not belong to this event");
      const knownId = Object.hasOwn(discountState.discounts, discountKey) ? discountState.discounts[discountKey] : null;
      if (knownId != null) {
        if (typeof knownId !== "string" || (data.discountId && data.discountId !== knownId)) throw new ApiFailure("Discount ID conflicts with this job's verified identity");
        data.discountId = knownId; // Never recreate a previously verified code on stale search results.
      }
    }
    let createdId = null, finalized = false;
    const sentLinks = new Set(), verifiedLinks = new Set();
    const result = await api.execute(target, operation, data, async prepared => {
      const root = `/events/${job.target.apiEventId}/discounts`;
      const create = !dispatched && prepared?.method === "POST" && prepared.path === root && prepared.baseline === null;
      const link = createdId && !finalized && prepared?.phase === "LINK_NEW_DISCOUNT_ITEM" && prepared.method === "PUT" && prepared.discountId === createdId && prepared.baseline === null &&
        data.agendaItems?.some(item => isDeepStrictEqual(item, prepared.agendaItem)) && !sentLinks.has(prepared.agendaItem.id) && prepared.path === `${root}/${createdId}/agenda-items/${prepared.agendaItem.id}`;
      const finalize = createdId && !finalized && prepared?.phase === "FINALIZE_NEW_DISCOUNT" && prepared.method === "PUT" && prepared.discountId === createdId && prepared.baseline?.id === createdId && prepared.path === `${root}/${createdId}` &&
        data.agendaItems?.length > 0 && data.agendaItems.every(item => verifiedLinks.has(`${item.type}:${item.id}`)) &&
        isDeepStrictEqual(prepared.body, { ...receipt.prepared.body, active: data.patch.active, applyToAllAgendaItems: true });
      if (operation !== "configureDiscount" || !(create || link || finalize)) throw new ApiFailure("RR preservation policy permits only confirmed-missing discount creation and its initial configuration; existing-item writes are prohibited");
      if (!Array.isArray(input.rrReferences) || !input.rrReferences.length || !input.rrReferences.every(value => typeof value === "string" && value.trim())) throw new ApiFailure("API writes require RR source references");
      const latestJob = await read(join(workspace, "job.json"));
      const latest = await read(runtimePath);
      const uncertainty = existsSync(uncertainPath) ? await read(uncertainPath) : null;
      const ownIntent = uncertainty?.receiptId === receiptId && uncertainty?.eventId === job.target.apiEventId && uncertainty?.operation === operation;
      if (latestJob.status !== "RUNNING" || latestJob.target?.apiEventId !== job.target.apiEventId || latest.ownership !== "AGENT" || latest.runtimeId !== runtime.runtimeId || latest.activeTargetId !== runtime.activeTargetId || latest.steelSessionId !== runtime.steelSessionId || (dispatched ? !ownIntent : uncertainty !== null)) throw new ApiFailure("Stop, takeover or unresolved API write blocks this mutation");
      receipt.requested = input.data ?? input;
      receipt.prepared ??= prepared;
      (receipt.preparedWrites ??= []).push(prepared);
      if (link) sentLinks.add(prepared.agendaItem.id);
      if (finalize) finalized = true;
      await save(receiptPath, { ...receipt, status: "INTENT_REQUIRES_RECONCILIATION" });
      await save(uncertainPath, { receiptId, receipt: receiptPath, operation, eventId: job.target.apiEventId });
      dispatched = true;
    }, async evidence => {
      if (!dispatched) throw new ApiFailure("Write evidence requires durable intent first");
      (receipt.writeEvidence ??= []).push(evidence);
      await save(receiptPath, { ...receipt, status: "INTENT_REQUIRES_RECONCILIATION" });
      if (!createdId && receipt.prepared.method === "POST" && evidence.phase === "READBACK" && evidence.matched && evidence.saved?.id === evidence.discountId && evidence.saved?.code === receipt.prepared.body.code) createdId = evidence.discountId;
      if (evidence.phase === "LINK_READBACK" && evidence.matched && evidence.discountId === createdId) for (const key of evidence.links) verifiedLinks.add(key);
    });
    await save(receiptPath, { ...receipt, status: result.requirementsSatisfied === false ? "PRESERVED_DIFFERENCE" : "PASS", completedAt: new Date().toISOString(), result });
    if (discountState && result.verified && result.discountId) {
      discountState.discounts[discountKey] = result.discountId;
      await save(discountStatePath, discountState);
    }
    if (dispatched) {
      if (operation === "updateEvent" && result.saved?.title) await save(currentNamePath, { eventId: job.target.apiEventId, name: result.saved.title, receipt: receiptPath });
      const { unlink } = await import("node:fs/promises");
      await unlink(uncertainPath);
    }
    console.log(JSON.stringify({ receipt: receiptPath, operation, route: "api", verified: true, eventId: job.target.apiEventId, ...(result.action ? { action: result.action, requirementsSatisfied: result.requirementsSatisfied, differences: result.differences } : {}), ...(Array.isArray(result) ? { count: result.length } : {}) }));
  } catch (error) {
    await save(receiptPath, { ...receipt, status: dispatched ? "UNCERTAIN" : "BLOCKED", message: error instanceof ApiFailure ? error.message : "Cvent API operation failed; inspect the receipt and reconcile before further writes", httpStatus: error.status ?? null, diagnostic: error instanceof ApiFailure ? error.diagnostic : undefined });
    throw error;
  } finally {
    await lock.close();
    const { unlink } = await import("node:fs/promises");
    await unlink(lockPath);
  }
}
main().catch(error => {
  console.error(JSON.stringify({ error: error instanceof ApiFailure ? error.message : "Cvent API command failed; do not blindly retry or bypass through the browser", httpStatus: error.status ?? null }));
  process.exitCode = 1;
});
