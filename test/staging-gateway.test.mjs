import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { createGateway, routeWorkspace } from '../deploy/azure/gateway.mjs';
import { isLocalRequest } from '../app/rr-connection.mjs';
import { localWorkspaceConfig } from '../public/workspace-config.js';
import { workspaceBase, workspacePath, scopedStorage } from '../public/workspace-routing.js';
const origin = 'https://staging.example.test';
async function fixture(t, expired = false, executionSlotDirectory, serveUI = false) {
  const backends = [], websocketServers = [];
  for (let id = 1; id <= 3; id++) {
    const backend = http.createServer((req, res) => {
      let body = ''; req.on('data', b => body += b); req.on('end', () => {
        if (serveUI && req.method === 'GET' && (req.url === '/' || /^\/[a-z-]+\.js$/.test(req.url))) {
          const name = req.url === '/' ? 'index.html' : req.url.slice(1);
          try {
            res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
            return res.end(readFileSync(new URL('../public/' + name, import.meta.url)));
          } catch { res.writeHead(404); return res.end('Missing UI asset'); }
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
  return { gateway, headers, request };
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
test('live HTTP gate forwards only one handoff and preserves Stop/preview across workspaces', async t => {
  const f = await fixture(t, false, mkdtempSync(join(tmpdir(), 'gateway-slot-')));
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const attempts = await Promise.all(ids.map((id, i) => f.request(`/workspaces/${i + 1}/api/jobs/${id}/answer`, {}, 'POST', '{}')));
  assert.equal(attempts.filter(r => r.status === 200).length, 1);
  assert.equal(attempts.filter(r => r.status === 409).length, 2);
  for (const [i, id] of ids.entries()) {
    assert.equal((await f.request(`/workspaces/${i + 1}/api/jobs/${id}/stop`, {}, 'POST', '{}')).status, 200);
    assert.equal((await f.request(`/workspaces/${i + 1}/api/jobs/${id}/read`, {}, 'POST', '{}')).status, 200);
    assert.equal((await f.request(`/workspaces/${i + 1}/api/jobs/${id}/answer/`, {}, 'POST', '{}')).status, 409);
    assert.equal((await f.request(`/workspaces/${i + 1}/api/target`, {}, 'POST', '{}')).status, 409);
  }
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
