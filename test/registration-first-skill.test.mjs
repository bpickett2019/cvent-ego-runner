import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RUN_POLICY, RUN_SKILLS, RUN_SKILL_FILES } from '../app/run-policy.mjs';

const skill = new URL('../.pi/skills/cvent-event-build/', import.meta.url);
const text = async path => (await readFile(new URL(path, skill), 'utf8')).replace(/\s+/g, ' ');

test('captured task and active skill require event then registration types before remaining authoring', async () => {
  assert.match(RUN_POLICY.executionInstructions, /verified event selection, then RR-required\s+registration types, then the remaining work in dependency order/);
  assert.match(RUN_POLICY.executionInstructions, /Record missing inputs or known unsupported requirements and continue independent\s+safe work/);
  const main = await text('SKILL.md');
  assert.match(main, /verified event selection → registration types → remaining configuration/);
  assert.match(main, /Do not begin with discounts, pricing or website authoring/);
  assert.match(main, /Read \[registration and pricing\].*before the first configuration pass/);
  assert.doesNotMatch(main + RUN_POLICY.executionInstructions, /Choose your own plan and dependency order|no prescribed editor order/);
  assert.deepEqual(RUN_SKILLS, ['cvent-event-build']);
  assert.equal(RUN_SKILL_FILES.length, 17);
});

test('types-first is a verified prerequisite pass, not an unrelated-work deadlock or stale click script', async () => {
  const main = await text('SKILL.md');
  const registration = await text('references/registration-and-pricing.md');
  assert.match(main, /record its source-backed blocker, finish the other executable types and proceed only with work that does not depend on the blocked type/);
  assert.match(main, /Source interpretation and necessary read-only prerequisite discovery may precede type configuration/);
  assert.match(registration, /Details → dropdown → Registration Types → Edit/);
  assert.match(registration, /Confirm the visible controls and exact event identity/);
  assert.match(registration, /already|Reuse an exact existing definition/);
  assert.match(registration, /independently re-read the created\/reused type and event assignment/);
  assert.match(registration, /A blocked type prevents only its dependents/);
});

test('contact type exception is exact, create-only, browser-bound and cannot alter existing shared definitions', async () => {
  const registration = await text('references/registration-and-pricing.md');
  for (const required of [
    'User-authorized create-only exception', 'Contact-type definitions can be account-wide',
    'not changing existing definitions, other events, shared defaults, templates, permissions or contact/attendee records',
    'Required creation values must come from the RR/confirmed intake',
    'No contact-type API authoring or raw-HTTP fallback is authorized',
    'no duplicate/suffix or replay after an uncertain create',
  ]) assert.ok(registration.includes(required), required);
  for (const file of ['SKILL.md', 'references/scope-and-intake.md', 'references/runner-integration.md']) {
    assert.match(await text(file), /create-only/);
  }
  const apiGuide = await readFile(new URL('../CVENT-API.md', import.meta.url), 'utf8');
  assert.match(apiGuide, /does not expose an API creation route/);
  assert.match(apiGuide, /Missing API creation support alone does not prohibit that separately authorized browser workflow/);
});

test('later domain guidance cannot suggest discount-first or unconstrained configuration order', async () => {
  assert.match(await text('references/discounts.md'), /registration-types-first configuration pass must precede discount authoring/);
  assert.match(await text('references/website-and-fields.md'), /After completing or specifically blocking the RR registration-types-first pass/);
  assert.match(await text('references/operating-model.md'), /mandatory first configuration pass is verified event selection → registration types/);
  assert.match(await text('references/runner-integration.md'), /registration-type configuration come first/);
});

test('ordinary blockers require continued independent work while unresolved writes retain safety stops', async () => {
  const operating = await text('references/operating-model.md');
  assert.match(operating, /ordinary pre-write selector\/navigation failure calls for a fresh observation/);
  assert.match(operating, /Known post-Save rejection with confirmed non-persistence permits/);
  assert.match(operating, /pending Save, unknown persistence, identity\/control loss or a runner safety hold does not/);
  assert.match(operating, /Current runtime safety stops terminate Pi\/browser/);
  assert.match(await text('references/runner-contract.md'), /A blocked requirement is not a terminal run status/);
  assert.match(await text('references/verification.md'), /not an instruction to quit at the first blocker/);
  assert.match(await text('references/verification.md'), /\*\*STOPPED\*\* on operator Stop, identity\/control loss/);
  assert.match(RUN_POLICY.executionInstructions, /Never replay unresolved writes or bypass holds/);
});

test('skill follows configured capacity and cannot bypass event or shared-contact-type protection', async () => {
  const integration = await text('references/runner-integration.md');
  assert.match(integration, /concurrent mode permits up to three different-event builds, one per workspace/);
  assert.match(integration, /do not change another workspace, release claims, start an extra agent or bypass the gateway/i);
  assert.match(integration, /Concurrent mode disables shared contact-type creation/);
  assert.match(integration, /Same-event builds cannot overlap/);
  assert.match(integration, /skill instructions do not implement that policy/);
});
