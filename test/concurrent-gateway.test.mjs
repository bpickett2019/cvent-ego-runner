import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createGateway } from '../deploy/azure/gateway.mjs';
import { createSharedEventSafety } from '../app/shared-event-safety.mjs';

async function fixture(t, sameEvent = false) {
  const directory = mkdtempSync(join(tmpdir(), 'concurrent-http-')), origin = 'https://concurrent.example.test';
  const jobs = [1, 2, 3].map(workspace => ({ workspace, id: randomUUID(), contextId: randomUUID(), eventId: randomUUID(), running: false, stopped: false }));
  if (sameEvent) jobs[1].eventId = jobs[0].eventId;
  const starts = [], requests = [], backends = []; let denyPeer = false, mismatch = false, beforeReply = async () => {};
  for (const job of jobs) {
    const verify = createSharedEventSafety({ workspaceId: job.workspace, requireEventLease: true });
    const server = http.createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      let body; try { body = raw ? JSON.parse(raw) : {}; } catch { res.writeHead(400); return res.end('{}'); }
      requests.push({ workspace: job.workspace, path: req.url, method: req.method });
      res.setHeader('content-type', 'application/json');
      const send = v => res.end(JSON.stringify(v));
      if (req.url === '/api/internal/event-holds') return send({ protocol: 'shared-event-safety-v1', workspace: job.workspace, enforced: true, complete: true, eventLeasesEnforced: !(denyPeer && job.workspace === 3), holds: [] });
      if (req.url === '/api/internal/concurrent-target') {
        if (body.jobId !== job.id) { res.writeHead(409); return send({ error: 'Wrong job' }); }
        return send({ protocol: 'workspace-event-target-v1', workspace: job.workspace, jobId: job.id, contextId: job.contextId, eventId: job.eventId, canRebind: !job.running });
      }
      if (req.url.startsWith('/api/execution-clearance/')) return send({ version: 1, jobId: job.id, cleared: job.stopped, resourcesCleared: job.stopped, uncertaintyBlocked: false, resourceBlockers: job.stopped ? [] : ['JOB_NOT_SETTLED'], uncertaintyBlockers: [] });
      if (req.url.endsWith('/stop')) { job.running = false; job.stopped = true; return send({ stopped: true }); }
      if (req.url === '/api/new-rr') {
        job.running = false; job.stopped = true;
        return send({ cleared: true, resetScope: 'WORKSPACE', clearScope: 'CURRENT_RR_CONTEXT', aiStarted: false, executionHoldsCleared: false });
      }
      if (req.url.endsWith('/answer')) {
        try {
          verify({ req, record: job, target: { apiEventId: mismatch ? randomUUID() : job.eventId, evtstub: job.eventId } });
          assert.equal(body.returnControl, true); assert.equal(req.headers['x-cvent-staging-user'], undefined);
          starts.push(job.workspace); job.running = true; await beforeReply(job.workspace);
          return send({ aiStarted: true });
        } catch { res.writeHead(409); return send({ error: 'Backend identity/lease mismatch' }); }
      }
      return send({ ready: true });
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); backends.push(server);
  }
  const gateway = createGateway({ origin, expiresAt: new Date(Date.now() + 60000).toISOString(), ports: backends.map(s => s.address().port), executionSlotDirectory: directory, concurrentWorkspaces: 3 });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  t.after(async () => { await Promise.all([gateway, ...backends].map(s => new Promise(r => { s.close(r); s.closeAllConnections(); }))); rmSync(directory, { recursive: true, force: true }); });
  const request = (workspace, path, body, extra = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: gateway.address().port, path: `/workspaces/${workspace}${path}`, method: body === undefined ? 'GET' : 'POST', headers: { host: 'concurrent.example.test', 'x-cvent-staging-user': 'fixture-user', origin, 'content-type': 'application/json', ...extra } }, res => {
      let raw = ''; res.on('data', c => raw += c); res.on('end', () => { let data; try { data = JSON.parse(raw); } catch { data = raw; } resolve({ status: res.statusCode, data }); });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const start = (n, extra) => request(n, `/api/jobs/${jobs[n - 1].id}/answer`, { returnControl: true }, extra);
  const state = () => JSON.parse(readFileSync(join(directory, 'workspace-active.json'), 'utf8'));
  return { jobs, starts, requests, request, start, state, denyPeer: v => denyPeer = v, mismatch: v => mismatch = v, beforeReply: fn => beforeReply = fn };
}
test('real HTTP gateway admits three different events together, advertises per-workspace capacity and isolates Stop/Clear', async t => {
  const f = await fixture(t);
  const result = await Promise.all([1, 2, 3].map(n => f.start(n, { 'x-cvent-event-safety': 'forged' })));
  assert.deepEqual(result.map(r => r.status), [200, 200, 200]); assert.equal(f.jobs.filter(j => j.running).length, 3); assert.equal(f.starts.length, 3);
  for (const n of [1, 2, 3]) { const r = await f.request(n, '/api/execution-status'); assert.equal(r.data.version, 2); assert.equal(r.data.workspace, n); assert.equal(r.data.capacity, 'HELD'); assert.equal(r.data.availableWorkspaces, 0); }
  const before = f.state().claims;
  assert.equal((await f.request(2, `/api/jobs/${f.jobs[1].id}/stop`, {})).status, 200);
  const cleared = await f.request(2, '/api/new-rr', { replaceWorkspace: true }); assert.equal(cleared.data.sharedSlotStatus, 'RELEASED');
  assert.deepEqual(f.state().claims, before.filter(c => c.workspace !== 2)); assert.equal(f.jobs[0].running, true); assert.equal(f.jobs[2].running, true);
  assert.equal((await f.request(2, '/api/execution-status')).data.capacity, 'AVAILABLE');
});
test('HTTP same-event race forwards only one build, while another event remains available', async t => {
  const f = await fixture(t, true); const results = await Promise.all([f.start(1), f.start(2), f.start(3)]);
  assert.equal(results.filter(r => r.status === 200).length, 2); assert.equal(f.starts.length, 2);
  assert.equal(results.find(r => r.status === 409).data.code, 'EVENT_ALREADY_RUNNING');
});
test('HTTP lease identity disagreement is rejected by the backend before mocked execution', async t => {
  const f = await fixture(t); f.mismatch(true); assert.equal((await f.start(1)).status, 409); assert.equal(f.starts.length, 0);
});
test('HTTP incompatible peer refuses new handoff but Stop and read-only routes are responsive', async t => {
  const f = await fixture(t); f.denyPeer(true);
  assert.equal((await f.start(1)).data.code, 'SHARED_EVENT_SAFETY_UNAVAILABLE'); assert.equal(f.starts.length, 0);
  assert.equal((await f.request(1, `/api/jobs/${f.jobs[0].id}/stop`, {})).status, 200);
  for (const route of ['/api/internal/concurrent-target', '/API/INTERNAL/concurrent-target/', '/api/%69nternal/concurrent-target']) assert.equal((await f.request(1, route, { jobId: f.jobs[0].id })).status, 404);
});
test('HTTP pending handoff cannot be duplicated; a different workspace need not wait for its response', async t => {
  const f = await fixture(t); let entered, release; const enteredP = new Promise(r => entered = r), wait = new Promise(r => release = r);
  f.beforeReply(async n => { if (n === 1) { entered(); await wait; } });
  const pending = f.start(1); await enteredP;
  assert.equal((await f.start(1)).data.code, 'WORKSPACE_HANDOFF_BUSY'); assert.equal((await f.start(2)).status, 200);
  release(); assert.equal((await pending).status, 200); assert.deepEqual(f.starts.sort(), [1, 2]);
});
