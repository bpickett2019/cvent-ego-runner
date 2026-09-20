import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import { mountWorkbooks } from '../app/workbooks.mjs';
const hash = data => createHash('sha256').update(data).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rr-workbook-editor-'));
  await mkdir(join(root, 'app'));
  await copyFile(new URL('../app/workbook-editor.py', import.meta.url), join(root, 'app/workbook-editor.py'));
  const path = join(root, 'Fixture.xlsx');
  execFileSync('python3', ['-c', `from openpyxl import Workbook\nfrom openpyxl.comments import Comment\nfrom openpyxl.styles import PatternFill\nfrom zipfile import ZipFile\nimport sys\nw=Workbook();s=w.active;s.title='Event Details';s['A1']='Event Name';s['B1']='Source event, not target';s['B1'].comment=Comment('Keep this comment','Fixture');s['B1'].fill=PatternFill('solid',fgColor='FFFF00');s['C1']='=1+1';s['A90']='Last';w.create_sheet('Pricing')['A1']='Fee';w.save(sys.argv[1])\nwith ZipFile(sys.argv[1],'a') as z:z.writestr('fixture-preservation.bin',b'unchanged extra part')`, path]);
  const original = await readFile(path);
  let busy = false;
  const app = express(); app.use(express.json());
  mountWorkbooks(app, { root, isBusy: () => busy });
  app.use((error, _req, res, _next) => res.status(409).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => { await new Promise(r => server.close(r)); await rm(root, { recursive: true, force: true }); });
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, body === undefined ? {} : { method: 'POST', ...(body instanceof FormData ? { body } : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const form = new FormData(); form.append('rr', new Blob([original]), 'Fixture.xlsx');
  const uploaded = await request('/api/workbooks', form); assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  return { root, path, original, job: uploaded.body, request, busy: value => { busy = value; } };
}
test('local preview inventories sheets and paginates without a Pi session or paid prompt', async t => {
  const f = await fixture(t);
  assert.equal(f.job.rows.length, 80); assert.equal(f.job.sheets.length, 2);
  assert.equal(f.job.rows[0][2].formula, true);
  assert.equal(f.job.rows[0][1].value, 'Source event, not target');
  const next = await f.request(`/api/workbooks/${f.job.id}?sheet=0&offset=80`);
  assert.equal(next.body.rows.length, 10); assert.equal(next.body.rows[9][0].value, 'Last');
  const sheet = await f.request(`/api/workbooks/${f.job.id}?sheet=1`);
  assert.equal(sheet.body.rows[0][0].value, 'Fee');
  assert.equal((await f.request(`/api/workbooks/${f.job.id}?sheet=999`)).status, 409);
  assert.deepEqual(await readdir(join(f.root, 'data')), ['workbooks']);
});
test('save creates an immutable draft and preserves original, other ZIP entries, style, comment and formula', async t => {
  const f = await fixture(t);
  const result = await f.request(`/api/workbooks/${f.job.id}/save`, { sha256: f.job.sha256, sheet: 0, edits: [{ cell: 'B1', value: '<script>not HTML</script>' }] });
  assert.equal(result.status, 200); assert.equal(result.body.revision, 1);
  const dir = join(f.root, 'data/workbooks', f.job.id), draft = join(dir, result.body.file);
  assert.equal(hash(await readFile(join(dir, 'original.xlsx'))), hash(f.original));
  assert.equal(hash(await readFile(f.path)), hash(f.original));
  execFileSync('python3', ['-c', `from zipfile import ZipFile\nfrom openpyxl import load_workbook\nimport sys\nwith ZipFile(sys.argv[1]) as a,ZipFile(sys.argv[2]) as b:\n assert a.namelist()==b.namelist()\n for name in a.namelist():\n  if name!='xl/worksheets/sheet1.xml':assert a.read(name)==b.read(name),name\ns=load_workbook(sys.argv[2]).active\nassert s['B1'].value=='<script>not HTML</script>'\nassert s['B1'].comment.text=='Keep this comment'\nassert s['B1'].fill.fgColor.rgb=='00FFFF00'\nassert s['C1'].value=='=1+1'`, f.path, draft]);
  const version2 = await f.request(`/api/workbooks/${f.job.id}/save`, { sha256: result.body.sha256, sheet: 0, edits: [{ cell: 'B2', value: '=literal text, not a formula' }] });
  assert.equal(version2.status, 200); assert.equal(version2.body.revision, 2);
  assert.equal(hash(await readFile(draft)), result.body.sha256);
  assert.equal((await readdir(dir)).filter(name => name.endsWith('.xlsx')).length, 3);
});
test('editor rejects stale saves, formula edits, unknown cells and active-build writes', async t => {
  const f = await fixture(t), url = `/api/workbooks/${f.job.id}/save`;
  const valid = { sha256: f.job.sha256, sheet: 0, edits: [{ cell: 'B1', value: 'New' }] };
  for (const body of [{ ...valid, sha256: 'stale' }, { ...valid, edits: [{ cell: 'C1', value: 'Changed formula' }] }, { ...valid, edits: [{ cell: 'XFD9999999', value: 'Outside' }] }, { ...valid, edits: [{ cell: 'B1', value: 'bad\u0000text' }] }]) assert.equal((await f.request(url, body)).status, 409);
  f.busy(true); assert.equal((await f.request(url, valid)).status, 409);
  const dir = join(f.root, 'data/workbooks', f.job.id);
  assert.equal(hash(await readFile(join(dir, 'original.xlsx'))), hash(f.original));
  assert.equal((await readdir(dir)).filter(name => name.endsWith('.xlsx')).length, 1);
});
