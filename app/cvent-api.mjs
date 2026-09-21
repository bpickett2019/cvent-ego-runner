import { readFile } from "node:fs/promises";
import { parseEnv, isDeepStrictEqual } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const CAPABILITIES = Object.freeze({
  getEvent: "api-read", listAdmissionItems: "api-read", listRegistrationPaths: "api-read",
  listRegistrationTypes: "api-read", listQuestions: "api-read",
  listFees: "api-read", listVouchers: "api-read", listDiscounts: "api-read", listDiscountedAgendaItems: "api-read",
  listQuantityItems: "api-read", listDonationItems: "api-read",
  listQuestionChoices: "api-read", listEventFeatures: "api-read",
  listContactTypes: "api-read", listEventCustomFieldDefinitions: "api-read",
  enableEventFeature: "api-write",
  configureDiscount: "api-write", configureVolumeDiscount: "api-write",
  updateEvent: "api-write", updateEventBasics: "api-write", updateRegistrationType: "api-write",
});
// Official Cvent OpenAPI routes. Keep collection reads here rather than using
// the installed client's stale routes or unbounded, permissive paginator.
export const BLOCKED_OPERATIONS = Object.freeze({
  listSessions: "Sessions/speakers work is outside this build SOW",
  updateEventCustomFieldAnswers: "Integration identifiers cannot be distinguished safely from build answers; no definition/answer edits exposed",
  createContactType: "Reviewed public contact-types route is GET only",
  createCustomField: "Account-wide visibility/default effects cannot be proven isolated from other events",
});
const COLLECTIONS = Object.freeze({
  listContactTypes: { path: "/contact-types" },
  listEventCustomFieldDefinitions: { path: "/custom-fields", filter: "category eq 'Event'" },
  listAdmissionItems: { path: "/admission-items", filtered: true },
  listRegistrationPaths: { path: "/events/{id}/registration-paths" },
  listRegistrationTypes: { path: "/events/{id}/registration-types" },
  listQuestions: { path: "/event-questions", filtered: true },
  listFees: { path: "/events/{id}/fee-items" },
  listVouchers: { path: "/events/{id}/vouchers" },
  listDiscounts: { path: "/events/{id}/discounts" },
  listDiscountedAgendaItems: { path: "/events/{id}/discounts/agenda-items" },
  listQuantityItems: { path: "/events/{id}/quantity-items" },
  listDonationItems: { path: "/events/{id}/donation-items" },
  listEventFeatures: { path: "/events/{id}/features" },
  listQuestionChoices: { path: "/event-questions/{questionId}/choices" },
});
function collectionScope(url, path, eventId, discountId = null, questionId = null) {
  const route = Object.values(COLLECTIONS).find(route => route.path.replace("{id}", eventId).replace("{questionId}", questionId || "{questionId}") === path);
  if (!route) return false;
  const allowed = route.filtered || route.filter || discountId ? ["limit", "token", "filter"] : ["limit", "token"];
  if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) return false;
  if (discountId) return route === COLLECTIONS.listDiscounts && UUID.test(discountId) && url.searchParams.get("filter") === `id in ('${discountId}')`;
  if (route.filter) return url.searchParams.get("filter") === route.filter;
  return !route.filtered || url.searchParams.get("filter") === `event.id eq '${eventId}'`;
}
const EVENT_FIELDS = new Set(["title", "description", "start", "end", "closeAfter", "timezone", "venues", "format", "type", "planners", "note", "languages", "capacity", "showVenueLocation", "showPointOfContact"]);
// These fields may be carried forward from GET, never supplied as changes.
const PRESERVE_ONLY_FIELDS = ["archiveAfter"];
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
export function clientPaths(env = process.env) {
  const project = env.CVENT_AGENT_ROOT || join(homedir(), "cvent-agent");
  const configuration = env.CVENT_UI_AUTOMATION_ROOT || join(homedir(), "cvent-ui-automation");
  return { loader: join(project, "node_modules/tsx/dist/esm/api/index.mjs"),
    defaultClient: join(project, "src/cvent/api.ts"), configurationClient: join(configuration, "src/cvent-api.ts") };
}
async function existingClient(credentials, fetcher, family = "default") {
  // Reuse the installed client, not its separate agent/runtime.
  const paths = clientPaths();
  const { tsImport } = await import(pathToFileURL(paths.loader).href);
  if (family === "configuration") {
    const { CventApi } = await tsImport(paths.configurationClient, import.meta.url);
    return new CventApi({ ...credentials, fetch: fetcher });
  }
  const { CventApi } = await tsImport(paths.defaultClient, import.meta.url);
  return new CventApi(credentials, fetcher);
}
export function includesRequested(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => includesRequested(actual[index], value));
  if (expected && typeof expected === "object") return !!actual && typeof actual === "object" && Object.entries(expected).every(([key, value]) => includesRequested(actual[key], value));
  return actual === expected;
}
export function buildEventUpdate(event, changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Object.keys(changes).length || Object.keys(changes).some(key => !EVENT_FIELDS.has(key))) throw new ApiFailure("Event changes contain unsupported or prohibited fields");
  const readOnly = ["id", "code", "virtual", "launchAfter", "phone", "defaultLocale", "currency", "registrationSecurityLevel", "status", "eventStatus", "planningStatus", "testMode", "stakeholders", "customFields", "category", "_links", "created", "createdBy", "meetingRequestId", ...AUDIT_FIELDS];
  if (Object.keys(event).some(key => ![...EVENT_FIELDS, ...PRESERVE_ONLY_FIELDS, ...readOnly].includes(key))) throw new ApiFailure("Unreviewed event baseline field; refusing potentially lossy PUT");
  // Retain the installed configuration client's explicit safety restrictions.
  if (typeof event.title !== "string" || !event.title.startsWith("(C+D)")) throw new ApiFailure("Installed event PUT client permits only (C+D) events; no browser bypass");
  if (Object.hasOwn(changes, "title") && changes.title !== event.title) throw new ApiFailure("Installed event PUT client requires the existing event title");
  for (const key of ["planners", "languages", "type"]) if (Object.hasOwn(changes, key) && !isDeepStrictEqual(changes[key], event[key])) throw new ApiFailure(`Changing ${key} may replace definitions/collections; not supported`);
  for (const key of ["description", "note"]) if (Object.hasOwn(changes, key)) text(changes[key], key === "note" ? 300 : 20000);
  for (const key of ["start", "end", "closeAfter"]) if (Object.hasOwn(changes, key)) timestamp(changes[key]);
  if (Object.hasOwn(changes, "capacity") && (!Number.isSafeInteger(changes.capacity) || changes.capacity < -1)) throw new ApiFailure("Invalid event capacity");
  if (Object.hasOwn(changes, "format") && !["In-person", "Virtual", "Hybrid"].includes(changes.format)) throw new ApiFailure("Invalid event format");
  if (Object.hasOwn(changes, "timezone")) { text(changes.timezone, 29); try { new Intl.DateTimeFormat("en", { timeZone: changes.timezone }); } catch { throw new ApiFailure("Invalid timezone"); } }
  for (const key of ["showVenueLocation", "showPointOfContact"]) if (Object.hasOwn(changes, key) && typeof changes[key] !== "boolean") throw new ApiFailure("Visibility must be boolean");
  const body = { ...Object.fromEntries([...EVENT_FIELDS, ...PRESERVE_ONLY_FIELDS].filter(key => Object.hasOwn(event, key)).map(key => [key, structuredClone(event[key])])), ...structuredClone(changes) };
  if (Object.hasOwn(changes, "venues")) {
    if (!Array.isArray(changes.venues) || changes.venues.length !== 1 || (event.venues?.length ?? 0) > 1) throw new ApiFailure("Venue removal/collection replacement is prohibited; supply one venue patch");
    const venue = changes.venues[0]; keys(venue, ["name", "address"]);
    if (Object.hasOwn(venue, "name")) text(venue.name, 300);
    if (Object.hasOwn(venue, "address")) { keys(venue.address, ["address1", "address2", "address3", "city", "regionCode", "postalCode", "countryCode"]); for (const [key, value] of Object.entries(venue.address)) { text(value, key === 'postalCode' ? 25 : key === 'regionCode' ? 10 : key === 'countryCode' ? 3 : 40); if (['regionCode', 'countryCode'].includes(key) && value.length < 2) throw new ApiFailure('Invalid venue address code'); } }
    body.venues = [{ ...event.venues?.[0], ...venue, ...(venue.address ? { address: { ...event.venues?.[0]?.address, ...venue.address } } : {}) }];
  }
  if (body.start && body.end && Date.parse(body.start) > Date.parse(body.end)) throw new ApiFailure("Event start is after end");
  if (["title", "format", "timezone", "type"].some(key => typeof body[key] !== "string" || !body[key]) || !Array.isArray(body.planners) || !Array.isArray(body.languages)) throw new ApiFailure("Fresh event baseline lacks the required PUT fields; refusing an incomplete update");
  if (body.closeAfter && body.end && Date.parse(body.closeAfter) > Date.parse(body.end)) throw new ApiFailure("Event registration deadline is after its end date; Cvent rejects this preserved schedule. Explicit approval to correct the dates is required before event PUT; no write attempted");
  return body;
}
function eventWireBody(body) {
  // Same nested writable projections as the installed configuration client and
  // reviewed Event/Venue/Planner schemas. Read-only contact data is never sent.
  const project = (value, writable, readOnly = []) => {
    if (!object(value) || Object.keys(value).some(key => ![...writable, ...readOnly].includes(key))) throw new ApiFailure("Unreviewed nested event field; refusing lossy replacement");
    return Object.fromEntries(writable.filter(key => Object.hasOwn(value, key)).map(key => [key, structuredClone(value[key])]));
  };
  const address = value => project(value, ["address1", "address2", "address3", "city", "countryCode", "postalCode", "regionCode"], ["region", "country", "latitude", "longitude"]);
  const wire = structuredClone(body);
  wire.planners = body.planners.map(planner => {
    const row = project(planner, ["prefix", "firstName", "lastName", "company", "title", "email", "type", "homeAddress", "workAddress"], ["nickname", "optOut", "pager", "_links", "deleted", "middleName", "ccEmail", "gender", "designation", "membership", "primaryAddressType", "homePhone", "homeFax", "workPhone", "workFax", "customFields", "sourceId", "mobilePhone", "created", "createdBy", ...AUDIT_FIELDS]);
    if (row.type) row.type = project(row.type, ["id"], ["name"]);
    for (const key of ["homeAddress", "workAddress"]) if (row[key]) row[key] = address(row[key]);
    return row;
  });
  if (body.venues) wire.venues = body.venues.map(venue => { const row = project(venue, ["name", "address"]); if (row.address) row.address = address(row.address); return row; });
  return wire;
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
function keys(value, allowed) { if (!object(value) || !Object.keys(value).length || Object.keys(value).some(key => !allowed.includes(key))) throw new ApiFailure("Unsupported/prohibited fields or empty patch"); }
function text(value, max) { if (typeof value !== "string" || !value.trim() || value.length > max) throw new ApiFailure("Explicit nonempty text required; clearing is prohibited"); }
function timestamp(value) { if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) throw new ApiFailure("Valid explicit UTC date-time required; clearing is prohibited"); }
const business = row => Object.fromEntries(Object.entries(row).filter(([key]) => !AUDIT_FIELDS.has(key)));
function uniqueRows(rows) { if (rows.some(row => !UUID.test(row.id)) || new Set(rows.map(row => row.id)).size !== rows.length) throw new ApiFailure("Catalog identities are missing or ambiguous"); }
function sameCatalog(actual, expected) {
  uniqueRows(actual); uniqueRows(expected);
  const sort = rows => rows.map(business).sort((a, b) => a.id.localeCompare(b.id));
  return isDeepStrictEqual(sort(actual), sort(expected));
}
function registrationBody(before, patch) {
  const fields = ["openForRegistration", "automaticOpenDate", "automaticEndDate", "capacity"];
  keys(patch, fields);
  if (Object.keys(before).some(key => ![...fields, "id", "event", "name", "code", "description", "virtual", ...AUDIT_FIELDS].includes(key))) throw new ApiFailure("Unreviewed registration baseline field; no lossy PUT");
  const body = { id: before.id, ...Object.fromEntries(fields.filter(key => Object.hasOwn(before, key)).map(key => [key, structuredClone(before[key])])), ...structuredClone(patch) };
  if (typeof body.openForRegistration !== "boolean") throw new ApiFailure("Explicit registration availability required");
  for (const key of ["automaticOpenDate", "automaticEndDate"]) if (Object.hasOwn(patch, key)) timestamp(patch[key]);
  if (body.automaticOpenDate && body.automaticEndDate && Date.parse(body.automaticOpenDate) > Date.parse(body.automaticEndDate)) throw new ApiFailure("Registration dates reversed");
  if (Object.hasOwn(patch, "capacity")) keys(patch.capacity, ["total"]);
  if (body.capacity) {
    if (!Number.isSafeInteger(body.capacity.total) || body.capacity.total < -1 || !Number.isSafeInteger(before.capacity?.consumed) || before.capacity.consumed < 0 || (body.capacity.total !== -1 && body.capacity.total < before.capacity.consumed) || Object.keys(before.capacity).some(key => !["total", "consumed", "remaining"].includes(key))) throw new ApiFailure("Registration capacity cannot be safely preserved");
    body.capacity = { total: body.capacity.total };
  }
  return body;
}
function discountMatch(rows, code, kind = "DISCOUNT_CODE") {
  const ids = new Set();
  for (const row of rows) {
    if (!UUID.test(row.id) || ids.has(row.id) || !["DISCOUNT_CODE", "VOLUME_DISCOUNT"].includes(row.type) || (row.type === "DISCOUNT_CODE" && (typeof row.code !== "string" || !row.code.trim()))) throw new ApiFailure("Discount catalog has invalid or duplicate identities; no write allowed");
    ids.add(row.id);
  }
  const volume = kind === "VOLUME_DISCOUNT";
  if (volume && rows.some(row => typeof row.name !== "string" || !row.name.trim())) throw new ApiFailure("Discount catalog has missing names; cannot prove volume-discount absence");
  const matches = rows.filter(row => volume ? row.name === code : typeof row.code === "string" && discountKey(row.code) === discountKey(code));
  if (matches.length > 1) throw new ApiFailure("Discount code is ambiguous; do not create or update duplicates");
  const row = matches[0];
  if (row && (row.level !== "EVENT" || row.type !== kind)) throw new ApiFailure("Discount identity collides with a different type or account-level item; preserve it without creating a replacement");
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
const VOLUME_FIELDS = ["name", "type", "active", "stackable", "method", "effectiveFrom", "effectiveTo", "note", "thresholdType", "thresholdLimit", "interval", "includePrimaryRegistrant"];
const VOLUME_PATCH_FIELDS = VOLUME_FIELDS.filter(key => !["name", "type"].includes(key));
function prepareVolumeDiscount(input, before) {
  if (before && Object.keys(before).some(key => ![...VOLUME_FIELDS, "id", "level", "event", "created", "createdBy", ...AUDIT_FIELDS].includes(key))) throw new ApiFailure("Volume discount baseline contains an unreviewed field; no lossy initial configuration");
  const body = { ...(before ? Object.fromEntries(VOLUME_FIELDS.filter(key => Object.hasOwn(before, key)).map(key => [key, structuredClone(before[key])])) : { name: input.name, type: "VOLUME_DISCOUNT" }), ...structuredClone(input.patch) };
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 50 || body.type !== "VOLUME_DISCOUNT") throw new ApiFailure("Volume discount name/type required");
  if (["active", "stackable", "includePrimaryRegistrant"].some(key => typeof body[key] !== "boolean")) throw new ApiFailure("Volume discount flags must be explicit booleans");
  if (!object(body.method) || Object.keys(body.method).some(key => !["type", "value"].includes(key)) || !["BY_AMOUNT", "BY_PERCENTAGE", "FLAT_PRICE"].includes(body.method.type) || !Number.isFinite(body.method.value) || body.method.value < 0 || (body.method.type === "BY_PERCENTAGE" && body.method.value > 100)) throw new ApiFailure("Invalid volume discount method/value");
  if (!["ALL", "AFTER_THRESHOLD_LIMIT", "BEFORE_THRESHOLD_LIMIT", "EVERY_NTH_REGISTRANT"].includes(body.thresholdType) || !Number.isSafeInteger(body.thresholdLimit) || body.thresholdLimit < 1 || !Number.isInteger(body.interval) || body.interval < 1 || body.interval > 10) throw new ApiFailure("Explicit supported volume threshold and interval required");
  if ((body.thresholdType !== "EVERY_NTH_REGISTRANT" && body.interval !== 1) || (body.thresholdType !== "BEFORE_THRESHOLD_LIMIT" && body.includePrimaryRegistrant !== false)) throw new ApiFailure("Volume interval/primary-registrant flags do not apply to this threshold type");
  if (Object.hasOwn(body, "note") && (typeof body.note !== "string" || body.note.length > 300)) throw new ApiFailure("Invalid volume discount note");
  for (const key of ["effectiveFrom", "effectiveTo"]) if (Object.hasOwn(body, key) && (typeof body[key] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body[key]) || !Number.isFinite(Date.parse(body[key])) || new Date(body[key]).toISOString().slice(0, 10) !== body[key])) throw new ApiFailure("Volume effective dates must be valid ISO dates");
  if (body.effectiveFrom && body.effectiveTo && body.effectiveFrom > body.effectiveTo) throw new ApiFailure("Volume effective dates are reversed");
  return { body };
}
export class CventConnection {
  constructor({ credentials = () => loadCredentials(), fetcher = fetch, clientFactory = existingClient, mutationGuard = async () => {}, intervalMs = 520, discountPollDelaysMs = [1000, 2000, 5000, 10000, 20000, 30000, 60000], sleeper = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    this.credentials = credentials; this.fetcher = fetcher; this.clientFactory = clientFactory; this.mutationGuard = mutationGuard;
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
      if (!["GET", "HEAD"].includes((init.method || "GET").toUpperCase()) && !new URL(url).pathname.endsWith("/oauth2/token")) await this.mutationGuard();
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
  async readCollection(eventId, operation, discountId = null, questionId = null) {
    if (!UUID.test(eventId) || !Object.hasOwn(COLLECTIONS, operation) || (discountId !== null && (operation !== "listDiscounts" || !UUID.test(discountId))) || (operation === "listQuestionChoices" ? !UUID.test(questionId || "") : questionId !== null)) throw new ApiFailure("Approved event and collection operation required");
    // Choices have a question-only URL: establish event membership from a complete
    // scoped catalog before following that URL, never from an input event claim.
    if (operation === "listQuestionChoices") {
      const questions = await this.readCollection(eventId, "listQuestions");
      if (questions.some(row => !UUID.test(row.id)) || new Set(questions.map(row => row.id)).size !== questions.length || questions.filter(row => row.id === questionId).length !== 1) throw new ApiFailure("Question identity is missing or ambiguous in the approved event");
    }
    const { credentials, token } = await this.authenticate();
    const route = COLLECTIONS[operation];
    const first = new URL(`${credentials.baseUrl}${route.path.replace("{id}", eventId).replace("{questionId}", questionId)}`);
    first.searchParams.set("limit", "100");
    if (route.filtered) first.searchParams.set("filter", `event.id eq '${eventId}'`);
    if (route.filter) first.searchParams.set("filter", route.filter);
    if (discountId) first.searchParams.set("filter", `id in ('${discountId}')`);
    const path = first.pathname.slice(new URL(credentials.baseUrl).pathname.length);
    let url = first;
    const seen = new Set(), items = [];
    for (let count = 0; count < 200; count++) {
      const cursor = url.searchParams.get("token") ?? "";
      if (url.origin !== first.origin || url.pathname !== first.pathname || url.username || url.password || url.hash || !collectionScope(url, path, eventId, discountId, questionId) || seen.has(cursor)) throw new ApiFailure("Unsafe or repeated Cvent collection pagination; no partial result returned");
      seen.add(cursor);
      const response = await this.transport(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
      let page;
      try { page = await response.json(); } catch { throw new ApiFailure("Cvent collection returned invalid JSON; no partial result returned"); }
      if (!Array.isArray(page?.data) || page.data.some(item => !item || typeof item !== "object" || Array.isArray(item))) throw new ApiFailure("Cvent collection response has invalid data; no partial result returned");
      if (page.data.some(item => item.event?.id != null && item.event.id !== eventId)) throw new ApiFailure("Cvent collection returned a different event identity; no partial result returned");
      if (operation === "listEventCustomFieldDefinitions" && page.data.some(item => item.category !== "Event")) throw new ApiFailure("Custom-field catalog escaped the Event category");
      if (questionId && page.data.some(item => item.question?.id != null && item.question.id !== questionId)) throw new ApiFailure("Choice read returned a different question identity");
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
  async client(eventId, family = "default") {
    if (!UUID.test(eventId)) throw new ApiFailure("Approved Cvent API event UUID required");
    const credentials = await this.credentials();
    const base = new URL(credentials.baseUrl);
    const scopedFetch = async (input, init = {}) => {
      const url = new URL(input), method = (init.method || "GET").toUpperCase();
      if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`) || url.username || url.password || url.hash) throw new ApiFailure("Cvent request escaped the configured API endpoint");
      const path = decodeURIComponent(url.pathname.slice(base.pathname.length));
      const oauth = path === "/oauth2/token" && method === "POST";
      const root = `/events/${eventId}`;
      const eventRead = method === "GET" && path === root && !url.search;
      const collectionRead = method === "GET" && collectionScope(url, path, eventId);
      // Installed clients are read transports only. All writes go through the
      // adapter's prepared, validated, receipt-bound dispatch below.
      if (!oauth && !eventRead && !collectionRead) throw new ApiFailure("Cvent API operation is outside the approved event/capability scope");
      if (oauth) {
        const body = new URLSearchParams(init.body);
        body.set("client_id", credentials.clientId);
        return this.transport(url, { ...init, body });
      }
      return this.transport(url, init);
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
  async configureDiscount(target, event, input, beforeWrite, recordEvidence, kind = "DISCOUNT_CODE") {
    if (!event.title?.startsWith("(C+D)")) throw new ApiFailure("Discount writes require the existing (C+D) event guard; no browser bypass");
    const volume = kind === "VOLUME_DISCOUNT", identityKey = volume ? "name" : "code";
    const identity = input?.[identityKey], fields = volume ? VOLUME_PATCH_FIELDS : DISCOUNT_PATCH_FIELDS;
    const match = rows => discountMatch(rows, identity, kind);
    const prepare = volume ? prepareVolumeDiscount : prepareDiscount;
    if (!object(input) || Object.keys(input).some(key => ![identityKey, "discountId", "patch", "createIfMissing", "agendaItems"].includes(key)) || typeof identity !== "string" || !identity.trim() || identity !== identity.trim() || identity.length > (volume ? 50 : 30) || (input.discountId !== undefined && !UUID.test(input.discountId)) || (input.createIfMissing !== undefined && typeof input.createIfMissing !== "boolean") || !object(input.patch) || !Object.keys(input.patch).length || Object.keys(input.patch).some(key => !fields.includes(key))) throw new ApiFailure("Discount input requires an exact identity and supported patch");
    if (Object.hasOwn(input.patch, "note")) text(input.patch.note, 300);
    if (input.agendaItems !== undefined && (!Array.isArray(input.agendaItems) || !input.agendaItems.length || input.agendaItems.length > 100 || input.agendaItems.some(item => !object(item) || Object.keys(item).some(key => !["id", "type"].includes(key)) || !UUID.test(item.id) || !["AdmissionItem", "QuantityItem"].includes(item.type)) || new Set(input.agendaItems.map(item => item.id)).size !== input.agendaItems.length)) throw new ApiFailure("agendaItems requires 1–100 unique, explicit AdmissionItem/QuantityItem UUIDs; sessions and other item types are outside scope");
    const rows = await this.readCollection(target.apiEventId, "listDiscounts");
    const before = match(rows);
    if (input.discountId && before?.id !== input.discountId) throw new ApiFailure("Discount ID/code does not match this event's catalog");
    if (!before && input.createIfMissing !== true) throw new ApiFailure("Discount code not found; creation requires explicit createIfMissing and complete configuration");
    const { body } = prepare(input, before);
    if (before) {
      if (before[identityKey] !== identity) throw new ApiFailure("Exact RR identity differs from the existing code; renaming/suffix substitution is not supported");
      return this.updateDiscount(target, event, input, before, body, beforeWrite, recordEvidence, kind);
    }
    if (volume) {
      // Exact RR names matter. An equivalent rule under a different name is
      // not an exact match and does not prohibit a separate RR-compliant rule.
      await this.discountLinks(target.apiEventId, "00000000-0000-0000-0000-000000000000");
    }
    if (input.agendaItems) return this.configureItemDiscount(target, event, input, volume ? body : { ...body, applyToAllAgendaItems: true }, beforeWrite, recordEvidence, kind);
    const { credentials, token } = await this.authenticate();
    const latestEvent = (await this.assertTarget(target)).event;
    if (!isDeepStrictEqual(event, latestEvent)) throw new ApiFailure("Event changed during discount preparation; no write attempted");
    const latestRows = await this.readCollection(target.apiEventId, "listDiscounts");
    const latest = match(latestRows);
    if (volume && !isDeepStrictEqual(rows, latestRows)) throw new ApiFailure("Discount catalog changed during volume preparation; no write attempted");
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
      if (saved && (saved.level !== "EVENT" || saved.type !== kind || typeof saved[identityKey] !== "string" || (volume ? saved.name !== identity : discountKey(saved.code) !== discountKey(identity)))) throw new ApiFailure("Discount readback escaped the approved code/level; reconciliation required");
      const matches = row => !!row && includesRequested(row, body);
      let matched = matches(saved);
      if (matched) {
        // Full scoped scan also catches duplicate codes after creation/update.
        const final = match(await this.readCollection(target.apiEventId, "listDiscounts"));
        if (final && final.id !== discountId) throw new ApiFailure("Discount code resolved to another identity after write");
        matched = matches(final); if (matched) saved = final;
      }
      if (matched && volume && (await this.discountLinks(target.apiEventId, discountId)).length) throw new ApiFailure("New volume discount has unexpected associations; retain uncertainty");
      const poll = { phase: "READBACK", discountId, elapsedMs: Date.now() - started, matched, saved: saved ?? null };
      polls.push(poll); await recordEvidence(poll);
      if (matched) {
        await this.assertTarget(target);
        return { route: "api", action: "created", method, verified: true, requirementsSatisfied: true, differences: [], eventId: target.apiEventId, discountId, saved, polls };
      }
    }
    throw new ApiFailure("Discount saved state did not verify within bounded polling; keep uncertainty, do not replay or use browser fallback");
  }
  async dispatch(prepared, beforeWrite, recordEvidence, recheck = async () => {}) {
    const { credentials, token } = await this.authenticate();
    await beforeWrite(prepared);
    await recheck();
    const response = await this.transport(credentials.baseUrl + prepared.path, { method: prepared.method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(prepared.body ? { body: JSON.stringify(prepared.body) } : {}) });
    await recordEvidence({ phase: "ACKNOWLEDGED_NOT_VERIFIED", status: response.status, path: prepared.path, requestId: response.headers.get("x-request-id") || response.headers.get("x-cvent-request-id") });
    if (response.status === 204) return null;
    let payload;
    try { payload = await response.json(); } catch {
      await recordEvidence({ phase: "ACKNOWLEDGMENT_BODY", format: "INVALID_JSON", path: prepared.path });
      throw new ApiFailure("Write acknowledgment invalid; keep uncertainty");
    }
    const secrets = [credentials.clientId, credentials.clientSecret, token].filter(Boolean).sort((a, b) => b.length - a.length);
    const sanitize = (value, depth = 0) => {
      if (depth > 6) return "[depth limited]";
      if (typeof value === "string") return secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value).slice(0, 1000);
      if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitize(item, depth + 1));
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [/authorization|cookie|token|secret|password|client.?id|api.?key/i.test(key) ? "[sensitive field]" : secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), key), /authorization|cookie|token|secret|password|client.?id|api.?key/i.test(key) ? "[redacted]" : sanitize(item, depth + 1)]));
      return value;
    };
    const sanitized = JSON.stringify(sanitize(payload));
    await recordEvidence({ phase: "ACKNOWLEDGMENT_BODY", path: prepared.path, format: Array.isArray(payload) ? "ARRAY" : payload === null ? "NULL" : typeof payload, ...(sanitized.length <= 16384 ? { body: JSON.parse(sanitized) } : { truncated: true, preview: sanitized.slice(0, 16384) }) });
    // A documented resource object takes precedence over incidental data fields.
    return object(payload) && (Object.hasOwn(payload, "id") || Object.hasOwn(payload, "type")) ? payload : payload?.data ?? payload;
  }
  async pollSaved(read, matches, recordEvidence) {
    const started = Date.now();
    for (const delay of this.discountPollDelaysMs) {
      const remaining = delay - (Date.now() - started); if (remaining > 0) await this.sleeper(remaining);
      const saved = await read(), matched = matches(saved);
      await recordEvidence({ phase: "READBACK", matched, saved });
      if (matched) return saved;
    }
    throw new ApiFailure("Saved state did not verify within bounded polling; retain uncertainty, never replay");
  }
  async updateDiscount(target, event, input, before, body, beforeWrite, recordEvidence, kind) {
    const id = target.apiEventId, volume = kind === "VOLUME_DISCOUNT";
    const match = rows => discountMatch(rows, volume ? input.name : input.code, kind);
    let links = await this.discountLinks(id, before.id);
    const desiredLinks = input.agendaItems ? this.itemKeys(input.agendaItems) : links;
    if (links.some(key => !desiredLinks.includes(key))) throw new ApiFailure("Removing/replacing existing discount links is prohibited");
    const catalog = input.agendaItems ? await this.discountItemsSnapshot(id, input.agendaItems) : null;
    if (input.agendaItems && !volume) body = { ...body, applyToAllAgendaItems: true };
    const expected = { ...before, ...body, ...(!volume ? { capacity: { ...before.capacity, ...body.capacity } } : {}) };
    if (isDeepStrictEqual(business(before), business(expected)) && isDeepStrictEqual(links, desiredLinks)) return { route: "api", action: "unchanged", verified: true, requirementsSatisfied: true, differences: [], eventId: id, discountId: before.id, saved: before };
    const assertBaseline = async () => {
      if (!isDeepStrictEqual(event, (await this.assertTarget(target)).event) || !isDeepStrictEqual(business(before), business(match(await this.readCollection(id, "listDiscounts")) ?? {}))) throw new ApiFailure("Discount/event changed during preparation; do not write or replay");
      if (!isDeepStrictEqual(links, await this.discountLinks(id, before.id)) || (catalog && !isDeepStrictEqual(catalog, await this.discountItemsSnapshot(id, input.agendaItems)))) throw new ApiFailure("Discount links/items changed during preparation");
    };
    const root = `/events/${id}/discounts/${before.id}`;
    for (const item of input.agendaItems ?? []) {
      const key = this.itemKeys([item])[0]; if (links.includes(key)) continue;
      await assertBaseline();
      const ack = await this.dispatch({ phase: "ADD_DISCOUNT_ITEM", method: "PUT", path: `${root}/agenda-items/${item.id}`, baseline: before, discountId: before.id, agendaItem: item, existingLinks: links }, beforeWrite, recordEvidence);
      if (ack !== null) throw new ApiFailure("Unexpected link acknowledgment; keep uncertainty");
      links = [...links, key].sort();
      await this.pollSaved(() => this.discountLinks(id, before.id), saved => isDeepStrictEqual(saved, links), recordEvidence);
    }
    await assertBaseline();
    let saved = before;
    if (!isDeepStrictEqual(business(before), business(expected))) {
      const ack = await this.dispatch({ phase: "UPDATE_DISCOUNT", method: "PUT", path: root, baseline: before, body, discountId: before.id }, beforeWrite, recordEvidence);
      if (ack?.id !== before.id) throw new ApiFailure("Discount acknowledgment has wrong identity; keep uncertainty");
      saved = await this.pollSaved(async () => match(await this.readCollection(id, "listDiscounts")), row => !!row && isDeepStrictEqual(business(row), business(expected)), recordEvidence);
    }
    if (!isDeepStrictEqual(links, await this.discountLinks(id, before.id)) || (catalog && !isDeepStrictEqual(catalog, await this.discountItemsSnapshot(id, input.agendaItems)))) throw new ApiFailure("Discount relationships/items did not preserve saved state");
    await this.assertTarget(target);
    return { route: "api", action: "updated", verified: true, requirementsSatisfied: true, differences: [], eventId: id, discountId: before.id, saved, links };
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
  async configureItemDiscount(target, event, input, desired, beforeWrite, recordEvidence, kind = "DISCOUNT_CODE") {
    const volume = kind === "VOLUME_DISCOUNT";
    const match = rows => discountMatch(rows, volume ? input.name : input.code, kind);
    // Complete initial configuration of ONE new discount in this command. Never
    // expose a standalone link/update tool that can modify an existing discount.
    const items = input.agendaItems;
    const catalog = await this.discountItemsSnapshot(target.apiEventId, items);
    await this.discountLinks(target.apiEventId, "00000000-0000-0000-0000-000000000000"); // Validate the complete link collection before creating anything.
    const initial = { ...input, patch: { ...input.patch, active: false } };
    delete initial.agendaItems;
    const created = await this.configureDiscount(target, event, initial, beforeWrite, recordEvidence, kind);
    if (created.action !== "created") throw new ApiFailure("Discount appeared during preparation; preserve it rather than adding links");
    const discountId = created.discountId, base = `/events/${target.apiEventId}/discounts/${discountId}`;
    const baseline = created.saved;
    // Refuse a newly returned, unreviewed field before any link/finalizing PUT.
    // This is initial configuration, not permission for a lossy overwrite.
    (volume ? prepareVolumeDiscount : prepareDiscount)(input, baseline);
    const assertNewUnchanged = async () => {
      await this.assertTarget(target);
      const current = match(await this.readCollection(target.apiEventId, "listDiscounts"));
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
      const saved = match(await this.readCollection(target.apiEventId, "listDiscounts"));
      if (saved && saved.id !== discountId) throw new ApiFailure("Finalized discount identity changed; keep uncertainty");
      const links = await this.discountLinks(target.apiEventId, discountId);
      if (!isDeepStrictEqual(links, expectedLinks)) throw new ApiFailure("Finalized discount links did not preserve the requested item set");
      const expected = volume ? { ...baseline, ...desired } : { ...baseline, ...desired, capacity: { ...baseline.capacity, ...desired.capacity } };
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
    if (Object.hasOwn(BLOCKED_OPERATIONS, operation)) throw new ApiFailure(BLOCKED_OPERATIONS[operation]);
    if (!Object.hasOwn(CAPABILITIES, operation)) throw new ApiFailure("Operation is not exposed by the installed API adapter. Check API coverage documentation before authorizing browser fallback");
    if (CAPABILITIES[operation] === "api-read") {
      // Reads remain available to reconcile an uncertain rename or status change.
      const client = await this.client(target.apiEventId);
      const event = await client.getEvent(target.apiEventId);
      if (event.id !== target.apiEventId) throw new ApiFailure("Cvent API read returned a different event identity");
      if (operation === "listQuestionChoices" && (!object(input) || Object.keys(input).some(key => key !== "questionId") || !UUID.test(input.questionId || ""))) throw new ApiFailure("listQuestionChoices requires only an explicit questionId");
      return operation === "getEvent" ? event : this.readCollection(target.apiEventId, operation, null, operation === "listQuestionChoices" ? input.questionId : null);
    }
    const { event, client } = await this.assertTarget(target);
    if (!event.title?.startsWith("(C+D)")) throw new ApiFailure("Writes require the retained (C+D) event guard; no bypass");
    if (operation === "configureDiscount" || operation === "configureVolumeDiscount") return this.configureDiscount(target, event, input, beforeWrite, recordEvidence, operation === "configureVolumeDiscount" ? "VOLUME_DISCOUNT" : "DISCOUNT_CODE");
    const id = target.apiEventId;
    if (operation === "updateEvent" || operation === "updateEventBasics") {
      const body = buildEventUpdate(event, input);
      if (body.languages.length !== 1 || body.planners.length > 1) throw new ApiFailure("Event PUT cannot preserve unsupported language/planner collections");
      const wire = eventWireBody(body);
      const expected = { ...event, ...body };
      const comparable = row => {
        const copy = business(structuredClone(row));
        for (const key of ['start', 'end', 'closeAfter', 'archiveAfter']) if (typeof copy[key] === 'string' && Number.isFinite(Date.parse(copy[key]))) copy[key] = new Date(copy[key]).toISOString();
        if (input.format) delete copy.virtual; // Deprecated read-only projection of format.
        if (input.venues?.[0]?.address && copy.venues?.[0]?.address) {
          for (const key of ['latitude', 'longitude']) delete copy.venues[0].address[key];
          if (Object.hasOwn(input.venues[0].address, 'countryCode')) delete copy.venues[0].address.country;
          if (Object.hasOwn(input.venues[0].address, 'regionCode')) delete copy.venues[0].address.region;
        }
        return copy;
      };
      if (isDeepStrictEqual(expected, event)) return { route: "api", action: "unchanged", verified: true, saved: event };
      if (!isDeepStrictEqual(event, (await this.assertTarget(target)).event)) throw new ApiFailure("Event changed during update preparation");
      const ack = await this.dispatch({ phase: "UPDATE_EVENT", method: "PUT", path: `/events/${id}`, baseline: event, body: wire }, beforeWrite, recordEvidence, async () => { if (!isDeepStrictEqual(event, (await this.assertTarget(target)).event)) throw new ApiFailure("Event changed immediately before PUT; no dispatch"); });
      if (ack?.id !== id) throw new ApiFailure("Event acknowledgment has wrong identity; keep uncertainty");
      const saved = await this.pollSaved(() => client.getEvent(id), row => isDeepStrictEqual(comparable(row), comparable(expected)), recordEvidence);
      await this.assertTarget(target);
      return { route: "api", method: "PUT", action: "updated", verified: true, eventId: id, saved };
    }
    if (operation === "updateRegistrationType") {
      keys(input, ["registrationTypeId", "patch"]);
      if (!UUID.test(input.registrationTypeId)) throw new ApiFailure("Explicit registration type UUID required");
      const rows = await this.readCollection(id, "listRegistrationTypes"); uniqueRows(rows);
      const before = rows.find(row => row.id === input.registrationTypeId);
      if (!before) throw new ApiFailure("Registration type is not in the selected event");
      const body = registrationBody(before, input.patch);
      const expected = { ...before, ...body, ...(body.capacity ? { capacity: { ...before.capacity, ...body.capacity, ...(Object.hasOwn(before.capacity, "remaining") ? { remaining: body.capacity.total === -1 ? -1 : body.capacity.total - before.capacity.consumed } : {}) } } : {}) };
      if (isDeepStrictEqual(before, expected)) return { route: "api", action: "unchanged", verified: true, saved: before };
      if (!isDeepStrictEqual(rows, await this.readCollection(id, "listRegistrationTypes")) || !isDeepStrictEqual(event, (await this.assertTarget(target)).event)) throw new ApiFailure("Registration/event baseline changed before write");
      const ack = await this.dispatch({ phase: "UPDATE_REGISTRATION_TYPE", method: "PUT", path: `/events/${id}/registration-types/${before.id}`, baseline: before, body }, beforeWrite, recordEvidence);
      if (ack?.id !== before.id) throw new ApiFailure("Registration acknowledgment has wrong identity; keep uncertainty");
      const expectedRows = rows.map(row => row.id === before.id ? expected : row);
      const savedRows = await this.pollSaved(() => this.readCollection(id, "listRegistrationTypes"), result => sameCatalog(result, expectedRows), recordEvidence);
      await this.assertTarget(target);
      return { route: "api", method: "PUT", action: "updated", verified: true, eventId: id, saved: savedRows.find(row => row.id === before.id) };
    }
    if (operation === "enableEventFeature") {
      keys(input, ["type"]);
      if (!["Website", "Registration"].includes(input.type)) throw new ApiFailure("Only Website/Registration feature enablement is in scope; no disable/launch");
      const rows = await this.readCollection(id, "listEventFeatures");
      if (new Set(rows.map(row => row.type)).size !== rows.length) throw new ApiFailure("Ambiguous feature catalog");
      const before = rows.find(row => row.type === input.type);
      if (!before || typeof before.enabled !== "boolean" || before.locked !== false || Object.keys(before).some(key => !["type", "enabled", "locked", "lockedReason", "enabledTier", "availableTiers", "config", "weblink"].includes(key))) throw new ApiFailure("Feature scope/configuration is unavailable or locked");
      if (before.enabled) return { route: "api", action: "unchanged", verified: true, saved: before };
      if (before.type === "Registration" && (!object(before.config) || Object.keys(before.config).some(key => key !== 'pricing') || !object(before.config.pricing) || typeof before.config.pricing.enabled !== 'boolean' || !['invoicePrefix', 'revenueGoal', 'merchantAccount', 'currency', 'allowedPaymentMethods'].every(key => Object.hasOwn(before.config.pricing, key)))) throw new ApiFailure("Registration feature enablement lacks a complete pricing baseline; cannot preserve payment defaults");
      const body = { type: before.type, enabled: true, ...Object.fromEntries(["enabledTier", "config"].filter(key => Object.hasOwn(before, key)).map(key => [key, structuredClone(before[key])])) };
      if (!isDeepStrictEqual(rows, await this.readCollection(id, "listEventFeatures")) || !isDeepStrictEqual(event, (await this.assertTarget(target)).event)) throw new ApiFailure("Feature/event baseline changed before write");
      const ack = await this.dispatch({ phase: "ENABLE_EVENT_FEATURE", method: "PUT", path: `/events/${id}/features/${before.type}`, baseline: before, body }, beforeWrite, recordEvidence);
      const featureFields = ["type", "enabled", "locked", "lockedReason", "enabledTier", "availableTiers", "config", "weblink"];
      if (ack !== null && (!object(ack) || (Object.hasOwn(ack, "type") && ack.type !== before.type) || Object.keys(ack).some(key => !featureFields.includes(key)))) throw new ApiFailure("Feature acknowledgment has wrong or unsupported identity; retain uncertainty");
      if (ack?.type === undefined) await recordEvidence({ phase: "ACK_IDENTITY_ABSENT_READBACK_REQUIRED", expectedType: before.type });
      // Missing identity on a successful acknowledgment is not proof of failure.
      // Only the full independently read catalog + selected Draft event below can
      // establish success. Conflicting/foreign identities never reach this path.
      if (ack && !includesRequested({ ...before, enabled: true }, ack)) throw new ApiFailure("Feature acknowledgment conflicts with requested state; retain uncertainty");
      const expected = rows.map(row => row.type === before.type ? { ...row, enabled: true } : row);
      const saved = await this.pollSaved(() => this.readCollection(id, "listEventFeatures"), result => isDeepStrictEqual(result, expected), recordEvidence);
      await this.assertTarget(target);
      return { route: "api", action: "updated", verified: true, eventId: id, saved };
    }
    throw new ApiFailure("No scoped write implementation");
  }
}
