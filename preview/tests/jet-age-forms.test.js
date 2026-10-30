import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JET_AGE_FORMS, JET_AGE_FORMS_VERSION, boomerangProfile, hoopCentreline, jetAgeFormsManifest, parabolicArch, roundedRectOutline, saucerProfile, stadiumOutline, starburstRays, taperedColumnProfile } from '../../shared/city-kit/jet-age-forms.js';
import { boomerangGeometry, mergeJetAgeParts, prismGeometry, ringGeometry, saucerGeometry, starburstGeometry } from '../src/jet-age-forms.js';

// Shoelace area: positive for a counter-clockwise outline.
const area = points => points.reduce((sum, [x, y], i) => { const [x2, y2] = points[(i + 1) % points.length];return sum + x * y2 - x2 * y; }, 0) / 2;

test('rounded outlines are closed, counter-clockwise and exactly inside their rectangle', () => {
  for (const [w, d, r] of [[5, 6, 1.2], [2, 2, 5], [4, 1, 0]]) {
    const outline = roundedRectOutline(w, d, r);
    assert.ok(area(outline) > 0, 'counter-clockwise');
    const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [-w / 2, w / 2, -d / 2, d / 2]);
    // Rounding removes exactly the four corner remainders (square minus quarter disc) at fine segments.
    const radius = Math.min(r, w / 2, d / 2), fine = roundedRectOutline(w, d, r, 64);
    assert.ok(Math.abs(area(fine) - (w * d - (4 - Math.PI) * radius * radius)) < 1e-3, `area ${w}x${d} r${r}`);
  }
  const capsule = stadiumOutline(2, 6, 32), xs = capsule.map(p => p[0]);
  assert.ok(Math.abs(Math.min(...xs) + 1) < 1e-9 && Math.abs(area(capsule) - (2 * 4 + Math.PI)) < 2e-2, 'stadium: full semicircle ends');
});

test('profiles have the shapes they promise', () => {
  // Saucer: radius from the axis out and back, a thin rim, the dome highest at the axis.
  const saucer = saucerProfile({ radius: 3, rim: 0.03, dome: 0.15, belly: 0.05 });
  assert.equal(saucer[0][0], 0);assert.equal(saucer.at(-1)[0], 0);
  assert.equal(Math.max(...saucer.map(p => p[0])), 3);
  assert.ok(Math.abs(Math.max(...saucer.map(p => p[1])) - 0.23) < 1e-9 && Math.min(...saucer.map(p => p[1])) === 0);
  // Boomerang: closed, rising outward, thinner at the tip than at the wall.
  const wing = boomerangProfile({ depth: 1.6, rise: 0.45, root: 0.2, tip: 0.06 });
  assert.ok(area(wing) !== 0 && wing[0][0] === 0 && Math.max(...wing.map(p => p[0])) > 1.6);
  assert.ok(wing[12][1] > wing[6][1] && wing[6][1] > wing[0][1], 'the underside rises toward the nose');
  // Arch: springs at both ends, crown at mid-span, symmetric.
  const arch = parabolicArch({ span: 10, spring: 1, crown: 3, segments: 16 });
  assert.deepEqual([arch[0], arch[8], arch[16]], [[-5, 1], [0, 3], [5, 1]]);
  for (let i = 0; i <= 16; i++) assert.ok(Math.abs(arch[i][1] - arch[16 - i][1]) < 1e-9);
  // Hoop: legs from the feet straight up, the crown above the legs only.
  const hoop = hoopCentreline({ width: 4, legHeight: 3, crownRise: 1 });
  assert.deepEqual([hoop[0], hoop[1], hoop.at(-2), hoop.at(-1)], [[-2, 0], [-2, 3], [2, 3], [2, 0]]);
  assert.ok(hoop.slice(1, -1).every(([, y]) => y >= 3 - 1e-9) && Math.max(...hoop.map(p => p[1])) === 4);
  // Column: wider at the head than at the foot.
  const column = taperedColumnProfile({ height: 3, foot: 0.06, head: 0.12 });
  assert.ok(column[1][0] < column[2][0] && column.at(-1)[1] === 3);
  // Starburst: unit directions over both hemispheres, from a fixed length cycle.
  const rays = starburstRays({ rays: 14, length: 1 });
  assert.equal(rays.length, 14);
  for (const ray of rays) assert.ok(Math.abs(Math.hypot(...ray.direction) - 1) < 1e-5);
  assert.ok(rays.some(ray => ray.direction[1] > 0.5) && rays.some(ray => ray.direction[1] < -0.5));
});

test('the vocabulary is deterministic and its manifest is pinned', () => {
  assert.deepEqual(jetAgeFormsManifest(), jetAgeFormsManifest());
  const manifest = jetAgeFormsManifest();
  assert.equal(manifest.version, JET_AGE_FORMS_VERSION);
  assert.deepEqual(manifest.forms.map(form => form.name), Object.keys(JET_AGE_FORMS));
  // Change a profile and these change: bump JET_AGE_FORMS_VERSION and re-pin with a note.
  assert.deepEqual(Object.fromEntries(manifest.forms.map(form => [form.name, form.digest])), {
    'rounded-rect': '400db00d', stadium: '0802a7b5', saucer: '11ab7fce', boomerang: '5e812959',
    'parabolic-arch': '421396d0', hoop: 'ecac0e94', 'tapered-column': 'e087a683', starburst: 'c3ff437e',
  });
});

test('builders make solid, bounded geometry in campus axes and merge one draw per material', () => {
  // A prism from a campus-metre outline: scene x = u, y = up, z = -v.
  const prism = prismGeometry([[0, 0], [2, 0], [2, 3], [0, 3]], 1, 4);
  prism.computeBoundingBox();
  assert.deepEqual(prism.boundingBox.min.toArray().map(n => +n.toFixed(6)), [0, 1, -3]);
  assert.deepEqual(prism.boundingBox.max.toArray().map(n => +n.toFixed(6)), [2, 4, 0]);
  const saucer = saucerGeometry({ radius: 2, belly: 0.05, rim: 0.03, dome: 0.15 });
  saucer.computeBoundingBox();
  assert.ok(Math.abs(saucer.boundingBox.max.x - 2) < 1e-6 && Math.abs(saucer.boundingBox.max.y - 0.23) < 1e-6);
  const wing = boomerangGeometry({ depth: 1.5 }, 2.8);
  wing.computeBoundingBox();
  assert.ok(Math.abs(wing.boundingBox.min.z + 1.4) < 1e-6 && Math.abs(wing.boundingBox.max.z - 1.4) < 1e-6, 'centred across its width');
  const ring = ringGeometry(1, 0.02);
  ring.computeBoundingBox();
  assert.ok(ring.boundingBox.max.y - ring.boundingBox.min.y < 0.05, 'a ring lies flat');
  const star = starburstGeometry();
  assert.ok(star.attributes.position.count > 0 && !star.index);
  const merged = mergeJetAgeParts([{ material: 'a', geometry: prism }, { material: 'b', geometry: saucer }, { material: 'a', geometry: ring }, { material: 'b', geometry: wing }, { material: 'a', geometry: star }]);
  assert.deepEqual([...merged.keys()], ['a', 'b']);
  for (const geometry of merged.values()) {
    assert.equal(geometry.index, null);assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position', 'uv']);
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
    geometry.dispose();
  }
  assert.ok(new THREE.Box3().setFromBufferAttribute(merged.get('a').attributes.position).isEmpty() === false);
});
