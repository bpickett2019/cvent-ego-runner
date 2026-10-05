// Manual Ego UI fixture: real controller/UI, fake Pi/Cvent/browser only.
// No credentials, production data, Docker, native Pi or external requests.
import '../offline-network.mjs';
import express from 'express';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mountRR } from '../../app/rr-connection.mjs';
import { transitionBrowser } from '../../app/browser-ownership.mjs';

const root = await mkdtemp(join(tmpdir(), 'rr-pause-ui-'));
await mkdir(join(root, 'data/current'), { recursive: true });
const sharedPath = join(root, 'data/current/runtime.json');
const shared = async () => JSON.parse(await readFile(sharedPath, 'utf8'));
const eventId = randomUUID(), nativeSessions = [], cleanups = new Set();
class FixturePi extends EventEmitter {
  constructor(workspace) { super(); this.workspace = workspace; this.id = randomUUID(); this.prompts = 0; }
  state() { return { sessionId: this.id, sessionFile: join(this.workspace, 'pi-sessions', this.id + '.jsonl'), messageCount: this.prompts * 2, isStreaming: false, isCompacting: false, pendingMessageCount: 0, model: { cost: { input: 1 } } }; }
  async freshSession() { return this.state(); }
  async request(command) {
    if (command.type === 'prompt') {
      this.prompts++;
      this.emit('event', { type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } });
    }
    return { data: command.type === 'get_state' ? this.state() : command.type === 'get_session_stats' ? { cost: this.prompts * 0.01 } : { text: 'Synthetic fixture; no model or Cvent call.' } };
  }
  async pause() { this.emit('event', { type: 'agent_settled' }); return this.state(); }
  async stop(after) { await after(); return []; }
}
const app = express(); app.use(express.json());
const connection = mountRR(app, { root,
  rpcFactory: ({ workspace }) => { const rpc = new FixturePi(workspace); nativeSessions.push(rpc); return rpc; },
  provisionBrowser: async record => {
    const runtime = { jobId: record.id, runtimeId: record.id, steelSessionId: randomUUID(), activeTargetId: randomUUID(), ownership: 'USER', freshProfile: true, identityVerified: true };
    await writeFile(sharedPath, JSON.stringify(runtime)); return runtime;
  },
  stopBrowser: async ({ record }) => { cleanups.add(record.id); await writeFile(join(record.workspace, 'receipts/steel-cleanup.json'), JSON.stringify({ status: 'STOPPED' })); },
  prepareTarget: async (name, options) => {
    const target = { name, apiEventId: eventId, evtstub: eventId, url: `https://app.cvent.com/?evtstub=${eventId}` };
    await options.beforeBrowser(target);
    const runtime = transitionBrowser(sharedPath, await shared(), ['USER', 'AGENT'], { ownership: 'AGENT', apiPreflight: { eventId } }, options.cancelled);
    return { target, runtime };
  },
  verifyLogin: async () => shared(),
});
app.post('/api/take-control', async (req, res) => {
  try { res.json(await connection.takeControl(req.body)); }
  catch (error) { res.status(409).json({ error: error.message }); }
});
app.get('/api/runtime', async (_req, res) => {
  const runtime = await shared();
  res.json({ ...runtime, loginFirst: true, setupTargetEditable: true, operatorPauseSupported: true, rrContext: connection.uiContext(), browserStopped: cleanups.has(runtime.jobId), budget: connection.budget() });
});
app.post('/fixture-model-error', (_req, res) => {
  const rpc = nativeSessions.at(-1);
  if (!rpc) return res.status(409).json({ error: 'Synthetic session not ready' });
  rpc.emit('event', { type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'WebSocket error' } });
  rpc.emit('event', { type: 'agent_settled' });
  res.json({ fixtureOnly: true, errorInjected: true });
});
app.get('/fixture-evidence', async (_req, res) => {
  const rpc = nativeSessions.at(-1);
  const record = rpc ? JSON.parse(await readFile(join(rpc.workspace, 'job.json'), 'utf8')) : {};
  res.json({ fixtureOnly: true, nativeSessions: nativeSessions.length, prompts: nativeSessions.map(rpc => rpc.prompts), browserCleanups: cleanups.size,
    phase: record.phase, sessionId: record.sessionId, browserId: record.browser?.steelSessionId, modelFailure: record.modelFailure?.category || null, failureHistoryCount: record.modelFailureHistory?.length || 0 });
});
app.get('/viewer', async (_req, res) => res.type('html').send(cleanups.has((await shared()).jobId)
  ? '<h2>Fixture browser stopped</h2><p>No live browser was used.</p>'
  : '<!doctype html><html><body style="background:#edf3fa;font:20px system-ui;padding:24px"><h2>Local browser fixture — NOT Cvent</h2><p>Same document should survive Take Control and Return.</p><label>Human-only fixture note <input id="humanNote" aria-label="Human-only fixture note"></label><p>No credentials, AI, or external operations.</p></body></html>'));
app.get('/local-workspaces.json', (_req, res) => res.sendStatus(404));
app.use(express.static(resolve(new URL('../../public', import.meta.url).pathname)));
app.use((error, _req, res, _next) => res.status(409).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const origin = `http://127.0.0.1:${server.address().port}`;
async function post(path, body) {
  const response = await fetch(origin + path, { method: 'POST', ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
const form = new FormData(); form.append('rr', new Blob(['synthetic workbook bytes; never parsed by Cvent']), 'Local_UI_Fixture.xlsx'); form.append('eventName', 'Local Fixture Event');
const job = await post('/api/jobs', form);
await post(`/api/jobs/${job.id}/read`, {});
await post(`/api/jobs/${job.id}/answer`, { returnControl: true });
console.log(JSON.stringify({ origin, pid: process.pid, fixtureOnly: true }));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await connection.shutdown(); server.close(); server.closeAllConnections(); await rm(root, { recursive: true, force: true }); process.exit(0);
});
