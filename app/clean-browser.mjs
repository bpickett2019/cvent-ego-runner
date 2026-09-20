import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const exec = promisify(execFile);
const IMAGE = 'sha256:21cf2a5785aa9478d0f7933c04bce96ca79f3d7a93d9824ea184800d29d3cd02';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export function steelOrigin(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Expected assigned loopback Steel origin');
  return url.origin;
}
const docker = async args => (await exec('docker', args, { timeout: 90000, maxBuffer: 100000 })).stdout.trim();
// Stop only this job's provenance-checked container. Retain its filesystem,
// profile and evidence; a stopped container consumes no browser memory.
export async function stopJobBrowser({ root, record, run = docker }) {
  if (!uuid.test(record.id)) throw new Error('Invalid browser job identity');
  const container = `cvent-build-${record.id}`;
  const profile = join(root, 'data/browser-profiles', record.id);
  let created;
  try { created = JSON.parse(await readFile(join(record.workspace, 'receipts/clean-browser.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (created.jobId !== record.id || created.container !== container || created.image !== IMAGE || created.profile !== profile) throw new Error('Browser cleanup provenance mismatch');
  const receipt = { jobId: record.id, container, requestedAt: new Date().toISOString(), status: 'STOPPING', profilesPreserved: true };
  const save = () => writeFile(join(record.workspace, 'receipts/steel-cleanup.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  await save();
  try {
    const found = await run(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.ID}}']);
    if (found.trim()) {
      const [info] = JSON.parse(await run(['inspect', container]));
      if (info.Name !== `/${container}` || info.Config?.Labels?.['cvent.runner.job'] !== record.id || info.Image !== IMAGE || !/^[a-f0-9]{64}$/.test(info.Id)) throw new Error('Browser cleanup container identity mismatch');
      // Address the immutable ID, never a name which could be reassigned.
      if (info.State?.Running) await run(['stop', '--time', '10', info.Id]);
      const [after] = JSON.parse(await run(['inspect', info.Id]));
      if (after.Id !== info.Id || after.State?.Running !== false || after.State?.Pid !== 0) throw new Error('Steel process termination not confirmed');
    }
    receipt.status = 'STOPPED'; receipt.stoppedAt = new Date().toISOString();
    await save();
  } catch (error) {
    receipt.status = 'FAILED'; receipt.error = 'Steel cleanup requires reconciliation';
    await save(); throw error;
  }
}
export async function provisionCleanBrowser({ root, record, cancelled = () => false, run = docker, fetchJson = async url => {
  const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error('Steel not ready');
  return r.json();
}, sleep = ms => new Promise(r => setTimeout(r, ms)), attempts = 60 }) {
  if (!uuid.test(record.id)) throw new Error('Invalid browser job identity');
  const profile = join(root, 'data/browser-profiles', record.id);
  await mkdir(join(root, 'data/browser-profiles'), { recursive: true, mode: 0o700 });
  await mkdir(profile, { mode: 0o700 }); // EEXIST fails closed; never reopen a profile.
  if ((await readdir(profile)).length) throw new Error('Fresh empty profile required');
  const container = `cvent-build-${record.id}`;
  const receipt = { jobId: record.id, container, profile, image: IMAGE, freshProfile: true, createdAt: new Date().toISOString(), status: 'PROVISIONING' };
  const save = () => writeFile(join(record.workspace, 'receipts/clean-browser.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  await save();
  try {
    if (cancelled()) throw new Error('Browser start cancelled');
    await run(['run', '-d', '--name', container, '--label', `cvent.runner.job=${record.id}`, '--restart', 'no', '--shm-size', '2g',
      '-e', 'CHROME_USER_DATA_DIR=/data/chrome', '-p', '127.0.0.1::3000', '-p', '127.0.0.1::9223',
      '--mount', `type=bind,source=${profile},target=/data/chrome`, IMAGE]);
    const [info] = JSON.parse(await run(['inspect', container]));
    if (info.Config?.Labels?.['cvent.runner.job'] !== record.id || info.Image !== IMAGE) throw new Error('Browser container provenance mismatch');
    const port = key => {
      const bindings = info.NetworkSettings?.Ports?.[key];
      if (bindings?.length !== 1 || bindings[0].HostIp !== '127.0.0.1' || !/^\d+$/.test(bindings[0].HostPort)) throw new Error('Browser must use unique loopback ports');
      return bindings[0].HostPort;
    };
    const api = steelOrigin(`http://127.0.0.1:${port('3000/tcp')}`), cdp = steelOrigin(`http://127.0.0.1:${port('9223/tcp')}`);
    let sessions, version, pages;
    for (let n = 0; n < attempts; n++) {
      if (cancelled()) throw new Error('Browser start cancelled');
      try {
        [sessions, version, pages] = await Promise.all([fetchJson(`${api}/v1/sessions`), fetchJson(`${cdp}/json/version`), fetchJson(`${cdp}/json/list`)]);
        if (sessions.sessions?.length === 1 && Array.isArray(pages) && pages.filter(p => p.type === 'page').length === 1) break;
      } catch { /* bounded non-AI startup health checks only */ }
      if (n === attempts - 1) throw new Error('Clean Steel browser did not become ready; no existing browser was reused');
      await sleep(500);
    }
    const page = pages.filter(p => p.type === 'page')[0];
    if (!['about:blank', 'chrome://newtab/', 'chrome://new-tab-page/'].includes(page.url)) throw new Error('New browser is not on an empty page');
    if (!page.id || !sessions.sessions[0].id) throw new Error('Assigned browser identity missing');
    const ws = new URL(version.webSocketDebuggerUrl);
    if (!/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(ws.pathname)) throw new Error('Invalid CDP browser identity');
    const runtime = { runtimeId: record.id, jobId: record.id, container, profile, steelSessionId: sessions.sessions[0].id,
      providerSessionId: sessions.sessions[0].id, steelApiOrigin: api, debugCdpOrigin: cdp,
      cdpEndpoint: `ws://127.0.0.1:${new URL(cdp).port}${ws.pathname}`, viewerUrl: `${api}/v1/sessions/debug?showControls=true&interactive=true`,
      activeTargetId: page.id, ownership: 'USER', identityVerified: true, createdAt: receipt.createdAt, freshProfile: true };
    receipt.status = 'READY'; receipt.steelSessionId = runtime.steelSessionId; receipt.activeTargetId = page.id;
    await save(); return runtime;
  } catch (error) {
    receipt.status = 'FAILED'; receipt.error = 'Provisioning failed or was cancelled; profile and evidence retained'; await save();
    try { await stopJobBrowser({ root, record, run }); }
    catch { receipt.cleanupFailed = true; await save(); }
    throw error;
  }
}
