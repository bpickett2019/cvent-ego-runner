import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RUN_SKILLS, RUN_SKILL_FILES, RUN_POLICY} from '../app/run-policy.mjs';
import {checkInstallation} from '../scripts/check-installation.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base='.pi/skills/cvent-event-build/';
const read=p=>readFileSync(resolve(root,p),'utf8');
const text=p=>read(p).replace(/\s+/g,' ');
const walk=p=>readdirSync(resolve(root,p),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+'/'+e.name):[p+'/'+e.name]);

test('the client skill is byte-for-byte unchanged',()=>{
 assert.equal(createHash('sha256').update(read(base+'SKILL.md')).digest('hex'),'34431110c1f9941a18831c266f814a208c55b11969e1c391572760a7c81a5a44');
 assert.deepEqual(RUN_SKILLS,['cvent-event-build']);
 assert.equal(RUN_POLICY.executionPolicy,'native-pi');
});
test('installation inventory exactly covers the current 11-file skill bundle',()=>{
 assert.equal(RUN_SKILL_FILES.length,11);
 assert.deepEqual([...RUN_SKILL_FILES].sort(),walk(base.slice(0,-1)).filter(p=>p.endsWith('.md')).sort());
 assert.equal(new Set(RUN_SKILL_FILES).size,RUN_SKILL_FILES.length);
});
test('all local links in the active bundle resolve, without external local skill dependencies',()=>{
 for(const file of RUN_SKILL_FILES){
  for(const [,target] of read(file).matchAll(/\]\(([^)]+)\)/g)){
   if(/^(https?:|#|mailto:)/.test(target))continue;
   const dest=resolve(root,dirname(file),target.split('#')[0]);
   assert.ok(dest.startsWith(resolve(root,base)+'/'),file+' -> '+target);
   assert.ok(existsSync(dest),file+' -> '+target);
  }
 }
});
test('installation checker sees the real bundle; unrelated prerequisites are explicitly mocked',()=>{
 const result=checkInstallation({directory:root,nodeVersion:'25.0.0',env:{PATH:'/fixture',PI_PROVIDER:'fixture',PI_MODEL:'fixture',CVENT_CREDENTIALS_FILE:'/fixture/credentials'},
  file:p=>p.includes('/.pi/skills/cvent-event-build/')?existsSync(p):true,
  run:()=>({status:0,stdout:'dca7003349c5f7132189ba00547cbbd7ff8e597e'})});
 for(const path of RUN_SKILL_FILES)assert.equal(result.checks.find(x=>x.name===path)?.status,'PASS',path);
 // This tests only source-inventory integration, not local installation/authentication.
});
test('native task points to the single policy and existing technical entrypoints',()=>{
 const task=text('app/native-task.md');
 for(const p of ['runner-integration','runner-contract','rr-interpretation','discounts'])assert.ok(task.includes('references/'+p+'.md'));
 assert.ok(task.includes('references/browser/controls.md'));
 assert.ok(task.includes('$CVENT_API_GUIDE'));
 assert.ok(task.includes('never replay unresolved writes'));
 assert.match(task,/Do not run registration previews or submit registrations/);
 assert.match(task,/No other build starts/);
 assert.match(task,/diagnostic-guard.js --status/);
});
test('references no longer supply alternate default tables or obsolete contact-type permission',()=>{
 const support=RUN_SKILL_FILES.filter(p=>!p.endsWith('/SKILL.md')&&!p.endsWith('/api.md')).map(read).join('\n');
 assert.doesNotMatch(support,/NULL-|100000|Fee Name:|Dates: start =|sole create-only|Necessary in-scope event-exclusive object removal\/replacement is authorized/);
 const api=text('CVENT-API.md')+' '+text('CVENT-API-COVERAGE.md');
 assert.doesNotMatch(api,/create-only contact-type|source skill.*registration-types-first|Never infer missing amounts/);
 assert.match(api,/Registration-type Advanced Filters are not exposed/);
});
test('browser guide omits unsupported generic fetch, popup, download and clipboard recipes',()=>{
 const controls=read(base+'references/browser/controls.md');
 assert.doesNotMatch(controls,/await (?:page\.fetch|task\.newPage|page\.keyboard\.paste|download\.saveAs)\(/);
 for(const term of ['taskSpace(1246080070)','saveOnce/observeSave','same-renderer','No raw POST/PUT/PATCH','task.finish({ keep: [page.label] })'])assert.ok(controls.includes(term),term);
});
test('report contract keeps machine fields, unknown effects and partial results honest',()=>{
 const contract=text(base+'references/runner-contract.md');
 for(const term of ['client-rules-configuration-only-v1','registrationTesting','not_performed','originalExpected','policyDecisions','concurrentEditorSaves','verified_existing','verified_changed','partially_verified','unresolved-changes.json','currentStage','currentAction','updatedAt'])assert.ok(contract.includes(term),term);
 assert.match(contract,/Before editing a verified item, revoke stale verification, mark it unverified/);
 assert.match(contract,/Neither Saved grouping nor existing matches hide unfinished requirements/);
 assert.match(contract,/Draft verified, Not done empty and no uncertainty/);
 assert.match(contract,/never|Never/);
});
test('business and technical steps do not expand the native launch or discount authoring scope',()=>{
 const launch=read('app/pi-rpc.mjs'), cli=read('app/cvent-api-cli.mjs');
 assert.match(launch,/"--no-context-files"/);
 assert.match(launch,/"--no-skills", \.\.\.RUN_SKILLS.flatMap/);
 assert.match(cli,/const rrWrites = new Set\(\["configureDiscount", "configureVolumeDiscount"\]\)/);
 assert.doesNotMatch(launch,/pi-goal|goal_complete|\/goal/);
});
