import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RUN_POLICY,RUN_SKILLS,RUN_SKILL_FILES} from '../app/run-policy.mjs';
// Historical filename retained. The approved policy is now event-first, not types-first.
const root=new URL('../.pi/skills/cvent-event-build/',import.meta.url);
const text=async name=>(await readFile(new URL(name,root),'utf8')).replace(/\s+/g,' ');
const order='Event → Registration Types → Admission Items → Fees → Discount Codes → Website → Footer Links → Registration Paths → Questions';

test('execution follows the client nine-stage order with answers immediately after questions',async()=>{
 const skill=await text('SKILL.md');assert.ok(skill.includes(order));assert.match(skill,/answer choices right after each question/);
 assert.match(RUN_POLICY.executionInstructions.replace(/\s+/g,' '),/execute in the skill's order/);
 assert.deepEqual(RUN_SKILLS,['cvent-event-build']);assert.equal(RUN_SKILL_FILES.length,11);
});
test('layout discovery may precede authoring without changing order or forcing workbook edits',async()=>{
 const rr=await text('references/rr-interpretation.md');
 assert.match(rr,/Read-only prerequisite discovery can happen before its authoring stage/);
 assert.match(rr,/Preserve its scope and execution order regardless of the source layout/);
 assert.match(rr,/Do not physically reorder, rename or resave the bound original/);
 assert.match(rr,/Keep deferred connections unfinished until their dependencies are saved and verified/);
});
test('the former shared contact-type creation exception is not part of this build',async()=>{
 const skill=await text('SKILL.md');assert.match(skill,/Change anything shared across the Cvent account \(contact types, shared venues, templates, other events\)/);
 const guide=await readFile(new URL('../CVENT-API.md',import.meta.url),'utf8');
 assert.doesNotMatch(guide,/create-only contact-type|Missing API creation support alone does not prohibit/);
 const runtime=await text('references/runner-integration.md');assert.match(runtime,/No other agent, browser, profile, tab, server, raw connection or HTTP fallback/);
});
test('technical browser guidance cannot substitute discount-first or unconstrained authoring order',async()=>{
 const bridge=await text('references/browser/references/steel-bridge.md');
 assert.match(bridge,/Discover supported controls within the skill's stage order/);
 assert.match(bridge,/Read-only prerequisite discovery does not authorize out-of-order authoring/);
 assert.ok((await text('SKILL.md')).includes(order));
});
test('ordinary item failures continue while uncertain writes retain Stop and no-replay protections',async()=>{
 const skill=await text('SKILL.md'),runtime=await text('references/runner-integration.md');
 assert.match(skill,/If one thing fails, note it and move on/);
 assert.match(skill,/Never repeat a change whose outcome you don't know/);
 assert.match(runtime,/Known pre-write failures block dependent requirements, not independent work/);
 assert.match(runtime,/A stopped job is not resumable/);
 assert.match(runtime,/Pending Save means observe, not reload or repeat/);
});
test('existing concurrency, ownership, identity and uncertainty remain runtime gates',async()=>{
 const runtime=await text('references/runner-integration.md');
 for(const phrase of ['same-event claims','Do not change another workspace','release claims','remove locks/markers','replay intents','identity-verified Return'])assert.ok(runtime.includes(phrase),phrase);
 assert.match(runtime,/controller, not the model's report, settles the run/);
});
