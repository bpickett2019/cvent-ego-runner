import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {RUN_SKILLS,RUN_SKILL_FILES,RUN_POLICY} from '../app/run-policy.mjs';
const root=new URL('../.pi/skills/cvent-event-build/',import.meta.url);
const text=async name=>(await readFile(new URL(name,root),'utf8')).replace(/\s+/g,' ');

test('one explicit skill and assigned browser reference workspace; no legacy specialist discovery',async()=>{
 assert.deepEqual(RUN_SKILLS,['cvent-event-build']);assert.equal(RUN_SKILL_FILES.length,11);
 const files=await readdir(root,{recursive:true});assert.deepEqual(files.filter(p=>p.endsWith('SKILL.md')),['SKILL.md']);
 const launch=await readFile(new URL('../app/pi-rpc.mjs',import.meta.url),'utf8');assert.match(launch,/"--no-skills", \.\.\.RUN_SKILLS.flatMap/);
 const bridge=await readFile(new URL('../ego-bridge/cli.mjs',import.meta.url),'utf8');
 assert.match(bridge,/EGO_BROWSER_AGENT_WORKSPACE = resolve\(project, "\.pi\/skills\/cvent-event-build\/references\/browser"\)/);
 assert.doesNotMatch(bridge,/\.pi\/skills\/ego-browser/);
 assert.match(RUN_POLICY.executionInstructions,/client business policy/);
});
test('scope is the exact client nine-section profile, not removed specialist checklists',async()=>{
 const skill=await text('SKILL.md');
 for(const name of ['01 Event','02 Registration Types','03 Admission Items','06 Fees','07 Discount Codes','09 Website','10 Footer Links','11 Registration Paths','12 Questions'])assert.ok(skill.includes(name),name);
 assert.match(skill,/Skip every other tab/);assert.match(skill,/only rows where Item Type is "Admission Item"/);
 assert.match(skill,/ignore the Sessions and Optional Items columns/);assert.match(skill,/except the Theme row/);
 assert.match(skill,/Brand Color 1–5.*same order/);
 assert.match(skill,/Instructions in a Notes cell.*part of the job/);
});
test('asset signatures do not invent remote transfer or restore a human-upload policy requirement',async()=>{
 const controls=await text('references/browser/controls.md');
 assert.match(controls,/File chooser\/upload signatures do not implement transfer/);
 assert.match(controls,/authorized source assets and verified staging\/host support/);
 assert.match(controls,/No general human-upload business prerequisite/);
 assert.match(controls,/Desktop clipboard and remote download artifact transfer are not implemented/);
 assert.match(controls,/Never upload workbooks, reports, secrets or unrelated files/);
});
test('discount transport and pricing remain distinct and unsupported eligibility cannot be broadened',async()=>{
 const skill=await text('SKILL.md'),discounts=await text('references/discounts.md');
 assert.match(skill,/Discounts go through `\$CVENT_API_BIN`. Everything else goes through `\$EGO_BROWSER_BIN`/);
 assert.match(discounts,/Registration-type Advanced Filters are not exposed/);
 assert.match(discounts,/Unsupported required eligibility blocks the discount before writing/);
 assert.match(discounts,/No raw HTTP or browser discount fallback after denial/);
 assert.match(discounts,/complete links/);
 assert.match(await text('references/runner-integration.md'),/additional volume operation does not expand business scope/);
});
test('saved evidence, not preview or presentation, determines completion',async()=>{
 const contract=await text('references/runner-contract.md');
 assert.match(contract,/saved relationships to be verified, Draft verified, Not done empty and no uncertainty/);
 assert.match(contract,/Neither Saved grouping nor existing matches hide unfinished requirements/);
 assert.match(contract,/controller is authoritative/);assert.match(contract,/registrationTesting/);
 assert.match(await text('SKILL.md'),/Registration testing was not performed/);
});
test('reference consolidation preserves source and technical evidence without importing obsolete business policy',async()=>{
 const rr=await text('references/rr-interpretation.md'),contract=await text('references/runner-contract.md');
 for(const phrase of ['original workbook/version/checksum','exact sheet/cell/range references','originalExpected','policyDecisions','answer order','dependent logic'])assert.ok(rr.includes(phrase),phrase);
 for(const phrase of ['concurrentEditorSaves','unresolved-changes.json','verified_existing','verified_changed','partially_verified'])assert.ok(contract.includes(phrase),phrase);
 assert.equal(await readFile(new URL('references/browser/references/api.md',root),'utf8'),await readFile(new URL('../.pi/skills/ego-browser/references/api.md',import.meta.url),'utf8'));
});
