import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const runtime = { ownership: 'AGENT', loginFirst: true };
const turn = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
function fixture(fetcher) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { value: '', files: [], disabled: false, hidden: false, textContent: '', checked: false,
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); } },
        focus() { this.focused = true; }, scrollIntoView() { this.scrolled = true; }, querySelector() { return get('viewerIframe'); },
        replaceChildren(...children) { this.children = children; } });
    }
    return elements.get(id);
  };
  const context = vm.createContext({ document: { getElementById: get, createElement: () => ({}) }, sessionStorage: { getItem: key => key === 'rrJobId' ? 'job' : key === 'rrTargetName' ? 'Selected Event' : null, setItem() {} }, setInterval() {}, FormData: class { append() {} }, fetch: async (path, options) => { const data = await (path === '/api/jobs' && !options?.method ? [] : fetcher(path, options)); return { ok: true, json: async () => data }; } });
  vm.runInContext(source, context);
  return { get, context };
}
const response = (path, record) => path === '/api/runtime' ? runtime : path.endsWith('/results/state.json') ? {} : record;

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
