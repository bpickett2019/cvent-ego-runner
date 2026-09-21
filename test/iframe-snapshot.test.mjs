import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SteelEgoHost } from '../ego-bridge/host.mjs';
import { browserSnapshotRefsToRefMap } from '../vendor/ego-lite/package/ego-browser/dist/src/browser-runtime.js';
import { RefMap } from '../vendor/ego-lite/package/ego-browser/dist/src/ref-map.js';

async function fixture(t, { ownership = 'AGENT', remote = false, detached = false, wrongTree = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'frame-snapshot-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'runtime.json');
  await writeFile(path, JSON.stringify({ ownership, activeTargetId: 'assigned' }));
  const calls = [];
  const client = { setExternalSink() {}, async request(method, params = {}, sessionId) {
    calls.push({ method, params, sessionId });
    if (method === 'Target.getTargets') return { targetInfos: [{ type: 'page', targetId: 'assigned', url: 'https://example.com' }] };
    if (method === 'Target.attachToTarget') {
      assert.equal(params.targetId, 'assigned');
      return { sessionId: 'assigned-session' };
    }
    assert.equal(sessionId, 'assigned-session');
    if (method === 'Accessibility.getFullAXTree') return { nodes: params.frameId ? [
      { nodeId: 'f1', frameId: wrongTree ? 'other' : 'child', backendDOMNodeId: 20, role: { value: 'RootWebArea' }, name: { value: 'Designer' }, childIds: ['f2', 'f3'] },
      { nodeId: 'f2', backendDOMNodeId: 21, role: { value: 'textbox' }, name: { value: 'Heading' }, value: { value: 'Saved heading' } },
      { nodeId: 'f3', backendDOMNodeId: 22, role: { value: 'Iframe' } },
    ] : [
      { nodeId: '1', backendDOMNodeId: 1, role: { value: 'RootWebArea' }, name: { value: 'Editor shell' }, childIds: ['2'] },
      { nodeId: '2', backendDOMNodeId: 2, role: { value: 'Iframe' } },
    ] };
    if (method === 'DOM.describeNode') {
      assert.equal(params.backendNodeId, 2);
      return { node: { backendNodeId: 2, frameId: 'child', ...(!remote ? { contentDocument: { backendNodeId: 20 } } : {}) } };
    }
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'top' }, childFrames: detached ? [] : [{ frame: { id: 'child' } }] } };
    return {};
  } };
  return { host: new SteelEgoHost(client, path), calls };
}

test('unnamed iframe is discoverable without claiming automatic frame expansion', async t => {
  const { host } = await fixture(t);
  const result = await host.snapshot({ scope: 'full_page' });
  assert.match(result.content, /Iframe \[ref=2\]/);
  assert.match(result.content, /top document only/);
  assert.doesNotMatch(result.content, /Saved heading/);
});

test('explicit same-renderer iframe subtree returns frame-scoped refs accepted by pinned Ego', async t => {
  const { host, calls } = await fixture(t);
  const result = await host.snapshot({ scope: 'subtree', root: 2 });
  assert.match(result.content, /Saved heading/);
  assert.match(result.content, /nested iframe contents not included/);
  assert.doesNotMatch(result.content, /Editor shell|loc=/);
  assert.ok(result.refs.length > 0);
  assert.ok(result.refs.every(ref => ref.frameId === 'child'));
  const refs = new RefMap({ allowFallback: false });
  browserSnapshotRefsToRefMap(refs, result.refs);
  assert.equal(refs.get('21').frameId, 'child');
  assert.equal(refs.get('21').backendNodeId, 21);
  assert.equal(calls.filter(call => call.method === 'Target.attachToTarget').length, 1);
  assert.ok(calls.every(call => !/^(Input\.|Page\.navigate|DOM\.set)/.test(call.method)));
  const bounded = await host.snapshot({ scope: 'subtree', root: 2, maxResultLength: 50 });
  assert.equal(bounded.content.length, 50);
});

for (const [label, options] of [['out-of-process', { remote: true }], ['detached', { detached: true }]]) {
  test(`${label} iframe fails closed without attaching another target`, async t => {
    const { host, calls } = await fixture(t, options);
    await assert.rejects(host.snapshot({ scope: 'subtree', root: 2 }), /only an attached same-renderer frame/);
    assert.ok(!calls.some(call => call.method === 'Accessibility.getFullAXTree' && call.params.frameId));
    assert.ok(calls.filter(call => call.method === 'Target.attachToTarget').every(call => call.params.targetId === 'assigned'));
  });
}

test('mismatched frame AX identity is not presented as verified frame contents', async t => {
  const { host } = await fixture(t, { wrongTree: true });
  await assert.rejects(host.snapshot({ scope: 'subtree', root: 2 }), /frame document identity could not be verified/);
});

test('USER ownership prevents iframe inspection before any protocol calls', async t => {
  const { host, calls } = await fixture(t, { ownership: 'USER' });
  await assert.rejects(host.snapshot({ scope: 'subtree', root: 2 }), /User owns/);
  assert.equal(calls.length, 0);
});
