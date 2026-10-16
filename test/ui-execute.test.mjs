import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { workspaceBase, workspacePath, scopedStorage } from '../public/workspace-routing.js';
import { requirementProgress } from '../public/requirement-progress.js';
import { executionReadiness } from '../public/execution-readiness.js';
import { runOutcome } from '../public/run-outcome.js';
import { resultLanguage } from '../public/result-language.js';
import { bindRrFileInput, MAX_RR_BYTES } from '../public/rr-file-input.js';
import { createProgressEvidence, canCheckFinalReport, finalReportAvailability, evidenceNotice } from '../public/progress-evidence.js';
import { createFixtureDom } from './ui-dom-fixture.mjs';
// Inject real exports into the VM fixture. This is not rendered-browser acceptance.
const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8'))
  .replace("import { workspaceBase, workspacePath, scopedStorage } from './workspace-routing.js';\n", '')
  .replace("import { requirementProgress } from './requirement-progress.js';\n", '')
  .replace("import { executionReadiness } from './execution-readiness.js';\n", '')
  .replace("import { runOutcome } from './run-outcome.js';\n", '')
  .replace("import { resultLanguage } from './result-language.js';\n", '')
  .replace("import { bindRrFileInput } from './rr-file-input.js';\n", '')
  .replace("import { createProgressEvidence, canCheckFinalReport, finalReportAvailability, evidenceNotice } from './progress-evidence.js';\n", '');
assert.doesNotMatch(source, /^import /m, 'register each actual frontend module in the fixture');
const runtime = { ownership: 'AGENT', loginFirst: true };
const turn = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
function fixture(fetcher, { confirmResult = true, history = [], reportStatus = 404, storage = new Map([['rrJobId', 'job'], ['rrTargetName', 'Selected Event']]) } = {}) {
  const {get,document}=createFixtureDom();
  const confirmations = []; let fileOperation=null;
  const trackedFileBinding=options=>bindRrFileInput({...options,onFile:file=>{
    fileOperation=options.onFile(file);return fileOperation;
  }});
  const context = vm.createContext({ document, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, confirm: text => { confirmations.push(text); return confirmResult; }, setInterval() {},
    setTimeout(){return {};},clearTimeout(){},FormData: class { append() {} }, fetch: async (path, options) => {
      // Report HEAD is a read, not a mutation to count in the existing test scenarios.
      if(options?.method==='HEAD')return {ok:reportStatus===200,status:reportStatus,redirected:false};
      const data = await (path === '/api/jobs' && !options?.method ? history : fetcher(path, options));
      return { ok: true, status:200, json: async () => data };
    } });
  Object.assign(context, { workspaceBase, workspacePath, scopedStorage, requirementProgress, executionReadiness, runOutcome,
    resultLanguage,bindRrFileInput:trackedFileBinding,createProgressEvidence,canCheckFinalReport,finalReportAvailability,evidenceNotice,
    AbortSignal, location: { pathname: '/', origin: 'http://127.0.0.1:8788' }, window: { sessionStorage: context.sessionStorage } });
  const fetcherWithFixture = context.fetch;
  context.fetch = (path, options) => path === '/local-workspaces.json' ? Promise.resolve({ status: 404 }) : fetcherWithFixture(path, options);
  vm.runInContext(source, context);
  // Compatibility convenience for these tests: dispatch the real registered change
  // listener and await its actual newRR operation. Legacy filename-only fixture
  // objects represent nonempty synthetic files; explicit sizes still test validation.
  get('rr').onchange=async()=>{
    get('rr').files=get('rr').files.map(f=>f.size===undefined?{...f,size:8}:f);
    fileOperation=null;get('rr').dispatchEvent({type:'change'});
    if(fileOperation)await fileOperation;await turn();
  };
  return { get, context, storage, confirmations };
}
const response = (path, record) => path === '/api/runtime' ? runtime : path.endsWith('/results/state.json') ? {requirements:[]} : record;

test('saved partial grouping survives a failed refresh without promoting raw completion',async()=>{
  const row=Object.freeze({id:'partial',label:'Synthetic question',source:'Questions!A2',status:'partially_verified',verification:'Saved text read back',reason:'Choice code remains unchecked',presentation:{status:'partially_verified',action:'saved',summary:'Question text saved',nextAction:'Check the supplied choice code'}});
  const progress={requirements:[row]},record=Object.freeze({id:'job',status:'INCOMPLETE'});let fail=false;
  const f=fixture(path=>{if(path.endsWith('/results/state.json')){if(fail)throw Error('Read unavailable');return progress;}return response(path,record);});
  await turn();assert.equal(f.get('changedPlain').children.length,1);assert.equal(f.get('pendingPlain').children.length,0);
  assert.match(f.get('changedPlain').textContent,/Choice code remains unchecked/);
  assert.equal(f.get('status').textContent,'Done — unfinished items');
  assert.equal(requirementProgress(progress).pending.length,1);assert.equal(row.status,'partially_verified');
  fail=true;await vm.runInContext('refresh()',f.context);await turn();
  assert.equal(f.get('changedPlain').children.length,1);
  assert.match(f.get('progressEvidenceNotice').textContent,/last successful snapshot, not current verification/);
  assert.notEqual(f.get('status').textContent,'Done — configuration saved');assert.equal(record.status,'INCOMPLETE');
});
test('absent final report stays hidden rather than turning retained progress into a report',async()=>{
  const f=fixture(path=>response(path,{id:'job',status:'STOPPED'}));await turn();
  assert.equal(f.get('results').hidden,true);assert.equal(f.get('results').hasAttribute('href'),false);
  assert.match(f.get('progressEvidenceNotice').textContent,/No final report is available/);
});
test('real file-input validation rejects empty and oversized fixture files before reset or upload',async()=>{
  const posts=[],f=fixture((path,options)=>{if(options?.method)posts.push(path);return response(path,{id:'job',status:'STOPPED'});});await turn();
  for(const size of [0,MAX_RR_BYTES+1]){
    f.get('rr').files=[{name:'synthetic.xlsx',size}];await f.get('rr').onchange();
    assert.match(f.get('message').textContent,/empty or unavailable|exceeds the 30 MB/);
    assert.deepEqual(posts,[]);assert.equal(f.storage.get('rrJobId'),'job');
  }
});
const readiness = (patch = {}) => ({ version: 1, scope: 'shared', checkedAt: new Date().toISOString(), capacity: 'AVAILABLE', holder: null,
  eventSafety: 'SCOPED_HOLDS', holdCount: 1, owners: [{ workspace: 3, jobId: '33333333-3333-4333-8333-333333333333', scope: 'event' }], ...patch });
test('successful Clear removes only the form and keeps historical event holds visible', async () => {
  const posts = [], f = fixture((path, options) => {
    if (options?.method) { posts.push(path); return { cleared: true, executionHoldsCleared: false, sharedSlotReleased: false }; }
    if (path === '/api/execution-status') return readiness();
    return response(path, { id: 'job', status: 'STOPPED' });
  });
  await turn(); await f.get('newRR').onclick(); await turn();
  assert.deepEqual(posts, ['/api/new-rr']); assert.match(f.get('message').textContent, /Workspace cleared/);
  assert.match(f.get('capacityStatus').textContent, /CAPACITY AVAILABLE/); assert.match(f.get('eventSafetyStatus').textContent, /require reconciliation/);
  assert.match(f.get('safetyOwners').children[0].textContent, /Workspace 3/); assert.equal(f.storage.has('rrJobId'), false);
});
test('failed Clear retains selection and reports uncertainty independently of available capacity', async () => {
  const f = fixture((path, options) => {
    if (options?.method) throw Error('New RR blocked for selected run: reconciliation required');
    return path === '/api/execution-status' ? readiness() : response(path, { id: 'job', status: 'STOPPED' });
  });
  await turn(); await f.get('newRR').onclick(); await turn();
  assert.equal(f.storage.get('rrJobId'), 'job'); assert.match(f.get('message').textContent, /Clear was not confirmed/);
  assert.match(f.get('eventSafetyStatus').textContent, /reconciliation/); assert.equal(f.get('newRR').disabled, false);
});
test('readiness outage never overwrites Clear success or advertises ready', async () => {
  const f = fixture((path, options) => {
    if (options?.method) return { cleared: true };
    if (path === '/api/execution-status') throw Error('Unavailable');
    return response(path, { id: 'job', status: 'STOPPED' });
  });
  await turn(); await f.get('newRR').onclick(); await turn();
  assert.match(f.get('message').textContent, /Workspace cleared/); assert.equal(f.get('capacityStatus').textContent, 'CAPACITY UNKNOWN');
  assert.equal(f.get('upload').disabled, false);
});
test('a hung runtime read cannot keep stale available status when readiness is unavailable', async () => {
  const delayed = deferred(); let hung = false;
  const f = fixture(path => {
    if (path === '/api/execution-status') { if (hung) throw Error('Status unavailable'); return readiness(); }
    if (path === '/api/runtime' && hung) return delayed.promise;
    return response(path, { id: 'job', status: 'STOPPED' });
  });
  await turn(); assert.match(f.get('capacityStatus').textContent, /CAPACITY AVAILABLE/);
  hung = true; vm.runInContext('readinessReadAt=0', f.context);
  const pending = vm.runInContext('refresh()', f.context); await turn();
  assert.equal(f.get('capacityStatus').textContent, 'CAPACITY UNKNOWN');
  delayed.resolve(runtime); await pending;
});
test('a late pre-Clear readiness response cannot hide newer uncertainty', async () => {
  const delayed = deferred(); let first = true;
  const f = fixture((path, options) => {
    if (options?.method) return { cleared: true };
    if (path === '/api/execution-status') { if (first) { first = false; return delayed.promise; } return readiness(); }
    return response(path, { id: 'job', status: 'STOPPED' });
  });
  await turn(); await f.get('newRR').onclick(); await turn();
  delayed.resolve(readiness({ eventSafety: 'CLEAR', holdCount: 0, owners: [] })); await turn();
  assert.match(f.get('eventSafetyStatus').textContent, /require reconciliation/); assert.match(f.get('message').textContent, /Settled historical holds are retired for fresh runs; original evidence/);
});

