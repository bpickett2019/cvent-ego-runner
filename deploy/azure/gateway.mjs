// Authenticated, expiring staging gateway. Caddy MUST authenticate every route
// and overwrite X-Cvent-Staging-User. Only loopback SSH forwards are upstreams.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createExecutionSlot, slotErrorResponse } from './execution-slot.mjs';
import { boundedJson, collectEventInventories, collectEventSafety, readExecutionStatus } from './event-safety.mjs';
import { createWorkspaceSlots } from './workspace-slots.mjs';

// One canonical reset request, no retries. Buffer only the bounded JSON receipt
// so capacity release is acknowledged after backend cleanup, not before it.
function forwardReset(req, res, port, headers) {
  return new Promise((resolve, reject) => {
    const upstream = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/new-rr', headers }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 16384) { response.destroy(); upstream.destroy(new Error('Reset receipt too large')); } else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => { try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch { reject(new Error('Invalid reset receipt')); } });
    });
    upstream.setTimeout(90000, () => upstream.destroy(new Error('Reset did not settle')));
    upstream.on('error', reject);
    req.on('aborted', () => upstream.destroy(new Error('Reset caller disconnected')));
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(new Error('Reset caller disconnected')); });
    req.pipe(upstream);
  });
}

export function routeWorkspace(raw) {
  if (typeof raw !== 'string' || /[\\\x00-\x20]/.test(raw) || /%(?:2e|2f|5c)/i.test(raw) || /(?:^|\/)\.{1,2}(?:\/|\?|$)/.test(raw)) return null;
  const match = /^\/workspaces\/([123])\/(.*)$/.exec(raw);
  return match ? { id: Number(match[1]), path: '/' + match[2] } : null;
}
export function createGateway({ origin, expiresAt, ports = [18781, 18782, 18783], now = Date.now, executionSlotDirectory, concurrentWorkspaces = 1 }) {
  if (![1, 3].includes(concurrentWorkspaces) || concurrentWorkspaces === 3 && !executionSlotDirectory) throw new Error('Invalid concurrent workspace configuration');
  const concurrent = concurrentWorkspaces === 3;
  const url = new URL(origin), expiry = Date.parse(expiresAt);
  if (url.protocol !== 'https:' || url.origin !== origin || !Number.isFinite(expiry) || ports.length !== 3 || new Set(ports).size !== 3 || ports.some(p => !Number.isInteger(p) || p < 1024 || p > 65535)) throw new Error('Invalid gateway configuration');
  function authorized(req) {
    return ['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.socket.remoteAddress)
      && req.headers.host === url.host && typeof req.headers['x-cvent-staging-user'] === 'string'
      && /^[^\r\n]{1,200}$/.test(req.headers['x-cvent-staging-user'])
      && (!req.headers.origin || req.headers.origin === origin)
      && req.headers['sec-fetch-site'] !== 'cross-site';
  }
  function headers(req) {
    const result = { ...req.headers, host: '127.0.0.1:8788' };
    for (const key of Object.keys(result)) if (/^(?:authorization|proxy-authorization|cookie|forwarded|x-forwarded-.*|x-cvent-.*)$/i.test(key)) delete result[key];
    if (result.origin) result.origin = 'http://127.0.0.1:8788';
    return result;
  }
  const clearance = async ({ workspace, jobId }) => {
      const response = await fetch(`http://127.0.0.1:${ports[workspace - 1]}/api/execution-clearance/${jobId}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const text = await response.text();
      if (text.length > 8192) return null;
      const value = JSON.parse(text);
      // Legacy full clearance remains supported. Resource-only release additionally
      // requires versioned cleanup proof and compatible all-workspace event guards.
      return value && Object.keys(value).length === 1 && typeof value.cleared === 'boolean' ? value.cleared : value;
    };
  const slot = !executionSlotDirectory ? null : concurrent ? createWorkspaceSlots({ directory: executionSlotDirectory, now, clearance,
    collectInventories: () => collectEventInventories({ ports }),
    resolveTarget: async ({ workspace, ...input }) => boundedJson(await fetch(`http://127.0.0.1:${ports[workspace - 1]}/api/internal/concurrent-target`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), redirect: 'error', signal: AbortSignal.timeout(30000),
    })),
  }) : createExecutionSlot({ directory: executionSlotDirectory, now, clearance,
    prepareHandoff: handoff => collectEventSafety({ ports, ...handoff, now }),
  });
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!authorized(req)) { res.writeHead(403); return res.end('Authenticated staging access required'); }
    if (now() >= expiry) { res.writeHead(503); return res.end('Restricted staging access expired; operator renewal required'); }
    // The UI resolves module imports, API calls and storage from this prefix.
    // Never serve a second root alias with an independently maintained asset list.
    const entry = /^\/(?:index\.html)?(\?.*)?$/.exec(req.url);
    if (entry && ['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(302, { Location: '/workspaces/1/' + (entry[1] || '') }); return res.end();
    }
    if (/^\/workspaces\/[123]$/.test(req.url)) { res.writeHead(308, { Location: req.url + '/' }); return res.end(); }
    const route = routeWorkspace(req.url);
    if (!route) { res.writeHead(404); return res.end('Unknown workspace route'); }
    // Inventory is only for the trusted gateway-to-backend loopback hop. Public
    // requests cannot query it, including Express case/encoding/trailing aliases.
    try {
      if (/^\/api\/internal(?:\/|$)/i.test(decodeURIComponent(route.path.split('?')[0]))) { res.writeHead(404); return res.end('Unknown workspace route'); }
    } catch { res.writeHead(404); return res.end('Unknown workspace route'); }
    if (route.path === '/local-workspaces.json' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ version: 1, mode: 'staging', current: route.id,
        workspaces: [1, 2, 3].map(id => ({ id, url: `${origin}/workspaces/${id}/` })) }));
    }
    if (slot && req.method === 'GET' && route.path === '/api/execution-status') {
      const status = await readExecutionStatus({ slot, ports, now, workspace: route.id, concurrent });
      if (req.destroyed || res.destroyed) return;
      if (now() >= expiry) { res.writeHead(503); return res.end('Restricted staging access expired'); }
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(status));
    }
    const upstreamHeaders = headers(req);
    if (slot && req.method === 'POST' && route.path === '/api/new-rr') {
      let response;
      try {
        const result = await slot.resetWorkspace(route.id, async () => {
          response = await forwardReset(req, res, ports[route.id - 1], upstreamHeaders);
          if (response.status !== 200) throw new Error('Backend reset refused');
          return response.body;
        });
        if (!res.destroyed) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); }
      } catch (error) {
        if (!res.destroyed) {
          res.writeHead(response?.status && response.status !== 200 ? response.status : 409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response?.status && response.status !== 200 ? response.body : slotErrorResponse(error)));
        }
      }
      return;
    }
    let bufferedBody, finishHandoff = () => {};
    try {
      let body;
      if (concurrent && req.method === 'POST' && /^\/api\/jobs\/[0-9a-f-]{36}\/(?:answer|resume|rpc)$/.test(route.path)) {
        const chunks = []; let size = 0;
        req.setTimeout(10000, () => req.destroy());
        for await (const chunk of req) { size += chunk.length; if (size > 100 * 1024) throw new Error('Body too large'); chunks.push(chunk); }
        req.setTimeout(0); bufferedBody = Buffer.concat(chunks); body = JSON.parse(bufferedBody.toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected JSON');
      }
      // A fully consumed IncomingMessage may be destroyed normally. Check the
      // caller/response, not body-stream destruction, before paid forwarding.
      const cancelled = () => req.aborted || res.destroyed;
      const admission = await slot?.authorize(route.id, route.path, req.method, { body, cancelled });
      const eventSafety = concurrent ? admission?.header : admission;
      if (concurrent && admission) { finishHandoff = admission.finish; res.once('finish', finishHandoff); res.once('close', finishHandoff); }
      if (eventSafety) upstreamHeaders['x-cvent-event-safety'] = eventSafety;
    }
    catch (error) { finishHandoff(); if (!res.destroyed) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(slotErrorResponse(error))); } return; }
    if (req.aborted || res.destroyed) { finishHandoff(); return; } // Never forward an abandoned delayed handoff.
    if (now() >= expiry) { finishHandoff(); res.writeHead(503); return res.end('Restricted staging access expired'); }
    if (bufferedBody) { delete upstreamHeaders['transfer-encoding']; upstreamHeaders['content-length'] = String(bufferedBody.length); }
    const upstream = http.request({ host: '127.0.0.1', port: ports[route.id - 1], method: req.method, path: route.path, headers: upstreamHeaders }, response => {
      const outgoing = { ...response.headers, 'cache-control': 'no-store' };
      delete outgoing['set-cookie'];
      if (outgoing.location?.startsWith('/') && !outgoing.location.startsWith('//')) outgoing.location = `/workspaces/${route.id}${outgoing.location}`;
      res.writeHead(response.statusCode, outgoing); response.pipe(res);
      response.on('error', () => res.destroy());
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Assigned workspace unavailable'); });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    if (bufferedBody) upstream.end(bufferedBody); else req.pipe(upstream);
  });
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const route = routeWorkspace(req.url);
    if (!authorized(req) || req.headers.origin !== origin || now() >= expiry || !route || !/^\/steel-cast(?:[/?]|$)/.test(route.path)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    const upstream = http.request({ host: '127.0.0.1', port: ports[route.id - 1], method: 'GET', path: route.path, headers: headers(req) });
    upstream.on('upgrade', (response, remote, remoteHead) => {
      remote.on('error', () => socket.destroy()); socket.on('error', () => remote.destroy());
      const lines = Object.entries(response.headers).filter(([key]) => key !== 'set-cookie').map(([key, value]) => `${key}: ${value}`);
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`);
      if (remoteHead.length) socket.write(remoteHead); if (head.length) remote.write(head);
      remote.pipe(socket).pipe(remote);
      const timer = setTimeout(() => { socket.destroy(); remote.destroy(); }, Math.min(expiry - now(), 2147483647)); timer.unref();
      socket.on('close', () => { clearTimeout(timer); remote.destroy(); }); remote.on('close', () => socket.destroy());
    });
    upstream.on('response', response => { response.resume(); socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'); });
    upstream.on('error', () => socket.destroy()); socket.on('close', () => upstream.destroy()); upstream.end();
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Production startup requires an explicitly configured durable slot directory.
  if (!process.env.CVENT_EXECUTION_SLOT_DIR) throw new Error('Durable execution slot directory required');
  const server = createGateway({ origin: process.env.CVENT_PUBLIC_ORIGIN, expiresAt: process.env.CVENT_STAGING_EXPIRES, executionSlotDirectory: process.env.CVENT_EXECUTION_SLOT_DIR, concurrentWorkspaces: process.env.CVENT_CONCURRENT_WORKSPACES === undefined ? 1 : Number(process.env.CVENT_CONCURRENT_WORKSPACES) });
  server.listen(8890, '127.0.0.1');
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.close(); server.closeAllConnections(); setTimeout(() => process.exit(0), 1000).unref(); });
}
