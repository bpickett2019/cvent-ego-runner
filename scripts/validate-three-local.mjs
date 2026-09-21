#!/usr/bin/env node
// Opt-in real lifecycle smoke test. No credentials, Return-to-Agent, Pi or Cvent writes.
// Uses three source copies, isolated HOME/data, and shared installed dependencies.
// This is NOT OS-user isolation, an authenticated RR test, or Azure acceptance.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, chmod, symlink, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'node:net';

const mode = process.argv.slice(2).join(' ');
const interactive = mode === '--interactive';
if (!['--run', '--interactive'].includes(mode)) {
  console.error('Explicit opt-in: node scripts/validate-three-local.mjs --run|--interactive\nStarts three real local Steel browsers; no model prompts. Interactive mode leaves them available until SIGINT/SIGTERM. Evidence retained in logs/.');
  process.exit(2);
}
process.umask(0o077);
const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = await mkdtemp(join(root, 'logs/local-three-'));
const receipt = { startedAt: new Date().toISOString(), supervisorPid: process.pid, mode, status: 'RUNNING', checks: [], instances: [], limitations: [
  'Same OS user and shared read-only dependency use; not hostile-tenant isolation',
  'No human login, paid Pi execution, event editing or full RR/Draft acceptance',
  'No cross-instance event lease, shared quota or Azure access acceptance',
] };
const instances = [];
let stopRequested = false, finishInteractive;
const interactiveStop = new Promise(r => { finishInteractive = r; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopRequested = true; finishInteractive(); });
const checkStop = () => { if (stopRequested) throw new Error('Local workspace startup cancelled'); };
const save = () => writeFile(join(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function request(base, path, body, timeout = 150000) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(timeout), ...(body === undefined ? {} : {
    method: 'POST', ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  }) });
  return { status: response.status, body: await response.json() };
}
async function must(base, path, body) {
  const result = await request(base, path, body);
  assert.ok(result.status >= 200 && result.status < 300, `${path}: ${result.status} ${result.body.error || ''}`);
  return result.body;
}
const mainBase = 'http://127.0.0.1:8788';
const protectedPaths = ['data/current/runtime.json', 'data/current/state.json', 'data/rr-connection.lock'];
let before;
let sources;
let failure;
try {
  before = { runtime: await must(mainBase, '/api/runtime'), jobs: await must(mainBase, '/api/jobs'), files: {} };
  assert.equal(before.runtime.browserStopped, true, 'Existing browser must already be stopped');
  assert.equal(before.runtime.ownership, 'USER');
  assert.ok(before.jobs.every(j => !['RUNNING', 'WAITING', 'STOPPING'].includes(j.status)), 'Existing app must be idle');
  for (const p of protectedPaths) before.files[p] = hash(await readFile(join(root, p)));
  const { stdout: context } = await exec('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  const dockerHost = process.env.DOCKER_HOST || context.trim();
  assert.match(dockerHost, /^unix:\/\//, 'Only a local Docker socket is permitted');
  // Reuse the deployment source allowlist; do not copy data, auth or global Pi config.
  const { stdout } = await exec('python3', ['-c', `import importlib.util,json,pathlib
r=pathlib.Path(${JSON.stringify(root)})
s=importlib.util.spec_from_file_location('bundle',r/'deploy/azure/bundle.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
print(json.dumps([str(p.relative_to(r)) for p in m.source_files(r)]))`]);
  sources = JSON.parse(stdout);
  const manifest = {};
  for (const p of sources) manifest[p] = hash(await readFile(join(root, p)));
  await writeFile(join(evidence, 'source-manifest.json'), JSON.stringify(manifest, null, 2));
  // A valid minimal OOXML workbook, synthetic and deliberately not a build RR.
  const fixture = join(evidence, 'lifecycle-only.xlsx');
  await exec('python3', ['-c', `import zipfile,sys
files={
'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
'_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Lifecycle only" sheetId="1" r:id="rId1"/></sheets></workbook>',
'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
'xl/worksheets/sheet1.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SYNTHETIC LIFECYCLE TEST - NO BUILD</t></is></c></row></sheetData></worksheet>'}
with zipfile.ZipFile(sys.argv[1],'x',zipfile.ZIP_DEFLATED) as z:
 for p,b in files.items(): z.writestr(p,b)
`, fixture]);
  for (let n = 1; n <= 3; n++) {
    checkStop();
    const dir = join(evidence, `user-${n}`);
    const item = { dir, n }; instances.push(item);
    for (const p of sources) {
      await mkdir(dirname(join(dir, p)), { recursive: true });
      await copyFile(join(root, p), join(dir, p));
      assert.equal(hash(await readFile(join(dir, p))), manifest[p]);
    }
    for (const p of ['home', 'vendor', 'data/current', 'data/jobs', 'data/workbooks']) await mkdir(join(dir, p), { recursive: true });
    await symlink(join(root, 'node_modules'), join(dir, 'node_modules'));
    await symlink(join(root, 'vendor/ego-lite'), join(dir, 'vendor/ego-lite'));
    // Fail closed even if a future lifecycle regression tries to launch Pi.
    await writeFile(join(dir, 'bin/pi'), '#!/bin/sh\nprintf blocked > "$HOME/pi-launch-blocked"\nexit 126\n');
    await chmod(join(dir, 'bin/pi'), 0o700);
    await writeFile(join(dir, 'data/current/runtime.json'), JSON.stringify({ ownership: 'USER', identityVerified: false }));
    await writeFile(join(dir, 'data/current/state.json'), JSON.stringify({ status: 'IDLE', completed: [], pending: [], activity: [] }));
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((r, reject) => reservation.close(error => error ? reject(error) : r()));
    const env = { HOME: join(dir, 'home'), PATH: `${join(dir, 'bin')}:${process.env.PATH}`, PORT: String(port), DOCKER_HOST: dockerHost };
    checkStop();
    item.child = spawn(process.execPath, ['app/server.mjs'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    item.exited = new Promise(resolveExit => item.child.once('exit', (code, signal) => resolveExit({ code, signal })));
    item.output = ''; item.child.stdout.on('data', b => { item.output += b; });
    item.child.stderr.on('data', b => { item.output += b; });
    item.child.on('error', error => { item.spawnError = error; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (item.spawnError) throw item.spawnError;
      const match = item.output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { item.base = match[0]; break; }
      if (item.child.exitCode !== null) throw new Error(`App ${n} exited before listening`);
      await delay(100);
    }
    assert.ok(item.base, 'App startup deadline');
    const initial = await must(item.base, '/api/runtime');
    assert.equal(initial.executionPolicyId, 'native-pi'); assert.equal(initial.budget.spentUSD, 0);
    assert.deepEqual(await must(item.base, '/api/jobs'), []);
    const form = new FormData();
    form.append('rr', new Blob([await readFile(fixture)]), `user-${n}-lifecycle.xlsx`);
    form.append('eventName', `LOCAL LIFECYCLE ONLY ${n} - DO NOT BUILD`);
    item.job = await must(item.base, '/api/jobs', form);
    receipt.instances.push({ user: n, root: dir, pid: item.child.pid, base: item.base, jobId: item.job.id });
  }
  if (interactive) {
    for (const item of instances) await writeFile(join(item.dir, 'public/local-workspaces.json'), JSON.stringify({
      version: 1, current: item.n, workspaces: instances.map(i => ({ id: i.n, url: i.base })),
    }));
  }
  checkStop();
  await save(); // Durable identities before browser dispatch; never auto-replay.
  const starts = await Promise.allSettled(instances.map(async item => {
    item.startDispatched = true;
    const result = await must(item.base, `/api/jobs/${item.job.id}/read`, {});
    assert.equal(result.aiStarted, false);
    item.runtime = await json(join(item.dir, 'data/current/runtime.json'));
    Object.assign(receipt.instances[item.n - 1], { browser: item.runtime });
  }));
  const rejected = starts.find(r => r.status === 'rejected');
  if (rejected) throw rejected.reason;
  for (const key of ['jobId', 'steelSessionId', 'activeTargetId', 'container', 'profile', 'steelApiOrigin', 'debugCdpOrigin']) {
    assert.equal(new Set(instances.map(i => i.runtime[key])).size, 3, `${key} must be distinct`);
  }
  for (const item of instances) {
    const job = await must(item.base, `/api/jobs/${item.job.id}`);
    assert.equal(job.waitingFor, 'setup'); assert.equal(job.piCostUSD, 0); assert.ok(!job.sessionId && !job.ownedPid);
    assert.equal(item.runtime.ownership, 'USER'); assert.equal(item.runtime.freshProfile, true);
    assert.equal((await must(item.base, '/api/jobs')).length, 1);
    assert.equal((await readdir(join(item.dir, 'data/ego-v2'))).length, 1);
    for (const other of instances.filter(i => i !== item)) {
      assert.notEqual((await request(item.base, `/api/jobs/${other.job.id}`)).status, 200);
      assert.equal((await request(item.base, `/api/jobs/${other.job.id}/stop`, {})).status, 409);
    }
    const viewer = await fetch(item.base + '/viewer', { signal: AbortSignal.timeout(15000) });
    assert.equal(viewer.status, 200);
    assert.match(await viewer.text(), /\/steel-cast/);
    const forbidden = await fetch(item.base + '/api/jobs', { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(forbidden.status, 403);
  }
  receipt.checks.push('Three concurrent clean browsers with distinct profiles/sessions/targets/ports and Ego ledgers',
    'Separate uploads/jobs and zero model cost; no native session before human Return',
    'Foreign job reads/Stop denied; foreign Origin denied; each viewer HTML uses its local cast proxy');
  for (const p of sources) assert.equal(hash(await readFile(join(root, p))), manifest[p], 'Source changed during startup');
  if (interactive) {
    checkStop();
    assert.deepEqual(await must(mainBase, '/api/runtime'), before.runtime);
    assert.deepEqual(await must(mainBase, '/api/jobs'), before.jobs);
    receipt.status = 'INTERACTIVE'; receipt.readyAt = new Date().toISOString();
    receipt.checks.push('Original dashboard unchanged at handoff; three local workspace switchers configured');
    await save();
    console.log(JSON.stringify({ status: 'INTERACTIVE', evidence, supervisorPid: process.pid, workspaces: instances.map(i => ({ user: i.n, url: i.base })) }, null, 2));
    // Keep these exact instances available for human interaction. Never prompt Pi.
    await Promise.race([interactiveStop, ...instances.map(item => item.exited.then(() => { throw new Error(`User ${item.n} app exited during interactive preview`); }))]);
  } else {
    // Stop one while two remain usable; no restart/resume or login is attempted.
    await must(instances[0].base, `/api/jobs/${instances[0].job.id}/stop`, {});
    for (const item of instances.slice(1)) {
      assert.equal((await must(item.base, `/api/jobs/${item.job.id}`)).waitingFor, 'setup');
      assert.equal((await must(item.base, '/api/runtime')).browserStopped, false);
      const { stdout: state } = await exec('docker', ['inspect', '--format', '{{.State.Running}}', item.runtime.container]);
      assert.equal(state.trim(), 'true');
    }
    receipt.checks.push('Stopping user 1 leaves users 2 and 3 waiting with running browsers');
  }
} catch (error) {
  failure = error; receipt.error = error.message;
} finally {
  // Await all issued starts above before cleanup; never kill unrelated resources.
  const cleanupErrors = [];
  for (const item of instances) {
    if (item.child && item.child.exitCode === null && item.child.signalCode === null) {
      // Production shutdown awaits creation and stops its current job, including
      // any fresh upload made by a human during interactive mode.
      item.child.kill('SIGTERM');
      const exit = await Promise.race([item.exited, delay(30000).then(() => null)]);
      if (!exit) cleanupErrors.push(`user-${item.n}: app termination unconfirmed; PID ${item.child.pid}`);
      else if (exit.code !== 0) cleanupErrors.push(`user-${item.n}: abnormal exit ${JSON.stringify(exit)}`);
    }
    try {
      if (item.job) {
        for (const id of await readdir(join(item.dir, 'data/jobs'))) {
          const workspace = join(item.dir, 'data/jobs', id);
          const final = await json(join(workspace, 'job.json'));
          assert.equal(final.piCostUSD, 0); assert.ok(!final.sessionId && !final.ownedPid);
          assert.ok(!['PREPARING', 'STARTING', 'RUNNING', 'STOPPING'].includes(final.status));
          assert.deepEqual(await readdir(join(workspace, 'pi-sessions')), []);
          if ((await readdir(join(workspace, 'receipts'))).includes('clean-browser.json')) {
            const clean = await json(join(workspace, 'receipts/steel-cleanup.json'));
            assert.equal(clean.jobId, id); assert.equal(clean.container, `cvent-build-${id}`); assert.equal(clean.status, 'STOPPED');
            const { stdout } = await exec('docker', ['inspect', '--format', '{{.State.Running}} {{.State.Pid}}', clean.container]);
            assert.equal(stdout.trim(), 'false 0');
          }
        }
        assert.deepEqual(await readdir(join(item.dir, 'home')), []);
      }
    } catch (error) { cleanupErrors.push(`user-${item.n}: ${error.message}`); }
    await writeFile(join(evidence, `user-${item.n}-server.log`), item.output || '');
  }
  try {
    if (before && !interactive) {
      assert.deepEqual(await must(mainBase, '/api/runtime'), before.runtime);
      assert.deepEqual(await must(mainBase, '/api/jobs'), before.jobs);
      for (const [p, digest] of Object.entries(before.files)) assert.equal(hash(await readFile(join(root, p))), digest);
      receipt.checks.push('Original dashboard runtime/jobs/accounting/lock unchanged');
    }
  } catch (error) { cleanupErrors.push(`Original dashboard changed: ${error.message}`); }
  receipt.cleanupErrors = cleanupErrors;
  if (!cleanupErrors.length) receipt.checks.push('All test apps/browsers stopped; profiles/evidence retained; zero Pi sessions or cost');
  receipt.status = failure || cleanupErrors.length ? 'FAIL' : interactive ? 'STOPPED' : 'PASS';
  receipt.finishedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ status: receipt.status, evidence, checks: receipt.checks, error: receipt.error, cleanupErrors }, null, 2));
  if (receipt.status === 'FAIL') process.exitCode = 1;
}