for(const [status,note] of [['RELEASED',/No execution reservation remains/],['EMPTY',/No execution reservation remains/],['OTHER_WORKSPACE',/Another workspace owns execution capacity and was not changed/],['REVIEW_REQUIRED',/Capacity release still needs review/]])test(`workspace Clear sends explicit replacement and truthfully reports ${status}`,async()=>{
  const posts=[];let current=null;
  const f=fixture((path,options)=>{
    if(options?.method){const body=JSON.parse(options.body);posts.push({path,body});current={id:'11111111-1111-4111-8111-111111111111',jobId:null,workbookId:null};return {cleared:true,rrContext:current,sharedSlotReleased:status==='RELEASED',sharedSlotStatus:status,slotError:{error:'Cleanup proof unavailable'}};}
    if(path==='/api/runtime')return {...runtime,workspaceResetSupported:true,rrContext:current};
    if(path==='/api/execution-status')return readiness();
    return response(path,{id:'job',status:'STOPPED'});
  });
  await turn();await f.get('newRR').onclick();await turn();
  assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/new-rr');assert.equal(posts[0].body.replaceWorkspace,true);
  assert.equal(posts[0].body.contextId,null);assert.match(f.get('message').textContent,note);assert.equal(f.storage.get('rrContextId'),'11111111-1111-4111-8111-111111111111');
  assert.equal(f.storage.has('rrJobId'),false);
});
test('capable backend allows a pre-AI target correction and locks the field after execution begins', async () => {
  const posts=[],record={id:'job',requestedEventName:'Original Event',status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup'};
  let ownership='USER';
  const f=fixture((path,options)=>{
    if(options?.method){const body=JSON.parse(options.body);posts.push({path,body});record.requestedEventName=body.eventName;record.phase='EXECUTING';record.waitingFor=null;record.aiStartedAt=new Date().toISOString();ownership='AGENT';return {accepted:true,aiStarted:true};}
    return path==='/api/runtime'?{ownership,loginFirst:true,setupTargetEditable:true}:response(path,record);
  });
  await turn();assert.equal(f.get('eventName').disabled,false);
  f.get('eventName').value='Any Existing Event';f.get('eventName').oninput();
  await f.get('take').onclick();
  assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/jobs/job/answer');
  assert.equal(posts[0].body.eventName,'Any Existing Event');assert.equal(posts[0].body.returnControl,true);
  assert.equal(f.get('eventName').disabled,true);assert.equal(f.storage.get('rrTargetName'),'Any Existing Event');
  assert.match(f.get('eventTitle').textContent,/Any Existing Event/);
});

test('old backend keeps the waiting target locked and receives no unsupported field', async () => {
  let body;
  const f=fixture((path,options)=>{if(options?.method){body=JSON.parse(options.body);return {accepted:true,aiStarted:false};}return path==='/api/runtime'?{ownership:'USER',loginFirst:true}:response(path,{id:'job',requestedEventName:'Original Event',status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup'});});
  await turn();assert.equal(f.get('eventName').disabled,true);await f.get('take').onclick();
  assert.equal(Object.hasOwn(body,'eventName'),false);
});

test('failed lookup remains editable and exposes the actual handoff blocker instead of claiming continuation', async () => {
  const record={id:'job',requestedEventName:'Missing Event',status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup'};
  const f=fixture((path,options)=>{if(options?.method){record.lastAssistantText='No exact event-name match was found through the Cvent API';return {accepted:true,aiStarted:false};}return path==='/api/runtime'?{ownership:'USER',loginFirst:true,setupTargetEditable:true}:response(path,record);});
  await turn();await f.get('take').onclick();
  assert.match(f.get('message').textContent,/No exact event-name match/);assert.equal(f.get('message').className,'activity-error');
  assert.equal(f.get('eventName').disabled,false);assert.equal(f.get('take').disabled,false);
});

test('empty editable target cannot submit a Return request', async () => {
  const posts=[];
  const f=fixture((path,options)=>{if(options?.method)posts.push(path);return path==='/api/runtime'?{ownership:'USER',loginFirst:true,setupTargetEditable:true}:response(path,{id:'job',status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup'});});
  await turn();f.get('eventName').value='   ';await f.get('take').onclick();
  assert.deepEqual(posts,[]);assert.match(f.get('message').textContent,/exact existing Cvent event name/);
});

test('runtime advertises target editing only with the new backend implementation', async () => {
  const server=await readFile(new URL('../app/server.mjs',import.meta.url),'utf8');
  assert.match(server,/setupTargetEditable: true/);
});

test('requirement statuses drive live bullets and polling counts without sending agent actions', async () => {
  const posts = [], record = { id: 'job', status: 'RUNNING', phase: 'EXECUTING' };
  let progress = { completed: ['stale checkpoint'], requirements: [
    { id: 'price', label: 'Admission price', status: 'verified_changed', verification: 'Read back $25' },
    { id: 'venue', status: 'verified_existing', evidence: 'Matches RR' },
    { id: 'theme', status: 'blocked', reason: 'Mapping missing' },
    { id: 'questions', status: 'unverified' },
    { id: 'CRM', status: 'excluded', reason: 'Out of scope' },
  ] };
  const f = fixture((path, options) => {
    if (options?.method) posts.push(path);
    return path.endsWith('/results/state.json') ? progress : response(path, record);
  });
  await turn();
  assert.equal(f.get('completed').children.length, 2);
  assert.match(f.get('completed').children[0].textContent, /Changed · price — Admission price — Read back \$25/);
  assert.equal(f.get('pending').children.length, 2);
  assert.match(f.get('pending').children[0].textContent, /Blocked.*Mapping missing/);
  assert.equal(f.get('excluded').children.length, 1); assert.equal(f.get('excludedProgress').hidden, false);
  assert.equal(f.get('progressLists').hidden, false);
  assert.match(f.get('completionCount').textContent, /1 changed · 1 already correct in CVENT · 2 left · 1 excluded/);
  assert.equal(f.get('status').textContent, 'Running', 'progress does not promote job completion');
  progress = { requirements: [{ id: 'price', status: 'unverified' }] };
  await vm.runInContext('refresh()', f.context);
  assert.equal(f.get('completed').children[0].textContent, 'None');
  assert.match(f.get('pending').children[0].textContent, /Unverified · price/);
  assert.match(f.get('completionCount').textContent, /0 changed · 0 already correct in CVENT · 1 left/);
  assert.equal(f.get('excludedProgress').hidden, true); assert.deepEqual(posts, []);
});

test('initialized RR progress exposes reported stage and read/edit/verify activity without claiming a save', async () => {
  const posts = [], record = { id: 'job', status: 'RUNNING', phase: 'EXECUTING', executionActivity: { at: 'now', message: 'bash finished' } };
  let progress = { requirements: [{ id: 'ATT-path', status: 'unverified' }], currentStage: 'Stage 2 — Paths', currentAction: 'READ ATT-path: inspect current assignment' };
  const f = fixture((path, options) => {
    if (options?.method) posts.push(path);
    return path.endsWith('/results/state.json') ? progress : response(path, record);
  });
  await turn();
  assert.equal(f.get('stage').textContent, 'Stage 2 — Paths');
  assert.equal(f.get('action').textContent, 'Agent-reported: READ ATT-path: inspect current assignment');
  for (const action of ['EDIT', 'SAVE_PENDING', 'VERIFY']) {
    progress = { ...progress, currentAction: `${action} ATT-path: correct and verify` };
    await vm.runInContext('refresh()', f.context);
    assert.match(f.get('action').textContent, new RegExp(`Agent-reported: ${action}`));
    assert.match(f.get('completionCount').textContent, /0 changed · 0 already correct in CVENT · 1 left/);
    assert.equal(f.get('status').textContent, 'Running');
  }
  assert.deepEqual(posts, []);
});

test('missing or malformed requirement activity falls back to native metadata safely', async () => {
  const record = { id: 'job', status: 'RUNNING', phase: 'EXECUTING', executionActivity: { at: 'now', message: 'bash started' } };
  const f = fixture(path => path.endsWith('/results/state.json')
    ? { requirements: [], currentStage: {}, currentAction: 9 }
    : response(path, record));
  await turn();
  assert.equal(f.get('stage').textContent, 'Executing RR');
  assert.equal(f.get('action').textContent, 'now · bash started');
});

test('dashboard describes in-place RR corrections rather than duplicate objects for differences', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /correct existing differences in place, and create confirmed missing requirements/);
  assert.match(html, /Follow the RR's path assignments and verify saved connections/);
  assert.doesNotMatch(html, /create separate RR-compliant objects for differences/);
});

test('exclusions alone stay visible and never count as completion', async () => {
  const f = fixture(path => path.endsWith('/results/state.json')
    ? { requirements: [{ id: 'CRM', status: 'excluded', reason: 'Out of scope' }] }
    : response(path, { id: 'job', status: 'STOPPED' }));
  await turn();
  assert.equal(f.get('progressLists').hidden, false); assert.equal(f.get('excludedProgress').hidden, false);
  assert.equal(f.get('completionTitle').textContent, 'Stopped');
  assert.equal(f.get('completionMark').textContent, '■');
  assert.match(f.get('completionCount').textContent, /work left: unknown · 1 excluded/);
});

test('requirement content renders as literal text, not workbook-supplied markup', async () => {
  const markup = '<img src=x onerror=alert(1)>';
  const f = fixture(path => path.endsWith('/results/state.json')
    ? { requirements: [{ id: 'question', label: markup, status: 'blocked', reason: '<script>bad()</script>' }] }
    : response(path, { id: 'job', status: 'STOPPED' }));
  await turn();
  const item = f.get('pending').children[0];
  assert.match(item.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(item.innerHTML, undefined);
});

test('an old startup rejection is displayed as retired, never as a current operator prerequisite', async () => {
  const reason = 'Operator decision required before a new RR: inspect data/jobs/prior/unresolved-changes.json. Authorize separate read-only saved-state verification; repair or acceptance needs explicit approval. No AI started.';
  const f = fixture(path => response(path, {id:'job',status:'STOPPED',phase:'SETTLED',stopReason:reason,piCostUSD:0,totalEventCostUSD:0}));
  await turn(); assert.equal(f.get('stage').textContent, 'Stopped');
  assert.match(f.get('action').textContent, /retired startup rule.*Upload a new RR/);
  assert.doesNotMatch(f.get('action').textContent, /Operator decision|unresolved-changes|Checking previous interrupted change/);
  assert.match(f.get('cost').textContent, /\$0\.00 this run/);
});

test('cost display retains per-run tracking and indicates no spending stop', async () => {
  const record = { id: 'job', status: 'INCOMPLETE', piCostUSD: 10.5, totalEventCostUSD: 49.8 };
  const f = fixture(path => path === '/api/runtime' ? { ...runtime, budget: { resetId: 'reset', spentUSD: 0, spendingLimitEnabled: false, allowanceUSD: 60, externalCostReserveUSD: 10 } } : response(path, record));
  await turn();
  assert.match(f.get('cost').textContent, /\$0\.00 tracked since reset/);
  assert.match(f.get('cost').textContent, /no spending stop/);
  assert.match(f.get('cost').textContent, /\$10\.50 selected run/);
});

test('execution clock excludes login/setup and stopped-before-AI time', async () => {
  for (const state of [{status:'UPLOADED'}, {status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup'}, {status:'STOPPED',phase:'SETTLED'}]) {
    const record = {id:'job',workflow:'login-first',startedAt:'2026-01-01T08:00:00Z',finishedAt:'2026-01-01T10:30:00Z',...state};
    const f = fixture(path => response(path, record));
    await turn();
    assert.equal(f.get('elapsed').textContent, '00:00:00');
    assert.match(f.get('elapsedLabel').textContent, /starts after verified Return/);
  }
});

test('settled execution clock uses existing AI start and finish, not upload/browser start', async () => {
  const record = {id:'job',workflow:'login-first',status:'INCOMPLETE',startedAt:'2026-01-01T08:00:00Z',aiStartedAt:'2026-01-01T09:00:00Z',finishedAt:'2026-01-01T10:30:00Z'};
  const f = fixture(path => response(path, record));
  await turn();
  assert.equal(f.get('elapsed').textContent, '01:30:00');
  await vm.runInContext('refresh()', f.context);
  assert.equal(f.get('elapsed').textContent, '01:30:00', 'settled clock must not keep increasing');
  assert.match(f.get('elapsedLabel').textContent, /target ~90 min \(not a cutoff\)/);
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="elapsedLabel"/);
  assert.match(html, /not guarantees or automatic limits/);
});

test('historical records retain their original duration with an honest setup-inclusive label', async () => {
  const record = {id:'job',status:'INCOMPLETE',startedAt:'2026-01-01T08:00:00Z',finishedAt:'2026-01-01T10:30:00Z'};
  const f = fixture(path => response(path, record));
  await turn();
  assert.equal(f.get('elapsed').textContent, '02:30:00');
  assert.match(f.get('elapsedLabel').textContent, /Historical duration.*includes setup/);
});

test('passing the 90-minute target does not Stop, change status or send another prompt', async () => {
  const posts = [];
  const record = {id:'job',workflow:'login-first',status:'RUNNING',phase:'EXECUTING',aiStartedAt:'2026-01-01T09:00:00Z'};
  const f = fixture((path, options) => { if (options?.method) posts.push(path); return response(path, record); });
  await turn();
  await vm.runInContext('Date.now = () => Date.parse("2026-01-01T10:35:00Z"); refresh()', f.context);
  assert.equal(f.get('elapsed').textContent, '01:35:00');
  assert.equal(f.get('status').textContent, 'Running');
  assert.deepEqual(posts, []);
});

test('invalid or reversed timestamps never display NaN or a negative execution time', async () => {
  for (const aiStartedAt of ['invalid', '2026-01-01T11:00:00Z']) {
    const f = fixture(path => response(path, {id:'job',workflow:'login-first',status:'STOPPED',aiStartedAt,finishedAt:'2026-01-01T10:30:00Z'}));
    await turn();
    assert.equal(f.get('elapsed').textContent, '00:00:00');
  }
});

test('fresh single-runner tab selects its sole waiting job before replacing an Excel file', async () => {
  const posts = [], record = { id: 'waiting-job', originalName: 'old.xlsx', requestedEventName: 'Bound Target', status: 'RUNNING', phase: 'AWAITING_INPUT', waitingFor: 'setup', workflow: 'login-first', piCostUSD: 0 };
  const preview = { id: 'new-workbook', originalName: 'new.xlsx', sheets: [{name:'Sheet',rows:0,columns:1}], sheet:0, offset:0, rows:[], columns:['A'] };
  const f = fixture((path, options) => {
    if (options?.method) {
      posts.push(path);
      if (path === '/api/new-rr') { assert.equal(JSON.parse(options.body).jobId, record.id); record.status = 'STOPPED'; return { cleared:true }; }
      if (path === '/api/workbooks') return preview;
      assert.fail(`Unexpected execution request: ${path}`);
    }
    return path === '/api/runtime' ? {ownership:'USER',loginFirst:true} : response(path, record);
  }, { storage:new Map(), history:[record] });
  await turn();
  assert.equal(f.storage.get('rrJobId'), record.id);
  assert.equal(f.get('jobSelect').value, record.id);
  assert.equal(f.get('eventName').value, 'Bound Target');
  assert.equal(f.get('stop').disabled, false);
  assert.equal(f.get('rr').disabled, false);
  assert.match(f.get('status').textContent, /AI NOT STARTED/);
  f.get('rr').files = [{name:'new.xlsx'}]; await f.get('rr').onchange();
  assert.equal(f.confirmations.length, 1);
  assert.deepEqual(posts, ['/api/new-rr','/api/workbooks']);
  assert.equal(f.storage.get('rrWorkbookId'), preview.id);
  assert.equal(f.storage.has('rrJobId'), false);
  assert.equal(f.get('eventName').value, 'Bound Target');
});

test('cancelled replacement of an auto-selected waiting job makes no mutation requests', async () => {
  const posts=[], record={id:'waiting-job',requestedEventName:'Bound Target',status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup'};
  const f=fixture((path,options)=>{if(options?.method)posts.push(path);return response(path,record);}, {storage:new Map(),history:[record],confirmResult:false});
  await turn(); f.get('rr').files=[{name:'new.xlsx'}]; await f.get('rr').onchange();
  assert.equal(f.confirmations.length,1); assert.deepEqual(posts,[]);
  assert.equal(f.storage.get('rrJobId'),record.id);
});

test('file replacement stays disabled until startup job discovery finishes', async () => {
  const gate=deferred(), posts=[];
  const f=fixture((path,options)=>{if(options?.method)posts.push(path);return response(path,null);},{storage:new Map(),history:gate.promise});
  await turn(); assert.equal(f.get('rr').disabled,true); assert.equal(f.get('newRR').disabled,true);
  f.get('rr').files=[{name:'early.xlsx'}]; await f.get('rr').onchange();
  assert.deepEqual(posts,[]);
  gate.resolve([]); await turn(); assert.equal(f.get('rr').disabled,false);
});

test('malformed startup history blocks intake while retaining Stop for a known active job', async () => {
  const posts=[], record={id:'job',status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup'};
  const f=fixture((path,options)=>{if(options?.method)posts.push(path);return response(path,record);},{history:{invalid:true}});
  await turn();
  assert.equal(f.get('rr').disabled,true); assert.equal(f.get('newRR').disabled,true);
  assert.equal(f.get('stop').disabled,false); assert.match(f.get('message').textContent,/Refresh before uploading/);
  f.get('rr').files=[{name:'new.xlsx'}]; await f.get('rr').onchange();
  assert.deepEqual(posts,[]);
});

test('startup job discovery preserves an explicit history selection and never guesses among multiple active jobs', async () => {
  const activeJobs=[{id:'one',status:'RUNNING'},{id:'two',status:'STOPPING'}];
  for (const selected of [undefined,'saved-job']) {
    const storage=new Map(selected?[['rrJobId',selected],['rrTargetName','Chosen Target']]:[]);
    const f=fixture(path=>response(path,{id:'saved-job',status:'STOPPED'}),{storage,history:activeJobs});
    await turn(); assert.equal(storage.get('rrJobId'),selected);
    assert.equal(vm.runInContext('jobId',f.context),selected ?? null);
    if(selected)assert.equal(f.get('eventName').value,'Chosen Target');
  }
});

test('Clear/New RR waits for confirmed cleanup, clears persisted selection and grid, and never starts AI',async()=>{
  const gate=deferred(),posts=[];
  const f=fixture((path,options)=>{if(options?.method){posts.push(path);return gate.promise;}return response(path,{id:'job',status:'RUNNING',phase:'EXECUTING'});});
  await turn();f.storage.set('rrWorkbookId','old-workbook');f.get('sheetTable').replaceChildren({textContent:'old cells'});f.get('sessionInvalidated').checked=true;
  assert.equal(f.get('newRR').disabled,false);
  const pending=f.get('newRR').onclick();await f.get('newRR').onclick();
  assert.deepEqual(posts,['/api/new-rr']);assert.equal(f.storage.get('rrJobId'),'job');assert.equal(f.get('upload').disabled,true);
  gate.resolve({cleared:true});await pending;
  assert.equal(f.storage.size,0);assert.equal(vm.runInContext('jobId',f.context),null);assert.equal(f.get('eventName').value,'');
  assert.equal(f.get('sheetTable').children.length,0);assert.equal(f.get('workbookName').textContent,'No RR selected');assert.equal(f.get('sessionInvalidated').checked,false);
  await vm.runInContext('initialize()',f.context);assert.equal(vm.runInContext('jobId',f.context),null);
  assert.equal(f.get('stage').textContent,'UPLOAD');assert.match(f.get('cost').textContent,/prior spending retained/);
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');assert(html.indexOf('id="newRR"')>html.indexOf('id="rr"'));assert(html.indexOf('id="newRR"')<html.indexOf('id="eventName"'));
});
test('choosing another Excel automatically resets before uploading preview, not execution',async()=>{
  const posts=[];const preview={id:'new-workbook',originalName:'new.xlsx',sheets:[{name:'Sheet',rows:0,columns:1}],sheet:0,offset:0,rows:[],columns:['A']};
  const f=fixture((path,options)=>{
    if(options?.method){posts.push(path);return path==='/api/new-rr'?{cleared:true}:preview;}
    return response(path,{id:'job',status:'RUNNING',phase:'EXECUTING'});
  });
  await turn();assert.equal(f.get('rr').disabled,false);f.get('rr').files=[{name:'new.xlsx'}];await f.get('rr').onchange();
  assert.deepEqual(posts,['/api/new-rr','/api/workbooks']);assert.equal(f.storage.get('rrWorkbookId'),'new-workbook');assert.equal(f.storage.has('rrJobId'),false);
  assert.equal(vm.runInContext('workbook.id',f.context),'new-workbook');assert.match(f.get('message').textContent,/AI starts only after verified Return/);
  assert.equal(f.get('eventName').value,'Selected Event');assert.equal(f.storage.get('rrTargetName'),'Selected Event');
  assert.equal(f.get('rr').files[0].name,'new.xlsx');assert.match(f.get('rrSelection').textContent,/Saved: new.xlsx/);
});
test('successful upload clears all prior run UI immediately even when runtime polling fails', async () => {
  const posts=[],old={id:'job',originalName:'OLD.xlsx',status:'STOPPED',lastAssistantText:'OLD answer',stopReason:'OLD failure',activity:[{at:'before',message:'OLD activity'}]};
  const preview={id:'11111111-1111-1111-1111-111111111111',originalName:'new.xlsx',sheets:[{name:'Sheet',rows:0,columns:1}],sheet:0,offset:0,rows:[],columns:['A']};
  let pollFails=false;
  const f=fixture((path,options)=>{
    if(options?.method){posts.push(path);if(path==='/api/new-rr')return {cleared:true};if(path==='/api/workbooks'){pollFails=true;return preview;}assert.fail(path);}
    if(path==='/api/runtime'&&pollFails)throw new Error('Temporary status read failure');
    if(path.endsWith('/results/state.json'))return {requirements:[{id:'OLD',label:'OLD completed work',status:'verified_changed'}]};
    return response(path,old);
  },{history:[old,{id:'older-job',originalName:'OLDER.xlsx',status:'STOPPED'}],reportStatus:200});
  await turn();assert.equal(f.get('results').hidden,false);assert.match(f.get('agentReply').textContent,/OLD answer/);
  f.get('answer').value='OLD reply';f.get('sessionInvalidated').checked=true;
  f.get('rr').files=[{name:'new.xlsx'}];await f.get('rr').onchange();
  assert.deepEqual(posts,['/api/new-rr','/api/workbooks']);assert.equal(f.storage.has('rrJobId'),false);
  assert.equal(f.get('jobSelect').children.length,1);assert.equal(f.get('jobSelect').children[0].textContent,'new.xlsx');assert.equal(f.get('jobSelect').disabled,true);
  assert.equal(f.get('results').hidden,true);assert.equal(f.get('results').href,'');
  for(const id of ['agentReply','question'])assert.equal(f.get(id).textContent,'');
  assert.equal(f.get('answer').value,'');assert.equal(f.get('sessionInvalidated').checked,false);
  for(const id of ['questionPanel','progressLists','excludedProgress'])assert.equal(f.get(id).hidden,true);
  for(const id of ['completed','pending','excluded','activity'])assert.equal(f.get(id).children[0].textContent,'None');
  assert.equal(f.get('elapsed').textContent,'00:00:00');assert.equal(f.get('status').textContent,'Not running');assert.equal(f.get('stage').textContent,'UPLOAD');
  assert.equal(f.get('take').disabled,true,'unknown runtime cannot grant browser control');
  assert.match(f.get('cost').textContent,/prior spending retained/);
  assert.equal(f.get('eventName').value,'Selected Event');assert.equal(old.stopReason,'OLD failure','no historical record rewrite');
});

test('new upload stays fresh on reload and repeated uploads of the same filename', async () => {
  const old={id:'job',originalName:'same.xlsx',status:'STOPPED'};
  const ids=['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222'];
  let uploads=0;const posts=[];
  const preview=id=>({id,originalName:'same.xlsx',sheets:[{name:'Sheet',rows:0,columns:1}],sheet:0,offset:0,rows:[],columns:['A']});
  const fetcher=(path,options)=>{
    if(options?.method){posts.push(path);if(path==='/api/new-rr')return {cleared:true};if(path==='/api/workbooks')return preview(ids[uploads++]);assert.fail(path);}
    if(path.startsWith('/api/workbooks/'))return preview(path.split('/').at(-1));
    return response(path,old);
  };
  const f=fixture(fetcher,{history:[old]});await turn();
  f.get('rr').files=[{name:'same.xlsx'}];await f.get('rr').onchange();
  const reloaded=fixture(fetcher,{storage:f.storage,history:[old]});await turn();
  assert.equal(reloaded.get('jobSelect').value,'');assert.equal(reloaded.get('jobSelect').children.length,1);
  assert.equal(reloaded.get('results').hidden,true);assert.equal(reloaded.get('stage').textContent,'UPLOAD');
  assert.equal(vm.runInContext('jobId',reloaded.context),null);
  reloaded.get('rr').files=[{name:'same.xlsx'}];await reloaded.get('rr').onchange();
  assert.equal(reloaded.storage.get('rrWorkbookId'),ids[1]);assert.equal(reloaded.storage.has('rrJobId'),false);
  assert.deepEqual(posts,['/api/new-rr','/api/workbooks','/api/new-rr','/api/workbooks']);
});

test('a late old-run poll cannot restore results after a new file upload', async () => {
  const gate=deferred();let delayNext=false;
  const old={id:'job',originalName:'OLD.xlsx',status:'STOPPED',lastAssistantText:'OLD report'};
  const preview={id:'new',originalName:'new.xlsx',sheets:[{name:'Sheet',rows:0,columns:1}],sheet:0,offset:0,rows:[],columns:['A']};
  const f=fixture((path,options)=>{
    if(options?.method)return path==='/api/new-rr'?{cleared:true}:preview;
    if(path==='/api/runtime'&&delayNext){delayNext=false;return gate.promise;}
    return response(path,old);
  },{history:[old]});await turn();
  delayNext=true;const pending=vm.runInContext('refresh()',f.context);
  f.get('rr').files=[{name:'new.xlsx'}];await f.get('rr').onchange();
  gate.resolve(runtime);await pending;
  assert.equal(f.get('agentReply').textContent,'');assert.equal(f.get('results').hidden,true);
  assert.equal(f.get('jobSelect').children.length,1);assert.equal(f.get('jobSelect').value,'');
  assert.equal(f.get('stage').textContent,'UPLOAD');assert.equal(vm.runInContext('job',f.context),null);
});

test('enabling reset support does not clear an existing selection before the operator requests a reset', async () => {
  const book='11111111-1111-1111-1111-111111111111';
  const old={id:'job',status:'STOPPED',originalName:'Selected.xlsx'};
  const saved={id:book,originalName:'Selected.xlsx',sheet:0,offset:0,rows:[],columns:['A'],sheets:[{name:'Sheet',rows:0,columns:1}]};
  const storage=new Map([['rrJobId','job'],['rrWorkbookId',book],['rrTargetName','Selected Event']]);
  const f=fixture(path=>path==='/api/runtime'?{ownership:'USER',loginFirst:true,rrContext:null}:path.startsWith('/api/workbooks/')?saved:response(path,old),{storage,history:[old]});
  await turn();assert.equal(f.storage.get('rrJobId'),'job');assert.equal(f.storage.get('rrWorkbookId'),book);
  assert.equal(f.get('eventName').value,'Selected Event');assert.match(f.get('workbookName').textContent,/Selected.xlsx/);
  assert.equal(f.get('newRR').disabled,false);
});

test('backend-confirmed Clear persists its reset and stale tabs cannot restore old selections', async () => {
  const oldJob='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',oldBook='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const first='11111111-1111-1111-1111-111111111111',next='22222222-2222-2222-2222-222222222222';
  let context={id:first,jobId:oldJob,workbookId:oldBook};const reads=[],posts=[];
  const old={id:oldJob,status:'STOPPED',originalName:'OLD.xlsx',requestedEventName:'Old Event'};
  const saved={id:oldBook,originalName:'OLD.xlsx',sheet:0,offset:0,rows:[],columns:['A'],sheets:[{name:'Sheet',rows:0,columns:1}]};
  const storage=new Map([['rrContextId',first],['rrJobId',oldJob],['rrWorkbookId',oldBook],['rrTargetName','Old Event']]);
  const staleStorage=new Map(storage);
  const fetcher=(path,options)=>{
    if(options?.method){posts.push({path,body:JSON.parse(options.body)});context={id:next,jobId:null,workbookId:null};return {cleared:true,rrContext:context};}
    reads.push(path);
    if(path==='/api/runtime')return {ownership:'USER',loginFirst:true,browserStopped:true,rrContext:context};
    if(path.startsWith('/api/workbooks/'))return saved;
    return response(path,old);
  };
  const f=fixture(fetcher,{storage,history:[old]});await turn();await f.get('newRR').onclick();
  assert.deepEqual(posts,[{path:'/api/new-rr',body:{jobId:oldJob,contextId:first,prepareUpload:false}}]);
  assert.deepEqual([...storage],[['rrContextId',next]]);
  assert.equal(f.get('workbookName').textContent,'No RR selected');assert.equal(f.get('eventName').value,'');
  assert.equal(f.get('results').hidden,true);assert.equal(f.get('stage').textContent,'UPLOAD');
  reads.length=0;
  const staleTab=fixture(fetcher,{storage:staleStorage,history:[old]});await turn();await turn();
  assert.deepEqual([...staleStorage],[['rrContextId',next]]);
  assert.equal(staleTab.get('workbookName').textContent,'No RR selected');assert.equal(staleTab.get('eventName').value,'');
  assert.equal(staleTab.get('rr').disabled,false);
  assert.ok(!reads.some(p=>p.startsWith('/api/workbooks/')||p.startsWith('/api/jobs/')),'server context is read before old cached pointers');
});

test('server-selected fresh workbook replaces stale cached workbook on reload without restoring old results', async () => {
  const generation='11111111-1111-1111-1111-111111111111',book='22222222-2222-2222-2222-222222222222';
  const fresh={id:book,originalName:'NEW.xlsx',sheet:0,offset:0,rows:[],columns:['A'],sheets:[{name:'Sheet',rows:0,columns:1}]};
  const reads=[];
  const f=fixture(path=>{
    reads.push(path);
    if(path==='/api/runtime')return {ownership:'USER',loginFirst:true,rrContext:{id:generation,jobId:null,workbookId:book}};
    if(path==='/api/workbooks/'+book)return fresh;
    assert.fail('Obsolete selection must not be read: '+path);
  },{storage:new Map([['rrJobId','old-job'],['rrWorkbookId','old-book'],['rrTargetName','OLD event']]),history:[{id:'old-job',status:'STOPPED'}]});
  await turn();await turn();
  assert.match(f.get('workbookName').textContent,/NEW.xlsx/);assert.equal(f.get('eventName').value,'');
  assert.equal(f.storage.get('rrContextId'),generation);assert.equal(f.storage.has('rrJobId'),false);
  assert.equal(f.get('results').hidden,true);assert.equal(f.get('stage').textContent,'UPLOAD');
  assert.ok(!reads.some(p=>p.includes('old-job')||p.includes('old-book')));
});

test('file replacement prepares cleanup without committing a reset until the new preview succeeds', async () => {
  const id='11111111-1111-1111-1111-111111111111',job='22222222-2222-2222-2222-222222222222',book='33333333-3333-3333-3333-333333333333';
  const context={id,jobId:job,workbookId:book};const posts=[];
  const old={id:job,status:'STOPPED',originalName:'OLD.xlsx'};
  const saved={id:book,originalName:'OLD.xlsx',sheet:0,offset:0,rows:[],columns:['A'],sheets:[{name:'Sheet',rows:0,columns:1}]};
  const f=fixture((path,options)=>{
    if(options?.method){posts.push(path);if(path==='/api/new-rr'){assert.equal(JSON.parse(options.body).prepareUpload,true);return {cleared:true,rrContext:context};}throw new Error('Invalid workbook');}
    if(path==='/api/runtime')return {ownership:'USER',loginFirst:true,rrContext:context};
    if(path.startsWith('/api/workbooks/'))return saved;
    return response(path,old);
  },{storage:new Map([['rrContextId',id],['rrJobId',job],['rrWorkbookId',book],['rrTargetName','Selected Event']]),history:[old]});
  await turn();f.get('rr').files=[{name:'broken.xlsx'}];await f.get('rr').onchange();
  assert.deepEqual(posts,['/api/new-rr','/api/workbooks']);assert.equal(f.storage.get('rrContextId'),id);
  assert.equal(f.storage.get('rrJobId'),job);assert.equal(f.storage.get('rrWorkbookId'),book);
  assert.equal(f.get('eventName').value,'Selected Event');assert.match(f.get('message').textContent,/Invalid workbook/);
});

for (const operation of ['sheet read','draft save']) test(`late ${operation} cannot repopulate a server-reset context`, async () => {
  const id='11111111-1111-1111-1111-111111111111',next='22222222-2222-2222-2222-222222222222',book='33333333-3333-3333-3333-333333333333';
  let context={id,jobId:null,workbookId:book},delay=false;
  const gate=deferred();const saved={id:book,originalName:'OLD.xlsx',sheet:0,offset:0,rows:[],columns:['A'],sheets:[{name:'Sheet',rows:0,columns:1}]};
  const f=fixture((path,options)=>{
    if(path==='/api/runtime')return {ownership:'USER',loginFirst:true,rrContext:context};
    if(path.startsWith('/api/workbooks/')){if(delay){delay=false;return gate.promise;}return saved;}
    assert.fail(path);
  },{storage:new Map([['rrContextId',id],['rrWorkbookId',book]])});
  await turn();delay=true;
  let pending;
  if(operation==='draft save'){vm.runInContext('edits.set("A1","draft")',f.context);pending=f.get('saveWorkbook').onclick();}
  else pending=vm.runInContext('loadSheet(0,0)',f.context);
  assert.equal(vm.runInContext('draftLoading',f.context),true);
  context={id:next,jobId:null,workbookId:null};await vm.runInContext('refresh()',f.context);
  gate.resolve(saved);await pending;
  assert.equal(f.storage.get('rrContextId'),next);assert.equal(f.storage.has('rrWorkbookId'),false);
  assert.equal(vm.runInContext('workbook',f.context),null);assert.equal(vm.runInContext('draftLoading',f.context),false);
  assert.equal(f.get('workbookName').textContent,'No RR selected');assert.equal(f.get('rr').disabled,false);
});

test('failed New RR keeps current job and workbook selected for reconciliation; no new upload',async()=>{
  const posts=[];const f=fixture((path,options)=>{if(options?.method){posts.push(path);throw new Error('cleanup requires reconciliation');}return response(path,{id:'job',status:'RUNNING',phase:'EXECUTING'});});
  await turn();f.storage.set('rrWorkbookId','old-workbook');vm.runInContext('workbook={id:"old-workbook",rows:[],offset:0,sheet:0,sheets:[{rows:0}]}',f.context);
  f.get('rr').files=[{name:'new.xlsx'}];await f.get('rr').onchange();
  assert.deepEqual(posts,['/api/new-rr']);assert.equal(f.storage.get('rrJobId'),'job');assert.equal(vm.runInContext('workbook.id',f.context),'old-workbook');assert.match(f.get('message').textContent,/reconciliation/);
});
test('cancelled Clear or file replacement neither stops nor drops unsaved changes',async()=>{
  let posts=0;const f=fixture((path,options)=>{if(options?.method)posts++;return response(path,{id:'job',status:'RUNNING',phase:'EXECUTING'});},{confirmResult:false});
  await turn();vm.runInContext('edits.set("A1","unsaved")',f.context);await f.get('newRR').onclick();
  f.get('rr').files=[{name:'new.xlsx'}];await f.get('rr').onchange();
  assert.equal(posts,0);assert.equal(f.storage.get('rrJobId'),'job');assert.equal(vm.runInContext('edits.size',f.context),1);
});
test('preview failure after Stop retains previous workbook, unsaved edits, target and selection',async()=>{
  const f=fixture(path=>{if(path==='/api/new-rr')return {cleared:true};if(path==='/api/workbooks')throw new Error('Invalid workbook');return response(path,{id:'job',status:'REVIEW_REQUIRED'});});
  await turn();f.storage.set('rrWorkbookId','old');
  vm.runInContext('workbook={id:"old",rows:[],offset:0,sheet:0,sheets:[{rows:0}]}; edits.set("A1","keep me")',f.context);
  f.get('rrSelection').textContent='Saved: old.xlsx';f.get('rr').files=[{name:'broken.xlsx'}];await f.get('rr').onchange();
  assert.equal(vm.runInContext('workbook.id',f.context),'old');assert.equal(vm.runInContext('jobId',f.context),'job');assert.equal(f.storage.get('rrWorkbookId'),'old');
  assert.equal(vm.runInContext('edits.get("A1")',f.context),'keep me');assert.equal(f.get('eventName').value,'Selected Event');assert.equal(f.storage.get('rrTargetName'),'Selected Event');
  assert.equal(f.get('rr').value,'');assert.equal(f.get('rrSelection').textContent,'Saved: old.xlsx');assert.match(f.get('message').textContent,/Invalid workbook.*retained/);
});
test('pending replacement does not blank target or old preview and only commits after saving',async()=>{
  const gate=deferred(),preview={id:'new',originalName:'new.xlsx',sheets:[{name:'Sheet',rows:0,columns:1}],sheet:0,offset:0,rows:[],columns:['A']};
  const f=fixture(path=>path==='/api/new-rr'?{cleared:true}:path==='/api/workbooks'?gate.promise:response(path,{id:'job',status:'REVIEW_REQUIRED'}));
  await turn();f.storage.set('rrWorkbookId','old');vm.runInContext('workbook={id:"old",rows:[],offset:0,sheet:0,sheets:[{rows:0}]}',f.context);
  f.get('rr').files=[{name:'new.xlsx'}];const pending=f.get('rr').onchange();await turn();
  assert.equal(vm.runInContext('workbook.id',f.context),'old');assert.equal(f.storage.get('rrWorkbookId'),'old');assert.equal(f.get('eventName').value,'Selected Event');assert.equal(f.get('upload').disabled,true);
  gate.resolve(preview);await pending;assert.equal(vm.runInContext('workbook.id',f.context),'new');assert.equal(f.get('eventName').value,'Selected Event');assert.equal(f.storage.get('rrWorkbookId'),'new');
});
test('late workbook restoration after Clear cannot repopulate the blank form',async()=>{
  const gate=deferred();let restoring=false;
  const storage=new Map([['rrWorkbookId','11111111-1111-1111-1111-111111111111']]);
  const f=fixture(path=>{if(path.startsWith('/api/workbooks/')){restoring=true;return gate.promise;}if(path==='/api/new-rr')return {cleared:true};return response(path,null);},{storage});
  await turn();assert.equal(restoring,true);await f.get('newRR').onclick();gate.resolve({id:'old'});await turn();
  assert.equal(vm.runInContext('workbook',f.context),null);assert.equal(storage.size,0);assert.equal(f.get('workbookName').textContent,'No RR selected');
});

test('workbook saves include the current generation only when the backend requires it',async()=>{
  for(const required of [true,false]){
    const id='11111111-1111-4111-8111-111111111111',bookId='22222222-2222-4222-8222-222222222222';
    let book={id:bookId,originalName:'Fixture.xlsx',sha256:'before',revision:0,sheet:0,offset:0,columns:['A'],rows:[[{value:'Original'}]],sheets:[{name:'Fixture',rows:1,columns:1}]};
    const posts=[],storage=new Map([['rrWorkbookId',bookId],...(required?[['rrContextId',id]]:[])]);
    const f=fixture((path,options)=>{
      if(options?.method){posts.push({path,body:JSON.parse(options.body)});book={...book,revision:1,sha256:'after'};return book;}
      if(path==='/api/runtime')return {ownership:'USER',loginFirst:true,workbookSaveContextRequired:required,...(required?{rrContext:{id,workbookId:bookId,jobId:null}}:{})};
      return path.startsWith('/api/workbooks/')?book:null;
    },{storage});
    await turn();vm.runInContext('edits.set("A1","Changed");renderControls()',f.context);
    assert.equal(f.get('saveWorkbook').disabled,false);await f.get('saveWorkbook').onclick();
    assert.equal(posts.length,1);assert.equal(posts[0].path,`/api/workbooks/${bookId}/save`);
    assert.equal(posts[0].body.contextId,required?id:undefined);assert.equal(posts[0].body.sha256,'before');
    assert.equal(vm.runInContext('edits.size',f.context),0);
  }
});

test('legacy cached workbook without a confirmed generation cannot send a save to a guarded backend',async()=>{
  const bookId='22222222-2222-4222-8222-222222222222';
  const book={id:bookId,originalName:'Fixture.xlsx',sha256:'old',revision:0,sheet:0,offset:0,columns:['A'],rows:[[{value:'Original'}]],sheets:[{name:'Fixture',rows:1,columns:1}]};
  const posts=[];
  const f=fixture((path,options)=>{if(options?.method)posts.push(path);return path==='/api/runtime'?{ownership:'USER',loginFirst:true,workbookSaveContextRequired:true,rrContext:null}:path.startsWith('/api/workbooks/')?book:null;},{storage:new Map([['rrWorkbookId',bookId]])});
  await turn();vm.runInContext('edits.set("A1","Unsaved");renderControls()',f.context);
  assert.equal(f.get('saveWorkbook').disabled,true);assert.match(f.get('editStatus').textContent,/context is unconfirmed/);
  await f.get('saveWorkbook').onclick();assert.deepEqual(posts,[]);assert.equal(vm.runInContext('edits.size',f.context),1);
});

test('production workbook saves are wired to the controller generation guard',async()=>{
  const server=await readFile(new URL('../app/server.mjs',import.meta.url),'utf8');
  assert.ok(server.includes('withSave: connection.withWorkbookSave'));
  assert.ok(server.includes('workbookSaveContextRequired: true'));
});

test('Start Build binds the named target and starts a fresh job once', async () => {
  let reads = 0, uploads = 0;
  const gate = deferred();
  const f = fixture((path, options) => {
    if (path === '/api/jobs') { uploads++; return gate.promise; }
    if (path.endsWith('/read')) { reads++; return { started: true }; }
    return response(path, path.includes('new-job') ? { id: 'new-job', status: 'RUNNING', phase: 'READING' } : { id: 'job', status: 'REVIEW_REQUIRED' });
  });
  await turn(); f.get('rr').files = [{ name: 'New.xlsx' }];
  const first = f.get('upload').onclick(); await f.get('upload').onclick();
  assert.equal(uploads, 1); assert.equal(reads, 0); assert.equal(f.get('upload').disabled, true);
  gate.resolve({ id: 'new-job', status: 'UPLOADED' }); await first;
  assert.equal(reads, 1); assert.equal(vm.runInContext('jobId', f.context), 'new-job');
  assert.equal(f.get('upload').disabled, true); assert.equal(f.get('stop').disabled, false);
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="eventName"/);
  assert.doesNotMatch(html, /id="(?:lockTarget|continue)"/);
  assert.match(source, /form.append\("eventName", targetName\)/);
  assert.doesNotMatch(html, /id="instruction"|Tell Pi what to do|What should Pi do/);
  assert.doesNotMatch(source, /\$\("instruction"\)|form.append\("instruction"/);
  assert.match(html, /START BUILD/);
  assert.doesNotMatch(source, /\/continue|\/start/);
});

test('Start Build cannot infer a missing target from the workbook', async () => {
  let uploads = 0;
  const f = fixture(path => { if (path === '/api/jobs') uploads++; return response(path, { id: 'job', status: 'REVIEW_REQUIRED' }); });
  await turn(); f.get('rr').files = [{ name: 'Coconut Grove.xlsx' }]; f.get('eventName').value = '';
  await f.get('upload').onclick();
  assert.equal(uploads, 0); assert.match(f.get('message').textContent, /never taken from the RR/);
});

test('poll cannot enable another upload during active reading or a pending request', async () => {
  const f = fixture(path => response(path, { id: 'job', status: 'RUNNING', phase: 'READING', piCostUSD: 0.5, totalEventCostUSD: 13.81 }));
  await turn(); assert.equal(f.get('upload').disabled, true);
  await vm.runInContext('refresh()', f.context);
  assert.equal(f.get('upload').disabled, true);
  assert.equal(f.get('cost').textContent, '$0.50 this run · $13.81 including prior spending · spending guard active');
});

test('clarification answer only goes to the live waiting job and is double-submit safe', async () => {
  const pending = deferred(); let answers = 0;
  const f = fixture((path, options) => {
    if (path.endsWith('/answer')) { answers++; assert.equal(JSON.parse(options.body).message, 'Skip placeholders'); return pending.promise; }
    return response(path, { id: 'job', status: 'RUNNING', phase: 'AWAITING_INPUT', waitingFor: 'clarification', lastAssistantText: 'Mock-only warning: proceed?' });
  });
  await turn(); assert.equal(f.get('questionPanel').hidden, false);
  f.get('answer').value = 'Skip placeholders'; const first = f.get('sendAnswer').onclick(); await f.get('sendAnswer').onclick();
  assert.equal(answers, 1); pending.resolve({ accepted: true }); await first;
});

test('login handoff requires explicit action and security acknowledgement is not prechecked', async () => {
  let body;
  const f = fixture((path, options) => {
    if (path.endsWith('/answer')) { body = JSON.parse(options.body); return { accepted: true }; }
    return path === '/api/runtime' ? { ownership: 'USER' } : response(path, { id: 'job', status: 'RUNNING', phase: 'AWAITING_INPUT', waitingFor: 'setup', lastAssistantText: 'Security review: invalidate the session' });
  });
  await turn(); assert.equal(f.get('securityConfirmation').hidden, false); assert.equal(f.get('sessionInvalidated').checked, false);
  assert.equal(f.get('browserDetails').open, true);
  await f.get('loginDone').onclick(); assert.equal(body, undefined);
  await f.get('take').onclick(); assert.equal(body, undefined);
  assert.match(f.get('browserControlMessage').textContent, /Human security confirmation/);
  f.get('sessionInvalidated').checked = true;
  await f.get('take').onclick(); assert.equal(body.returnControl, true); assert.equal(body.sessionInvalidated, true);
});

test('settled reports cannot be answered, and malformed activity is not split into characters', async () => {
  const f = fixture(path => path.endsWith('/results/state.json') ? { requirements: [], activity: 'Read-only recovery failed' } : response(path, { id: 'job', status: 'REVIEW_REQUIRED', phase: 'AWAITING_INPUT' }));
  await turn(); assert.equal(f.get('questionPanel').hidden, true);
  assert.equal(f.get('activity').children.length, 1); assert.equal(f.get('activity').children[0].textContent, 'Read-only recovery failed');
});

test('USER ownership shows RETURN TO AGENT but cannot resume a job that is not waiting for setup', async () => {
  let posts = 0;
  const f = fixture((path, options) => {
    if (options?.method === 'POST') posts++;
    return path === '/api/runtime' ? { ownership: 'USER' } : response(path, { id: 'job', status: 'RUNNING', phase: 'AWAITING_INPUT' });
  });
  await turn();
  assert.equal(f.get('take').disabled, true);
  assert.equal(f.get('take').textContent, 'RETURN TO AGENT');
  assert.equal(f.get('browserFrame').classList.contains('user-control'), true);
  await f.get('take').onclick();
  assert.equal(posts, 0);
});

test('model-error pause is visible on refresh, retains human control and hides an older report without prompting',async()=>{
  const posts=[];
  const record={id:'job',status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'operator',pauseId:'error-pause',pauseReason:'model_failure',modelFailure:{category:'MODEL_TRANSPORT_FAILED',message:'Native model request failed with a transport error.'},lastAssistantText:'Native model request failed. Browser retained; no automatic retry.'};
  const f=fixture((path,options)=>{if(options?.method)posts.push(path);return path==='/api/runtime'?{ownership:'USER',operatorPauseSupported:true,browserStopped:false}:response(path,record);});
  await turn();assert.equal(f.get('status').textContent,'MODEL ERROR · PAUSED');assert.equal(f.get('take').disabled,false);
  assert.equal(f.get('browserFrame').classList.contains('user-control'),true);assert.equal(f.get('results').hidden,true);
  assert.match(f.get('browserControlMessage').textContent,/no automatic retry/);
  await vm.runInContext('refresh()',f.context);assert.deepEqual(posts,[]);
});

test('capable UI pauses and Returns the same job with its current pause token, without changing target', async () => {
  let ownership='AGENT',record={id:'job',requestedEventName:'Selected Event',status:'RUNNING',phase:'EXECUTING',aiStartedAt:'2026-09-29T01:00:00Z'};
  const posts=[];
  const f=fixture((path,options)=>{
    if(options?.method==='POST'){
      const body=JSON.parse(options.body);posts.push({path,body});
      if(path==='/api/take-control'){ownership='USER';record={...record,phase:'AWAITING_INPUT',waitingFor:'operator',pauseId:'pause-token'};return {paused:true,browserRetained:true};}
      if(path==='/api/jobs/job/resume'){ownership='AGENT';record={...record,phase:'EXECUTING',waitingFor:null,pauseId:null};return {resumed:true};}
    }
    return path==='/api/runtime'?{ownership,loginFirst:true,operatorPauseSupported:true,browserStopped:false}:response(path,record);
  });
  await turn();await f.get('take').onclick();
  assert.equal(posts[0].body.jobId,'job');assert.equal(posts[0].body.contextId,null);
  assert.equal(f.get('status').textContent,'PAUSED · HUMAN CONTROL');assert.equal(f.get('take').disabled,false);
  assert.match(f.get('browserControlMessage').textContent,/same browser is retained/);assert.equal(f.get('sendAnswer').hidden,true);
  assert.equal(f.get('eventName').disabled,true);assert.equal(f.get('loginDone').textContent,'RETURN TO SAME BUILD');
  await f.get('take').onclick();assert.equal(posts[1].path,'/api/jobs/job/resume');
  assert.deepEqual(posts[1].body,{returnControl:true,pauseId:'pause-token'});assert.equal(posts.length,2);
  assert.equal(f.get('take').textContent,'TAKE CONTROL');assert.equal(f.get('browserFrame').classList.contains('user-control'),false);
});

test('a paused UI never enables Return without backend capability and does not expose a pausing browser', async()=>{
  for(const [phase,capability] of [['AWAITING_INPUT',false],['PAUSING',true],['RETURNING',true]]){
    const f=fixture(path=>path==='/api/runtime'?{ownership:'USER',operatorPauseSupported:capability}:response(path,{id:'job',status:'RUNNING',phase,waitingFor:phase==='AWAITING_INPUT'?'operator':null,pauseId:'token'}));
    await turn();assert.equal(f.get('take').disabled,true);
    if(phase!=='AWAITING_INPUT')assert.equal(f.get('browserFrame').classList.contains('user-control'),false);
  }
});

test('Take Control is double-submit safe and toggles to RETURN TO AGENT only after handoff settles', async () => {
  const gate = deferred(); let takes = 0, ownership = 'AGENT';
  const f = fixture(async (path) => {
    if (path === '/api/take-control') { takes++; await gate.promise; ownership = 'USER'; return { ownership }; }
    return path === '/api/runtime' ? { ownership } : response(path, { id: 'job', status: 'RUNNING', phase: 'EXECUTING' });
  });
  await turn();
  assert.equal(f.get('take').textContent, 'TAKE CONTROL');
  const first = f.get('take').onclick(); await f.get('take').onclick();
  assert.equal(takes, 1); assert.equal(f.get('take').disabled, true);
  ownership = 'USER'; await vm.runInContext('refresh()', f.context);
  assert.equal(f.get('browserFrame').classList.contains('user-control'), false);
  gate.resolve(); await first;
  assert.equal(f.get('browserFrame').classList.contains('user-control'), true);
  assert.equal(f.get('take').textContent, 'RETURN TO AGENT');
  assert.match(f.get('browserControlMessage').textContent, /active RR was stopped/);
});

test('busy Take Control reports that execution continues and never pretends the browser was handed over',async()=>{
  const posts=[];const notice='Pi is finishing an operation. Nothing was paused or stopped. Let it finish before taking control, or use Stop Build to end this run.';
  const f=fixture((path,options)=>{
    if(options?.method){posts.push(path);throw new Error(notice);}
    return path==='/api/runtime'?{ownership:'AGENT',operatorPauseSupported:true,browserStopped:false}:response(path,{id:'job',status:'RUNNING',phase:'EXECUTING'});
  });
  await turn();await f.get('take').onclick();
  assert.deepEqual(posts,['/api/take-control']);assert.equal(f.get('status').textContent,'Running');
  assert.equal(f.get('take').textContent,'TAKE CONTROL');assert.equal(f.get('browserFrame').classList.contains('user-control'),false);
  assert.match(f.get('browserControlMessage').textContent,/Nothing was paused or stopped/);assert.equal(f.get('stop').disabled,false);
});

test('failed Take Control stays watch-only and shows the error next to the browser', async () => {
  const f = fixture(path => {
    if (path === '/api/take-control') throw new Error('Handoff failed');
    return response(path, { id: 'job', status: 'RUNNING', phase: 'EXECUTING' });
  });
  await turn(); await f.get('take').onclick();
  assert.equal(f.get('browserFrame').classList.contains('user-control'), false);
  assert.match(f.get('browserControlMessage').textContent, /Could not confirm control: Handoff failed/);
  assert.equal(f.get('take').disabled, false);
});

test('RETURN TO AGENT uses guarded same-job handoff then toggles back to TAKE CONTROL', async () => {
  const gate = deferred(), posts = [];
  let ownership = 'USER', record = { id: 'job', status: 'RUNNING', phase: 'AWAITING_INPUT', waitingFor: 'setup' };
  const f = fixture(async (path, options) => {
    if (options?.method === 'POST') {
      posts.push([path, JSON.parse(options.body)]);
      await gate.promise; ownership = 'AGENT'; record = { ...record, phase: 'EXECUTING', waitingFor: null };
      return { accepted: true };
    }
    return path === '/api/runtime' ? { ownership } : response(path, record);
  });
  await turn(); assert.equal(f.get('take').disabled, false);
  assert.equal(f.get('take').textContent, 'RETURN TO AGENT');
  const first = f.get('take').onclick(); await f.get('take').onclick();
  assert.equal(posts.length, 1); assert.equal(posts[0][0], '/api/jobs/job/answer');
  assert.equal(posts[0][1].returnControl, true); assert.equal(posts[0][1].sessionInvalidated, false);
  assert.equal(f.get('browserFrame').classList.contains('user-control'), false);
  assert.equal(f.get('take').disabled, true);
  gate.resolve(); await first;
  assert.match(f.get('browserControlMessage').textContent, /agent has control/);
  assert.equal(f.get('take').textContent, 'TAKE CONTROL');
  assert.equal(f.get('take').disabled, false);
  assert.equal(f.get('browserFrame').classList.contains('user-control'), false);
});

test('agent handoff retains server safety blockers instead of claiming control from an accepted answer', async () => {
  let blocked = false;
  const f = fixture(path => {
    if (path.endsWith('/answer')) { blocked = true; return { accepted: true }; }
    return path === '/api/runtime' ? { ownership: 'USER' } : response(path, { id: 'job', status: 'RUNNING', phase: 'AWAITING_INPUT', waitingFor: 'setup', lastAssistantText: blocked ? 'Target verification failed' : '' });
  });
  await turn(); await f.get('take').onclick();
  assert.equal(f.get('browserControlMessage').textContent, 'Target verification failed');
  assert.equal(f.get('browserFrame').classList.contains('user-control'), true);
});

test('agent takeover requires a live job waiting for setup; no new or stopped run is started', async () => {
  for (const record of [null, { status: 'STOPPED_REQUIRES_REVIEW' }, { status: 'RUNNING', phase: 'READING' }, { status: 'RUNNING', phase: 'AWAITING_INPUT', waitingFor: 'clarification' }]) {
    let posts = 0;
    const f = fixture((path, options) => { if (options?.method === 'POST') posts++; return path === '/api/runtime' ? { ownership: 'USER' } : response(path, record); });
    await turn(); assert.equal(f.get('take').disabled, true);
    await f.get('take').onclick(); assert.equal(posts, 0);
  }
});

test('choosing a new file cannot execute an older upload through retry', async () => {
  let reads = 0;
  const f = fixture(path => { if (path.endsWith('/read')) reads++; return response(path, { id: 'job', status: 'UPLOADED' }); });
  await turn(); f.get('rr').files = [{ name: 'other.xlsx' }]; vm.runInContext('renderControls()', f.context);
  assert.equal(f.get('start').disabled, true); await f.get('start').onclick(); assert.equal(reads, 0);
});

test('execution status uses observed metadata instead of stale inventory or security messages',async()=>{
  const record={id:'job',status:'RUNNING',phase:'EXECUTING',lastAssistantText:'Old security review blocker',
    executionActivity:{at:'2030-01-01T00:00:00.000Z',message:'bash finished; not saved-result verification'},
    activity:[{at:'2030-01-01T00:00:00.000Z',message:'bash started'}]};
  const f=fixture(path=>path.endsWith('/results/state.json')?{currentStage:'Inventory RR',currentAction:'Old inventory message',completed:['target-verified']}:response(path,record));
  await turn();assert.equal(f.get('stage').textContent,'Executing RR');assert.match(f.get('action').textContent,/bash finished/);
  assert.equal(f.get('agentReply').textContent,'');assert.equal(f.get('securityConfirmation').hidden,true);
  assert.equal(f.get('completionCount').textContent,'1 progress notes');
  assert.equal(f.get('status').textContent,'Running','legacy notes do not establish saved completion');
  assert.match(f.get('activity').children[0].textContent,/2030.*bash started/);
});
test('terminal run labels distinguish processing finished, verified complete, legacy uncertainty and Stop',async()=>{
  for(const status of ['DONE','INCOMPLETE','FINISHED','REVIEW_REQUIRED','STOPPED','STOPPED_REQUIRES_REVIEW']){
    const f=fixture(path=>path==='/api/runtime'?{ownership:'USER'}:path.endsWith('/results/state.json')?{completed:['saved-object'],currentAction:'Review required'}:response(path,{id:'job',status,reviewRequired:'Review saved results',lastAssistantText:'Created one item; another is blocked.'}));
    await turn();
    const expected=status.includes('STOPPED')?'Stopped':status==='DONE'?'Done — configuration saved':status==='INCOMPLETE'?'Done — unfinished items':'Ended — completion unverified';
    for(const id of ['status','stage','completionTitle'])assert.equal(f.get(id).textContent,expected);
    assert.equal(f.get('outcomeSummary').hidden,false);
    const summary=status.includes('STOPPED')?/Stopping does not undo changes/:status==='DONE'?/retained report for verification/:status==='INCOMPLETE'?/Some work is still unfinished/:/older run does not confirm completion/;
    assert.match(f.get('outcomeSummary').textContent,summary);
    if(status!=='DONE'){assert.equal(f.get('progressLists').hidden,false);assert.match(f.get('pending').children[0].textContent,/Completion and remaining work are unconfirmed/);}
    assert.match(f.get('agentReply').textContent,/Created one item/);
    assert.equal(f.get('take').disabled,true);
  }
});
test('Done with unfinished RR values shows concrete notes and Clear removes all prior outcome text',async()=>{
  const record=Object.freeze({id:'job',status:'INCOMPLETE',lastAssistantText:'Skipped the missing banner; registration was configured.'});
  const progress={requirements:[{id:'banner',label:'Banner image',status:'blocked',reason:'Missing file at Website!B4'},{id:'price',label:'Admission fee',status:'unverified',reason:'Missing amount at Pricing!C9'}]};
  const posts=[],f=fixture((path,options)=>{if(options?.method){posts.push(path);return {cleared:true};}return path==='/api/runtime'?{...runtime,ownership:'USER',browserStopped:true}:path.endsWith('/results/state.json')?progress:response(path,record);});
  await turn();assert.equal(f.get('status').textContent,'Done — unfinished items');assert.equal(f.get('completionMark').textContent,'!');
  assert.equal(f.get('pendingTitle').textContent,'Unfinished work / needs input');assert.match(f.get('pending').children[0].textContent,/Missing file at Website!B4/);
  assert.match(f.get('pending').children[1].textContent,/Missing amount at Pricing!C9/);assert.equal(f.get('progressLists').hidden,false);
  assert.equal(f.get('take').disabled,true);assert.equal(record.status,'INCOMPLETE');assert.equal(posts.length,0);
  await f.get('newRR').onclick();await turn();assert.equal(f.get('outcomeSummary').hidden,true);assert.equal(f.get('outcomeSummary').textContent,'');
  assert.equal(f.get('status').textContent,'Not running');assert.equal(f.get('completionMark').textContent,'•');assert.equal(f.get('pendingTitle').textContent,'Remaining / blocked');
});
test('lifecycle milestones follow browser/login/AI evidence, not legacy intake or completion labels',async()=>{
  const browser={runtimeId:'runtime',steelSessionId:'steel',activeTargetId:'page'},verified={target:{apiEventId:'event'},apiPreflight:{eventId:'event'}};
  const cases=[
    [{status:'UPLOADED',intake:{summary:'Old intake'}},[true,false,false,false]],
    [{status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup',browser},[true,true,false,false]],
    [{status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup',browser,...verified},[true,true,true,false]],
    [{status:'RUNNING',phase:'EXECUTING',browser,...verified,aiStartedAt:'2026-10-02T12:00:00Z'},[true,true,true,true]],
    ...['DONE','INCOMPLETE','STOPPED'].map(status=>[{status,phase:'SETTLED',browser,...verified,aiStartedAt:'2026-10-02T12:00:00Z'},[true,true,true,true]]),
    [{status:'STOPPED',phase:'SETTLED',intake:{summary:'Old intake'},aiStartedAt:'invalid'},[true,false,false,false]],
  ];
  for(const [fields,expected] of cases){
    const f=fixture(path=>response(path,{id:'job',workflow:'login-first',...fields}));await turn();
    assert.deepEqual([1,2,3,4].map(n=>f.get(`step${n}`).classList.contains('done')),expected,JSON.stringify(fields));
    if(fields.status==='INCOMPLETE')assert.equal(f.get('status').textContent,'Done — unfinished items');
    if(fields.status==='STOPPED')assert.equal(f.get('status').textContent,'Stopped');
  }
});
test('settled status does not display an old running action or claim live browser health',async()=>{
  const f=fixture(path=>path.endsWith('/results/state.json')?{currentAction:'Inventory RR still running'}:response(path,{id:'job',status:'STOPPED_REQUIRES_REVIEW',stopReason:'Operator Stop'}));
  await turn();assert.match(f.get('action').textContent,/Operator Stop/);assert.doesNotMatch(f.get('action').textContent,/still running/);assert.doesNotMatch(f.get('owner').textContent,/LIVE/);
});
test('Stop remains actionable during a pending Return and does not start or resume anything',async()=>{
  const gate=deferred();let stops=0,ownership='USER',record={id:'job',status:'RUNNING',phase:'AWAITING_INPUT',waitingFor:'setup'};
  const f=fixture(async(path)=>{
    if(path.endsWith('/answer')){await gate.promise;return {accepted:false};}
    if(path.endsWith('/stop')){stops++;record={...record,status:'STOPPED_REQUIRES_REVIEW',phase:'SETTLED'};return {stopFailures:[]};}
    return path==='/api/runtime'?{ownership}:response(path,record);
  });
  await turn();const pending=f.get('take').onclick();await turn();assert.equal(f.get('stop').disabled,false);
  await f.get('stop').onclick();assert.equal(stops,1);assert.equal(f.get('stop').disabled,true);
  gate.resolve();await pending;assert.equal(f.get('take').disabled,true);assert.equal(f.get('take').textContent,'RETURN TO AGENT');
});
