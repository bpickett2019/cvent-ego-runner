import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { RUN_SKILLS, RUN_SKILL_FILES, RUN_POLICY } from '../app/run-policy.mjs';
const root = new URL('../.pi/skills/cvent-event-build/', import.meta.url);
const text = async name => (await readFile(new URL(name, root), 'utf8')).replace(/\s+/g, ' ');

test('single skill and browser reference workspace stay explicit; no legacy skill discovery or helper injection', async () => {
  assert.deepEqual(RUN_SKILLS, ['cvent-event-build']);
  assert.equal(RUN_SKILL_FILES.length, 17);
  assert.equal(RUN_SKILL_FILES.filter(p => p.endsWith('/SKILL.md')).length, 1);
  const files = await readdir(root, { recursive: true });
  assert.deepEqual(files.filter(p => p.endsWith('SKILL.md')), ['SKILL.md']);
  const launcher = await readFile(new URL('../app/pi-rpc.mjs', import.meta.url), 'utf8');
  assert.match(launcher, /"--no-skills", \.\.\.RUN_SKILLS.flatMap/);
  const bridge = await readFile(new URL('../ego-bridge/cli.mjs', import.meta.url), 'utf8');
  assert.match(bridge, /EGO_BROWSER_AGENT_WORKSPACE = resolve\(project, "\.pi\/skills\/cvent-event-build\/references\/browser"\)/);
  assert.doesNotMatch(bridge, /\.pi\/skills\/ego-browser/);
  assert.match(RUN_POLICY.executionInstructions, /admission items, pricing and discounts/);
});

test('agreed scope explicitly accounts for every supplied website, field, registration and discount property', async () => {
  const scope = await text('references/scope-and-intake.md');
  for (const value of ['Header banner', 'Header billboard', 'four supported options', 'Footer theme', 'resource-link label',
    'short justification', 'Footer social box', 'visibility toggle', 'Footer Contact Us', 'Button text, first name, last name and email',
    'Already Registered', 'Block heading and instructions', 'First name, last name, email and company', 'required flag and display-as',
    'Source folder', 'source location', 'source filename', 'destination filename', 'Registration overview',
    'Registration path selection', 'Admission items', 'Expo-variant differentiators', 'fee name', 'registration type',
    'price/currency', 'active/display toggles', 'every fee row', 'group/volume', 'Event vouchers', 'Advanced rules']) {
    assert.ok(scope.includes(value), value);
  }
  assert.match(scope, /four option names were not supplied/);
  assert.match(scope, /Blank does not mean off/);
  assert.match(scope, /Off means verify the requested feature is disabled/);
  assert.match(scope, /dedicated asset folder\/filename fields and voucher\/rule switches must be separately implemented\/verified/);
});

test('image workflow remains human upload with actual destination/name/readback and no invented capability', async () => {
  const assets = await text('references/assets.md');
  for (const value of ['source folder/location/filename', 'Cvent library folder and destination filename',
    'user upload', 'human completes it', 'Automated image upload is not implied',
    'Only the app\'s supported explicit Take Control/Return', 'stopped job requires a fresh build',
    'identity/folder/filename AND widget use']) {
    const coverage = assets + ' ' + await text('references/verification.md');
    assert.ok(coverage.includes(value), value);
  }
  assert.match(assets, /Missing\/wrong asset or unverified filename\/placement is INCOMPLETE/);
});

test('discount and pricing remain distinct; API limitations cannot be bypassed or silently broadened', async () => {
  const pricing = await text('references/registration-and-pricing.md');
  for (const value of ['multiple fees per admission/type', 'active flag and display flag independently',
    'Do not overwrite one tier with another', 'exact name/code', 'Expo-variant differentiators']) assert.ok(pricing.includes(value), value);
  const discounts = await text('references/discounts.md');
  for (const value of ['configureDiscount/configureVolumeDiscount', 'Registration-type Advanced Filters are not exposed',
    'before any write', 'never a browser fallback', 'Do not switch to Ego to bypass an API rejection',
    'independently', 'exact eligible items and all required relationships']) assert.ok(discounts.includes(value), value);
  const rules = await text('references/vouchers-and-rules.md');
  assert.match(rules, /not discount codes, and a voucher is not an admission fee/);
  assert.match(rules, /triggering and non-triggering cases/);
  assert.match(rules, /Do not delete rules\/vouchers/);
});

test('verification cannot treat missing, unsupported or untested work as sign-off', async () => {
  const verify = await text('references/verification.md');
  for (const value of ['Revisit the original RR', 'operator review', 'unexercised categories/variants',
    'missing structured intake UI', 'not human commercial sign-off', 'without the user\'s review of actual saved results',
    '**INCOMPLETE**', '**STOPPED**', 'without submitting a live registration',
    'A working button leading to the wrong event is a failure']) assert.ok(verify.includes(value), value);
  const main = await text('SKILL.md');
  assert.match(main, /Read \[verification\].*before final reporting/);
  assert.match(main, /No publishing, attendee access\/registration submission/);
});

test('consolidation preserves the inherited domain details rather than replacing them with a short checklist', async () => {
  const sections = [
    ['cvent-registration/SKILL.md', 'registration-and-pricing.md', '## Discover the existing event\n', '## Save and verify\n'],
    ['cvent-discounts/SKILL.md', 'discounts.md', '## Exact mapping checklist\n', '## Routes and known limits\n'],
    ['cvent-rr-verify/SKILL.md', 'verification.md', '## Verify behavior safely\n', '## Completion rules\n'],
  ];
  const section = (s, start, end) => s.slice(s.indexOf(start), s.indexOf(end, s.indexOf(start)));
  for (const [original, reference, start, end] of sections) {
    const before = await readFile(new URL('../.pi/skills/' + original, import.meta.url), 'utf8');
    const after = await readFile(new URL('references/' + reference, root), 'utf8');
    assert.ok(before.includes(start) && after.includes(start));
    assert.equal(section(after, start, end), section(before, start, end), reference);
  }
  assert.equal(await readFile(new URL('references/browser/references/api.md', root), 'utf8'),
    await readFile(new URL('../.pi/skills/ego-browser/references/api.md', import.meta.url), 'utf8'));
});
