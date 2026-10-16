// Gateway-only sessions. Existing Caddy credentials are verified on loopback;
// passwords, Basic headers and session cookies never reach a workspace.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./login.css', import.meta.url));
const logo = readFileSync(new URL('./login-logo.png', import.meta.url));
const COOKIE = '__Host-forge-session';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function loginDestination(value) {
  // Only dashboard entrypoints, never API/mutation endpoints or external URLs.
  return /^\/workspaces\/[123]\/$/.test(value || '') ? value : '/workspaces/1/';
}
function page({ next = '/workspaces/1/', error = '', logout = false } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${logout ? 'Sign out' : 'Sign in'} · Forge</title><link rel="stylesheet" href="/auth/styles.css"></head><body>
  <main class="login-shell"><section class="story" aria-label="Forge event operations"><a class="brand" href="/login" aria-label="Forge sign in"><img class="brand-logo" src="/auth/logo.png" alt="Forge" width="103" height="45"><span class="brand-caption">EVENT OPERATIONS</span></a><div class="story-copy"><p class="eyebrow">YOUR CVENT WORKSPACE</p><h1>Your event work.<br>One focused workspace.</h1><p>A focused workspace for your event builds.<br>Your workbook, agent and browser—all in one place.</p><ol><li><span>01</span>Bring your registration requirements</li><li><span>02</span>Build with the Cvent agent</li><li><span>03</span>Review the saved draft</li></ol></div><p class="story-footer">Human oversight. Event-scoped changes. Draft-only builds.</p></section>
  <section class="signin" aria-labelledby="login-heading"><span class="environment"><i></i> RESTRICTED STAGING</span><div class="form-wrap"><p class="eyebrow">FORGE · CVENT AGENT</p><h2 id="login-heading">${logout ? 'Ready to sign out?' : 'Welcome back.'}</h2><p class="intro">${logout ? 'Signing out ends your Forge session on this browser.' : 'Use your existing team username and password.'}</p>
  ${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
  <form method="post" action="/${logout ? 'logout' : 'login'}">${logout ? `<p class="notice">Running builds continue after sign-out. Use <strong>Stop Build</strong> in the workspace first if you want to stop execution. Save workbook edits before leaving.</p><button type="submit">Sign out</button><a class="back" href="${escape(loginDestination(next))}">Back to workspace</a>` : `<input type="hidden" name="next" value="${escape(loginDestination(next))}"><label for="username">Username</label><input id="username" name="username" autocomplete="username" maxlength="200" required autofocus placeholder="Your staging username"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required placeholder="Enter your password"><button type="submit">Sign in <span aria-hidden="true">→</span></button><p class="help">Need access? Contact your staging administrator.</p>`}</form>
  <div class="access-note"><span aria-hidden="true">◇</span><p>${logout ? 'Your files and saved history stay in the workspace.' : 'Use your existing staging credentials. Cvent sign-in happens separately inside your workspace.'}</p></div></div><p class="signin-footer">Authorized team access only · Forge event operations</p></section></main></body></html>`;
}

export async function verifyCaddyCredentials(username, password) {
  const response = await fetch('http://127.0.0.1:8891/verify', {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` },
  });
  const user = response.headers.get('x-cvent-staging-user');
  await response.body?.cancel();
  if (response.status === 401 || response.status === 403) return null;
  if (response.status !== 204 || user !== username || !/^[^\r\n]{1,200}$/.test(user)) throw new Error('Credential verifier unavailable');
  return user;
}

