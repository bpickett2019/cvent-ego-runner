import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInstallation } from '../scripts/check-installation.mjs';
import { clientPaths } from '../app/cvent-api.mjs';

const env = { PATH: '/bin', PI_PROVIDER: 'provider', PI_MODEL: 'model', CVENT_CREDENTIALS_FILE: '/private/secret.env', CVENT_AGENT_ROOT: '/installed/api', CVENT_UI_AUTOMATION_ROOT: '/installed/configuration' };
const pin = 'dca7003349c5f7132189ba00547cbbd7ff8e597e';
test('installation check uses configurable clients, only local commands, and never reveals credentials', () => {
  const calls = [];
  const result = checkInstallation({ directory: '/project', env, file: () => true, nodeVersion: '25.8.1', run: (command, args, options) => {
    calls.push(command); assert.ok(['python3', 'git'].includes(command)); assert.equal(options.timeout, 5000);
    return { status: 0, stdout: command === 'git' ? pin : '' };
  } });
  assert.equal(result.status, 'OFFLINE_CHECKS_PASS'); assert.deepEqual(calls, ['python3', 'git']);
  assert.doesNotMatch(JSON.stringify(result), /secret.env|\/installed/);
  assert.deepEqual(clientPaths(env), { loader: '/installed/api/node_modules/tsx/dist/esm/api/index.mjs', defaultClient: '/installed/api/src/cvent/api.ts', configurationClient: '/installed/configuration/src/cvent-api.ts' });
  assert.match(result.limits, /not deployment or execution acceptance/);
});
test('missing dependencies, configuration, incorrect pin and Python failure are explicit blockers', () => {
  const result = checkInstallation({ directory: '/project', env: {}, file: () => false, nodeVersion: '18.0.0', run: () => ({ status: 1 }) });
  assert.equal(result.status, 'BLOCKED'); assert.ok(result.checks.every(x => x.status === 'BLOCKED'));
  const relative = checkInstallation({ directory: '/project', env: { ...env, CVENT_AGENT_ROOT: 'relative' }, file: () => true, run: () => ({ status: 0, stdout: pin }) });
  assert.equal(relative.status, 'BLOCKED');
});
