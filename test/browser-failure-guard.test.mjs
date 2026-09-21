import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserFailureGuard, classifyBrowserFailure, BROWSER_FAILURE_WINDOW_MS } from '../app/browser-failure-guard.mjs';
const error = (id, text) => ({ type:'tool_execution_end', toolName:'bash', toolCallId:id, isError:true, result:{content:[{type:'text',text}]} });
test('recognizes bounded browser failure categories without returning native payloads',()=>{
  const cases=[['ElementResolutionError: Locator matched 3 elements','ELEMENT_RESOLUTION'],['ElementResolutionError: page.selectOption timed out: Selector #missing matched 0 elements','ELEMENT_RESOLUTION'],['Error: snapshot: CDP request timed out: Accessibility.enable','BROWSER_UNRESPONSIVE'],['Error: page.reload timed out after 15000ms waiting for load','BROWSER_UNRESPONSIVE'],['CdpRequestTimeoutError: CDP request timed out: Target.getTargets','BROWSER_UNRESPONSIVE'],['PageEvaluationTimeoutError: Execution could not be confirmed stopped; reload or close the Page before continuing.','EXECUTION_UNCERTAIN']];
  for(const [text,category]of cases)assert.equal(classifyBrowserFailure(error('id',text)),category);
  const result=new BrowserFailureGuard().observe(error('id','CdpRequestTimeoutError: PRIVATE_PAYLOAD'),0);
  assert(!JSON.stringify(result).includes('PRIVATE_PAYLOAD'));
});
test('successes between browser failures do not reset the rolling circuit breaker',()=>{
  const guard=new BrowserFailureGuard();
  assert.equal(guard.observe(error('1','CdpRequestTimeoutError: timeout'),0).tripped,false);
  assert.equal(guard.observe({...error('success','snapshot'),isError:false},1000),null);
  assert.equal(guard.observe(error('2','Error: page.goto timed out'),2000).tripped,false);
  assert.equal(guard.observe(error('3','Error: snapshot: CDP request timed out: Accessibility.enable'),3000).tripped,true);
});
test('old errors expire, duplicate events do not count twice, and guards are per run',()=>{
  const guard=new BrowserFailureGuard();const event=error('1','CdpRequestTimeoutError: timeout');
  guard.observe(event,0);assert.equal(guard.observe(event,1),null);
  assert.equal(guard.observe(error('2','CdpRequestTimeoutError: timeout'),BROWSER_FAILURE_WINDOW_MS+1).failuresInWindow,1);
  assert.equal(new BrowserFailureGuard().observe(event,2).failuresInWindow,1);
});
test('selector failures are recoverable and do not count toward browser-unresponsiveness Stop',()=>{
  const guard=new BrowserFailureGuard();
  guard.observe(error('timeout','CdpRequestTimeoutError: timeout'),0);
  for(let i=0;i<20;i++)assert.equal(guard.observe(error('selector'+i,'ElementResolutionError: missing'),i+1),null);
  assert.equal(guard.observe(error('stale','StaleElementReferenceError: old ref'),22),null);
  const next=guard.observe(error('timeout2','CdpRequestTimeoutError: timeout'),23);
  assert.equal(next.failuresInWindow,2);assert.equal(next.tripped,false);
});
test('unconfirmed page execution trips immediately and requires uncertainty retention',()=>{
  const result=new BrowserFailureGuard().observe(error('late','PageEvaluationTimeoutError: mayHaveLateEffects: true'),0);
  assert.equal(result.tripped,true);assert.equal(result.executionUncertain,true);assert.match(result.stopReason,/late effects/);
  assert.equal(new BrowserFailureGuard().observe(error('safe','PageEvaluationTimeoutError: executionStopped: true'),0).executionUncertain,false);
});
test('unknown save outcome stops immediately; a pending save does not trip the circuit',()=>{
  const result=new BrowserFailureGuard().observe(error('save','BrowserSaveUncertainError: unknown'),0);
  assert.equal(result.tripped,true);assert.equal(result.executionUncertain,true);
  assert.equal(new BrowserFailureGuard().observe(error('pending','SavePendingError: Saving is visible'),0),null);
});
test('normal reads, successful tools and unrelated errors never trigger a write quota or failure stop',()=>{
  const guard=new BrowserFailureGuard();
  for(let i=0;i<100;i++){
    assert.equal(guard.observe({...error(String(i),'ElementResolutionError: quoted docs'),isError:false},i),null);
    assert.equal(guard.observe(error('python'+i,'/bin/bash: python: command not found'),i),null);
    assert.equal(guard.observe({...error('read'+i,'ElementResolutionError: docs'),toolName:'read'},i),null);
  }
  assert.equal(classifyBrowserFailure(null),null);assert.equal(classifyBrowserFailure(error('bad','Error: generic failure')),null);
});
