import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { CventConnection, buildEventUpdate } from '../app/cvent-api.mjs';

const id = '11111111-1111-1111-1111-111111111111', typeId = '22222222-2222-2222-2222-222222222222';
const event = { id, title: '(C+D) Scoped Test', status: 'Pending', format: 'In-person', type: 'Conference', timezone: 'America/New_York', languages: ['en-US'], planners: [{ firstName: 'Planner' }], note: 'Original', start: '2030-01-01T12:00:00Z', end: '2030-01-02T12:00:00Z', closeAfter: '2030-01-01T11:00:00Z', capacity: 100, venues: [{ name: 'Original venue', address: { address1: 'Keep this street', city: 'Original city', countryCode: 'US' } }] };
const reg = { id: typeId, name: 'Shared name', code: 'SHARED_CODE', event: { id }, openForRegistration: true, automaticOpenDate: '2029-01-01T12:00:00Z', capacity: { total: 100, consumed: 2, remaining: 98 } };
const feature = { type: 'Website', enabled: false, locked: false };
const target = { apiEventId: id, name: event.title };
const json = body => new Response(JSON.stringify(body), { status: 200 });
function fixture(options = {}) {
  let currentEvent = structuredClone({ ...event, ...options.event }), types = structuredClone(options.types ?? [reg]), features = structuredClone(options.features ?? [feature]);
  const writes = [], evidence = [], intents = [], requests = [];
  const api = new CventConnection({ intervalMs: 0, discountPollDelaysMs: [0, 1, 2], sleeper: async () => {}, credentials: async () => ({ baseUrl: 'https://api-platform.cvent.com/ea', clientId: 'dummy', clientSecret: 'dummy' }),
    clientFactory: async () => ({ getEvent: async () => structuredClone(currentEvent) }),
    fetcher: async (input, init = {}) => {
      const u = new URL(input), m = init.method ?? 'GET', root = `/ea/events/${id}`;
      requests.push({ method: m, path: u.pathname });
      if (u.pathname.endsWith('/oauth2/token')) return json({ access_token: 'dummy' });
      if (m === 'PUT') {
        assert.equal(intents.length, writes.length + 1);
        const body = JSON.parse(init.body); writes.push(body);
        if (options.fail) return new Response('{}', { status: 403 });
        if (options.lost) throw new Error('lost');
        if (!options.stale) {
          if (u.pathname === root) currentEvent = { ...currentEvent, ...body, ...options.savedDrift };
          else if (u.pathname === `${root}/registration-types/${typeId}`) types = types.map(row => row.id === typeId ? { ...row, ...body, capacity: { ...row.capacity, ...body.capacity, remaining: body.capacity.total - row.capacity.consumed }, ...options.savedDrift } : row);
          else if (u.pathname === `${root}/features/${body.type}` && ['Website', 'Registration'].includes(body.type)) features = features.map(row => row.type === body.type ? { ...row, ...body, ...options.savedDrift } : row);
          else assert.fail('unscoped route');
        }
        return json(Object.hasOwn(options, 'ack') ? options.ack : options.wrongAck ? { id: 'wrong' } : u.pathname === root ? currentEvent : u.pathname.includes('/registration-types/') ? types[0] : features[0]);
      }
      assert.equal(m, 'GET');
      if (u.pathname === `${root}/registration-types`) return json({ data: types });
      if (u.pathname === `${root}/features`) return json({ data: features });
      if (u.pathname === '/ea/contact-types') { assert.equal(u.searchParams.has('filter'), false); return json({ data: [{ id: typeId, name: 'Shared name', code: 'SHARED_CODE' }] }); }
      if (u.pathname === '/ea/custom-fields') { assert.equal(u.searchParams.get('filter'), "category eq 'Event'"); return json({ data: [{ id: typeId, category: 'Event', code: 'EXTERNAL_ID' }] }); }
      assert.fail('unexpected request');
    } });
  return { api, writes, evidence, intents, requests, run: (op, input, hook) => api.execute(target, op, input, async p => { await hook?.(p); intents.push(p); }, async e => evidence.push(e)) };
}
const operations = [
  ['updateEvent', { note: 'Exact RR note', closeAfter: '2030-01-01T10:00:00Z' }],
  ['updateRegistrationType', { registrationTypeId: typeId, patch: { capacity: { total: 150 } } }],
  ['enableEventFeature', { type: 'Website' }],
];
test('event-only writes bind resource, preserve unrelated state, acknowledge and independently verify', async () => {
  for (const [op, input] of operations) {
    const f = fixture(), r = await f.run(op, input);
    assert.equal(r.action, 'updated'); assert.equal(r.verified, true); assert.equal(f.writes.length, 1);
    assert.ok(f.intents[0].path.startsWith(`/events/${id}`)); assert.ok(f.intents[0].baseline);
    assert.equal(f.evidence[0].phase, 'ACKNOWLEDGED_NOT_VERIFIED'); assert.equal(f.evidence.at(-1).matched, true);
    assert.equal((await f.run(op, input)).action, 'unchanged'); assert.equal(f.writes.length, 1);
    if (op === 'updateEvent') assert.deepEqual(r.saved.venues, event.venues);
    if (op === 'updateRegistrationType') { assert.equal(r.saved.code, reg.code); assert.equal(r.saved.automaticOpenDate, reg.automaticOpenDate); assert.equal(r.saved.capacity.consumed, 2); }
  }
});
test('paced transport rechecks ownership after intent, before sending any mutation', async () => {
  const f = fixture(); f.api.mutationGuard = async () => { throw new Error('Stop after intent'); };
  await assert.rejects(f.run(...operations[0])); assert.equal(f.intents.length, 1); assert.equal(f.writes.length, 0);
});
test('event baseline projections refuse unknown nested fields before intent', async () => {
  for (const patch of [{ planners: [{ firstName: 'A', unreviewedSetting: true }] }, { venues: [{ name: 'A', sharedVenueId: typeId }] }, { venues: [{ name: 'A', address: { unknown: 'unsafe' } }] }, { languages: ['en-US', 'fr-FR'] }]) {
    const f = fixture({ event: patch }); await assert.rejects(f.run(...operations[0])); assert.equal(f.intents.length, 0); assert.equal(f.writes.length, 0);
  }
});
test('read-only planner identifiers are omitted on the wire without authorizing shared contact changes', async () => {
  const f = fixture({ event: { planners: [{ firstName: 'Planner', deleted: false, sourceId: 'immutable' }] } });
  // Simulate Cvent retaining its read-only fields when it applies writable fields.
  const original = f.api.fetcher;
  f.api.fetcher = async (url, init) => {
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body); assert.deepEqual(body.planners, [{ firstName: 'Planner' }]);
      // Override the fixture's full-object simulation to retain server read-only values.
      const response = await original(url, { ...init, body: JSON.stringify({ ...body, planners: [{ ...body.planners[0], deleted: false, sourceId: 'immutable' }] }) });
      return response;
    }
    return original(url, init);
  };
  assert.equal((await f.run(...operations[0])).verified, true);
});
test('event venue patches merge nested fields rather than implicitly delete them', async () => {
  const f = fixture(), r = await f.run('updateEventBasics', { venues: [{ name: 'Exact RR venue', address: { city: 'Exact RR city' } }] });
  assert.deepEqual(r.saved.venues, [{ name: 'Exact RR venue', address: { ...event.venues[0].address, city: 'Exact RR city' } }]);
});
test('event validation denies deletion/archive, replacement collections, unsafe fields and malformed values before intent', () => {
  for (const patch of [{ venues: [] }, { venues: [null] }, { venues: [{ address: { city: null } }] }, { planners: [] }, { languages: [] }, { archiveAfter: '2030-01-01T00:00:00Z' }, { title: 'New name' }, { status: 'Active' }, { currency: 'EUR' }, { note: '' }, { capacity: '100' }, { capacity: -2 }, { start: '2030-02-30T00:00:00Z' }, { timezone: 'bad' }, { showVenueLocation: 'true' }, { format: 'invented' }, { venues: [{ id: typeId }] }]) assert.throws(() => buildEventUpdate(event, patch));
  assert.throws(() => buildEventUpdate({ ...event, unknownCollection: [1] }, { note: 'RR' }), /Unreviewed/);
});
test('registration assignment is not a grant to edit shared contact-type definitions', async () => {
  for (const patch of [{ name: 'Renamed shared' }, { code: 'NEW' }, { description: 'shared definition' }, { virtual: true }, { event: { id: typeId } }, { capacity: { total: 1 } }, { capacity: { total: 100, consumed: 0 } }, { automaticOpenDate: null }, { openForRegistration: 'true' }, { delete: true }]) {
    const f = fixture(); await assert.rejects(f.run('updateRegistrationType', { registrationTypeId: typeId, patch })); assert.equal(f.writes.length, 0); assert.equal(f.intents.length, 0);
  }
  for (const types of [[], [reg, reg], [{ ...reg, event: { id: typeId } }], [{ ...reg, unknownDefinition: true }]]) {
    const f = fixture({ types }); await assert.rejects(f.run(...operations[1])); assert.equal(f.writes.length, 0);
  }
});
test('feature grant enables build features only, never disables, launches or changes protected payment config', async () => {
  for (const input of [{ type: 'Website', enabled: false }, { type: 'Marketing' }, { type: 'Agenda' }, { type: 'Website', config: { pricing: { currency: 'EUR' } } }]) {
    const f = fixture(); await assert.rejects(f.run('enableEventFeature', input)); assert.equal(f.writes.length, 0);
  }
  const f = fixture({ features: [{ ...feature, locked: true }] }); await assert.rejects(f.run('enableEventFeature', { type: 'Website' })); assert.equal(f.writes.length, 0);
});
test('Registration enablement preserves complete payment configuration and blocks missing baseline instead of inventing defaults', async () => {
  const registration = { ...feature, type: 'Registration', config: { pricing: { enabled: false, invoicePrefix: 'KEEP', revenueGoal: 20, merchantAccount: 'Existing', currency: 'USD', allowedPaymentMethods: ['Visa'] } } };
  const f = fixture({ features: [registration] }), r = await f.run('enableEventFeature', { type: 'Registration' });
  assert.equal(r.verified, true); assert.deepEqual(f.writes[0].config, registration.config);
  const missing = fixture({ features: [{ ...feature, type: 'Registration' }] });
  await assert.rejects(missing.run('enableEventFeature', { type: 'Registration' }), /complete pricing baseline/); assert.equal(missing.writes.length, 0);
});
test('scope catalogs expose definitions not attendee records; unsupported shared creates/edits fail before network', async () => {
  const f = fixture();
  assert.equal((await f.run('listContactTypes', {}))[0].code, 'SHARED_CODE');
  assert.equal((await f.run('listEventCustomFieldDefinitions', {}))[0].category, 'Event');
  const count = f.requests.length;
  for (const op of ['createContactType', 'createCustomField', 'updateContactType', 'updateEventCustomFieldAnswers', 'deleteDiscount', 'listSessions', 'listAttendees']) await assert.rejects(f.run(op, {}));
  assert.equal(f.requests.length, count);
});
test('shared definition pagination retains its fixed category and rejects foreign-category results', async () => {
  const f = fixture(); let reads = 0;
  f.api.fetcher = async input => {
    const u = new URL(input);
    if (u.pathname.endsWith('oauth2/token')) return json({ access_token: 'dummy' });
    assert.equal(u.pathname, '/ea/custom-fields'); assert.equal(u.searchParams.get('filter'), "category eq 'Event'");
    if (++reads === 1) return json({ data: [{ id: typeId, category: 'Event' }], paging: { _links: { next: { href: '/ea/custom-fields?token=next' } } } });
    return json({ data: [{ id, category: 'Contact' }] });
  };
  await assert.rejects(f.run('listEventCustomFieldDefinitions', {}), /escaped the Event category/); assert.equal(reads, 2);
});
test('wrong event/name, published state and ownership loss prevent scoped mutations', async () => {
  for (const event of [{ id: typeId }, { title: 'Different event' }, { status: 'Active' }]) for (const [op, input] of operations) {
    const f = fixture({ event }); await assert.rejects(f.run(op, input)); assert.equal(f.writes.length, 0);
  }
  for (const [op, input] of operations) { const f = fixture(); await assert.rejects(f.run(op, input, () => { throw new Error('ownership lost'); })); assert.equal(f.writes.length, 0); }
});
test('HTTP failures, disconnects, stale readback, wrong acknowledgment and unrequested saved changes never replay', async () => {
  for (const options of [{ fail: true }, { lost: true }, { stale: true }, { wrongAck: true }, { savedDrift: { unexpected: true } }]) for (const [op, input] of operations) {
    const f = fixture(options); await assert.rejects(f.run(op, input)); assert.equal(f.writes.length, 1);
  }
});

