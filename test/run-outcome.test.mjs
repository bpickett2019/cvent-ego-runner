import test from 'node:test';
import assert from 'node:assert/strict';
import { runOutcome } from '../public/run-outcome.js';
import { requirementProgress } from '../public/requirement-progress.js';

test('finished processing with missing RR values says Done with visible unfinished work, never verified complete', () => {
  const job = Object.freeze({ status:'INCOMPLETE' });
  const state = { requirements:[
    { id:'image', label:'Banner', status:'blocked', source:'Website!A1', reason:'Missing supplied banner image (Website!A1)' },
    { id:'price', label:'Admission price', status:'unverified', reason:'Missing price for admission A' },
    { id:'contact', label:'Email', status:'verified_changed', verification:'Saved readback matches' },
  ] };
  const view = runOutcome(job, requirementProgress(state));
  assert.equal(view.label,'Done — unfinished items');assert.equal(view.complete,false);assert.equal(view.icon,'!');
  assert.equal(view.notes.length,2);assert.match(view.notes[0],/Missing supplied banner image/);assert.match(view.notes[1],/Missing price/);
  assert.match(view.summary,/Some work is still unfinished/);
  assert.equal(job.status,'INCOMPLETE');assert.equal(view.remaining,2);
});
test('verified DONE is distinct from partial completion and never changes controller data', () => {
  const job=Object.freeze({status:'DONE'}),view=runOutcome(job,{pending:[]});
  assert.equal(view.label,'Done — configuration saved');assert.equal(view.complete,true);assert.deepEqual(view.notes,[]);
  assert.equal(view.icon,'✓');assert.match(view.summary,/retained report for verification and registration-testing details/);
  const conflict=runOutcome(job,{pending:['Unverified price']});
  assert.equal(conflict.label,'Done — unfinished items');assert.equal(conflict.complete,false);assert.match(conflict.summary,/some checks are still open/);assert.equal(job.status,'DONE');
});
for(const status of ['STOPPED','STOPPED_REQUIRES_REVIEW'])test(`${status} never becomes Done`,()=>{
  const view=runOutcome({status},{pending:['Save outcome unverified']});assert.equal(view.label,'Stopped');assert.equal(view.icon,'■');assert.equal(view.complete,false);
  assert.match(view.summary,/Stopping does not undo changes/);assert.equal(view.heading,'Unfinished / not verified before Stop');
});
for(const status of ['FINISHED','REVIEW_REQUIRED'])test(`${status} remains historically unverified`,()=>{
  const view=runOutcome({status});assert.equal(view.label,'Ended — completion unverified');assert.equal(view.complete,false);assert.equal(view.remaining,'unconfirmed');
});
test('missing progress never implies that zero work remains',()=>{
  const view=runOutcome({status:'INCOMPLETE'});assert.equal(view.remaining,'unconfirmed');assert.match(view.notes[0],/No requirement-level results were recorded/);
  assert.match(view.notes[0],/Completion and remaining work are unconfirmed; review the retained run evidence/);assert.equal(view.complete,false);
});
test('model errors are not described as completed processing',()=>{
  const view=runOutcome({status:'INCOMPLETE',modelFailure:{category:'PROVIDER'}});assert.equal(view.label,'Ended — model error');assert.equal(view.complete,false);
});
test('active, paused, uploaded, absent and unknown states never get a terminal presentation',()=>{
  for(const status of ['RUNNING','PREPARING','STARTING','STOPPING','UPLOADED','CLEARED','OTHER'])assert.equal(runOutcome({status}),null);
  assert.equal(runOutcome(null),null);
});
