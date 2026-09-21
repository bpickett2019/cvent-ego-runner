// Authenticated, expiring staging gateway. Caddy MUST authenticate every route
// and overwrite X-Cvent-Staging-User. Only loopback SSH forwards are upstreams.
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function routeWorkspace(raw) {
  if (typeof raw !== 'string' || /[\\\x00-\x20]/.test(raw) || /%(?:2e|2f|5c)/i.test(raw) || /(?:^|\/)\.{1,2}(?:\/|\?|$)/.test(raw)) return null;
  const match = /^\/workspaces\/([123])\/(.*)$/.exec(raw);
  return match ? { id: Number(match[1]), path: '/' + match[2] } : null;
}
export function createGateway({ origin, expiresAt, ports = [18781, 18782, 18783], now = Date.now }) {
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
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!authorized(req)) { res.writeHead(403); return res.end('Authenticated staging access required'); }
    if (now() >= expiry) { res.writeHead(503); return res.end('Restricted staging access expired; operator renewal required'); }
    if (req.url === '/') { res.writeHead(302, { Location: '/workspaces/1/' }); return res.end(); }
    if (/^\/workspaces\/[123]$/.test(req.url)) { res.writeHead(308, { Location: req.url + '/' }); return res.end(); }
    const route = routeWorkspace(req.url);
    if (!route) { res.writeHead(404); return res.end('Unknown workspace route'); }
    if (route.path === '/local-workspaces.json' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ version: 1, mode: 'staging', current: route.id,
        workspaces: [1, 2, 3].map(id => ({ id, url: `${origin}/workspaces/${id}/` })) }));
    }
    const upstream = http.request({ host: '127.0.0.1', port: ports[route.id - 1], method: req.method, path: route.path, headers: headers(req) }, response => {
      const outgoing = { ...response.headers, 'cache-control': 'no-store' };
      delete outgoing['set-cookie'];
      if (outgoing.location?.startsWith('/') && !outgoing.location.startsWith('//')) outgoing.location = `/workspaces/${route.id}${outgoing.location}`;
      res.writeHead(response.statusCode, outgoing); response.pipe(res);
      response.on('error', () => res.destroy());
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Assigned workspace unavailable'); });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
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
  const server = createGateway({ origin: process.env.CVENT_PUBLIC_ORIGIN, expiresAt: process.env.CVENT_STAGING_EXPIRES });
  server.listen(8890, '127.0.0.1');
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.close(); server.closeAllConnections(); setTimeout(() => process.exit(0), 1000).unref(); });
}