export function createLogin({ origin, expiresAt, now = Date.now, verify = verifyCaddyCredentials, sessionMs = 8 * 60 * 60 * 1000 }) {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(sessionMs) || sessionMs <= 0 || sessionMs > 8 * 60 * 60 * 1000) throw new Error('Invalid login expiry');
  const sessions = new Map(), attempts = new Map();
  let pending = 0, globalAttempts = [];
  const cookie = (token, seconds) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
  function revoke(token) {
    const session = sessions.get(token); if (!session) return;
    sessions.delete(token); clearTimeout(session.timer);
    for (const close of session.connections) close();
  }
  function token(req) {
    const values = (req.headers.cookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith(COOKIE + '='));
    if (values.length !== 1) return null;
    const value = values[0].slice(COOKIE.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  function get(req) {
    const key = token(req), session = sessions.get(key);
    if (session && now() < session.expires && now() < expiry) return session;
    if (session) revoke(key);
    return null;
  }
  function track(req, stream) {
    const session = get(req); if (!session) { stream.destroy(); return; }
    const close = () => stream.destroy(); session.connections.add(close);
    stream.once('close', () => session.connections.delete(close));
  }
  function html(res, status, options) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    res.end(page(options));
  }
  function redirect(res, location) { res.writeHead(303, { Location: location }); res.end(); }
  function allowAttempt(req) {
    const cutoff = now() - 15 * 60 * 1000;
    for (const [ip, times] of attempts) { const recent = times.filter(t => t > cutoff); if (recent.length) attempts.set(ip, recent); else attempts.delete(ip); }
    globalAttempts = globalAttempts.filter(t => t > cutoff);
    // Caddy must overwrite this header with the actual remote client IP.
    const ip = req.headers['x-cvent-client-ip'] || req.socket.remoteAddress;
    const recent = attempts.get(ip) || [];
    if (recent.length >= 10 || globalAttempts.length >= 100 || pending >= 4) return false;
    recent.push(now()); attempts.set(ip, recent); globalAttempts.push(now()); return true;
  }
  async function handle(req, res) {
    if (typeof req.url !== 'string' || !req.url.startsWith('/') || req.url.startsWith('//') || /[\\\x00-\x20]/.test(req.url)) return false;
    const url = new URL(req.url, origin), path = url.pathname;
    if (['/auth/styles.css', '/auth/logo.png'].includes(path) && ['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(200, { 'Content-Type': path.endsWith('.png') ? 'image/png' : 'text/css; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : path.endsWith('.png') ? logo : css); return true;
    }
    if (path !== '/login' && path !== '/logout') return false;
    if (!['GET', 'POST'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, POST' }); res.end(); return true; }
    const next = loginDestination(url.searchParams.get('next'));
    if (req.method === 'GET') {
      if (path === '/logout') { if (!get(req)) redirect(res, '/login'); else html(res, 200, { logout: true, next }); }
      else if (get(req)) redirect(res, next);
      else html(res, 200, { next });
      return true;
    }
    if (req.headers.origin !== origin) { res.writeHead(403); res.end('Same-origin form required'); return true; }
    if (path === '/logout') {
      revoke(token(req)); res.setHeader('Set-Cookie', cookie('', 0)); redirect(res, '/login'); return true;
    }
    if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') { res.writeHead(415); res.end(); return true; }
    if (!allowAttempt(req)) { res.setHeader('Retry-After', '900'); html(res, 429, { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }); return true; }
    pending++;
    let bodyTimer = setTimeout(() => req.destroy(), 5000); bodyTimer.unref();
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) { html(res, 413, { error: 'Sign-in request is too large.' }); return true; }
        chunks.push(chunk);
      }
      clearTimeout(bodyTimer); bodyTimer = null;
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const username = form.get('username') || '', password = form.get('password') || '';
      const destination = loginDestination(form.get('next'));
      let user = null;
      if (form.getAll('username').length === 1 && form.getAll('password').length === 1 && /^[^:\x00-\x1f\x7f]{1,200}$/.test(username) && password.length > 0 && password.length <= 1024 && !/[\x00\r\n]/.test(password)) user = await verify(username, password);
      if (req.aborted || res.destroyed) return true;
      if (typeof user !== 'string' || user !== username) { html(res, 401, { next: destination, error: 'Username or password is incorrect.' }); return true; }
      if (now() >= expiry) { html(res, 503, { error: 'Restricted staging access has expired. Contact your administrator.' }); return true; }
      if (sessions.size >= 1000) { html(res, 503, { error: 'Sign-in is temporarily unavailable. Please try again later.' }); return true; }
      revoke(token(req));
      const key = randomBytes(32).toString('base64url'), expires = Math.min(now() + sessionMs, expiry);
      const session = { user, expires, connections: new Set(), timer: setTimeout(() => revoke(key), expires - now()) };
      session.timer.unref(); sessions.set(key, session);
      res.setHeader('Set-Cookie', cookie(key, Math.max(1, Math.floor((expires - now()) / 1000))));
      redirect(res, destination);
    } catch {
      if (!res.headersSent && !res.destroyed) html(res, 503, { error: 'Sign-in is temporarily unavailable. Please try again later.' });
    } finally { if (bodyTimer) clearTimeout(bodyTimer); pending--; }
    return true;
  }
  function deny(req, res) {
    if (req.method === 'GET' && /^\/(?:index\.html|workspaces\/[123](?:\/(?:index\.html)?)?|)?(?:\?.*)?$/.test(req.url)) {
      const path = new URL(req.url, origin).pathname.replace(/index\.html$/, '');
      const next = loginDestination(path.endsWith('/') ? path : path + '/');
      redirect(res, '/login?next=' + encodeURIComponent(next));
    } else { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Sign in to Forge to continue.', loginUrl: '/login' })); }
  }
  return { handle, get, track, deny, close() { for (const key of sessions.keys()) revoke(key); } };
}
