import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RUN_POLICY,RUN_SKILLS,RUN_SKILL_FILES} from '../app/run-policy.mjs';
const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const browser='.pi/skills/cvent-event-build/references/browser/';

test('cleanup preserves actual executor/skill/budget selections rather than silently optimizing them',async()=>{
  assert.deepEqual(RUN_SKILLS,['cvent-event-build']);assert.equal(RUN_SKILL_FILES.length,17);
  assert.equal(RUN_POLICY.executionPolicy,'native-pi');assert.equal(RUN_POLICY.spendingLimitEnabled,false);
  assert.equal(RUN_POLICY.targetCostUSD,60);assert.equal(RUN_POLICY.allowanceUSD,60);assert.equal(RUN_POLICY.externalCostReserveUSD,10);
  const launcher=await source('app/pi-rpc.mjs');assert.match(launcher,/env.PI_THINKING_LEVEL \?\? "high"/);
  assert.match(launcher,/"--no-skills", \.\.\.RUN_SKILLS.flatMap/);assert.match(launcher,/"--no-context-files"/);
});
test('current docs describe the deployed single-skill and reset/pause contracts without obsolete activation claims',async()=>{
  const rpc=await source('RPC-CONNECTION.md'),readme=await source('README.md');
  assert.match(rpc,/one explicit `--skill` for `cvent-event-build`/);assert.match(rpc,/`replaceWorkspace:true`/);assert.match(rpc,/`workspaceResetSupported:true`/);
  assert.doesNotMatch(rpc,/six explicitly selected|corrections are not deployed|not activated|Source-only:|D3 source only/);
  assert.doesNotMatch(readme,/new source; not yet activated|D2 source; not activated|These changes are not deployed|Azure\/filesystem validation and deployment remain pending/);
  assert.match(readme,/shared login is not per-person authorization/);assert.match(readme,/asset metadata fields and voucher\/rule switches are pending/);
  assert.match(rpc,/Native Pi\/provider retries and compaction remain distinct/);
});
test('active browser recipe uses only the assigned session and app-owned completion/ownership',async()=>{
  const controls=await source(browser+'controls.md');
  assert.match(controls,/taskSpace\(1246080070\)/);assert.match(controls,/\$EGO_BROWSER_BIN/);
  assert.match(controls,/task.finish\(\{ keep: \[page.label\] \}\)/);
  assert.doesNotMatch(controls,/taskSpace\("|taskSpace\(7\)|takeOverTaskSpace\(7\)|claimTaskSpace\(7\)|finish\(\{ keep: \[\] \}\)|await page.keyboard.paste\(/);
  assert.doesNotMatch(controls,/name='Sign in'|page.fetch\("\/api\/items"/);
  assert.match(controls,/not permitted for this build/);assert.match(controls,/application's supported Take Control\/Return flow/);
  assert.match(controls,/Do not finish on errors or human-control loss/);assert.match(controls,/No raw POST\/PUT\/PATCH/);
  assert.match(controls,/Read-only|read-only|snapshot/);
});
test('state-reset guide no longer offers cookie harvesting or clearing recipes to the runtime agent',async()=>{
  const text=await source(browser+'references/clearing-state.md');
  assert.match(text,/must not inspect\/export cookies/);assert.match(text,/Do not call browser-wide cookie\/cache clearing/);
  assert.doesNotMatch(text,/await page.cdp\(|Network.getAllCookies|Network.deleteCookies|Storage.clearDataForOrigin/);
  assert.match(text,/cannot stop another workspace/);assert.match(text,/does not erase saved Cvent changes/);
});
test('intake and lifecycle copy describe actual login-first flow without an allowance approval gate',async()=>{
  const html=await source('public/index.html'),js=await source('public/app.js');
  assert.doesNotMatch(html,/approved allowance|Understand requirements<|Open browser and build</);
  for(const label of ['RR uploaded','Clean browser prepared','Login &amp; event verified','AI build &amp; verification'])assert.ok(html.includes(label),label);
  assert.match(html,/Milestones show phases reached, not full completion/);
  assert.match(html,/Human login and verified Return to Agent are required/);
  assert.match(html,/not guarantees or automatic limits/);
  assert.doesNotMatch(js,/\[!!job \|\| !!workbook, !!job\?\.intake/);
});
