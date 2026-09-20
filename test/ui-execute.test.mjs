import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const runtime = { ownership: 'AGENT', loginFirst: true };
const turn = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
function fixture(fetcher, { confirmResult = true, storage = new Map([['rrJobId', 'job'], ['rrTargetName', 'Selected Event']]) } = {}) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { value: '', files: [], disabled: false, hidden: false, textContent: '', checked: false,
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); } },
        focus() { this.focused = true; }, scrollIntoView() { this.scrolled = true; }, querySelector() { return get('viewerIframe'); },
        replaceChildren(...children) { this.children = children; }, append() {}, setAttribute() {} });
    }
    return elements.get(id);
  };
  let created = 0;
  const context = vm.createContext({ document: { getElementById: get, createElement: () => get(`created-${created++}`) }, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, confirm: () => confirmResult, setInterval() {}, FormData: class { append() {} }, fetch: async (path, options) => { const data = await (path === '/api/jobs' && !options?.method ? [] : fetcher(path, options)); return { ok: true, json: async () => data }; } });
  vm.runInContext(source, context);
  return { get, context, storage };
}
const response = (path, record) => path === '/api/runtime' ? runtime : path.endsWith('/results/state.json') ? {} : record;

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
  assert.equal(vm.runInContext('workbook.id',f.context),'new-workbook');assert.match(f.get('message').textContent,/AI is off/);
  assert.equal(f.get('eventName').value,'Selected Event');assert.equal(f.storage.get('rrTargetName'),'Selected Event');
  assert.equal(f.get('rr').files[0].name,'new.xlsx');assert.match(f.get('rrSelection').textContent,/Saved: new.xlsx/);
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
  assert.equal(f.get('cost').textContent, '$0.50 this run · $13.81 including prior spending');
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
  const f = fixture(path => path.endsWith('/results/state.json') ? { activity: 'Read-only recovery failed' } : response(path, { id: 'job', status: 'REVIEW_REQUIRED', phase: 'AWAITING_INPUT' }));
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
  assert.match(f.get('completionCount').textContent,/not independent acceptance/);assert.match(f.get('activity').children[0].textContent,/2030.*bash started/);
});
test('finished and historical runs show execution results, never a mandatory review label',async()=>{
  for(const status of ['DONE','INCOMPLETE','FINISHED','REVIEW_REQUIRED','STOPPED','STOPPED_REQUIRES_REVIEW']){
    const f=fixture(path=>path==='/api/runtime'?{ownership:'USER'}:path.endsWith('/results/state.json')?{completed:['saved-object'],currentAction:'Review required'}:response(path,{id:'job',status,reviewRequired:'Review saved results',lastAssistantText:'Created one item; another is blocked.'}));
    await turn();
    assert.equal(f.get('status').textContent,status.includes('STOPPED')?'STOPPED':status==='DONE'?'DONE':'INCOMPLETE');
    for(const id of ['status','stage','action','completionTitle'])assert.doesNotMatch(f.get(id).textContent,/review|required/i);
    assert.match(f.get('agentReply').textContent,/Created one item/);
    assert.equal(f.get('take').disabled,true);
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
