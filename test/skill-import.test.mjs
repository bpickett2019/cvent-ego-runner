import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// These fingerprints were calculated from the user's existing skill files before
// copying. Verify their domain content wasn't replaced by another rewritten skill.
// Tests use committed source only, never a dependency on the user's home directory.
const sections = [
  ['cvent-registration/SKILL.md', '## Discover the existing event\n', '## Save and verify\n',
    '58e088951e9e8381a0d45df18743e7d26b5c0dc4ad8596ca432e0c9346127c98'],
  ['cvent-website/SKILL.md', '## Bind the website and its source\n', '### Body widgets and pages\n',
    'c6fd205ffd54fa08878656a9e96fb75b7cf4d835722fb16458a16d35b7cc8447'],
  ['cvent-website/SKILL.md', '### Website and registration connection\n', null,
    'f747a5a77e8c40edfe599c545da387f436ce2c92876595333ebed7d89ca96761'],
  ['cvent-discounts/SKILL.md', '## Exact mapping checklist\n', '## Routes and known limits\n',
    '270d10ab55ecd47376feb06cce66365b6bd0469638174fccf05a60113f6d3f51'],
  ['cvent-rr-verify/SKILL.md', '## Verify behavior safely\n', '## Completion rules\n',
    '7f7230b7c7b8a91f7175c0f3fddebc314a3ebc1ac825f113dfa9c3ea4170f9fd'],
  ['cvent-rr-build/references/operating-model.md', '## What Pi decides independently\n', '## Shared task context\n',
    '32902f008f9961b0bc166b94819e1c093010e7077ab424d122579035480c97b0'],
  ['cvent-rr-build/references/rr-interpretation.md', '## Read the workbook, not just its filename\n', '## Minimal requirement record\n',
    'cbcd8f1b486ebe22632a72264592263d4e3dd56f127e1403e1e56466a4db2323'],
];
for (const [file, start, end, expected] of sections) {
  test(`import preserves source domain guidance: ${file} / ${start.trim()}`, async () => {
    const text = await readFile(new URL(`../.pi/skills/${file}`, import.meta.url), 'utf8');
    const first = text.indexOf(start), last = end ? text.indexOf(end, first) : text.length;
    assert.ok(first >= 0 && last > first, 'original section boundaries remain');
    assert.equal(createHash('sha256').update(text.slice(first, last)).digest('hex'), expected);
  });
}
