import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { observeSave, readSaveSignals, saveObserverForHost, saveOnce } from '../ego-bridge/save-observer.mjs';
import { SteelEgoHost } from '../ego-bridge/host.mjs';
const idle = { pending: false, completionVisible: false, rejectionVisible: false, validation: [] };
function fixture(states, guard = async () => {}) {
  let elapsed = 0, calls = 0; const markers = [];
  const page = { evaluate: async () => { const value = states[Math.min(calls++, states.length - 1)]; if (value instanceof Error) throw value; return value; } };
  const run = (options = {}) => observeSave(page, { completionSelector: '#saved', timeoutMs: 3000, ...options }, { checkControl: guard, onUncertain: async evidence => markers.push(evidence), now: () => elapsed, sleep: async ms => { elapsed += ms; } });
  return { page, run, markers, calls: () => calls };
}
test('pending save is observed until explicit completion; never claimed persisted or clicked again', async () => {
  const f = fixture([{ ...idle, pending: true, completionVisible: true }, { ...idle, pending: true }, { ...idle, completionVisible: true }]);
  const result = await f.run();
  assert.equal(result.status, 'COMPLETION_VISIBLE_NOT_VERIFIED'); assert.equal(result.verified, false);
  assert.equal(result.polls, 3); assert.equal(result.elapsedMs, 2000); assert.deepEqual(f.markers, []);
});
test('explicit rejection surfaces validation without authorizing a retry or claiming persistence', async () => {
  const f = fixture([{ ...idle, rejectionVisible: true, validation: ['Changes were not saved: invalid URL'] }]);
  const result = await f.run({ rejectionSelector: '#rejected', validationSelector: '.validation' });
  assert.equal(result.status, 'REJECTION_VISIBLE_NOT_VERIFIED'); assert.equal(result.verified, false);
  assert.deepEqual(result.validation, ['Changes were not saved: invalid URL']); assert.deepEqual(f.markers, []);
});
for (const [name, state] of [
  ['pending timeout', { ...idle, pending: true }], ['spinner gone without completion', idle],
  ['validation count alone', { ...idle, validation: ['1'] }], ['conflicting signals', { ...idle, completionVisible: true, rejectionVisible: true }],
  ['crash/disconnect', Error('disconnected')], ['malformed observation', {}],
]) test(`uncertain ${name} stops without writes and retains evidence`, async () => {
  const f = fixture([state]); await assert.rejects(f.run(), { name: 'BrowserSaveUncertainError' });
  assert.equal(f.markers.length, 1); assert.ok(f.calls() <= 4);
});
test('ownership loss stops on the first observation, even if it reports completion', async () => {
  let checks = 0;
  const f = fixture([{ ...idle, completionVisible: true }], async () => { if (++checks === 2) throw Error('takeover'); });
  await assert.rejects(f.run(), { name: 'BrowserSaveUncertainError' }); assert.equal(f.calls(), 1); assert.equal(f.markers.length, 1);
});
for (const message of ['Execution context was destroyed', 'Cannot find context with specified id', 'SaveDocumentNotReady']) test(`read-only transition is re-observed on the same controlled page: ${message}`, async () => {
  const f = fixture([Error(message), { ...idle, pending: true }, { ...idle, completionVisible: true }]);
  const result = await f.run();
  assert.equal(result.attempts, 3); assert.equal(result.polls, 2); assert.equal(result.transientReadFailures, 1);
  assert.equal(result.verified, false); assert.deepEqual(f.markers, []);
});
test('persistent document transitions exhaust the budget without replay', async () => {
  const f = fixture([Error('Execution context was destroyed')]);
  await assert.rejects(f.run(), { name: 'BrowserSaveUncertainError' });
  assert.equal(f.calls(), 3); assert.equal(f.markers[0].failure.category, 'OBSERVATION_DEADLINE');
  assert.equal(f.markers[0].transientReadFailures, 3); assert.equal(f.markers[0].lastTransientFailure.category, 'EXECUTION_CONTEXT_DESTROYED');
});
test('a context error cannot hide ownership loss or late effects', async () => {
  let checks = 0;
  const f = fixture([Error('Execution context was destroyed')], async () => { if (++checks === 2) throw Error('Save observation lost ownership or identity'); });
  await assert.rejects(f.run(), { name: 'BrowserSaveUncertainError' });
  assert.equal(f.calls(), 1); assert.equal(f.markers[0].failure.phase, 'CONTROL_AFTER_READ');
  for (const error of [Object.assign(Error('Execution context was destroyed'), { mayHaveLateEffects: true }), Object.assign(Error('Execution context was destroyed'), { name: 'PageEvaluationTimeoutError' }), Error('disconnected: Execution context was destroyed')]) {
    const g = fixture([error]); await assert.rejects(g.run(), { name: 'BrowserSaveUncertainError' }); assert.equal(g.calls(), 1);
  }
});
test('failed control check before the first poll retains uncertainty and a safe cause', async () => {
  const f = fixture([idle], async () => { throw Error('Save observation lost assigned event/page'); });
  await assert.rejects(f.run(), { name: 'BrowserSaveUncertainError' });
  assert.equal(f.calls(), 0); assert.equal(f.markers[0].failure.phase, 'CONTROL_BEFORE_READ');
  assert.equal(f.markers[0].failure.category, 'CONTROL_OR_IDENTITY_LOST');
});
test('unexpected observation errors retain diagnostic fingerprint, not raw secrets', async () => {
  const f = fixture([new TypeError('PRIVATE_AUTH_SECRET in an unexpected error')]);
  await assert.rejects(f.run(), error => error.name === 'BrowserSaveUncertainError' && !error.message.includes('PRIVATE_AUTH_SECRET'));
  assert.equal(f.calls(), 1); assert.equal(f.markers[0].failure.phase, 'OBSERVE_DOM');
  assert.equal(f.markers[0].failure.errorType, 'TypeError'); assert.match(f.markers[0].failure.fingerprint, /^[a-f0-9]{64}$/);
  assert(!JSON.stringify(f.markers).includes('PRIVATE_AUTH_SECRET'));
});
test('completion arriving beyond the observation budget does not escape its deadline', async () => {
  let time = 0; const markers = [];
  await assert.rejects(observeSave({ evaluate: async () => { time = 4000; return { ...idle, completionVisible: true }; } }, { completionSelector: '#saved', timeoutMs: 3000 }, { checkControl: async () => {}, onUncertain: async x => markers.push(x), now: () => time }), { name: 'BrowserSaveUncertainError' });
  assert.equal(markers[0].failure.category, 'OBSERVATION_DEADLINE');
});
test('saveOnce preflights and submits exactly once across a document transition', async () => {
  let clicks = 0, reads = 0, time = 0; const markers = [];
  const page = { waitForSelector: async (ref, options) => { assert.equal(ref, '#Save'); assert.equal(options.state, 'visible'); },
    click: async () => { clicks++; }, evaluate: async () => { reads++; if (reads === 2) throw Error('Execution context was destroyed'); return reads === 1 ? idle : { ...idle, completionVisible: true }; } };
  const result = await saveOnce(page, '#Save', { completionSelector: '#Edit', timeoutMs: 3000 }, { checkControl: async () => {}, onUncertain: async x => markers.push(x), now: () => time, sleep: async ms => { time += ms; } });
  assert.equal(clicks, 1); assert.equal(result.transientReadFailures, 1); assert.equal(result.verified, false); assert.deepEqual(markers, []);
});
test('saveOnce invalid setup, pending/prior outcome and invalid selector never submit', async () => {
  for (const before of [{ ...idle, pending: true }, { ...idle, completionVisible: true }, { ...idle, rejectionVisible: true }, Error('not a valid selector')]) {
    let clicks = 0; const markers = [];
    const page = { waitForSelector: async () => {}, click: async () => clicks++, evaluate: async () => { if (before instanceof Error) throw before; return before; } };
    await assert.rejects(saveOnce(page, '#Save', { completionSelector: '#Edit' }, { checkControl: async () => {}, onUncertain: async x => markers.push(x) }));
    assert.equal(clicks, 0); assert.deepEqual(markers, []);
  }
});
test('save dispatch exception is not a read-only retry even for context errors', async () => {
  let clicks = 0; const markers = [];
  const page = { waitForSelector: async () => {}, evaluate: async () => idle, click: async () => { clicks++; throw Error('Execution context was destroyed'); } };
  await assert.rejects(saveOnce(page, '#Save', { completionSelector: '#Edit' }, { checkControl: async () => {}, onUncertain: async x => markers.push(x) }), { name: 'BrowserSaveUncertainError' });
  assert.equal(clicks, 1); assert.equal(markers[0].failure.phase, 'SAVE_DISPATCH');
});
test('missing document body is a typed read-only transition, not silent completion', () => {
  assert.throws(() => runInNewContext(`(${readSaveSignals.toString()})()`, { document: { body: null } }), /SaveDocumentNotReady/);
});

