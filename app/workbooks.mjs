import multer from 'multer';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';

const sha = data => createHash('sha256').update(data).digest('hex');
const validId = id => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id || '');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
async function save(path, data) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, path);
}
function workbookTool(root, input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('python3', [join(root, 'app/workbook-editor.py')], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', failed = false;
    const fail = message => { if (failed) return; failed = true; child.kill('SIGKILL'); reject(new Error(message)); };
    const timer = setTimeout(() => fail('Workbook operation timed out; original and saved versions are retained'), 30000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 4_000_000) fail('Workbook preview is too large'); });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); fail('Local workbook tools are unavailable'); });
    child.on('close', code => {
      clearTimeout(timer); if (failed) return;
      try { const result = JSON.parse(output); if (code !== 0 || result.error) throw new Error(result.error || 'Workbook operation failed'); resolveResult(result); }
      catch (error) { reject(error); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
export function mountWorkbooks(app, { root, isBusy }) {
  const base = join(root, 'data/workbooks'), upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });
  const working = new Set();
  const folder = id => { if (!validId(id)) throw new Error('Invalid workbook identity'); return join(base, id); };
  const current = async id => {
    const dir = folder(id), manifest = await read(join(dir, 'manifest.json'));
    if (!/^original\.xlsx$|^version-[0-9a-f-]{36}\.xlsx$/.test(manifest.file)) throw new Error('Invalid workbook version');
    const path = resolve(dir, manifest.file);
    if (sha(await readFile(path)) !== manifest.sha256) throw new Error('Saved workbook checksum mismatch');
    return { dir, manifest, path };
  };
  app.post('/api/workbooks', upload.single('rr'), async (req, res) => {
    if (isBusy()) throw new Error('Stop the active build before preparing another workbook');
    if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) throw new Error('Choose an .xlsx workbook');
    const id = randomUUID(), dir = folder(id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const source = join(dir, 'original.xlsx');
    await writeFile(source, req.file.buffer, { mode: 0o400, flag: 'wx' });
    const preview = await workbookTool(root, { action: 'preview', source });
    const manifest = { id, originalName: basename(req.file.originalname), file: 'original.xlsx', sha256: sha(req.file.buffer), originalSha256: sha(req.file.buffer), revision: 0 };
    await save(join(dir, 'manifest.json'), manifest);
    res.status(201).json({ ...manifest, ...preview });
  });
  app.get('/api/workbooks/:id', async (req, res) => {
    const { manifest, path } = await current(req.params.id);
    const preview = await workbookTool(root, { action: 'preview', source: path, sheet: Number(req.query.sheet || 0), offset: Number(req.query.offset || 0) });
    res.json({ ...manifest, ...preview });
  });
  app.get('/api/workbooks/:id/download', async (req, res) => {
    const { manifest, path } = await current(req.params.id);
    res.download(path, manifest.originalName);
  });
  app.post('/api/workbooks/:id/save', async (req, res) => {
    const id = req.params.id; folder(id);
    if (isBusy() || working.has(id)) throw new Error('Workbook is locked while a build or save is active');
    working.add(id);
    try {
      const { dir, manifest, path } = await current(id);
      if (req.body.sha256 !== manifest.sha256) throw new Error('Workbook changed; reload before editing');
      const file = `version-${randomUUID()}.xlsx`, destination = join(dir, file);
      await workbookTool(root, { action: 'edit', source: path, destination, sheet: req.body.sheet, edits: req.body.edits });
      await chmod(destination, 0o400);
      const next = { ...manifest, file, sha256: sha(await readFile(destination)), revision: manifest.revision + 1 };
      // Prior version and immutable original are backups; never overwrite them.
      await save(join(dir, 'manifest.json'), next);
      res.json(next);
    } finally { working.delete(id); }
  });
}