test('feature acknowledgment missing identity requires independent full preserved catalog verification', async () => {
  for (const ack of [{}, { enabled: true }, null, { data: { enabled: true } }]) {
    const f = fixture({ ack }); const result = await f.run('enableEventFeature', { type: 'Website' });
    assert.equal(result.verified, true); assert.equal(f.writes.length, 1);
    assert.ok(f.evidence.some(e => e.phase === 'ACK_IDENTITY_ABSENT_READBACK_REQUIRED'));
    assert.equal(f.evidence.at(-1).matched, true);
  }
  for (const options of [{ stale: true }, { savedDrift: { locked: true } }]) {
    const f = fixture({ ack: {}, ...options }); await assert.rejects(f.run('enableEventFeature', { type: 'Website' })); assert.equal(f.writes.length, 1);
  }
});
test('foreign, conflicting and unsupported feature acknowledgments stop without replay', async () => {
  for (const ack of [{ type: 'Registration' }, { id: typeId }, { event: { id: typeId } }, { enabled: false }, [{ type: 'Website' }], { result: 'ok' }]) {
    const f = fixture({ ack }); await assert.rejects(f.run('enableEventFeature', { type: 'Website' }));
    assert.equal(f.writes.length, 1); assert.ok(f.evidence.some(e => e.phase === 'ACKNOWLEDGMENT_BODY'));
    assert.ok(!f.evidence.some(e => e.phase === 'READBACK'));
  }
});
test('acknowledgment receipts retain bounded sanitized bodies, never credentials', async () => {
  const f = fixture({ ack: { type: 'Registration', secret: 'hidden', nested: { authorization: 'Bearer dummy', note: 'token dummy' } } });
  await assert.rejects(f.run('enableEventFeature', { type: 'Website' }));
  const body = f.evidence.find(e => e.phase === 'ACKNOWLEDGMENT_BODY');
  assert.equal(body.body.type, 'Registration'); assert.doesNotMatch(JSON.stringify(body), /dummy|hidden|Bearer/);
  assert.match(JSON.stringify(body), /redacted/);
});

