import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { createGateway, routeWorkspace } from '../deploy/azure/gateway.mjs';
import { createSharedEventSafety } from '../app/shared-event-safety.mjs';
import { isLocalRequest } from '../app/rr-connection.mjs';
import { localWorkspaceConfig } from '../public/workspace-config.js';
import { workspaceBase, workspacePath, scopedStorage } from '../public/workspace-routing.js';
const origin = 'https://staging.example.test';
async function fixture(t, expired = false, executionSlotDirectory, serveUI = false, clearanceStatus, inventoryStatus, verifyHandoff, resetBehavior) {
  const backends = [], websocketServers = [], backendRequests = [], acceptedHandoffs = [];
  for (let id = 1; id <= 3; id++) {
    const backend = http.createServer((req, res) => {
      let body = ''; req.on('data', b => body += b); req.on('end', () => {
        backendRequests.push({ workspace: id, method: req.method, path: req.url });
        if (resetBehavior && req.method === 'POST' && req.url === '/api/new-rr') {
          Promise.resolve(resetBehavior(id, JSON.parse(body || '{}'))).then(value => {
            res.writeHead(value.status || 200, { 'Content-Type': 'application/json' });
            res.end(typeof value.body === 'string' ? value.body : JSON.stringify(value.body));
          }, () => { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error:'Fixture reset denied' })); });
          return;
        }
        if (req.method === 'GET' && req.url === '/api/internal/event-holds') {
          res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(inventoryStatus ? inventoryStatus(id) : { protocol: 'shared-event-safety-v1', workspace: id, enforced: true, complete: true, holds: [] }));
        }
        if (clearanceStatus && req.method === 'GET' && req.url.startsWith('/api/execution-clearance/')) {
          res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(clearanceStatus(req.url.split('/').at(-1))));
        }
        if (serveUI && req.method === 'GET' && (req.url === '/' || /^\/[a-z-]+\.js$/.test(req.url))) {
          const name = req.url === '/' ? 'index.html' : req.url.slice(1);
          try {
            res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
            return res.end(readFileSync(new URL('../public/' + name, import.meta.url)));
          } catch { res.writeHead(404); return res.end('Missing UI asset'); }
        }
        if (verifyHandoff && req.method === 'POST' && /^\/api\/jobs\/[0-9a-f-]{36}\/(?:answer|resume|rpc)$/.test(req.url)) {
          try { verifyHandoff(req, id); acceptedHandoffs.push({ workspace: id, path: req.url }); }
          catch (error) { res.writeHead(409, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: error.message })); }
        }
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ id, path: req.url, local: isLocalRequest(req), headers: req.headers, body }));
      });
    });
    const wss = new WebSocketServer({ server: backend });
    wss.on('connection', (ws, req) => ws.send(JSON.stringify({ id, path: req.url, local: isLocalRequest(req) })));
    backend.listen(0, '127.0.0.1'); await once(backend, 'listening'); backends.push(backend); websocketServers.push(wss);
  }
  const gateway = createGateway({ origin, expiresAt: new Date(Date.now() + (expired ? -1000 : 60000)).toISOString(), ports: backends.map(b => b.address().port), executionSlotDirectory });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  t.after(async () => {
    for (const wss of websocketServers) { for (const ws of wss.clients) ws.terminate(); wss.close(); }
    await Promise.all([gateway, ...backends].map(s => new Promise(r => { s.close(r); s.closeAllConnections(); })));
  });
  const headers = { host: 'staging.example.test', 'x-cvent-staging-user': 'authenticated-test-user', origin };
  const request = (path, custom = {}, method = 'GET', body = '') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: gateway.address().port, path, method, headers: { ...headers, ...custom } }, res => {
      let text = ''; res.on('data', b => text += b); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    }); req.on('error', reject); req.end(body);
  });
  return { gateway, headers, request, backendRequests, acceptedHandoffs };
}
test('gateway routes three instances, strips credentials and passes existing loopback guard', async t => {
  const f = await fixture(t);
  for (const id of [1, 2, 3]) {
    const r = await f.request(`/workspaces/${id}/api/jobs?x=1`, { authorization: 'Basic TEST', cookie: 'private=TEST', 'x-forwarded-for': 'untrusted' }, 'POST', 'fixture');
    assert.equal(r.status, 200); const value = JSON.parse(r.text);
    assert.equal(value.id, id); assert.equal(value.path, '/api/jobs?x=1'); assert.equal(value.body, 'fixture'); assert.equal(value.local, true);
    for (const key of ['authorization', 'cookie', 'x-cvent-staging-user', 'x-forwarded-for']) assert.equal(value.headers[key], undefined);
    const config = JSON.parse((await f.request(`/workspaces/${id}/local-workspaces.json`)).text);
    assert.equal(localWorkspaceConfig(config, origin, `/workspaces/${id}/`).current, id);
  }
});
test('gateway requires trusted proxy identity/host/origin, redirects root and rejects unknown routes', async t => {
  const f = await fixture(t);
  for (const headers of [{ 'x-cvent-staging-user': '' }, { host: 'evil.test' }, { origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await f.request('/workspaces/1/api/jobs', headers)).status, 403);
  assert.equal((await f.request('/')).headers.location, '/workspaces/1/');
  assert.equal((await f.request('/workspaces/2')).headers.location, '/workspaces/2/');
  assert.equal((await f.request('/api/jobs')).status, 404);
  assert.equal((await f.request('/workspaces/4/')).status, 404);
});
test('canonical homepage loads the actual UI module graph and matching workspace configuration', async t => {
  const f = await fixture(t, false, undefined, true);
  for (const entry of ['/', '/index.html', '/?view=build', '/index.html?view=build']) {
    const redirect = await f.request(entry);
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, '/workspaces/1/' + (entry.includes('?') ? '?view=build' : ''));
  }
  for (const id of [1, 2, 3]) {
    const prefix = `/workspaces/${id}/`;
    const html = await f.request(prefix);
    assert.equal(html.status, 200);
    const entry = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html.text)?.[1];
    assert.ok(entry, 'real entrypoint must be a module');
    const queue = [new URL(entry, origin + prefix).pathname], visited = new Set();
    while (queue.length) {
      const path = queue.shift(); if (visited.has(path)) continue;
      visited.add(path); assert.ok(path.startsWith(prefix), 'module must stay in its workspace');
      const asset = await f.request(path);
      assert.equal(asset.status, 200, path); assert.match(asset.headers['content-type'], /javascript/);
      for (const match of asset.text.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.\.?\/[^'"]+\.js)['"]/g)) {
        queue.push(new URL(match[1], origin + path).pathname);
      }
    }
    for (const name of ['app.js', 'requirement-progress.js', 'workspace-routing.js', 'workspace-config.js']) assert.ok(visited.has(prefix + name), name);
    const config = JSON.parse((await f.request(prefix + 'local-workspaces.json')).text);
    assert.equal(localWorkspaceConfig(config, origin, prefix).current, id);
  }
});
const resetResult = () => ({cleared:true,resetScope:'WORKSPACE',clearScope:'CURRENT_RR_CONTEXT',executionHoldsCleared:false,aiStarted:false,rrContext:{id:randomUUID(),jobId:null,workbookId:null}});
test('HTTP Clear waits for actual backend success and cleanup, then releases only that workspace',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'gateway-reset-')),owner=randomUUID();let stopped=false;
  const f=await fixture(t,false,directory,false,id=>({cleared:id===owner&&stopped}),undefined,undefined,
    (workspace,body)=>{assert.equal(body.replaceWorkspace,true);if(workspace===1)stopped=true;return {body:resetResult()};});
  assert.equal((await f.request(`/workspaces/1/api/jobs/${owner}/answer`,{},'POST','{}')).status,200);
  const before=readFileSync(join(directory,'active.json'),'utf8');
  const elsewhere=await f.request('/workspaces/2/api/new-rr',{'content-type':'application/json'},'POST','{"replaceWorkspace":true}');
  assert.equal(elsewhere.status,200);assert.equal(JSON.parse(elsewhere.text).sharedSlotStatus,'OTHER_WORKSPACE');assert.equal(stopped,false);assert.equal(readFileSync(join(directory,'active.json'),'utf8'),before);
  const result=await f.request('/workspaces/1/api/new-rr',{'content-type':'application/json'},'POST','{"replaceWorkspace":true}');
  assert.equal(result.status,200);assert.equal(JSON.parse(result.text).sharedSlotReleased,true);assert.equal(existsSync(join(directory,'active.json')),false);
  assert.equal(readFileSync(join(directory,`${JSON.parse(before).claimId}.released.json`),'utf8'),before);
  assert.equal(JSON.parse((await f.request('/workspaces/1/api/new-rr',{},'POST','{"replaceWorkspace":true}')).text).sharedSlotStatus,'EMPTY');
  assert.equal(f.backendRequests.filter(r=>r.workspace===3&&r.method==='POST').length,0);
});
for(const mode of ['denied','malformed','oversized','not-cleaned'])test(`HTTP reset ${mode} retains its reservation without mutation retry`,async t=>{
  const directory=mkdtempSync(join(tmpdir(),'gateway-reset-fail-')),owner=randomUUID();let calls=0;
  const f=await fixture(t,false,directory,false,()=>({cleared:false}),undefined,undefined,()=>{
    calls++;return mode==='denied'?{status:409,body:{error:'Stop failed'}}:mode==='malformed'?{body:'not JSON'}:mode==='oversized'?{body:JSON.stringify({padding:'x'.repeat(18000)})}:{body:resetResult()};
  });
  await f.request(`/workspaces/1/api/jobs/${owner}/answer`,{},'POST','{}');const before=readFileSync(join(directory,'active.json'),'utf8');
  const result=await f.request('/workspaces/1/api/new-rr',{},'POST','{}');assert.equal(result.status,mode==='not-cleaned'?200:409);
  if(mode==='not-cleaned'){const b=JSON.parse(result.text);assert.equal(b.cleared,true);assert.equal(b.sharedSlotReleased,false);assert.equal(b.sharedSlotStatus,'REVIEW_REQUIRED');}
  assert.equal(calls,1);assert.equal(readFileSync(join(directory,'active.json'),'utf8'),before);
});
test('live HTTP gate forwards only one handoff and preserves Stop/preview across workspaces', async t => {
  const f = await fixture(t, false, mkdtempSync(join(tmpdir(), 'gateway-slot-')));
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const attempts = await Promise.all(ids.map((id, i) => f.request(`/workspaces/${i + 1}/api/jobs/${id}/answer`, {}, 'POST', '{}')));
  assert.equal(attempts.filter(r => r.status === 200).length, 1);
  assert.equal(attempts.filter(r => r.status === 409).length, 2);
  const holder = attempts.findIndex(r => r.status === 200);
  for (const [i, id] of ids.entries()) {
    assert.equal((await f.request(`/workspaces/${i + 1}/api/jobs/${id}/resume`, {}, 'POST', '{}')).status, i === holder ? 200 : 409);
    assert.equal((await f.request(`/workspaces/${i + 1}/api/jobs/${id}/resume/`, {}, 'POST', '{}')).status, 409);
    assert.equal((await f.request(`/workspaces/${i + 1}/api/jobs/${id}/stop`, {}, 'POST', '{}')).status, 200);
    assert.equal((await f.request(`/workspaces/${i + 1}/api/jobs/${id}/read`, {}, 'POST', '{}')).status, 200);
    assert.equal((await f.request(`/workspaces/${i + 1}/api/jobs/${id}/answer/`, {}, 'POST', '{}')).status, 409);
    assert.equal((await f.request(`/workspaces/${i + 1}/api/target`, {}, 'POST', '{}')).status, 409);
  }
});
test('HTTP resource release frees another event but the verified backend still rejects the uncertain event', async t => {
  const owner = randomUUID(), next = randomUUID(), eventId = randomUUID(); let stopped = false, candidateEvent = eventId;
  const directory = mkdtempSync(join(tmpdir(), 'gateway-safety-'));
  const guards = [1, 2, 3].map(workspaceId => createSharedEventSafety({ workspaceId }));
  const f = await fixture(t, false, directory, false, id => ({ version: 1, jobId: id, cleared: false,
    resourcesCleared: stopped && id === owner, uncertaintyBlocked: id === owner,
    resourceBlockers: stopped && id === owner ? [] : ['JOB_NOT_SETTLED'], uncertaintyBlockers: id === owner ? ['BROWSER_SAVE_UNCERTAIN'] : [], privateDetail: 'PRIVATE_SECRET' }),
    workspace => ({ protocol: 'shared-event-safety-v1', workspace, enforced: true, complete: true,
      holds: stopped && workspace === 3 ? [{ jobId: owner, eventId }] : [] }),
    (req, workspace) => {
      const id = req.url.split('/')[3], resolvedEvent = id === owner ? eventId : candidateEvent;
      guards[workspace - 1]({ req, record: { id }, target: { apiEventId: resolvedEvent, evtstub: resolvedEvent } });
    });
  assert.equal((await f.request(`/workspaces/3/api/jobs/${owner}/answer`, {}, 'POST', '{}')).status, 200);
  const claim = readFileSync(join(directory, 'active.json'), 'utf8'); stopped = true;
  const denied = await f.request(`/workspaces/1/api/jobs/${next}/answer`, {}, 'POST', '{}');
  assert.equal(denied.status, 409); const result = JSON.parse(denied.text);
  assert.match(result.error, new RegExp(`Workspace 3, run ${owner}`)); assert.match(result.error, /Read-only reconciliation/); assert.doesNotMatch(denied.text, /PRIVATE/);
  assert.equal(readFileSync(join(directory, `${JSON.parse(claim).claimId}.released.json`), 'utf8'), claim);
  assert.equal(JSON.parse(readFileSync(join(directory, 'active.json'))).jobId, next);
  assert.equal(f.acceptedHandoffs.length, 1, 'uncertain event never reaches the mocked execution boundary');
  candidateEvent = randomUUID(); // New explicit pre-AI correction; fixture represents the API-resolved ID, not body input.
  assert.equal((await f.request(`/workspaces/1/api/jobs/${next}/answer`, {}, 'POST', '{}')).status, 200);
  assert.equal(f.acceptedHandoffs.length, 2);
  const badRoute = await f.request('/workspaces/1/api/target', {}, 'POST', '{}');
  assert.equal(JSON.parse(badRoute.text).code, 'ROUTE_DENIED');
});
test('gateway replaces forged caller safety headers and hides internal inventory routes', async t => {
  const f = await fixture(t, false, mkdtempSync(join(tmpdir(), 'gateway-proof-'))), id = randomUUID();
  const result = await f.request(`/workspaces/2/api/jobs/${id}/answer`, { 'x-cvent-event-safety': 'PRIVATE_FORGED_PROOF' }, 'POST', '{}');
  assert.equal(result.status, 200);
  const forwarded = JSON.parse(result.text), proof = JSON.parse(Buffer.from(forwarded.headers['x-cvent-event-safety'], 'base64'));
  assert.equal(proof.jobId, id); assert.equal(proof.workspace, 2); assert.equal(proof.operation, 'answer'); assert.equal(proof.inventories.length, 3);
  assert.doesNotMatch(JSON.stringify(proof), /PRIVATE/);
  assert.equal(f.backendRequests.filter(r => r.path === '/api/internal/event-holds').length, 3);
  const before = f.backendRequests.length;
  for (const route of ['/api/internal/event-holds', '/API/INTERNAL/event-holds/', '/api/%69nternal/event-holds?x=1']) {
    assert.equal((await f.request('/workspaces/2' + route)).status, 404);
  }
  assert.equal(f.backendRequests.length, before);
});
test('one old or incompletely scanned peer blocks HTTP paid handoff while Stop remains available', async t => {
  for (const badWorkspace of [1, 2, 3]) {
    const f = await fixture(t, false, mkdtempSync(join(tmpdir(), 'gateway-peer-')), false, undefined, id => ({
      protocol: 'shared-event-safety-v1', workspace: id, enforced: id !== badWorkspace, complete: false, holds: [], secret: 'PRIVATE'
    }));
    const id = randomUUID(), denied = await f.request(`/workspaces/1/api/jobs/${id}/answer`, {}, 'POST', '{}');
    assert.equal(denied.status, 409); assert.equal(JSON.parse(denied.text).code, 'SHARED_EVENT_SAFETY_UNAVAILABLE');
    assert.doesNotMatch(denied.text, /PRIVATE/); assert.equal(f.backendRequests.filter(r => r.method === 'POST').length, 0);
    assert.equal((await f.request(`/workspaces/1/api/jobs/${id}/stop`, {}, 'POST', '{}')).status, 200);
  }
});
test('readiness GET returns a sanitized observation without reserving capacity or sending a POST', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'gateway-readiness-'));
  const f = await fixture(t, false, directory);
  const result = await f.request('/workspaces/2/api/execution-status');
  assert.equal(result.status, 200); const status = JSON.parse(result.text);
  assert.equal(status.scope, 'shared'); assert.equal(status.capacity, 'AVAILABLE'); assert.equal(status.holdCount, 0);
  assert.equal(f.backendRequests.filter(r => r.method === 'POST').length, 0);
  assert.throws(() => readFileSync(join(directory, 'active.json')), { code: 'ENOENT' });
});
test('restricted staging expiry fails closed', async t => { const f = await fixture(t, true); assert.equal((await f.request('/')).status, 503); });
test('websocket viewer goes only to the assigned workspace with normalized origin', async t => {
  const f = await fixture(t);
  for (const id of [1, 2, 3]) {
    const ws = new WebSocket(`ws://127.0.0.1:${f.gateway.address().port}/workspaces/${id}/steel-cast?session=fixture`, { headers: f.headers });
    const [message] = await once(ws, 'message'); const value = JSON.parse(message);
    assert.equal(value.id, id); assert.equal(value.local, true); assert.equal(value.path, '/steel-cast?session=fixture');
    ws.close(); await once(ws, 'close');
  }
});
test('wrong-origin and expired websocket handshakes are denied', async t => {
  for (const expired of [false, true]) {
    const f = await fixture(t, expired);
    const ws = new WebSocket(`ws://127.0.0.1:${f.gateway.address().port}/workspaces/1/steel-cast`, { headers: { ...f.headers, origin: expired ? origin : 'https://evil.test' } });
    ws.on('error', () => {});
    const status = await new Promise(resolve => ws.on('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode); ws.terminate(); }));
    assert.equal(status, 403);
  }
});
test('path parsing and same-origin UI routing fail closed without cross-workspace storage', () => {
  for (const path of ['/workspaces/1/../2/api/jobs', '/workspaces/1/%2fapi/jobs', '/workspaces/1/\\api/jobs', '//workspaces/1/', '/workspaces/9/']) assert.equal(routeWorkspace(path), null);
  const data = new Map(), storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  for (const id of [1, 2, 3]) {
    const base = workspaceBase(`/workspaces/${id}/`); assert.equal(workspacePath(base, '/viewer'), `/workspaces/${id}/viewer`);
    scopedStorage(storage, base).setItem('rrJobId', id);
  }
  for (const id of [1, 2, 3]) assert.equal(scopedStorage(storage, `/workspaces/${id}`).getItem('rrJobId'), id);
  assert.equal(scopedStorage(storage, '').getItem('rrJobId'), undefined);
  assert.throws(() => workspacePath('/workspaces/1', '//evil.test'));
  const value = { version: 1, mode: 'staging', current: 1, workspaces: [1, 2, 3].map(id => ({ id, url: `${origin}/workspaces/${id}/` })) };
  assert.throws(() => localWorkspaceConfig(value, origin, '/workspaces/2/'));
  value.workspaces[2].url = 'https://evil.test/workspaces/3/';
  assert.throws(() => localWorkspaceConfig(value, origin, '/workspaces/1/'));
});