test('evidence storage failure still emits the immediate uncertainty stop', async () => {
  const page = { evaluate: async () => { throw Error('disconnected'); } };
  await assert.rejects(observeSave(page, { completionSelector: '#saved' }, { checkControl: async () => {}, onUncertain: async () => { throw Error('disk full'); } }), error => error.name === 'BrowserSaveUncertainError' && /persistence also failed/.test(error.message));
});
test('invalid/unbounded observer options are rejected without page access', async () => {
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 120001 }, { completionSelector: '' }, { arbitraryRetry: true }]) {
    const f = fixture([idle]); await assert.rejects(f.run(options)); assert.equal(f.calls(), 0);
  }
});
test('DOM pending classification ignores hidden text and detects visible Saving text', () => {
  function run(text, shown, opacityVisible = true) {
    const element = { getClientRects: () => shown ? [{}] : [], innerText: text, checkVisibility: () => opacityVisible };
    let done = false;
    return runInNewContext(`(${readSaveSignals.toString()})()`, { document: { body: {}, querySelectorAll: () => [], createTreeWalker: () => ({ nextNode: () => { if (done) return null; done = true; return { textContent: text, parentElement: element }; } }) }, NodeFilter: { SHOW_TEXT: 4 }, getComputedStyle: () => ({ visibility: 'visible', display: 'block' }) });
  }
  assert.equal(run('Saving...', true).pending, true); assert.equal(run('Saving…', true).pending, true);
  assert.equal(run('Saving...', false).pending, false); assert.equal(run('Saving...', true, false).pending, false); assert.equal(run('Tips on saving money', true).pending, false);
});
async function hostFixture(t, pending = false) {
  const dir = await mkdtemp(join(tmpdir(), 'save-observer-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const runtimePath = join(dir, 'runtime.json'); const id = '11111111-1111-1111-1111-111111111111';
  const runtime = { ownership: 'AGENT', runtimeId: 'owned', steelSessionId: 'session', activeTargetId: 'tab', expectedEvtstub: id, expectedEventName: '(C+D) Test', apiEvent: { id, name: '(C+D) Test' } };
  await writeFile(runtimePath, JSON.stringify(runtime)); await writeFile(join(dir, 'job.json'), JSON.stringify({ status: 'RUNNING' }));
  const client = { setExternalSink() {}, async request(method, params) {
    if (method === 'Target.getTargets') return { targetInfos: [{ type: 'page', targetId: 'tab', url: `https://app.cvent.com/event/${id}/designer` }] };
    if (method === 'Runtime.evaluate' && params.expression.endsWith('().pending')) return { result: { value: pending } };
    return { result: { value: 'Save' } };
  } };
  return { dir, runtimePath, runtime, host: new SteelEgoHost(client, runtimePath) };
}
test('visible saving blocks input, close-navigation, reload and DOM writes, not observation', async t => {
  const { host } = await hostFixture(t, true);
  for (const envelope of [{ method: 'Input.insertText' }, { method: 'Input.dispatchMouseEvent', params: { x: 1, y: 1 } }, { method: 'Page.reload' }, { method: 'Page.navigate', params: { url: 'https://app.cvent.com/event/11111111-1111-1111-1111-111111111111/overview' } }, { method: 'Runtime.evaluate', params: { expression: 'document.querySelector("button").click()' } }]) await assert.rejects(host.assertOperationAllowed(envelope), /SavePendingError/);
  await host.assertOperationAllowed({ method: 'Runtime.evaluate', params: { expression: 'document.title' } });
});
test('bound post-Save observer records a failed initial runtime read; submit preflight does not click', async () => {
  for (const submit of [false, true]) {
    const dir = await mkdtemp(join(tmpdir(), 'save-baseline-'));
    const host = { runtimePath: join(dir, 'runtime.json'), runtime: async () => { throw Error('disconnected'); } };
    try {
      if (submit) {
        await assert.rejects(saveObserverForHost(host, { submit: true })({}, '#Save', { completionSelector: '#Edit' }), /disconnected/);
        await assert.rejects(readFile(join(dir, 'browser-save-uncertain.json')), { code: 'ENOENT' });
      } else {
        await assert.rejects(saveObserverForHost(host)({}, { completionSelector: '#Edit' }), { name: 'BrowserSaveUncertainError' });
        const marker = JSON.parse(await readFile(join(dir, 'browser-save-uncertain.json'), 'utf8'));
        assert.equal(marker.failure.phase, 'CONTROL_BASELINE'); assert.equal(marker.failure.category, 'DISCONNECTED_OR_CRASHED');
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('bound observer persists uncertainty, blocks later writes, and never overwrites/reopens it', async t => {
  const f = await hostFixture(t);
  const page = { targetId: 'tab', evaluate: async () => { throw Error('disconnected'); } };
  await assert.rejects(saveObserverForHost(f.host)(page, { completionSelector: '#saved' }), { name: 'BrowserSaveUncertainError' });
  const markerPath = join(f.dir, 'browser-save-uncertain.json'), marker = await readFile(markerPath, 'utf8');
  assert.equal(JSON.parse(marker).runtimeId, 'owned');
  await assert.rejects(f.host.assertOperationAllowed({ method: 'Input.insertText' }), /BrowserSaveUncertainError/);
  await f.host.assertOperationAllowed({ method: 'Runtime.evaluate', params: { expression: 'document.title' } });
  await assert.rejects(saveObserverForHost(f.host)(page, { completionSelector: '#saved' }), /Existing uncertainty/);
  assert.equal(await readFile(markerPath, 'utf8'), marker);
});
