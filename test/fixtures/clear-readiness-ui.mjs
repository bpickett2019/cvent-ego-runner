// Owned rendered-UI fixture: real controller/readiness helpers, synthetic files only.
// No native Pi, Steel, credentials, Cvent, gateway service or external network.
import '../offline-network.mjs';
import express from 'express';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mountRR } from '../../app/rr-connection.mjs';
import { executionSafety } from '../../app/execution-clearance.mjs';
import { eventHoldInventory } from '../../app/shared-event-safety.mjs';
import { createExecutionSlot } from '../../deploy/azure/execution-slot.mjs';
import { readExecutionStatus } from '../../deploy/azure/event-safety.mjs';

const base = await mkdtemp(join(tmpdir(), 'clear-readiness-ui-')), roots = [1, 2, 3].map(n => join(base, String(n)));
for (const root of roots) { await mkdir(join(root, 'data/jobs'), { recursive: true }); await mkdir(join(root, 'data/current')); }
const root = roots[0], oldId = randomUUID(), eventId = randomUUID(), oldDirectory = join(roots[2], 'data/jobs', oldId);
async function uncertainJob(directory, id, original = {}) {
  await mkdir(join(directory, 'receipts'), { recursive: true });
  const record = { ...original, id, workspace: directory, status: 'STOPPED', phase: 'SETTLED', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    sessionPrepared: false, spendingUnreconciled: false, piCostUSD: 1.25, stopFailures: [], unresolvedChanges: ['fixture-save'], ownedPid: null,
    target: { apiEventId: eventId, evtstub: eventId } };
  await writeFile(join(directory, 'job.json'), JSON.stringify(record));
  await writeFile(join(directory, 'runtime.json'), JSON.stringify({ ownership: 'USER' }));
  await writeFile(join(directory, 'receipts/steel-cleanup.json'), JSON.stringify({ status: 'STOPPED' }));
  await writeFile(join(directory, 'browser-save-uncertain.json'), JSON.stringify({ fixtureOnly: true, eventId, outcome: 'UNVERIFIED' }));
}
await uncertainJob(oldDirectory, oldId);
const oldBytes = await readFile(join(oldDirectory, 'job.json'), 'utf8'), markerBytes = await readFile(join(oldDirectory, 'browser-save-uncertain.json'), 'utf8');
const slotDirectory = join(base, 'slot'), slot = createExecutionSlot({ directory: slotDirectory, clearance: async () => executionSafety(roots[2], oldId) });
await slot.authorize(3, `/api/jobs/${oldId}/answer`, 'POST');
const claimBytes = await readFile(join(slotDirectory, 'active.json'), 'utf8');
let offline = false, nativeLaunches = 0, browserLaunches = 0;
const app = express(); app.use(express.json());
const unavailable = async () => { throw Error('No live event or browser access in this fixture'); };
const connection = mountRR(app, { root, verifyLogin: unavailable, prepareTarget: unavailable,
  provisionBrowser: async () => { browserLaunches++; throw Error('No fixture browser launch'); },
  rpcFactory: () => { nativeLaunches++; throw Error('No native Pi launch'); }, stopBrowser: async () => {},
});
app.get('/api/runtime', (_req, res) => res.json({ loginFirst: true, setupTargetEditable: true, operatorPauseSupported: true,
  rrContext: connection.uiContext(), ownership: 'USER', browserStopped: true, budget: connection.budget() }));
app.get('/api/execution-status', async (_req, res) => {
  if (offline) return res.status(503).json({ error: 'Synthetic status outage' });
  res.json(await readExecutionStatus({ slot, ports: [18781, 18782, 18783], fetchImpl: async url => {
    const workspace = Number(new URL(url).port) - 18780;
    return new Response(JSON.stringify(eventHoldInventory(roots[workspace - 1], workspace)));
  } }));
});
app.get('/viewer', (_req, res) => res.type('html').send('<h2>Readiness fixture only</h2><p>No live browser or AI is available.</p>'));
app.get('/local-workspaces.json', (_req, res) => res.sendStatus(404));
app.get('/fixture-evidence', async (_req, res) => res.json({ fixtureOnly: true, nativeLaunches, browserLaunches, context: connection.context(),
  oldJobPreserved: await readFile(join(oldDirectory, 'job.json'), 'utf8') === oldBytes,
  markerPreserved: await readFile(join(oldDirectory, 'browser-save-uncertain.json'), 'utf8') === markerBytes,
  claimPreserved: await readFile(join(slotDirectory, 'active.json'), 'utf8') === claimBytes,
  inventoryComplete: eventHoldInventory(root, 1).complete }));
app.post('/fixture-select-blocked', async (_req, res, next) => {
  try {
    const job = await upload(); await uncertainJob(job.workspace, job.id, job);
    res.json({ fixtureOnly: true, jobId: job.id });
  } catch (error) { next(error); }
});
app.post('/fixture-offline', (_req, res) => { offline = true; res.json({ fixtureOnly: true }); });
app.use(express.static(resolve(new URL('../../public', import.meta.url).pathname)));
app.use((error, _req, res, _next) => res.status(409).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const origin = `http://127.0.0.1:${server.address().port}`;
async function upload() {
  const form = new FormData(); form.append('rr', new Blob(['synthetic unstarted RR bytes']), 'Readiness_Fixture.xlsx'); form.append('eventName', 'Synthetic fixture event');
  if (connection.context().id) form.append('contextId', connection.context().id);
  const response = await fetch(origin + '/api/jobs', { method: 'POST', body: form });
  const body = await response.json(); if (!response.ok) throw Error(body.error); return body;
}
await upload();
console.log(JSON.stringify({ origin, pid: process.pid, fixtureOnly: true }));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await connection.shutdown(); server.close(); server.closeAllConnections(); await rm(base, { recursive: true, force: true }); process.exit(0);
});
