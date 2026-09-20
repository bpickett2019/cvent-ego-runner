import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// A path gate, not a secret/content scanner or authorization to push. Check the
// index as well as ignored paths: .gitignore alone cannot protect tracked files.
export function privateArtifact(path) {
  const parts = path.toLowerCase().split('/');
  const name = parts.at(-1);
  return parts.some(part => ['data', 'logs', 'node_modules', 'pi-sessions', 'browser-profiles', 'steel-user-data'].includes(part)) ||
    /\.(?:xlsx?|xlsm|csv|jsonl|log|har|trace|zip|tar|gz|pem|key)$/.test(name) ||
    name === '.env' || name.startsWith('.env.') || name.endsWith('.env') ||
    ['credentials.json', 'auth.json'].includes(name) || path.startsWith('.pi/sessions/');
}
export function checkRepository(cwd = process.cwd()) {
  const paths = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
  return paths.filter(privateArtifact);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const blocked = checkRepository();
  if (blocked.length) {
    console.error(`BLOCKED: ${blocked.length} private artifact path(s) in the Git index. Inspect locally; do not push.`);
    process.exitCode = 1;
  } else console.log('Index artifact-path check passed. This does NOT scan contents, history or submodules for secrets; human source-only review is still required.');
}
