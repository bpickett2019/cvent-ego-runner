import { readFile, writeFile, rename, mkdir, open } from "node:fs/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { CAPABILITIES, BLOCKED_OPERATIONS, CventConnection, ApiFailure } from "./cvent-api.mjs";
import { runBulkAccessProbe } from "./cvent-bulk-probe.mjs";

const operations = Object.fromEntries(Object.entries(CAPABILITIES).filter(([name]) => !Object.hasOwn(BLOCKED_OPERATIONS, name)));
const blockedOperations = BLOCKED_OPERATIONS;
const read = async path => JSON.parse(await readFile(path, "utf8"));
async function save(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
}
async function main() {
  const operation = process.argv[2];
  if (operation === "probeBulkAccess") {
    const confirmed = process.argv.length === 4 && process.argv[3] === "--confirm-empty-job";
    console.log(JSON.stringify(await runBulkAccessProbe({ root: resolve(new URL("..", import.meta.url).pathname), confirmed })));
    return;
  }
  if (operation === "capabilities") {
    console.log(JSON.stringify({ operations, blockedOperations, maintenanceOperations: { probeBulkAccess: { mode: "human-only-empty-job-access-check", confirmation: "--confirm-empty-job", limitation: "No records, run, cancellation or event writes. Actual bulk execution is not exposed." } }, writeCapabilities: {
      updateEvent: { mode: "event-only-update", supports: ["description/note, dates/deadline, timezone, format, capacity, merged single venue, visibility"], limitations: ["fixed name; unchanged planners/languages/type/archive schedule"] },
      updateEventBasics: { aliasOf: "updateEvent" },
      updateRegistrationType: { mode: "event-only-update", supports: ["availability, opening/closing dates, capacity"], limitations: ["no shared name/code/description or contact-type definition edits"] },
      enableEventFeature: { mode: "event-only-enable", supports: ["Website", "Registration"], limitations: ["preserve tier/config; no disable, payment changes or launch"] },
      configureDiscount: { mode: "event-only-create-or-update", supports: ["final-total and item-scoped codes", "existing event-level values and additive AdmissionItem/QuantityItem links"], limitations: ["no link removal; exact code; 1–100 scoped items"] },
      configureVolumeDiscount: { mode: "event-only-create-or-update", supports: ["named volume rules and additive scoped links"], limitations: ["no link removal; exact name; explicit threshold semantics"] }
    }, preservation: "Fixed selected event/name and Draft; no deletion/archive, shared edits, other-event effects, communications or attendee access. Shared creation requires documented isolation; no isolated shared create route established in this adapter.", browser: "Documented coverage gaps only; never bypass failed/denied/uncertain API operations", documentation: resolve(new URL("../CVENT-API.md", import.meta.url).pathname) }));
    return;
  }
  if (Object.hasOwn(blockedOperations, operation)) throw new ApiFailure(blockedOperations[operation]);
  if (!Object.hasOwn(operations, operation)) throw new ApiFailure("Use a supported operation from cvent-api capabilities");
  if (!process.env.RR_WORKSPACE) throw new ApiFailure("A running approved RR job is required");
  const workspace = resolve(process.env.RR_WORKSPACE), runtimePath = join(workspace, "runtime.json");
  const job = await read(join(workspace, "job.json"));
  if (job.status !== "RUNNING" || !job.target?.apiEventId) throw new ApiFailure("Job is not running with a confirmed API event identity");
  const runtime = await read(runtimePath);
  if (runtime.ownership !== "AGENT") throw new ApiFailure("Browser/execution control belongs to the user; API execution stopped");
  const uncertainPath = join(workspace, "api-write-uncertain.json");
  // Historical api-current-event.json never changes this run's fixed target.
  const volume = operation === "configureVolumeDiscount";
  const discountOperation = volume || operation === "configureDiscount";
  const identityKey = volume ? "name" : "code";
  const discountStatePath = join(workspace, volume ? "api-volume-discounts.json" : "api-discounts.json");
  if (existsSync(join(workspace, "browser-save-uncertain.json")) && CAPABILITIES[operation] === "api-write") throw new ApiFailure("A browser save is uncertain; API writes are blocked without replay");
  if (existsSync(uncertainPath) && CAPABILITIES[operation] === "api-write") throw new ApiFailure("This run's API write is uncertain. Stop; do not replay or use browser fallback");
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
    const checkControl = async () => {
      if (CAPABILITIES[operation] === "api-write" && existsSync(join(workspace, "browser-save-uncertain.json"))) throw new ApiFailure("Browser save uncertainty blocks API mutation");
      const latestJob = await read(join(workspace, "job.json")), latest = await read(runtimePath);
      const uncertainty = existsSync(uncertainPath) ? await read(uncertainPath) : null;
      const ownIntent = uncertainty?.receiptId === receiptId && uncertainty?.eventId === job.target.apiEventId && uncertainty?.operation === operation;
      if (latestJob.status !== "RUNNING" || !isDeepStrictEqual(latestJob.target, job.target) || latest.ownership !== "AGENT" || latest.runtimeId !== runtime.runtimeId || latest.activeTargetId !== runtime.activeTargetId || latest.steelSessionId !== runtime.steelSessionId || (dispatched ? !ownIntent : CAPABILITIES[operation] === "api-write" && uncertainty !== null)) throw new ApiFailure("Stop, takeover or unresolved API write blocks this mutation");
    };
    const api = new CventConnection({ mutationGuard: async () => { if (!dispatched) throw new ApiFailure("Mutation requires durable intent"); await checkControl(); } });
    const target = { ...job.target };
    const data = structuredClone(input.data ?? input);
    let discountState = null, discountKey = null;
    if (discountOperation && data && typeof data[identityKey] === "string") {
      discountKey = volume ? data.name : data.code.trim().toUpperCase();
      discountState = existsSync(discountStatePath) ? await read(discountStatePath) : { eventId: target.apiEventId, discounts: {} };
      if (discountState.eventId !== target.apiEventId || !discountState.discounts || typeof discountState.discounts !== "object" || Array.isArray(discountState.discounts)) throw new ApiFailure("Saved discount identities do not belong to this event");
      const knownId = Object.hasOwn(discountState.discounts, discountKey) ? discountState.discounts[discountKey] : null;
      if (knownId != null) {
        if (typeof knownId !== "string" || (data.discountId && data.discountId !== knownId)) throw new ApiFailure("Discount ID conflicts with this job's verified identity");
        data.discountId = knownId; // Never recreate a previously verified code on stale search results.
      }
    }
    let createdId = null, finalized = false;
    const sentLinks = new Set(), verifiedLinks = new Set(), sentPaths = new Set();
    const result = await api.execute(target, operation, data, async prepared => {
      const root = `/events/${job.target.apiEventId}/discounts`;
      const create = !dispatched && prepared?.method === "POST" && prepared.path === root && prepared.baseline === null && prepared.body?.type === (volume ? "VOLUME_DISCOUNT" : "DISCOUNT_CODE");
      const link = createdId && !finalized && prepared?.phase === "LINK_NEW_DISCOUNT_ITEM" && prepared.method === "PUT" && prepared.discountId === createdId && prepared.baseline === null &&
        data.agendaItems?.some(item => isDeepStrictEqual(item, prepared.agendaItem)) && !sentLinks.has(prepared.agendaItem.id) && prepared.path === `${root}/${createdId}/agenda-items/${prepared.agendaItem.id}`;
      const finalize = createdId && !finalized && prepared?.phase === "FINALIZE_NEW_DISCOUNT" && prepared.method === "PUT" && prepared.discountId === createdId && prepared.baseline?.id === createdId && prepared.path === `${root}/${createdId}` &&
        data.agendaItems?.length > 0 && data.agendaItems.every(item => verifiedLinks.has(`${item.type}:${item.id}`)) &&
        isDeepStrictEqual(prepared.body, { ...receipt.prepared.body, active: data.patch.active, ...(volume ? {} : { applyToAllAgendaItems: true }) });
      const existingDiscount = discountOperation && prepared?.baseline?.level === "EVENT" && prepared.baseline.type === (volume ? "VOLUME_DISCOUNT" : "DISCOUNT_CODE") && prepared.baseline[identityKey] === data[identityKey] && prepared.discountId === prepared.baseline.id && (!data.discountId || data.discountId === prepared.discountId) && (!prepared.baseline.event?.id || prepared.baseline.event.id === job.target.apiEventId) && prepared.method === "PUT" && (
        prepared.phase === "UPDATE_DISCOUNT" && prepared.path === `${root}/${prepared.discountId}` ||
        prepared.phase === "ADD_DISCOUNT_ITEM" && data.agendaItems?.some(item => isDeepStrictEqual(item, prepared.agendaItem)) && prepared.path === `${root}/${prepared.discountId}/agenda-items/${prepared.agendaItem.id}`
      );
      const eventRoot = `/events/${job.target.apiEventId}`;
      const scopedUpdate = !dispatched && prepared?.method === "PUT" && (
        ["updateEvent", "updateEventBasics"].includes(operation) && prepared.phase === "UPDATE_EVENT" && prepared.path === eventRoot && prepared.baseline?.id === job.target.apiEventId && prepared.body?.title === prepared.baseline.title && prepared.baseline.title === job.target.name ||
        operation === "updateRegistrationType" && prepared.phase === "UPDATE_REGISTRATION_TYPE" && prepared.path === `${eventRoot}/registration-types/${data.registrationTypeId}` && prepared.baseline?.id === data.registrationTypeId && prepared.body?.id === data.registrationTypeId ||
        operation === "enableEventFeature" && prepared.phase === "ENABLE_EVENT_FEATURE" && ["Website", "Registration"].includes(data.type) && prepared.path === `${eventRoot}/features/${data.type}` && prepared.baseline?.type === data.type && prepared.body?.enabled === true
      );
      if (!(create || link || finalize || existingDiscount || scopedUpdate) || sentPaths.has(`${prepared.method} ${prepared.path}`)) throw new ApiFailure("Prepared write is outside the scoped operation or was already dispatched; no replay");
      if (!Array.isArray(input.rrReferences) || !input.rrReferences.length || !input.rrReferences.every(value => typeof value === "string" && value.trim())) throw new ApiFailure("API writes require RR source references");
      await checkControl();
      sentPaths.add(`${prepared.method} ${prepared.path}`);
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
      if (!createdId && receipt.prepared.method === "POST" && evidence.phase === "READBACK" && evidence.matched && evidence.saved?.id === evidence.discountId && evidence.saved?.type === receipt.prepared.body.type && evidence.saved?.[identityKey] === receipt.prepared.body[identityKey]) createdId = evidence.discountId;
      if (evidence.phase === "LINK_READBACK" && evidence.matched && evidence.discountId === createdId) for (const key of evidence.links) verifiedLinks.add(key);
    });
    await checkControl();
    if (dispatched && result.verified !== true) throw new ApiFailure("Mutation result lacks saved verification; retain uncertainty");
    await save(receiptPath, { ...receipt, status: "PASS", completedAt: new Date().toISOString(), result });
    if (discountState && result.verified && result.discountId) {
      discountState.discounts = { ...discountState.discounts, [discountKey]: result.discountId };
      await save(discountStatePath, discountState);
    }
    if (dispatched) {
      await checkControl();
      const { unlink } = await import("node:fs/promises");
      await unlink(uncertainPath);
    }
    console.log(JSON.stringify({ receipt: receiptPath, operation, route: "api", verified: true, eventId: job.target.apiEventId, ...(result.action ? { action: result.action, requirementsSatisfied: result.requirementsSatisfied, differences: result.differences, ...(result.limitation ? { limitation: result.limitation } : {}) } : {}), ...(Array.isArray(result) ? { count: result.length } : {}) }));
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