async function cliFixture(t, mode = '') {
  const dir = await mkdtemp(join(tmpdir(), 'scoped-cli-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'job.json'), JSON.stringify({ status: 'RUNNING', target }));
  await writeFile(join(dir, 'runtime.json'), JSON.stringify({ ownership: 'AGENT', runtimeId: 'owned', activeTargetId: 'tab', steelSessionId: 'session' }));
  await writeFile(join(dir, 'state.json'), JSON.stringify({ event, types: [reg], features: [feature] }));
  const preload = join(dir, 'mock.mjs');
  await writeFile(preload, `
import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
const dir=${JSON.stringify(dir)},mode=${JSON.stringify(mode)},root='/ea/events/${id}';
const timer=setTimeout;globalThis.setTimeout=(f,ms,...args)=>timer(f,Math.min(ms,1),...args);
const json=v=>new Response(JSON.stringify(v),{status:200});
globalThis.fetch=async(input,init={})=>{
 const u=new URL(input),m=init.method||'GET'; assert.equal(u.origin,'https://api-platform.cvent.com');
 if(u.pathname.endsWith('/oauth2/token'))return json({access_token:'dummy',expires_in:3600});
 const s=JSON.parse(await readFile(dir+'/state.json'));
 if(m==='GET'){
  if(u.pathname===root)return json(s.event);
  if(u.pathname===root+'/registration-types')return json({data:s.types});
  if(u.pathname===root+'/features')return json({data:s.features});
  assert.fail('unmocked route');
 }
 assert.equal(m,'PUT');
 const marker=JSON.parse(await readFile(dir+'/api-write-uncertain.json'));
 const receipt=JSON.parse(await readFile(marker.receipt));assert.equal(receipt.status,'INTENT_REQUIRES_RECONCILIATION');
 await appendFile(dir+'/writes.log',u.pathname+'\\n'); const b=JSON.parse(init.body);
 if(mode==='denied')return new Response('{}',{status:403});
 let ack;
 if(u.pathname===root)ack=s.event={...s.event,...b};
 else if(u.pathname===root+'/registration-types/${typeId}')ack=s.types[0]={...s.types[0],...b,capacity:{...s.types[0].capacity,...b.capacity,remaining:b.capacity.total-2}};
 else if(u.pathname===root+'/features/Website')ack=s.features[0]={...s.features[0],...b};
 else assert.fail('unscoped mutation');
 if(mode!=='stale')await writeFile(dir+'/state.json',JSON.stringify(s));
 if(mode==='takeover')await writeFile(dir+'/runtime.json',JSON.stringify({ownership:'USER'}));
 if(mode==='stop')await writeFile(dir+'/job.json',JSON.stringify({status:'STOPPED',target:${JSON.stringify(target)}}));
 if(mode==='foreign-marker')await writeFile(dir+'/api-write-uncertain.json',JSON.stringify({receiptId:'foreign'}));
 return json(ack);
};`);
  const run = (operation, data, refs = ['RR!B2']) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', preload, new URL('../app/cvent-api-cli.mjs', import.meta.url).pathname, operation], { env: { ...process.env, RR_WORKSPACE: dir, CVENT_CREDENTIALS_FILE: '', CVENT_API_BASE_URL: 'https://api-platform.cvent.com/ea', CVENT_CLIENT_ID: 'dummy', CVENT_CLIENT_SECRET: 'dummy' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c); child.on('error', reject); child.on('close', code => resolve({ code, out, err })); child.stdin.end(JSON.stringify({ rrReferences: refs, data }));
  });
  const receipts = async () => Promise.all((await readdir(join(dir, 'receipts'))).map(async file => JSON.parse(await readFile(join(dir, 'receipts', file)))));
  return { dir, run, receipts };
}
test('production CLI enables all scoped update families with private durable receipts and unchanged fixed target', async t => {
  for (const [op, input] of operations) {
    const f = await cliFixture(t), result = await f.run(op, input); assert.equal(result.code, 0, result.err);
    const receipt = (await f.receipts())[0]; assert.equal(receipt.status, 'PASS'); assert.equal(receipt.result.verified, true);
    assert.equal(receipt.preparedWrites.length, 1); assert.equal(receipt.writeEvidence[0].phase, 'ACKNOWLEDGED_NOT_VERIFIED');
    assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), false);
    assert.deepEqual(JSON.parse(await readFile(join(f.dir, 'job.json'))).target, target);
    const repeat = await f.run(op, input); assert.equal(repeat.code, 0, repeat.err); assert.equal(JSON.parse(repeat.out).action, 'unchanged');
    assert.equal((await readFile(join(f.dir, 'writes.log'), 'utf8')).trim().split('\n').length, 1);
  }
});
test('production CLI holds uncertainty on failure/Stop/takeover after update, prohibits replay, never steals locks', async t => {
  for (const mode of ['denied', 'stale', 'takeover', 'stop', 'foreign-marker']) for (const [op, input] of operations) {
    const f = await cliFixture(t, mode), result = await f.run(op, input); assert.equal(result.code, 1, result.out);
    assert.equal((await f.receipts())[0].status, 'UNCERTAIN'); assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), true);
    const writes = await readFile(join(f.dir, 'writes.log'), 'utf8'); assert.equal((await f.run(op, input)).code, 1); assert.equal(await readFile(join(f.dir, 'writes.log'), 'utf8'), writes);
    if (mode === 'foreign-marker') assert.equal(JSON.parse(await readFile(join(f.dir, 'api-write-uncertain.json'))).receiptId, 'foreign');
  }
  const f = await cliFixture(t); await writeFile(join(f.dir, 'api-operation.lock'), 'owned elsewhere');
  assert.equal((await f.run(...operations[0])).code, 1); assert.equal(await readFile(join(f.dir, 'api-operation.lock'), 'utf8'), 'owned elsewhere'); assert.equal(existsSync(join(f.dir, 'writes.log')), false);
});
test('production scoped writes require RR sources and AGENT ownership before intent', async t => {
  for (const [op, input] of operations) {
    const f = await cliFixture(t); assert.equal((await f.run(op, input, [])).code, 1); assert.equal(existsSync(join(f.dir, 'writes.log')), false); assert.equal(existsSync(join(f.dir, 'api-write-uncertain.json')), false);
    await writeFile(join(f.dir, 'runtime.json'), JSON.stringify({ ownership: 'USER' })); assert.equal((await f.run(op, input)).code, 1); assert.equal(existsSync(join(f.dir, 'writes.log')), false);
  }
});
