import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runOutcome} from '../public/run-outcome.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const policy='client-rules-configuration-only-v1';
const read=p=>readFileSync(resolve(root,p),'utf8');
const manifest=JSON.parse(read('deploy/client-policy-manifest.json'));
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(p,e.name)):[resolve(p,e.name)]);
test('exact approved skill and every payload hash/deletion match the manifest',()=>{
 assert.equal(createHash('sha256').update(read('.pi/skills/cvent-event-build/SKILL.md')).digest('hex'),'34431110c1f9941a18831c266f814a208c55b11969e1c391572760a7c81a5a44');
 for(const row of manifest.changes){
  const file=resolve(root,row.path);
  if(row.operation==='delete')assert.ok(!existsSync(file),row.path);
  else assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),row.afterSha256,row.path);
 }
});
test('retained skill Markdown links resolve without deleted business references',()=>{
 for(const file of walk(resolve(root,'.pi/skills/cvent-event-build'))){
  if(!file.endsWith('.md'))continue;
  for(const [,target] of readFileSync(file,'utf8').matchAll(/\]\(([^)]+)\)/g)){
   if(/^(https?:|#|mailto:)/.test(target))continue;
   assert.ok(existsSync(resolve(dirname(file),target.split('#')[0])),file+' -> '+target);
  }
 }
});
test('native task retains diagnostic and runtime protections, while delegating policy',()=>{
 const text=read('app/native-task.md');
 for(const phrase of ['diagnostic-guard.js --status','never dump environment variables','authoritative client business','never replay unresolved writes','Do not run\nregistration previews'])assert.ok(text.includes(phrase),phrase);
});
test('DONE machine status stays unchanged; new policy has exact qualified summary',()=>{
 const job={status:'DONE'}, result=runOutcome(job,{pending:[]},policy);
 assert.equal(job.status,'DONE');assert.equal(result.complete,true);
 assert.equal(result.label,'Done — configuration saved; registration testing not performed');
 assert.equal(result.summary,'Configuration saved under the approved build rules. Registration testing was not performed.');
});
test('historical DONE does not assert testing was omitted',()=>{
 const result=runOutcome({status:'DONE'},{pending:[]});
 assert.equal(result.label,'Done — configuration saved');assert.match(result.summary,/retained report/);
 assert.doesNotMatch(result.summary,/testing was not performed/i);
});
for(const status of ['INCOMPLETE','STOPPED','STOPPED_REQUIRES_REVIEW','FINISHED','REVIEW_REQUIRED']){
 test(status+' remains non-complete with or without policy metadata',()=>{
  const job={status};const progress={pending:['Unfinished item']};
  assert.deepEqual(runOutcome(job,progress,policy),runOutcome(job,progress));
  assert.equal(runOutcome(job,progress,policy).complete,false);
 });
}
test('unfinished items and model failures cannot receive success wording',()=>{
 for(const [job,progress] of [[{status:'DONE'},{pending:['Missing field']}],[{status:'DONE',modelFailure:{message:'failed'}},{pending:[]}]]){
  const result=runOutcome(job,progress,policy);assert.equal(result.complete,false);assert.doesNotMatch(result.summary,/Configuration saved under/);
 }
});
test('metadata flows to presentation without changing controls or status enum',()=>{
 assert.match(read('public/app.js'),/runOutcome\(job, checkpoints, progress\?\.completionPolicy\)/);
 const contract=read('.pi/skills/cvent-event-build/references/runner-contract.md');
 for(const word of [policy,'originalExpected','policyDecisions','concurrentEditorSaves','unresolved-changes.json'])assert.ok(contract.includes(word),word);
});
