import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUARD_COMMAND = 'cvent-diagnostic-guard-v1';
export const BLOCK_REASON = 'Diagnostic blocked before execution: environment or credential dumps are not permitted. No command ran and no secret was exposed by this blocked call. Use node app/diagnostic-guard.js --status for configured/missing checks, or invoke the assigned tool directly. This is a rejected diagnostic, not a Cvent write or an exposure incident; continue permitted independent work. Do not retry the dump in another form. Actual secret exposure still requires Stop.';

// Targeted prevention of accidental diagnostics, not a hostile-shell sandbox.
// Deliberately conservative: use inherited environment with the assigned tools,
// not env/printenv wrappers or interpreter environment inspection.
const dumpPatterns = [
  /(?:^|[\s;&|()`])(?:\/(?:usr\/)?bin\/)?(?:env|printenv)\b/,
  /(?:^|[;&|\n(])\s*(?:builtin\s+|command\s+)?set\s*(?:$|[;&|\n)])/,
  /\b(?:export|declare|typeset)\s+(?:-[A-Za-z]*p[A-Za-z]*\b)/,
  /\b(?:process\s*\.\s*env|os\s*\.\s*environ|(?:os\s*\.\s*)?getenv)\b/,
  /\/proc\/(?:self|\d+|\$[^/\s]+)\/environ\b/,
  /\bpi\s+auth\s+(?:print-api-key|print-bearer-token)\b/,
  /\bpi\s+auth\s+check\b[^\n;&|]*--credentials\b/,
  /\b(?:echo|printf)\b[^\n;&|]*\$\{?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\b/,
];
export function blocksDiagnostic(command) {
  if (typeof command !== 'string') return true;
  // Catch line continuations and ordinary quoting of command names as well.
  const normalized = command.replace(/\\\r?\n/g, '').replace(/["']/g, '');
  return dumpPatterns.some(pattern => pattern.test(normalized));
}
export function configuredStatus(env) {
  return Object.fromEntries(['CVENT_CLIENT_ID', 'CVENT_CLIENT_SECRET', 'ANTHROPIC_API_KEY', 'CVENT_API_BIN', 'EGO_BROWSER_BIN', 'RR_WORKSPACE']
    .map(name => [name, typeof env[name] === 'string' && env[name].length > 0 ? 'configured' : 'missing']));
}
export default function diagnosticGuard(pi) {
  pi.on('tool_call', event => {
    if (event.toolName === 'bash' && blocksDiagnostic(event.input?.command)) return { block: true, reason: BLOCK_REASON };
  });
  // Also protect direct user/RPC bash execution, not just model tool calls.
  pi.on('user_bash', event => {
    if (blocksDiagnostic(event.command)) return { result: { output: BLOCK_REASON, exitCode: 1, cancelled: false, truncated: false } };
  });
  // The launcher checks this marker before any fresh session/prompt. Register it
  // only after both handlers, so a load failure cannot silently disable the guard.
  pi.registerCommand(GUARD_COMMAND, { description: 'Internal diagnostic guard readiness marker; no execution or configuration changes', handler: async () => {} });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--status') {
    process.stderr.write('Usage: node app/diagnostic-guard.js --status\n');
    process.exitCode = 2;
  } else process.stdout.write(JSON.stringify(configuredStatus(process.env)) + '\n');
}
