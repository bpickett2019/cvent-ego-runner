import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicEvent } from '../app/public-events.mjs';
import { privateArtifact, checkRepository } from '../scripts/check-repository.mjs';

const privatePaths = ['data/current/state.json', 'data/browser-profiles/id/Default/Cookies', 'data/workbooks/id/version.xlsx', 'logs/nested/receipt.json', 'original.xlsx', 'export.csv', '.env.local', 'config/production.env', 'auth.json', 'capture.har', 'native.jsonl', '.pi/sessions/run.json'];
test('private runtime trees and portable sensitive files are ignored, source remains visible', t => {
  const root = mkdtempSync(join(tmpdir(), 'repository-privacy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, '.gitignore'), readFileSync(new URL('../.gitignore', import.meta.url)));
  const ignored = execFileSync('git', ['check-ignore', '--stdin'], { cwd: root, input: privatePaths.join('\n') + '\n', encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(ignored, privatePaths);
  for (const path of ['app/server.mjs', 'test/release-privacy.test.mjs', 'README.md', '.pi/skills/ego-browser/SKILL.md']) {
    assert.equal(spawnSync('git', ['check-ignore', path], { cwd: root }).status, 1);
    assert.equal(privateArtifact(path), false);
  }
  assert.ok(privatePaths.every(privateArtifact));
  writeFileSync(join(root, 'auth.json'), '{}');
  execFileSync('git', ['add', '-f', 'auth.json'], { cwd: root });
  assert.deepEqual(checkRepository(root), ['auth.json'], 'force-staged ignored secrets still block the path gate');
});
test('activity projection excludes all native payloads, reasoning and unknown events', () => {
  for (const type of ['response', 'message_update', 'message_end', 'tool_execution_update', 'extension_ui_request', 'new_future_event']) {
    assert.equal(publicEvent({ type, text: 'secret', data: { token: 'secret' } }), null);
  }
  assert.deepEqual(publicEvent({ type: 'tool_execution_end', toolName: 'secret-extension-name', toolCallId: 'secret', result: 'secret', isError: true }), { type: 'tool_execution_end', tool: 'tool', outcome: 'error' });
  assert.deepEqual(publicEvent({ type: 'rr_question', kind: 'setup', message: 'secret' }), { type: 'rr_question', kind: 'setup' });
  assert.deepEqual(publicEvent({ type: 'rr_stopped', failures: ['secret'] }), { type: 'rr_stopped', reviewRequired: true, cleanupFailed: true });
  assert.deepEqual(publicEvent({ type: 'turn_end', message: 'secret', toolResults: ['secret'] }), { type: 'turn_end' });
});
