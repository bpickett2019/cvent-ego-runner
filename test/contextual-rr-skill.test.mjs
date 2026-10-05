import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RUN_POLICY, RUN_SKILLS, RUN_SKILL_FILES } from '../app/run-policy.mjs';

// Offline source-contract regressions, not an Excel parser, paid model evaluation,
// or proof that a live agent interpreted unseen workbooks correctly.
const root = new URL('../.pi/skills/cvent-event-build/', import.meta.url);
const text = async name => (await readFile(new URL(name, root), 'utf8')).replace(/\s+/g, ' ');

test('contextual interpretation remains in the short one-skill task without changing the type-first or tool contracts', async () => {
  assert.match(RUN_POLICY.executionInstructions, /Read every worksheet contextually/);
  assert.ok(RUN_POLICY.executionInstructions.trim().split(/\s+/).length <= 120);
  assert.match(RUN_POLICY.executionInstructions, /The RR defines the target configuration; live Cvent is the starting state/);
  assert.match(RUN_POLICY.executionInstructions, /verified event selection, then RR-required\s+registration types/);
  assert.deepEqual(RUN_SKILLS, ['cvent-event-build']);
  assert.equal(RUN_SKILL_FILES.length, 17);
  const main = await text('SKILL.md');
  assert.match(main, /contextual interpretation rules.*rr-interpretation\.md/);
  assert.match(main, /An uncertain external write is different: stop mutations and preserve its evidence/);
});

test('renamed, reordered and differently shaped tables must be discovered rather than matched to historical templates', async () => {
  const rr = await text('references/rr-interpretation.md');
  assert.match(rr, /do not depend on a fixed sheet count, spelling, column position, admission code or sample event/);
  assert.match(rr, /Map unfamiliar headings to their business meaning/);
  assert.match(rr, /Never fill down arbitrary blanks across different items or questions/);
  assert.match(rr, /examples.*not requirements or evidence/i);
  assert.doesNotMatch(rr, /Coconut Grove|EO-PB|EXONLY|PRESSED|F5|IGES|WPPI|Pizza Expo|NEW Reg Types & Pricing/);
});

test('different internal name, public caption and code are distinct properties, not invented aliases or automatic conflicts', async () => {
  const rr = await text('references/rr-interpretation.md');
  assert.match(rr, /internal names, display text, codes, registration types, admissions and resource UUIDs are different/);
  assert.match(rr, /Different strings in those roles are not automatically contradictory/);
  assert.match(rr, /registration type → admission identity → fee\/tier → path → discount eligibility/);
  assert.match(rr, /Do not infer an alias between different codes from similar names or silently collapse variants/);
  assert.match(await text('references/runner-contract.md'), /Unresolved aliases are blockers, not accepted inferred mappings/);
});

test('a clear RR difference from live state requires authorized execution, while true source conflicts retain both sources', async () => {
  const rr = await text('references/rr-interpretation.md');
  assert.match(rr, /A clear, authorized mismatch means configure and verify the requested change/);
  assert.match(rr, /Current state alone cannot override the RR/);
  assert.match(rr, /Never rank tabs by position, name, recency-looking labels or convenience/);
  assert.match(rr, /same-property requirements for the same object remain incompatible, retain both sources/);
  assert.match(rr, /Ask once per underlying decision/);
  assert.match(await text('references/registration-and-pricing.md'), /differing current assignments alone do not make the request ambiguous/);
});

test('formula caches and comments require contextual evidence without global invalidation or silent disregard', async () => {
  const rr = await text('references/rr-interpretation.md');
  assert.match(rr, /formula-generated value is not inherently unreliable/);
  assert.match(rr, /missing\/stale cache alone is not proof of conflicting intent/);
  assert.match(rr, /Never execute arbitrary workbook expressions as shell\/code/);
  assert.match(rr, /A local review warning does not automatically invalidate other rows or every formula/);
  assert.match(rr, /explicitly table-wide warning must not be narrowed to one cell/);
  assert.match(rr, /If the result cannot be established, block only dependent interpretation/);
});

test('blank semantics depend on the field legend, not a universal default or an invented tool capability', async () => {
  const rr = await text('references/rr-interpretation.md');
  assert.match(rr, /field-specific legend may explicitly define a blank as unrestricted or inherited/);
  assert.match(rr, /record a capability blocker, not an intent question or permission to invent replacement dates/);
  assert.match(rr, /Do not transfer a blank convention from one column\/category to another/);
  assert.match(rr, /Explicit zero\/No values remain meaningful/);
  assert.doesNotMatch(rr, /A blank date or `TBD` is not today's date or unlimited validity/);
  const scope = await text('references/scope-and-intake.md');
  assert.match(scope, /Blank does not mean off by itself/);
  assert.match(scope, /Explicit off\/No or disabled/);
});

test('optional omissions do not manufacture requirements, but requested essential values and explicit off stay binding', async () => {
  const scope = await text('references/scope-and-intake.md');
  assert.match(scope, /A requested feature's missing essential input is a blocker/);
  assert.match(scope, /same missing field on an unrequested optional feature is not automatically one/);
  assert.match(scope, /preserve unrequested existing properties while implementing the requested differences/);
  assert.match(scope, /Do not add synthetic blocked requirements or award completed-requirement credit/);
  assert.match(scope, /Existing behavior that conflicts with a requested result is not protected/);
  assert.match(scope, /Never silently preserve a conflicting enabled feature and claim compliance/);
  assert.doesNotMatch(scope, /a missing instruction is unknown, not not-applicable/);
});

test('baseline reuse requires actual approval, identity and verification rather than trusting existing defaults', async () => {
  const scope = await text('references/scope-and-intake.md');
  assert.match(scope, /explicitly supplied\/confirmed baseline whose identity\/version, governed categories and values are available for this job/);
  assert.match(scope, /must not override a conflicting explicit RR instruction without a confirmed precedence decision/);
  assert.match(scope, /No baseline supplied means no invented baseline approval/);
  const verify = await text('references/verification.md');
  assert.match(verify, /blanket “keep defaults” note cannot conceal a conflicting explicit requirement or missing essential input/);
  assert.match(verify, /not silently disabled or credited as completed RR work/);
});

test('domain and reporting references consistently distinguish optional notes, actual blockers and safety stops', async () => {
  assert.match(await text('references/vouchers-and-rules.md'), /do not invent a toggle requirement solely because the category appears here/);
  assert.match(await text('references/website-and-fields.md'), /Do not turn every listed field into a required customization/);
  assert.match(await text('references/operating-model.md'), /checklist is a coverage aid, not a source of synthetic requirements/);
  const contract = await text('references/runner-contract.md');
  assert.match(contract, /Optional unrequested settings belong in report applicability notes/);
  assert.match(contract, /distinguish missing essential input, unsupported capability and uncertain write outcomes/);
  assert.match(contract, /Never clear a hold or replay a mutation/);
  assert.match(await text('references/verification.md'), /\*\*STOPPED\*\* on operator Stop, identity\/control loss/);
  assert.match(await text('references/runner-integration.md'), /Same-event builds cannot overlap/);
});
