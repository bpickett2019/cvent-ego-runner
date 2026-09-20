import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acknowledgeSessionIncident, authenticatedCventPage } from '../app/session-security.mjs';
const authenticated = { info: { url: 'https://app.cvent.com/Subscribers/Events2/EventSelection' }, snapshot: 'Events Create event Search' };
function fixture() {
  let state = { ownership: 'USER', steelSessionId: 'browser-session', activeTargetId: 'assigned-page' }, observations = 0;
  const writes = [];
  let observation = async () => authenticated;
  const options = { incidents: ['old-incident'], returnControl: true, sessionInvalidated: true,
    readRuntime: async () => structuredClone(state),
    writeRuntime: async value => { writes.push(structuredClone(value)); state = structuredClone(value); },
    waitForIdle: async () => {}, observe: async () => { observations++; assert.equal(state.ownership, 'RETURNING'); return observation(); } };
  return { options, writes, get state() { return state; }, get observations() { return observations; }, observe: fn => { observation = fn; }, set: patch => { Object.assign(state, patch); } };
}
test('acknowledgment survives later event failure and is not demanded on another setup attempt', async () => {
  const f = fixture();
  await assert.rejects(async () => {
    await acknowledgeSessionIncident(f.options);
    throw new Error('No exact event-name match');
  }, /No exact/);
  assert.deepEqual(f.state.securityAcknowledgedJobs, ['old-incident']);
  assert.equal(f.state.ownership, 'USER', 'acknowledgment does not authorize Cvent authoring');
  assert.ok(f.state.browserLoginVerification.at);
  assert.equal(f.state.browserLoginVerification.humanSessionInvalidationAttested, true);
  await acknowledgeSessionIncident({ ...f.options, sessionInvalidated: false, returnControl: false });
  assert.equal(f.observations, 1, 'resolved incident does not force another login/observation');
  await assert.rejects(acknowledgeSessionIncident({ ...f.options, incidents: ['old-incident', 'new-incident'], sessionInvalidated: false }), /Security review/);
  assert.equal(f.observations, 1);
});
test('authenticated Events list accepts multiline accessibility snapshots without weakening login denials', async () => {
  const snapshot = 'heading "Events"\n  button "Create Event"\n  link "Advanced Search"';
  assert.deepEqual(authenticatedCventPage({ ...authenticated, snapshot }), {
    origin: 'https://app.cvent.com', pathname: '/Subscribers/Events2/EventSelection',
  });
  for (const suffix of ['\nSign\nin', '\nLog\tin', '\nPassword', '\nVerification\ncode', '\nLogged out due to\ninactivity']) {
    assert.throws(() => authenticatedCventPage({ ...authenticated, snapshot: snapshot + suffix }), /login is not confirmed/);
  }
  const f = fixture();
  f.observe(async () => ({ ...authenticated, snapshot }));
  await acknowledgeSessionIncident(f.options);
  assert.deepEqual(f.state.securityAcknowledgedJobs, ['old-incident']);
  assert.equal(f.state.ownership, 'USER');
  assert.equal(f.state.browserLoginVerification.humanSessionInvalidationAttested, true);
});
test('being logged in alone is not human attestation of invalidating a compromised session', async () => {
  for (const overrides of [{ returnControl: false }, { sessionInvalidated: false }]) {
    const f = fixture();
    await assert.rejects(acknowledgeSessionIncident({ ...f.options, ...overrides }), /Security review/);
    assert.equal(f.observations, 0); assert.equal(f.writes.length, 0);
  }
});
test('expired login, foreign site and observation failure retain the incident and return USER ownership', async () => {
  for (const observe of [
    async () => ({ ...authenticated, snapshot: 'Sign in Password' }),
    async () => ({ ...authenticated, info: { url: 'https://app.cvent.com.evil.test/' } }),
    async () => { throw new Error('Assigned page missing'); },
  ]) {
    const f = fixture(); f.observe(observe);
    await assert.rejects(acknowledgeSessionIncident(f.options));
    assert.equal(f.state.securityAcknowledgedJobs, undefined); assert.equal(f.state.ownership, 'USER');
  }
});
test('takeover or replaced browser during observation cannot acknowledge an incident or steal ownership', async () => {
  for (const patch of [{ ownership: 'USER' }, { steelSessionId: 'replacement', ownership: 'USER' }]) {
    const f = fixture(); f.observe(async () => { f.set(patch); return authenticated; });
    await assert.rejects(acknowledgeSessionIncident(f.options), /ownership changed/);
    assert.equal(f.state.securityAcknowledgedJobs, undefined); assert.equal(f.state.ownership, 'USER');
    assert.equal(f.writes.length, 1);
  }
});
test('login evidence never retains URL query credentials and rejects login or unrecognized pages', () => {
  assert.deepEqual(authenticatedCventPage({ ...authenticated, info: { url: authenticated.info.url + '?sensitive=not-retained' } }), { origin: 'https://app.cvent.com', pathname: '/Subscribers/Events2/EventSelection' });
  for (const url of ['http://app.cvent.com/', 'https://user:pass@app.cvent.com/', 'https://app.cvent.com:444/', 'https://login.app.cvent.com/', 'https://app.cvent.com/login', 'about:blank']) assert.throws(() => authenticatedCventPage({ ...authenticated, info: { url } }));
  assert.throws(() => authenticatedCventPage({ ...authenticated, snapshot: 'Loading...' }));
});
test('server persists security resolution before target lookup and never automatically resets/logout sessions', async () => {
  const server = await readFile(new URL('../app/server.mjs', import.meta.url), 'utf8');
  const handler = server.slice(server.indexOf('async function prepareTarget('), server.indexOf('app.post("/api/return-agent"'));
  assert.ok(handler.indexOf('await acknowledgeSessionIncident(') < handler.indexOf('await selectTarget(name)'));
  assert.doesNotMatch(handler, /securityAcknowledgedJobs:|logout|clearCookies|resetBrowser|deleteSession/);
  assert.match(handler, /not necessarily logged out/);
});
