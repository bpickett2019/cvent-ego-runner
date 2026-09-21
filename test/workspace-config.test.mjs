import test from 'node:test';
import assert from 'node:assert/strict';
import { localWorkspaceConfig } from '../public/workspace-config.js';
const config = () => ({ version: 1, current: 2, workspaces: [1, 2, 3].map(id => ({ id, url: `http://127.0.0.1:${8900 + id}` })) });
test('local navigation labels three distinct app origins and selects only its own user', () => {
  const result = localWorkspaceConfig(config(), 'http://127.0.0.1:8902');
  assert.equal(result.label, 'USER 2');
  assert.deepEqual(result.workspaces.map(w => w.label), ['USER 1', 'USER 2', 'USER 3']);
});
for (const url of ['https://example.com', 'http://localhost:8901', 'http://127.0.0.1', 'http://user:password@127.0.0.1:8901', 'http://127.0.0.1:8901/path', 'http://127.0.0.1:8901/?token=secret', 'http://127.0.0.1:8901/#fragment', 'javascript:alert(1)']) test(`reject non-app origin ${url}`, () => {
  const value = config(); value.workspaces[0].url = url;
  assert.throws(() => localWorkspaceConfig(value, 'http://127.0.0.1:8902'));
});
test('reject duplicate/missing users, duplicate origins, wrong version or current app', () => {
  const mutations = [v => { v.current = 4; }, v => { v.version = 2; }, v => v.workspaces.pop(), v => { v.workspaces[0].id = 2; }, v => { v.workspaces[0].url = v.workspaces[1].url; }];
  for (const mutate of mutations) { const value = config(); mutate(value); assert.throws(() => localWorkspaceConfig(value, 'http://127.0.0.1:8902')); }
  assert.throws(() => localWorkspaceConfig(config(), 'http://127.0.0.1:8788'));
});
