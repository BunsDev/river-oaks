import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EMERALD, applyEmeraldCut, emeraldAt, emeraldBays, emeraldOutline } from '../src/garden-campus.js';

test('bays follow the mullion module, or split evenly where there is none', () => {
  assert.deepEqual(emeraldBays(0, 6, 0), [0, 1.5, 3, 4.5, 6]);
  assert.deepEqual(emeraldBays(2.2, 6, 0), [2.2, 3, 4.5, 6], 'a run starting after an opening keeps the facade module');
  assert.deepEqual(emeraldBays(0, 1.6, 0), [0, 1.6], 'no sliver bay at the end');
  assert.deepEqual(emeraldBays(0, 4.4), [0, 4.4 / 3, 8.8 / 3, 4.4]);
});

test('every pane is cut like an emerald at its own size: bronze collet, polished lip, four steps, a table', () => {
  const w = 1.5, h = 4.65, c = Math.min(EMERALD.maxChamfer, EMERALD.chamfer * w);
  assert.equal(emeraldAt([w / 2 - 0.01, h / 2 - 0.01], w, h).part, 'bronze', 'the cut corner is bronze');
  assert.equal(emeraldAt([w / 2 - c - 0.05, h / 2 - 0.01], w, h).part, 'bronze', 'the bezel runs round the outline');
  assert.equal(emeraldAt([0, h / 2 - EMERALD.bezel - EMERALD.lip / 2], w, h).part, 'lip', 'a polished lip sits inside the bezel');
  assert.deepEqual(EMERALD.steps.map((limit, step) => emeraldAt([0, h / 2 - limit + 0.004], w, h).step), [0, 1, 2, 3], 'four graduated steps');
  assert.ok(EMERALD.steps.every((limit, i) => i === 0 || limit - EMERALD.steps[i - 1] <= (EMERALD.steps[i - 1] - (EMERALD.steps[i - 2] ?? EMERALD.bezel + EMERALD.lip)) + 1e-9), 'each step no wider than the one outside it');
  assert.ok(EMERALD.tilts.every((tilt, i) => i === 0 || tilt < EMERALD.tilts[i - 1]), 'each step flatter than the one outside it');
  assert.equal(emeraldAt([0, 0], w, h).part, 'table');
  // The chamfer scales with the pane but stops at a fixed size, so tall panes and transoms both read true.
  const outline = emeraldOutline(0.6, 0.9);
  assert.equal(outline.length, 8);
  assert.ok(Math.abs(outline[1][0] - (0.3 - EMERALD.chamfer * 0.6)) < 1e-9);
  assert.equal(emeraldOutline(3, 5)[1][0], 1.5 - EMERALD.maxChamfer);
});

test('the cut patches the real physical shader, and fails loudly if three.js moves its anchors', () => {
  const material = applyEmeraldCut(new THREE.MeshPhysicalMaterial());
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader);
  for (const marker of ['vPaneSize = vec2', 'vPaneAlong = normalize'])assert.ok(shader.vertexShader.includes(marker), marker);
  for (const marker of ['float emeraldDepth(', 'paneMetal', 'paneLip', 'paneFire', 'metalnessFactor = mix', 'roughnessFactor = mix', 'normal = normalize(normal * cos(paneTilt)', 'totalEmissiveRadiance += emeraldChampagne', 'fwidth(paneDepth)'])assert.ok(shader.fragmentShader.includes(marker), marker);
  assert.equal(/\bhalf\b/.test(shader.fragmentShader.slice(shader.fragmentShader.indexOf('float emeraldDepth('))), false, 'no GLSL ES reserved words');
  assert.equal(material.customProgramCacheKey(), 'campus-emerald-cut-v3');
  assert.deepEqual(Object.keys(shader.uniforms).sort(), ['emeraldBlush', 'emeraldBronze', 'emeraldChampagne']);
  assert.throws(() => applyEmeraldCut(new THREE.MeshPhysicalMaterial()).onBeforeCompile({ uniforms: {}, vertexShader: 'void main(){}', fragmentShader: '' }), /anchors missing/);
});
