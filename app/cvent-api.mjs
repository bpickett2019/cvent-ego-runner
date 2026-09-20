import { readFile } from "node:fs/promises";
import { parseEnv, isDeepStrictEqual } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const CAPABILITIES = Object.freeze({
  getEvent: "api-read", listAdmissionItems: "api-read", listRegistrationPaths: "api-read",
  listRegistrationTypes: "api-read", listQuestions: "api-read", listSessions: "api-read",
  listFees: "api-read", listVouchers: "api-read", listDiscounts: "api-read", listDiscountedAgendaItems: "api-read",
  listQuantityItems: "api-read", listDonationItems: "api-read",
  configureDiscount: "api-write",
  updateEvent: "api-write", updateEventBasics: "api-write", updateRegistrationType: "api-write", updateEventCustomFieldAnswers: "api-write",
});
// Official Cvent OpenAPI routes. Keep collection reads here rather than using
// the installed client's stale routes or unbounded, permissive paginator.
const COLLECTIONS = Object.freeze({
  listAdmissionItems: { path: "/admission-items", filtered: true },
  listRegistrationPaths: { path: "/events/{id}/registration-paths" },
  listRegistrationTypes: { path: "/events/{id}/registration-types" },
  listQuestions: { path: "/event-questions", filtered: true },
  listSessions: { path: "/sessions", filtered: true },
  listFees: { path: "/events/{id}/fee-items" },
  listVouchers: { path: "/events/{id}/vouchers" },
  listDiscounts: { path: "/events/{id}/discounts" },
  listDiscountedAgendaItems: { path: "/events/{id}/discounts/agenda-items" },
  listQuantityItems: { path: "/events/{id}/quantity-items" },
  listDonationItems: { path: "/events/{id}/donation-items" },
});
function collectionScope(url, path, eventId, discountId = null) {
  const route = Object.values(COLLECTIONS).find(route => route.path.replace("{id}", eventId) === path);
  if (!route) return false;
  const allowed = route.filtered || discountId ? ["limit", "token", "filter"] : ["limit", "token"];
  if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) return false;
  if (discountId) return route === COLLECTIONS.listDiscounts && UUID.test(discountId) && url.searchParams.get("filter") === `id in ('${discountId}')`;
  return !route.filtered || url.searchParams.get("filter") === `event.id eq '${eventId}'`;
}
const EVENT_FIELDS = new Set(["title", "description", "start", "end", "timezone", "venues", "format", "type", "planners", "note", "languages", "capacity", "showVenueLocation", "showPointOfContact"]);
// These fields may be carried forward from GET, never supplied as changes.
const PRESERVE_ONLY_FIELDS = ["closeAfter", "archiveAfter"];
const AUDIT_FIELDS = new Set(["lastModified", "lastModifiedBy"]);
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const normalizeName = value => String(value || "").trim().replace(/\s+/g, " ");
export class ApiFailure extends Error {
  constructor(message, status = null) { super(message); this.status = status; }
}
export async function loadCredentials(env = process.env) {
  const file = env.CVENT_CREDENTIALS_FILE ? parseEnv(await readFile(env.CVENT_CREDENTIALS_FILE, "utf8")) : {};
  const value = name => env[name] || file[name];
  const baseUrl = value("CVENT_API_BASE_URL"), clientId = value("CVENT_CLIENT_ID"), clientSecret = value("CVENT_CLIENT_SECRET");
  if (!baseUrl || !clientId || !clientSecret) throw new ApiFailure("Cvent API credentials are not configured; browser fallback is not allowed for missing authentication");
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || !/^api-platform(?:-[a-z0-9]+)?\.cvent\.com$/i.test(url.hostname) || url.username || url.password || url.search || url.hash || !/^\/ea\/?$/.test(url.pathname)) throw new ApiFailure("Cvent API regional base URL is not an approved HTTPS endpoint");
  return { baseUrl: baseUrl.replace(/\/$/, ""), clientId, clientSecret };
}
async function existingClient(credentials, fetcher, family = "default") {
  // Reuse the installed client, not its separate agent/runtime.
  const project = join(homedir(), "cvent-agent");
  const { tsImport } = await import(pathToFileURL(join(project, "node_modules/tsx/dist/esm/api/index.mjs")).href);
  if (family === "configuration") {
    const { CventApi } = await tsImport(join(homedir(), "cvent-ui-automation/src/cvent-api.ts"), import.meta.url);
    return new CventApi({ ...credentials, fetch: fetcher });
  }
  const { CventApi } = await tsImport(join(project, "src/cvent/api.ts"), import.meta.url);
  return new CventApi(credentials, fetcher);
}
export function includesRequested(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => includesRequested(actual[index], value));
  if (expected && typeof expected === "object") return !!actual && typeof actual === "object" && Object.entries(expected).every(([key, value]) => includesRequested(actual[key], value));
  return actual === expected;
}
export function buildEventUpdate(event, changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Object.keys(changes).length || Object.keys(changes).some(key => !EVENT_FIELDS.has(key))) throw new ApiFailure("Event changes contain unsupported or prohibited fields");
  // Retain the installed configuration client's explicit safety restrictions.
  if (typeof event.title !== "string" || !event.title.startsWith("(C+D)")) throw new ApiFailure("Installed event PUT client permits only (C+D) events; no browser bypass");
  if (Object.hasOwn(changes, "title") && changes.title !== event.title) throw new ApiFailure("Installed event PUT client requires the existing event title");
  const body = { ...Object.fromEntries([...EVENT_FIELDS, ...PRESERVE_ONLY_FIELDS].filter(key => Object.hasOwn(event, key)).map(key => [key, structuredClone(event[key])])), ...structuredClone(changes) };
  if (["title", "format", "timezone", "type"].some(key => typeof body[key] !== "string" || !body[key]) || !Array.isArray(body.planners) || !Array.isArray(body.languages)) throw new ApiFailure("Fresh event baseline lacks the required PUT fields; refusing an incomplete update");
  if (body.closeAfter && body.end && Date.parse(body.closeAfter) > Date.parse(body.end)) throw new ApiFailure("Event registration deadline is after its end date; Cvent rejects this preserved schedule. Explicit approval to correct the dates is required before event PUT; no write attempted");
  return body;
}
export function verifyEventUpdate(before, after, changes) {
  if (before.id !== after.id || !includesRequested(after, changes)) throw new ApiFailure("Event PUT saved values did not verify; reconciliation required");
  const untouched = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of untouched) {
    if (!Object.hasOwn(changes, key) && !AUDIT_FIELDS.has(key) && !isDeepStrictEqual(before[key], after[key])) throw new ApiFailure(`Event PUT changed an unrequested field (${key}); reconciliation required`);
  }
}
// Same writable-field allowlist as the installed configuration client. Its
// configureDiscount always POSTs first, so do not reuse that create/update workflow.
const DISCOUNT_FIELDS = ["name", "active", "stackable", "method", "effectiveFrom", "effectiveTo", "note", "code", "audienceType", "includeGuestsTowardsCapacity", "autoApply", "applyToAllAgendaItems", "type", "capacity"];
const DISCOUNT_PATCH_FIELDS = DISCOUNT_FIELDS.filter(key => !["type", "code", "applyToAllAgendaItems"].includes(key));
const discountKey = code => code.trim().toUpperCase();
const object = value => !!value && typeof value === "object" && !Array.isArray(value);
function discountMatch(rows, code) {
  const ids = new Set();
  for (const row of rows) {
    if (!UUID.test(row.id) || ids.has(row.id) || !["DISCOUNT_CODE", "VOLUME_DISCOUNT"].includes(row.type) || (row.type === "DISCOUNT_CODE" && (typeof row.code !== "string" || !row.code.trim()))) throw new ApiFailure("Discount catalog has invalid or duplicate identities; no write allowed");
    ids.add(row.id);
  }
  const matches = rows.filter(row => typeof row.code === "string" && discountKey(row.code) === discountKey(code));
  if (matches.length > 1) throw new ApiFailure("Discount code is ambiguous; do not create or update duplicates");
  const row = matches[0];
  if (row && (row.level !== "EVENT" || row.type !== "DISCOUNT_CODE")) throw new ApiFailure("Only event-level discount codes may be reused or created; no account/global or volume-discount writes");
  return row ?? null;
}
function validateDiscountBody(body) {
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 50 || typeof body.code !== "string" || !body.code.trim() || body.code.length > 30 || body.type !== "DISCOUNT_CODE") throw new ApiFailure("Discount name, code and DISCOUNT_CODE type are required");
  for (const key of ["active", "stackable", "includeGuestsTowardsCapacity", "autoApply", "applyToAllAgendaItems"]) if (typeof body[key] !== "boolean") throw new ApiFailure("Discount availability and application flags must be explicit booleans");
  if (!["PRIMARY", "GUEST", "ALL"].includes(body.audienceType)) throw new ApiFailure("Discount audience must be explicit");
  if (!object(body.method) || Object.keys(body.method).some(key => !["type", "value"].includes(key)) || !["BY_AMOUNT", "BY_PERCENTAGE", "FLAT_PRICE"].includes(body.method.type) || !Number.isFinite(body.method.value) || body.method.value < 0 || (body.method.type === "BY_PERCENTAGE" && body.method.value > 100)) throw new ApiFailure("Invalid discount method/value");
  if (!object(body.capacity) || Object.keys(body.capacity).some(key => key !== "total") || !Number.isInteger(body.capacity.total) || body.capacity.total < -1 || body.capacity.total > 32767) throw new ApiFailure("Discount capacity must contain only a supported total");
  if (Object.hasOwn(body, "note") && (typeof body.note !== "string" || body.note.length > 300)) throw new ApiFailure("Invalid discount note");
  for (const key of ["effectiveFrom", "effectiveTo"]) if (Object.hasOwn(body, key) && (typeof body[key] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body[key]) || !Number.isFinite(Date.parse(body[key])) || new Date(body[key]).toISOString().slice(0, 10) !== body[key])) throw new ApiFailure("Discount effective dates must be valid ISO dates; clearing dates is not supported");
  if (body.effectiveFrom && body.effectiveTo && body.effectiveFrom > body.effectiveTo) throw new ApiFailure("Discount effective dates are reversed");
}
function prepareDiscount(input, before) {
  if (before && Object.keys(before).some(key => ![...DISCOUNT_FIELDS, "id", "level", "event", "created", "createdBy", ...AUDIT_FIELDS].includes(key))) throw new ApiFailure("Discount baseline contains an unreviewed field; refusing a lossy PUT");
  if (before && (!object(before.capacity) || Object.keys(before.capacity).some(key => !["total", "used"].includes(key)) || !Number.isInteger(before.capacity.used) || before.capacity.used < 0)) throw new ApiFailure("Discount baseline capacity cannot be preserved");
  const patch = input.patch;
  const body = before ? Object.fromEntries(DISCOUNT_FIELDS.filter(key => Object.hasOwn(before, key)).map(key => [key, structuredClone(before[key])])) : { type: "DISCOUNT_CODE", code: input.code, applyToAllAgendaItems: false };
  if (before) body.capacity = { total: before.capacity.total };
  Object.assign(body, structuredClone(patch));
  validateDiscountBody(body);
  if (before && body.capacity.total !== -1 && body.capacity.total < before.capacity.used) throw new ApiFailure("Discount capacity is below its existing usage");
  const expected = before ? { ...structuredClone(before), ...structuredClone(patch), capacity: { ...before.capacity, ...body.capacity } } : body;
  return { body, expected };
}
export class CventConnection {
  constructor({ credentials = () => loadCredentials(), fetcher = fetch, clientFactory = existingClient, intervalMs = 520, discountPollDelaysMs = [1000, 2000, 5000, 10000, 20000, 30000, 60000], sleeper = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    this.credentials = credentials; this.fetcher = fetcher; this.clientFactory = clientFactory;
    this.intervalMs = intervalMs; this.tail = Promise.resolve(); this.lastRequest = 0;
    if (!Array.isArray(discountPollDelaysMs) || !discountPollDelaysMs.length || discountPollDelaysMs.length > 10 || discountPollDelaysMs.some((ms, i) => !Number.isFinite(ms) || ms < 0 || ms > 60000 || (i > 0 && ms <= discountPollDelaysMs[i - 1]))) throw new ApiFailure("Invalid bounded discount polling schedule");
    this.discountPollDelaysMs = [...discountPollDelaysMs]; this.sleeper = sleeper;
  }
  async transport(url, init = {}) {
    const previous = this.tail;
    let release;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const wait = this.intervalMs - (Date.now() - this.lastRequest);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      this.lastRequest = Date.now();
      const response = await this.fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
      // Keep the public error generic and never retry writes. Preserve redacted
      // API validation diagnostics for durable receipts, not OAuth response bodies.
      if (!response.ok) {
        const error = new ApiFailure(`Cvent API returned HTTP ${response.status}; inspect/reconcile before retry. Authentication, authorization, rate limits and uncertain writes are not browser-fallback reasons.`, response.status);
        error.diagnostic = { requestId: response.headers.get("x-request-id") || response.headers.get("x-cvent-request-id") };
        if (!new URL(url).pathname.endsWith("/oauth2/token")) {
          const credentials = await this.credentials();
          const authorization = new Headers(init.headers).get("authorization") || "";
          const secrets = [credentials.clientId, credentials.clientSecret, authorization, authorization.split(" ").at(-1)].filter(Boolean).sort((a, b) => b.length - a.length);
          const redact = value => {
            if (typeof value === "string") return secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value);
            if (Array.isArray(value)) return value.map(redact);
            if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /authorization|cookie|token|secret|password|client.?id/i.test(key) ? "[redacted]" : redact(item)]));
            return value;
          };
          try {
            const body = await response.json();
            const validation = redact(body);
            const serialized = JSON.stringify(validation);
            error.diagnostic.validation = serialized.length <= 16384 ? validation : { truncated: true, preview: serialized.slice(0, 16384) };
          } catch { /* No raw non-JSON error bodies. */ }
        }
        throw error;
      }
      return response;
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure("Cvent API transport failed or timed out; do not replay or switch to a browser write without reconciliation");
    } finally { release(); }
  }
  async authenticate() {
    const credentials = await this.credentials();
    const response = await this.transport(`${credentials.baseUrl}/oauth2/token`, {
      method: "POST", headers: { authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: credentials.clientId }),
    });
    let body;
    try { body = await response.json(); } catch { throw new ApiFailure("Cvent API authentication returned invalid JSON"); }
    if (typeof body.access_token !== "string" || !body.access_token) throw new ApiFailure("Cvent API authentication did not return a token");
    return { credentials, token: body.access_token };
  }
  async findEvents(name) {
    const { credentials, token } = await this.authenticate();
    const first = new URL(`${credentials.baseUrl}/events`); first.searchParams.set("limit", "100");
    let url = first;
    const seen = new Set(), matches = new Map();
    for (let count = 0; count < 200; count++) {
      if (url.origin !== first.origin || url.pathname !== first.pathname || url.username || url.password || seen.has(url.href)) throw new ApiFailure("Unsafe or repeated Cvent event pagination; no event selected");
      seen.add(url.href);
      const response = await this.transport(url, { headers: { authorization: `Bearer ${token}` } });
      let page;
      try { page = await response.json(); } catch { throw new ApiFailure("Cvent event search returned invalid JSON"); }
      if (!Array.isArray(page.data)) throw new ApiFailure("Cvent event search response was not a collection");
      for (const event of page.data) {
        if (normalizeName(event.title ?? event.name ?? event.eventName) === normalizeName(name)) {
          if (!UUID.test(event.id)) throw new ApiFailure("Cvent event match has no valid API identity");
          matches.set(event.id, { id: event.id, name: normalizeName(name), code: event.code || null, status: event.status || null });
        }
      }
      const href = page.paging?._links?.next?.href ?? page._links?.next?.href;
      if (href) { url = new URL(href, url); continue; }
      if (page.paging?.nextToken) { url = new URL(first); url.searchParams.set("token", page.paging.nextToken); continue; }
      return [...matches.values()];
    }
    throw new ApiFailure("Cvent event search exceeded its bounded page limit; no event selected");
  }
  async readCollection(eventId, operation, discountId = null) {
    if (!UUID.test(eventId) || !Object.hasOwn(COLLECTIONS, operation) || (discountId !== null && (operation !== "listDiscounts" || !UUID.test(discountId)))) throw new ApiFailure("Approved event and collection operation required");
    const { credentials, token } = await this.authenticate();
    const route = COLLECTIONS[operation];
    const first = new URL(`${credentials.baseUrl}${route.path.replace("{id}", eventId)}`);
    first.searchParams.set("limit", "100");
    if (route.filtered) first.searchParams.set("filter", `event.id eq '${eventId}'`);
    if (discountId) first.searchParams.set("filter", `id in ('${discountId}')`);
    const path = first.pathname.slice(new URL(credentials.baseUrl).pathname.length);
    let url = first;
    const seen = new Set(), items = [];
    for (let count = 0; count < 200; count++) {
      const cursor = url.searchParams.get("token") ?? "";
      if (url.origin !== first.origin || url.pathname !== first.pathname || url.username || url.password || url.hash || !collectionScope(url, path, eventId, discountId) || seen.has(cursor)) throw new ApiFailure("Unsafe or repeated Cvent collection pagination; no partial result returned");
      seen.add(cursor);
      const response = await this.transport(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
      let page;
      try { page = await response.json(); } catch { throw new ApiFailure("Cvent collection returned invalid JSON; no partial result returned"); }
      if (!Array.isArray(page?.data) || page.data.some(item => !item || typeof item !== "object" || Array.isArray(item))) throw new ApiFailure("Cvent collection response has invalid data; no partial result returned");
      if (page.data.some(item => item.event?.id != null && item.event.id !== eventId)) throw new ApiFailure("Cvent collection returned a different event identity; no partial result returned");
      if (discountId && page.data.some(item => item.id !== discountId)) throw new ApiFailure("Discount readback returned a different identity");
      items.push(...page.data);
      const href = page.paging?._links?.next?.href ?? page._links?.next?.href;
      let next = page.paging?.nextToken;
      if (next != null && typeof next !== "string") throw new ApiFailure("Invalid Cvent collection cursor; no partial result returned");
      if (href != null) {
        if (typeof href !== "string" || !href) throw new ApiFailure("Invalid Cvent collection pagination link");
        let linked;
        try { linked = new URL(href, url); } catch { throw new ApiFailure("Invalid Cvent collection pagination link"); }
        if (linked.origin !== first.origin || linked.pathname !== first.pathname || linked.username || linked.password || linked.hash || [...linked.searchParams].some(([key, value]) => linked.searchParams.getAll(key).length !== 1 || (key !== "token" && value !== first.searchParams.get(key)))) throw new ApiFailure("Unsafe Cvent collection pagination link; no partial result returned");
        const linkedToken = linked.searchParams.get("token");
        if (!linkedToken || (next && next !== linkedToken)) throw new ApiFailure("Missing or inconsistent Cvent collection cursor");
        next = linkedToken;
      }
      if (!next) return items;
      // Cvent's links can omit filter/limit. Like the official SDK, retain the
      // original request and advance ONLY the cursor, never follow a bare link.
      url = new URL(first); url.searchParams.set("token", next);
    }
    throw new ApiFailure("Cvent collection exceeded its bounded page limit; no partial result returned");
  }
  async client(eventId, family = "default", expectedEvent = null) {
    if (!UUID.test(eventId)) throw new ApiFailure("Approved Cvent API event UUID required");
    const credentials = await this.credentials();
    const base = new URL(credentials.baseUrl);
    let checkedBeforePut = false, putStarted = false;
    const scopedFetch = async (input, init = {}) => {
      const url = new URL(input), method = (init.method || "GET").toUpperCase();
      if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`) || url.username || url.password || url.hash) throw new ApiFailure("Cvent request escaped the configured API endpoint");
      const path = decodeURIComponent(url.pathname.slice(base.pathname.length));
      const oauth = path === "/oauth2/token" && method === "POST";
      const root = `/events/${eventId}`;
      const eventRead = method === "GET" && path === root && !url.search;
      const collectionRead = method === "GET" && collectionScope(url, path, eventId);
      const eventWrite = path === root && method === "PUT";
      const registrationWrite = method === "PUT" && new RegExp(`^/events/${eventId}/registration-types/[a-zA-Z0-9_-]+$`).test(path);
      const fieldWrite = method === "PUT" && new RegExp(`^/events/${eventId}/custom-fields/[a-zA-Z0-9_-]+/answers$`).test(path);
      if (!oauth && !eventRead && !collectionRead && !eventWrite && !registrationWrite && !fieldWrite) throw new ApiFailure("Cvent API operation is outside the approved event/capability scope");
      if (oauth) {
        const body = new URLSearchParams(init.body);
        body.set("client_id", credentials.clientId);
        return this.transport(url, { ...init, body });
      }
      if (expectedEvent && eventWrite && !checkedBeforePut) throw new ApiFailure("Event PUT requires a fresh unchanged baseline check");
      if (eventWrite) putStarted = true;
      const response = await this.transport(url, init);
      if (expectedEvent && !putStarted && method === "GET" && path === root) {
        const payload = await response.clone().json();
        if (!isDeepStrictEqual(payload.data ?? payload, expectedEvent)) throw new ApiFailure("Event changed immediately before PUT; reconcile before retry");
        checkedBeforePut = true;
      }
      return response;
    };
    return this.clientFactory(credentials, scopedFetch, family);
  }
  async assertTarget(target) {
    const client = await this.client(target.apiEventId);
    const event = await client.getEvent(target.apiEventId);
    if (event.id !== target.apiEventId || normalizeName(event.title ?? event.name) !== target.name) throw new ApiFailure("Cvent API event identity/name differs from the approved target");
    if (!["draft", "pending"].includes(String(event.status).trim().toLowerCase())) throw new ApiFailure("Cvent API target is not confirmed unpublished; execution blocked");
    return { event, client, receipt: { route: "api", eventId: event.id, name: target.name, status: event.status, verifiedAt: new Date().toISOString() } };
  }
  async configureDiscount(target, event, input, beforeWrite, recordEvidence) {
    if (!event.title?.startsWith("(C+D)")) throw new ApiFailure("Discount writes require the existing (C+D) event guard; no browser bypass");
    if (!object(input) || Object.keys(input).some(key => !["code", "discountId", "patch", "createIfMissing", "agendaItems"].includes(key)) || typeof input.code !== "string" || !input.code.trim() || input.code !== input.code.trim() || input.code.length > 30 || (input.discountId !== undefined && !UUID.test(input.discountId)) || (input.createIfMissing !== undefined && typeof input.createIfMissing !== "boolean") || !object(input.patch) || !Object.keys(input.patch).length || Object.keys(input.patch).some(key => !DISCOUNT_PATCH_FIELDS.includes(key))) throw new ApiFailure("Discount input requires an exact code and supported patch; existing-item changes are prohibited");
    if (input.agendaItems !== undefined && (!Array.isArray(input.agendaItems) || !input.agendaItems.length || input.agendaItems.length > 100 || input.agendaItems.some(item => !object(item) || Object.keys(item).some(key => !["id", "type"].includes(key)) || !UUID.test(item.id) || !["AdmissionItem", "QuantityItem"].includes(item.type)) || new Set(input.agendaItems.map(item => item.id)).size !== input.agendaItems.length)) throw new ApiFailure("agendaItems requires 1–100 unique, explicit AdmissionItem/QuantityItem UUIDs; sessions and other item types are outside scope");
    const rows = await this.readCollection(target.apiEventId, "listDiscounts");
    const before = discountMatch(rows, input.code);
    if (input.discountId && before?.id !== input.discountId) throw new ApiFailure("Discount ID/code does not match this event's catalog");
    if (!before && input.createIfMissing !== true) throw new ApiFailure("Discount code not found; creation requires explicit createIfMissing and complete configuration");
    const { body } = prepareDiscount(input, before);
    // Existing codes are immutable under the RR preservation policy. A verified
    // existing identity is not necessarily a match for this workbook's values.
    if (before) {
      const differences = Object.keys(input.patch).filter(key => !includesRequested(before[key], input.patch[key]));
      if (input.agendaItems) {
        if (before.applyToAllAgendaItems !== true) differences.push("applyToAllAgendaItems");
        const links = await this.discountLinks(target.apiEventId, before.id);
        if (!isDeepStrictEqual(links, this.itemKeys(input.agendaItems))) differences.push("agendaItems");
      }
      return { route: "api", action: differences.length ? "preserved" : "unchanged", verified: true, requirementsSatisfied: differences.length === 0, differences, eventId: target.apiEventId, discountId: before.id, saved: before };
    }
    if (input.agendaItems) return this.configureItemDiscount(target, event, input, { ...body, applyToAllAgendaItems: true }, beforeWrite, recordEvidence);
    const { credentials, token } = await this.authenticate();
    const latestEvent = (await this.assertTarget(target)).event;
    if (!isDeepStrictEqual(event, latestEvent)) throw new ApiFailure("Event changed during discount preparation; no write attempted");
    const latest = discountMatch(await this.readCollection(target.apiEventId, "listDiscounts"), input.code);
    if (!isDeepStrictEqual(before, latest)) throw new ApiFailure("Discount changed during preparation; no write attempted");
    const method = "POST";
    const path = `/events/${target.apiEventId}/discounts`;
    await beforeWrite({ method, path, baseline: before, body });
    // Exactly one mutation. Never replay on HTTP failure, stale search or timeout.
    const response = await this.transport(credentials.baseUrl + path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    let payload;
    try { payload = await response.json(); } catch { throw new ApiFailure("Discount write returned invalid JSON; saved state is uncertain"); }
    const acknowledged = payload?.data ?? payload;
    const discountId = acknowledged?.id;
    await recordEvidence({ phase: "ACKNOWLEDGED_NOT_VERIFIED", method, status: response.status, discountId: typeof discountId === "string" ? discountId : null, requestId: response.headers.get("x-request-id") || response.headers.get("x-cvent-request-id") });
    if (!UUID.test(discountId) || rows.some(row => row.id === discountId)) throw new ApiFailure("Discount write response has an unexpected identity; reconciliation required");
    const polls = [], started = Date.now();
    for (const delay of this.discountPollDelaysMs) {
      const remaining = delay - (Date.now() - started);
      if (remaining > 0) await this.sleeper(remaining);
      const found = await this.readCollection(target.apiEventId, "listDiscounts", discountId);
      if (found.length > 1) throw new ApiFailure("Discount readback has duplicate identities; reconciliation required");
      let saved = found[0];
      if (saved && (saved.level !== "EVENT" || saved.type !== "DISCOUNT_CODE" || typeof saved.code !== "string" || discountKey(saved.code) !== discountKey(input.code))) throw new ApiFailure("Discount readback escaped the approved code/level; reconciliation required");
      const matches = row => !!row && includesRequested(row, body);
      let matched = matches(saved);
      if (matched) {
        // Full scoped scan also catches duplicate codes after creation/update.
        const final = discountMatch(await this.readCollection(target.apiEventId, "listDiscounts"), input.code);
        if (final && final.id !== discountId) throw new ApiFailure("Discount code resolved to another identity after write");
        matched = matches(final); if (matched) saved = final;
      }
      const poll = { phase: "READBACK", discountId, elapsedMs: Date.now() - started, matched, saved: saved ?? null };
      polls.push(poll); await recordEvidence(poll);
      if (matched) {
        await this.assertTarget(target);
        return { route: "api", action: "created", method, verified: true, requirementsSatisfied: true, differences: [], eventId: target.apiEventId, discountId, saved, polls };
      }
    }
    throw new ApiFailure("Discount saved state did not verify within bounded polling; keep uncertainty, do not replay or use browser fallback");
  }
  itemKeys(items) { return items.map(item => `${item.type}:${item.id}`).sort(); }
  async discountItemsSnapshot(eventId, items) {
    const selected = [];
    for (const type of new Set(items.map(item => item.type))) {
      const rows = await this.readCollection(eventId, type === "AdmissionItem" ? "listAdmissionItems" : "listQuantityItems");
      if (rows.some(row => !UUID.test(row.id)) || new Set(rows.map(row => row.id)).size !== rows.length) throw new ApiFailure("Agenda-item catalog is ambiguous; no discount creation/link allowed");
      for (const item of items.filter(item => item.type === type)) {
        const row = rows.find(row => row.id === item.id);
        if (!row) throw new ApiFailure("Discount agenda item is missing from the approved event catalog");
        selected.push({ type, row });
      }
    }
    return selected;
  }
  async discountLinks(eventId, discountId) {
    const rows = await this.readCollection(eventId, "listDiscountedAgendaItems");
    if (rows.some(row => !UUID.test(row.id) || !UUID.test(row.discount?.id) || typeof row.type !== "string")) throw new ApiFailure("Discount association catalog is malformed; no partial proof of absence");
    const keys = this.itemKeys(rows.filter(row => row.discount.id === discountId));
    if (new Set(keys).size !== keys.length) throw new ApiFailure("Discount association catalog has duplicate identities");
    return keys;
  }
  async configureItemDiscount(target, event, input, desired, beforeWrite, recordEvidence) {
    // Complete initial configuration of ONE new discount in this command. Never
    // expose a standalone link/update tool that can modify an existing discount.
    const items = input.agendaItems;
    const catalog = await this.discountItemsSnapshot(target.apiEventId, items);
    await this.discountLinks(target.apiEventId, "00000000-0000-0000-0000-000000000000"); // Validate the complete link collection before creating anything.
    const initial = { ...input, patch: { ...input.patch, active: false } };
    delete initial.agendaItems;
    const created = await this.configureDiscount(target, event, initial, beforeWrite, recordEvidence);
    if (created.action !== "created") throw new ApiFailure("Discount appeared during preparation; preserve it rather than adding links");
    const discountId = created.discountId, base = `/events/${target.apiEventId}/discounts/${discountId}`;
    const baseline = created.saved;
    // Refuse a newly returned, unreviewed field before any link/finalizing PUT.
    // This is initial configuration, not permission for a lossy overwrite.
    prepareDiscount(input, baseline);
    const business = row => Object.fromEntries(Object.entries(row).filter(([key]) => !AUDIT_FIELDS.has(key)));
    const assertNewUnchanged = async () => {
      await this.assertTarget(target);
      const current = discountMatch(await this.readCollection(target.apiEventId, "listDiscounts"), input.code);
      if (!current || current.id !== discountId || !isDeepStrictEqual(business(current), business(baseline))) throw new ApiFailure("New discount changed before initial configuration completed; keep uncertainty");
      if (!isDeepStrictEqual(catalog, await this.discountItemsSnapshot(target.apiEventId, items))) throw new ApiFailure("Discount item catalog changed during preparation; keep uncertainty");
      return current;
    };
    let expectedLinks = [];
    for (const item of items) {
      await assertNewUnchanged();
      if (!isDeepStrictEqual(await this.discountLinks(target.apiEventId, discountId), expectedLinks)) throw new ApiFailure("New discount links changed unexpectedly; do not replace or replay");
      const { credentials, token } = await this.authenticate();
      const path = `${base}/agenda-items/${item.id}`;
      await beforeWrite({ phase: "LINK_NEW_DISCOUNT_ITEM", method: "PUT", path, baseline: null, discountId, agendaItem: item });
      const response = await this.transport(credentials.baseUrl + path, { method: "PUT", headers: { authorization: `Bearer ${token}` } });
      await recordEvidence({ phase: "LINK_ACKNOWLEDGED_NOT_VERIFIED", discountId, agendaItem: item, status: response.status });
      if (response.status !== 204) throw new ApiFailure("Discount link acknowledgment was unexpected; keep uncertainty");
      expectedLinks = [...expectedLinks, ...this.itemKeys([item])].sort();
      let matched = false; const started = Date.now();
      for (const delay of this.discountPollDelaysMs) {
        const remaining = delay - (Date.now() - started); if (remaining > 0) await this.sleeper(remaining);
        const links = await this.discountLinks(target.apiEventId, discountId);
        if (links.some(key => !expectedLinks.includes(key))) throw new ApiFailure("Unexpected discount association appeared; keep uncertainty");
        matched = isDeepStrictEqual(links, expectedLinks);
        await recordEvidence({ phase: "LINK_READBACK", discountId, links, matched });
        if (matched) break;
      }
      if (!matched) throw new ApiFailure("Discount link did not verify within bounded polling; do not resend");
    }
    const current = await assertNewUnchanged();
    if (!isDeepStrictEqual(await this.discountLinks(target.apiEventId, discountId), expectedLinks)) throw new ApiFailure("Discount links changed before finalization");
    const { credentials, token } = await this.authenticate();
    await beforeWrite({ phase: "FINALIZE_NEW_DISCOUNT", method: "PUT", path: base, baseline: current, body: desired, discountId });
    const response = await this.transport(credentials.baseUrl + base, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(desired) });
    let payload;
    try { payload = await response.json(); } catch { throw new ApiFailure("New discount finalization returned invalid JSON; keep uncertainty"); }
    await recordEvidence({ phase: "FINALIZE_ACKNOWLEDGED_NOT_VERIFIED", discountId, status: response.status });
    if ((payload?.data ?? payload)?.id !== discountId) throw new ApiFailure("Finalized discount acknowledgment has the wrong identity");
    const started = Date.now();
    for (const delay of this.discountPollDelaysMs) {
      const remaining = delay - (Date.now() - started); if (remaining > 0) await this.sleeper(remaining);
      const saved = discountMatch(await this.readCollection(target.apiEventId, "listDiscounts"), input.code);
      if (saved && saved.id !== discountId) throw new ApiFailure("Finalized discount identity changed; keep uncertainty");
      const links = await this.discountLinks(target.apiEventId, discountId);
      if (!isDeepStrictEqual(links, expectedLinks)) throw new ApiFailure("Finalized discount links did not preserve the requested item set");
      const expected = { ...baseline, ...desired, capacity: { ...baseline.capacity, ...desired.capacity } };
      const matched = !!saved && isDeepStrictEqual(business(saved), business(expected));
      await recordEvidence({ phase: "FINAL_READBACK", discountId, matched, saved: saved ?? null, links });
      if (matched) {
        await this.assertTarget(target);
        if (!isDeepStrictEqual(catalog, await this.discountItemsSnapshot(target.apiEventId, items))) throw new ApiFailure("Discount item catalog changed before final verification");
        return { ...created, saved, agendaItems: items, initialConfigurationComplete: true };
      }
    }
    throw new ApiFailure("New item discount finalization did not verify within bounded polling; keep uncertainty, never replay");
  }
  async execute(target, operation, input = {}, beforeWrite = async () => {}, recordEvidence = async () => {}) {
    if (!Object.hasOwn(CAPABILITIES, operation)) throw new ApiFailure("Operation is not exposed by the installed API adapter. Check API coverage documentation before authorizing browser fallback");
    if (CAPABILITIES[operation] === "api-read") {
      // Reads remain available to reconcile an uncertain rename or status change.
      const client = await this.client(target.apiEventId);
      const event = await client.getEvent(target.apiEventId);
      if (event.id !== target.apiEventId) throw new ApiFailure("Cvent API read returned a different event identity");
      return operation === "getEvent" ? event : this.readCollection(target.apiEventId, operation);
    }
    const { event, client } = await this.assertTarget(target);
    if (operation === "configureDiscount") return this.configureDiscount(target, event, input, beforeWrite, recordEvidence);
    if (operation === "updateEvent" || operation === "updateEventBasics") {
      const body = buildEventUpdate(event, input);
      const configured = await this.client(target.apiEventId, "configuration", event);
      // Refuse stale read/merge payloads; the API does not provide an ETag here.
      const latest = await client.getEvent(target.apiEventId);
      if (!isDeepStrictEqual(latest, event)) throw new ApiFailure("Event changed during update preparation; reconcile before retry");
      await beforeWrite();
      const write = await configured.updateEventBasics(target.apiEventId, body);
      const saved = await client.getEvent(target.apiEventId);
      verifyEventUpdate(event, saved, input);
      return { route: "api", method: "PUT", verified: true, eventId: saved.id, write, saved };
    }
    if (operation === "updateRegistrationType") {
      if (!UUID.test(input.registrationTypeId) || !input.patch || typeof input.patch !== "object" || Object.keys(input.patch).some(key => !["openForRegistration", "automaticOpenDate", "automaticEndDate", "capacity"].includes(key))) throw new ApiFailure("A registration type ID and supported patch are required");
      const configured = await this.client(target.apiEventId, "configuration");
      await beforeWrite();
      return configured.updateRegistrationType(target.apiEventId, input.registrationTypeId, input.patch);
    }
    if (!Array.isArray(input.fields) || !input.fields.length || input.fields.some(field => !field || !UUID.test(field.id) || typeof field.name !== "string" || typeof field.type !== "string" || !Array.isArray(field.value) || !field.value.every(value => typeof value === "string"))) throw new ApiFailure("Valid custom-field IDs and string values required");
    await beforeWrite();
    return client.updateEventCustomFieldAnswers(target.apiEventId, event.title, input.fields);
  }
}
