import { accessSync, constants, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientPaths } from '../app/cvent-api.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const present = (path, executable = false) => {
  try { accessSync(path, executable ? constants.X_OK : constants.R_OK); return statSync(path).isFile(); }
  catch { return false; }
};
export function checkInstallation({ directory = root, env = process.env, file = present, run = spawnSync, nodeVersion = process.versions.node } = {}) {
  const checks = [];
  const check = (name, pass) => checks.push({ name, status: pass ? 'PASS' : 'BLOCKED' });
  const executable = name => (env.PATH || '').split(delimiter).some(dir => dir && file(join(dir, name), true));
  check('Node 24 or newer (validated environment: Node 25)', Number(nodeVersion.split('.')[0]) >= 24);
  for (const name of ['pi', 'python3', 'docker']) check(`${name} executable`, executable(name));
  for (const name of ['express', 'multer', 'ws', 'http-proxy']) check(`${name} installed`, file(join(directory, 'node_modules', name, 'package.json')));
  const python = run('python3', ['-c', 'import openpyxl; assert openpyxl.__version__ == "3.1.5"'], { env, timeout: 5000, stdio: 'ignore' });
  check('Python openpyxl 3.1.5', python.status === 0);
  for (const [name, path] of Object.entries(clientPaths(env))) check(`External API ${name}`, isAbsolute(path) && file(path));
  for (const path of ['vendor/ego-lite/package/ego-browser/dist/src/run.js', '.pi/skills/ego-browser/SKILL.md', '.pi/skills/ego-browser/references/steel-bridge.md', 'app/rr-evidence.py', 'app/rr_audit.py']) check(path, file(join(directory, path)));
  const pin = run('git', ['-C', join(directory, 'vendor/ego-lite'), 'rev-parse', 'HEAD'], { env, timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  check('Pinned Ego revision (does not certify local patch/build)', pin.status === 0 && pin.stdout?.trim() === 'dca7003349c5f7132189ba00547cbbd7ff8e597e');
  check('Pi provider/model selected (authentication not tested)', Boolean(env.PI_PROVIDER && env.PI_MODEL));
  // Presence only: never read or print credential values, launch Pi, contact Docker/Cvent, or touch a browser.
  check('Cvent credential source present (contents/authentication not tested)', Boolean(
    (env.CVENT_CLIENT_ID && env.CVENT_CLIENT_SECRET && env.CVENT_API_BASE_URL) ||
    (env.CVENT_CREDENTIALS_FILE && file(env.CVENT_CREDENTIALS_FILE))));
  return { status: checks.every(x => x.status === 'PASS') ? 'OFFLINE_CHECKS_PASS' : 'BLOCKED', checks,
    limits: 'Local prerequisites only, not deployment or execution acceptance. Docker daemon/pinned image, native model pricing/authentication, credential validity/permissions, vendor patch/build, server ownership, browser handoff and live saved results still require operator verification. No repairs or network requests performed.' };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkInstallation();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'OFFLINE_CHECKS_PASS' ? 0 : 1;
}
