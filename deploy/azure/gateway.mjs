// Expiring staging gateway. Legacy mode trusts Caddy Basic identity; form-login
// mode requires gateway sessions and ignores supplied identity headers. Loopback only.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createExecutionSlot, slotErrorResponse } from './execution-slot.mjs';
import { boundedJson, collectEventInventories, collectEventSafety, readExecutionStatus } from './event-safety.mjs';
import { createWorkspaceSlots } from './workspace-slots.mjs';
import { createLogin } from './login.mjs';

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
// External links and their redirects are cross-site even after Basic authentication.
// Permit only safe top-level dashboard documents, never APIs, assets, frames or viewers.
function dashboardNavigation(req) {
  if (!['GET', 'HEAD'].includes(req.method) || req.headers['sec-fetch-mode'] !== 'navigate' || req.headers['sec-fetch-dest'] !== 'document') return false;
  if (/^\/(?:index\.html)?(?:\?[^\\\x00-\x20]*)?$/.test(req.url) || /^\/workspaces\/[123]$/.test(req.url)) return true;
  const route = routeWorkspace(req.url);
  return !!route && /^\/(?:index\.html)?(?:\?[^\\\x00-\x20]*)?$/.test(route.path);
}
export function createGateway({ origin, expiresAt, ports = [18781, 18782, 18783], now = Date.now, executionSlotDirectory, concurrentWorkspaces = 1, login: loginOptions = null }) {
  if (![1, 3].includes(concurrentWorkspaces) || concurrentWorkspaces === 3 && !executionSlotDirectory) throw new Error('Invalid concurrent workspace configuration');
  const concurrent = concurrentWorkspaces === 3;
  const url = new URL(origin), expiry = Date.parse(expiresAt);
  if (url.protocol !== 'https:' || url.origin !== origin || !Number.isFinite(expiry) || ports.length !== 3 || new Set(ports).size !== 3 || ports.some(p => !Number.isInteger(p) || p < 1024 || p > 65535)) throw new Error('Invalid gateway configuration');
  const login = loginOptions ? createLogin({ ...loginOptions, origin, expiresAt, now }) : null;
  function trusted(req) {
    const loginNavigation = login && req.method === 'GET' && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document' && /^\/login(?:\?[^\\\x00-\x20]*)?$/.test(req.url);
    return ['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.socket.remoteAddress)
      && req.headers.host === url.host
      && (!req.headers.origin || req.headers.origin === origin)
      && (req.headers['sec-fetch-site'] !== 'cross-site' || dashboardNavigation(req) || loginNavigation)
      && (!login || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.headers.origin === origin);
  }
  function authorized(req) {
    return trusted(req) && (login ? Boolean(login.get(req)) : typeof req.headers['x-cvent-staging-user'] === 'string' && /^[^\r\n]{1,200}$/.test(req.headers['x-cvent-staging-user']));
  }
  function headers(req) {
    const result = { ...req.headers, host: '127.0.0.1:8788' };
    for (const key of Object.keys(result)) if (/^(?:authorization|proxy-authorization|cookie|forwarded|x-forwarded-.*|x-cvent-.*)$/i.test(key)) delete result[key];
    if (result.origin) result.origin = 'http://127.0.0.1:8788';
    // The backend checks this metadata too. Normalize only the already-authorized
    // dashboard document on our trusted loopback hop, never an API or mutation.
    if (result['sec-fetch-site'] === 'cross-site' && dashboardNavigation(req)) result['sec-fetch-site'] = 'same-origin';
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
    if (!trusted(req)) { res.writeHead(403); return res.end('Trusted staging origin required'); }
    if (login && now() >= expiry) { res.writeHead(503); return res.end('Restricted staging access expired; operator renewal required'); }
    if (login && await login.handle(req, res)) return;
    if (!authorized(req)) {
      if (login) return login.deny(req, res);
      res.writeHead(403); return res.end('Authenticated staging access required');
    }
    login?.track(req, res);
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
      return res.end(JSON.stringify({ version: 1, mode: 'staging', current: route.id, sessionLogin: Boolean(login),
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
      const cancelled = () => req.aborted || res.destroyed || Boolean(login && !login.get(req));
      const admission = await slot?.authorize(route.id, route.path, req.method, { body, cancelled });
      const eventSafety = concurrent ? admission?.header : admission;
      if (concurrent && admission) { finishHandoff = admission.finish; res.once('finish', finishHandoff); res.once('close', finishHandoff); }
      if (eventSafety) upstreamHeaders['x-cvent-event-safety'] = eventSafety;
    }
    catch (error) { finishHandoff(); if (!res.destroyed) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(slotErrorResponse(error))); } return; }
    if (req.aborted || res.destroyed || (login && !login.get(req))) { finishHandoff(); res.destroy(); return; } // Never forward an abandoned delayed handoff.
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
    login?.track(req, socket);
    const upstream = http.request({ host: '127.0.0.1', port: ports[route.id - 1], method: 'GET', path: route.path, headers: headers(req) });
    upstream.on('upgrade', (response, remote, remoteHead) => {
      if (socket.destroyed || (login && !login.get(req))) { remote.destroy(); socket.destroy(); return; }
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
  server.on('close', () => login?.close());
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Production startup requires an explicitly configured durable slot directory.
  if (!process.env.CVENT_EXECUTION_SLOT_DIR) throw new Error('Durable execution slot directory required');
  if (process.env.CVENT_LOGIN_ENABLED && !['true', 'false'].includes(process.env.CVENT_LOGIN_ENABLED)) throw new Error('Invalid login mode');
  const server = createGateway({ origin: process.env.CVENT_PUBLIC_ORIGIN, expiresAt: process.env.CVENT_STAGING_EXPIRES, executionSlotDirectory: process.env.CVENT_EXECUTION_SLOT_DIR, concurrentWorkspaces: process.env.CVENT_CONCURRENT_WORKSPACES === undefined ? 1 : Number(process.env.CVENT_CONCURRENT_WORKSPACES), login: process.env.CVENT_LOGIN_ENABLED === 'true' ? {} : null });
  server.listen(8890, '127.0.0.1');
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.close(); server.closeAllConnections(); setTimeout(() => process.exit(0), 1000).unref(); });
}
