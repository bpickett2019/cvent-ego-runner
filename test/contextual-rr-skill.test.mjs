import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RUN_POLICY, RUN_SKILLS, RUN_SKILL_FILES} from '../app/run-policy.mjs';
// Instruction contracts, not proof of model interpretation or live execution.
const root=new URL('../.pi/skills/cvent-event-build/',import.meta.url);
const text=async name=>(await readFile(new URL(name,root),'utf8')).replace(/\s+/g,' ');

test('one native task delegates layout discovery and execution order to the current skill',async()=>{
 assert.deepEqual(RUN_SKILLS,['cvent-event-build']);assert.equal(RUN_SKILL_FILES.length,11);
 const task=RUN_POLICY.executionInstructions.replace(/\s+/g,' ');
 assert.match(task,/sheet order is not execution order/);
 assert.match(task,/execute in the skill's order/);
 assert.match(task,/references\/rr-interpretation.md/);
 assert.match(task,/never replay unresolved writes/);
});
test('sheet positions, numeric prefixes and columns do not create fixed-template requirements',async()=>{
 const rr=await text('references/rr-interpretation.md');
 for(const phrase of ['names, headers and contents','Sheet position, numeric prefixes and column positions can change','not fixed worksheet indexes','Never include an excluded section','Do not physically reorder, rename or resave the bound original','Keep original sheet names and cell addresses','do not assume one fixed table shape','Never fill down across unrelated objects'])assert.ok(rr.includes(phrase),phrase);
 assert.doesNotMatch(rr,/Coconut Grove|COL271|EO-PB|PRESSED|IGES|WPPI|Pizza Expo/);
});
test('names, display text, codes and UUIDs retain different roles and actual identity checks',async()=>{
 const rr=await text('references/rr-interpretation.md');
 assert.match(rr,/Internal names, display text, codes and resource UUIDs are distinct/);
 assert.match(rr,/not automatically conflicts/);
 assert.match(rr,/Resolve actual event resources before writes/);
 assert.match(rr,/confirm that a matching code belongs to the intended item/i);
});
test('filled intent, preservation and source conflicts follow client decisions rather than old escalation rules',async()=>{
 const skill=await text('SKILL.md');
 for(const phrase of ['Filled cell: make Cvent match it','Blank cell on something that already exists in Cvent: leave Cvent as it is','use 11 Registration Paths','choose the reading closest to what the doc says'])assert.ok(skill.includes(phrase),phrase);
 assert.match(await text('references/runner-contract.md'),/originalExpected.*policy-derived intended result in expected/);
});
test('formulas, formats, comments and unresolved source data remain technical evidence',async()=>{
 const rr=await text('references/rr-interpretation.md');
 for(const phrase of ['openpyxl does not recalculate formulas','Missing/unread data is not a confirmed blank','Never execute arbitrary workbook code','zero differs from blank','fraction displayed as a percentage','Preserve formulas and established results'])assert.ok(rr.includes(phrase),phrase);
 assert.match(rr,/parent questions, choices, codes, Notes and logic/);
});
test('blank and explicit None semantics come from the exact client skill, not removed field-legend rules',async()=>{
 const skill=await text('SKILL.md');
 assert.match(skill,/Blank cell on something that already exists/);
 assert.match(skill,/Blank cell on something you are creating, where Cvent requires a value/);
 assert.match(skill,/"None" in a date field means no date limit/);
 assert.match(skill,/Money and other numbers: `0`/);
 assert.match(skill,/Never use 0, because 0 blocks registration/);
 const rr=await text('references/rr-interpretation.md');assert.match(rr,/fill-in rule is not a substitute for an unresolved resource, asset or tool capability/);
});
test('unlisted leftovers stay preserved and excluded tabs cannot manufacture work',async()=>{
 const skill=await text('SKILL.md');
 assert.match(skill,/Anything in Cvent that isn't in the doc.*leave it alone/);
 assert.match(skill,/Skip every other tab/);
 assert.match(skill,/only rows where Item Type is "Admission Item"/);
 assert.match(await text('references/runner-contract.md'),/Outside scope; receives no completion credit/);
});
test('current saved state must verify approved intent rather than become an invented baseline approval',async()=>{
 const skill=await text('SKILL.md'),contract=await text('references/runner-contract.md');
 assert.match(skill,/Look first. If Cvent already matches the doc, move on/);
 assert.match(skill,/reopen or reload the page and check the saved value/);
 assert.match(contract,/verified_existing.*Existing saved configuration matches the approved intent/);
 assert.match(contract,/Before editing a verified item, revoke stale verification/);
 assert.match(contract,/Do not invent provenance/);
});
test('ordinary failures allow independent work; real uncertainty and unsupported operations remain visible',async()=>{
 const runtime=await text('references/runner-integration.md'),contract=await text('references/runner-contract.md');
 assert.match(runtime,/Known pre-write failures block dependent requirements, not independent work/);
 assert.match(runtime,/Possible effects with an unknown outcome/);
 assert.match(runtime,/same-event claims/);assert.match(runtime,/Do not change another workspace/);
 assert.match(contract,/Never clear a marker or replay a write/);
 assert.match(contract,/No included|missing saved field/);
});
