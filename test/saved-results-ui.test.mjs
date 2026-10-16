import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resultLanguage} from '../public/result-language.js';
import {requirementProgress} from '../public/requirement-progress.js';
import {runOutcome} from '../public/run-outcome.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const partial=(extra={})=>({id:'example',label:'Question Example',source:'Questions!A2',status:'partially_verified',verification:'Saved values read back.',reason:'Answer code remains unset.',presentation:{status:'partially_verified',action:'saved',summary:'Question saved; answer code remains unset.',nextAction:'Set the answer code.'},...extra});
const view=item=>resultLanguage({requirements:[item]});
test('saved partial belongs in Saved with no extra Needs attention row',()=>{
 const r=view(partial());assert.equal(r.changed.length,1);assert.equal(r.pending.length,0);assert.equal(r.attentionCount,0);
});
test('existing partial belongs in Saved without claiming this run wrote it',()=>{
 const item=partial();item.presentation.action='unchanged';const r=view(item);assert.equal(r.changed.length,1);assert.equal(r.changed[0].actionNote,'Existing settings checked; no changes made.');
});
test('unknown and not_changed partials remain pending regardless of prose',()=>{
 for(const action of ['unknown','not_changed']){const item=partial();item.presentation.action=action;const r=view(item);assert.equal(r.changed.length,0);assert.equal(r.pending.length,1);}
});
test('missing evidence or stale presentation cannot turn partial status into a saved claim',()=>{
 for(const variant of ['evidence','status','presentation','summary']){
  const item=partial();if(variant==='evidence')item.verification='';if(variant==='status')item.presentation.status='verified_changed';if(variant==='presentation')delete item.presentation;if(variant==='summary')item.presentation.summary='';
  const r=view(item);assert.equal(r.changed.length,0);assert.equal(r.pending.length,1);
 }
});
test('blocked and unverified records stay pending even with saved-action metadata',()=>{
 for(const status of ['blocked','unverified']){const item=partial({status});item.presentation.status=status;assert.equal(view(item).pending.length,1);assert.equal(view(item).changed.length,0);}
});
test('legacy progress notes are not interpreted as confirmed saved configuration',()=>{
 const r=resultLanguage({completed:['Saved something'],pending:['Check something']});assert.equal(r.changed.length,0);assert.equal(r.legacy.length,1);assert.equal(r.pending.length,1);
});
test('original status, evidence, unfinished field and next step survive grouping',()=>{
 const item=partial(),before=JSON.stringify(item),r=view(item).changed[0];assert.equal(JSON.stringify(item),before);
 assert.equal(r.status,'partially_verified');assert.equal(r.remainingIssue,item.reason);assert.equal(r.remainingIssueLabel,'Details');assert.equal(r.nextAction,item.presentation.nextAction);assert.ok(r.evidence.some(x=>x.label==='Verification'&&x.value===item.verification));
});
test('fully verified and excluded records retain their original sections',()=>{
 for(const [status,action,section] of [['verified_changed','saved','changed'],['verified_existing','unchanged','existing'],['excluded','not_changed','excluded']]){
  const item=partial({status});item.presentation.status=status;item.presentation.action=action;assert.equal(view(item)[section].length,1);
 }
});
test('synthetic 115-item fixture keeps every row and correct saved/attention counts',()=>{
 const records=[];const add=(count,status,action)=>{for(let i=0;i<count;i++){const item=partial({id:String(records.length),status});item.presentation.status=status;item.presentation.action=action;records.push(item);}};
 add(1,'verified_changed','saved');add(3,'partially_verified','saved');add(38,'partially_verified','unchanged');add(13,'verified_existing','unchanged');add(56,'blocked','not_changed');add(4,'excluded','not_changed');
 const state={requirements:records},before=JSON.stringify(state),r=resultLanguage(state);assert.deepEqual([r.changed.length,r.existing.length,r.pending.length,r.excluded.length],[42,13,56,4]);
 assert.equal(new Set([...r.changed,...r.existing,...r.pending,...r.excluded].map(x=>x.key)).size,115);assert.equal(JSON.stringify(state),before);
});
test('display grouping does not promote raw pending records or overall run completion',()=>{
 const state={requirements:[partial()]},raw=requirementProgress(state);assert.equal(raw.pending.length,1);assert.equal(raw.completed.length,0);
 assert.equal(runOutcome({status:'INCOMPLETE'},raw).complete,false);assert.equal(runOutcome({status:'DONE'},raw).complete,false);
});
test('remaining details label and explanatory note are wired into the renderer',()=>{
 assert.ok(read('public/app.js').includes("${row.remainingIssueLabel || 'Why'}: ${row.remainingIssue}"));
 assert.match(read('public/index.html'),/Saved includes checked existing settings and saved changes/);
 assert.match(read('public/index.html'),/Registration testing is separate/);
});
test('new unknown action removes the prior Saved presentation',()=>{
 const item=partial();assert.equal(view(item).changed.length,1);item.presentation.action='unknown';assert.equal(view(item).changed.length,0);assert.equal(view(item).pending.length,1);
});
test('literal labels are preserved as text and saved rows use textContent rendering',()=>{
 const r=view(partial({label:'Question <img onerror=alert(1)>'}));assert.match(r.changed[0].subject,/<img/);
 assert.match(read('public/app.js'),/Object.assign\(document.createElement\(tag\), \{ textContent: text \}\)/);
});
test('long technical summary preserves action and evidence without losing qualifications',()=>{
 const item=partial();item.presentation.summary='Detailed saved information '.repeat(30);const r=view(item).changed[0];assert.match(r.summary,/has saved settings/);assert.ok(r.evidence.some(x=>x.label==='Original summary'&&x.value===item.presentation.summary));
});
