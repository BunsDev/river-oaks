import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/ribbonwing/export-glb.mjs', import.meta.url));
const exportTo = dir => { execFileSync(process.execPath, [script, dir], { stdio: 'pipe' });return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')); };

test('the Ribbonwing exports a GLB that loads back as the same craft, byte for byte the same each time', t => {
  const dirs = [mkdtempSync(join(tmpdir(), 'ribbonwing-a-')), mkdtempSync(join(tmpdir(), 'ribbonwing-b-'))];
  t.after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
  const [first, second] = dirs.map(exportTo);
  assert.equal(first.roundTrip, 'passed', first.problems.join('; '));
  assert.deepEqual(first.loadedLevels, first.levels, 'every LOD level keeps its triangles');
  assert.ok(first.attachments.includes('seat.passenger') && first.attachments.includes('camera.cockpit'));
  assert.equal(first.colliders.length, 6);
  assert.ok(first.pivots.length >= 10, `${first.pivots.length} mechanism pivots`);
  assert.deepEqual([first.texture.width, first.texture.height, first.texture.maxChannelError], [64, 64, 0], 'the quilted upholstery normal map is embedded pixel for pixel');
  assert.deepEqual(first.texture.normalMapped, ['Ribbonwing ivory upholstery', 'Ribbonwing pink upholstery']);
  assert.equal(first.glb.sha256, second.glb.sha256, 'the export is deterministic');
  assert.ok(first.glb.bytes < 16 * 1024 * 1024, `${first.glb.bytes} bytes`);
});
