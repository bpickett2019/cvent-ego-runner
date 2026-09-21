import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { RUN_POLICY, executionPrompt } from '../app/run-policy.mjs';

test('execution envelope never injects old tasks, even with legacy reconciliation fields', () => {
  const prompt = executionPrompt({ executionInstructions: RUN_POLICY.executionInstructions, approvedSow: RUN_POLICY.approvedSow, workbook: '/new/original.xlsx', target: { apiEventId: 'current' }, executionPolicy: RUN_POLICY.executionPolicy, phase: 'RECONCILING', reconciliation: [{ jobId: 'OLD_TASK' }], priorEventJobs: [{ report: 'OLD_REPORT' }] }, '/new');
  assert.doesNotMatch(prompt, /OLD_TASK|OLD_REPORT|priorEventEvidence|prior-event-evidence|PRIOR SAVED-STATE RECOVERY|rr-reconcile/);
  assert.match(prompt, /current live saved Cvent state/);
  assert.match(prompt, /Never replay an uncertain save/);
});
test('historical uncertainty gates, promotion command and fence are removed from runtime source', () => {
  for (const file of ['bin/rr-reconcile','app/reconciliation.mjs','app/reconciliation-browser.mjs','app/reconciliation-prompt.md']) assert.equal(existsSync(new URL('../'+file, import.meta.url)), false, file);
  const history = readFileSync(new URL('../app/event-history.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(history, /unresolvedChanges|apiUnresolved|unresolved-changes|api-write-uncertain|Operator decision required|reconciliation/);
  for (const file of ['app/cvent-api-cli.mjs','ego-bridge/host.mjs']) assert.doesNotMatch(readFileSync(new URL('../'+file, import.meta.url), 'utf8'), /RECONCILING|reconciliationPending/);
  const source = readFileSync(new URL('../app/rr-connection.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fenceReconciliationBrowser|fenceBrowser|RECONCILING|\/api\/jobs\/:id\/reconcile/);
  const bridge = readFileSync(new URL('../.pi/skills/ego-browser/references/steel-bridge.md', import.meta.url), 'utf8');
  assert.doesNotMatch(bridge, /rr-reconcile|Follow this run's recovery|RECONCILING/);
});
