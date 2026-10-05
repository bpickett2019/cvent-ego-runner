// Ego fixture for real workbook UI/controller saves. Synthetic XLSX only.
// Native Pi, Steel, credentials and Cvent are unavailable by construction.
import '../offline-network.mjs';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, readFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mountRR } from '../../app/rr-connection.mjs';
import { mountWorkbooks } from '../../app/workbooks.mjs';

const root = await mkdtemp(join(tmpdir(), 'rr-save-ui-'));
await mkdir(join(root, 'app'));
await copyFile(new URL('../../app/workbook-editor.py', import.meta.url), join(root, 'app/workbook-editor.py'));
const source = join(root, 'Fixture.xlsx');
execFileSync('python3', ['-c', "from openpyxl import Workbook\nimport sys\nw=Workbook();s=w.active;s.title='Fixture';s['A1']='Label';s['B1']='Original fixture text';w.save(sys.argv[1])", source]);
const original = await readFile(source), sha = data => createHash('sha256').update(data).digest('hex');
let nativeLaunches = 0, browserLaunches = 0;
const unavailable = async () => { throw new Error('No Cvent/login operations in this fixture'); };
const app = express(); app.use(express.json());
const connection = mountRR(app, { root, verifyLogin: unavailable, prepareTarget: unavailable,
  provisionBrowser: async () => { browserLaunches++; throw new Error('No browser in this fixture'); },
  rpcFactory: () => { nativeLaunches++; throw new Error('No Pi in this fixture'); }, stopBrowser: async () => {},
});
mountWorkbooks(app, { root, isBusy: connection.isBusy, withUpload: connection.withWorkbookUpload, withSave: connection.withWorkbookSave });
app.get('/api/runtime', (_req, res) => res.json({ loginFirst: true, setupTargetEditable: true, operatorPauseSupported: true, workbookSaveContextRequired: true,
  rrContext: connection.uiContext(), ownership: 'USER', browserStopped: true, budget: connection.budget() }));
let book;
app.get('/fixture-evidence', async (_req, res) => {
  const dir = join(root, 'data/workbooks', book.id), manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  res.json({ fixtureOnly: true, rrContext: connection.context(), workbookId: book.id, sha256: manifest.sha256, revision: manifest.revision,
    originalPreserved: sha(await readFile(join(dir, 'original.xlsx'))) === sha(original), versionCount: (await readdir(dir)).filter(name => name.endsWith('.xlsx')).length,
    nativeLaunches, browserLaunches });
});
app.get('/viewer', (_req, res) => res.type('html').send('<h2>Workbook-only fixture</h2><p>No browser, Cvent account or AI session is available.</p>'));
app.get('/local-workspaces.json', (_req, res) => res.sendStatus(404));
app.use(express.static(resolve(new URL('../../public', import.meta.url).pathname)));
app.use((error, _req, res, _next) => res.status(409).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const form = new FormData(); form.append('rr', new Blob([original]), 'Workbook_Safety_Fixture.xlsx');
const response = await fetch(origin + '/api/workbooks', { method: 'POST', body: form });
book = await response.json(); if (!response.ok) throw new Error(book.error);
console.log(JSON.stringify({ origin, pid: process.pid, fixtureOnly: true }));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await connection.shutdown(); server.close(); server.closeAllConnections(); await rm(root, { recursive: true, force: true }); process.exit(0);
});
