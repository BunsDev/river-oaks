import test from 'node:test';
import assert from 'node:assert/strict';
import { paverSurface } from '../src/materials.js';
import { createPaverTextures, createPaverLayout, PAVER_PALETTE, PAVER_JOINT_COLOR, PAVER_TILE } from '../src/paver-textures.js';

const maps = createPaverTextures();
const S = maps.color.image.width;
const pxPerM = S / PAVER_TILE;
const rgb = (data, x, y) => { const i = (((y + S) % S) * S + (x + S) % S) * 4; return [data[i], data[i + 1], data[i + 2]]; };
const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const isJoint = c => c.every((v, k) => Math.abs(v - PAVER_JOINT_COLOR[k]) <= 9);

// Read courses back from pixels: course joints are full rows of joint colour,
// paver ends are columns of joint colour inside a course.
function measuredCourses() {
  const jointRows = [];
  for (let y = 0; y < S; y++) {
    let joint = 0;
    for (let x = 0; x < S; x++) if (isJoint(rgb(maps.color.image.data, x, y))) joint++;
    if (joint === S) jointRows.push(y);
  }
  return jointRows;
}

function measuredPavers(top, bottom) {
  const mid = (top + bottom) >> 1, ends = [];
  for (let x = 0; x < S; x++) {
    let column = true;
    for (let y = top; y < bottom; y++) if (!isJoint(rgb(maps.color.image.data, x, y))) { column = false; break; }
    if (column) ends.push(x);
  }
  return ends.map((end, k) => {
    const start = (ends[(k + ends.length - 1) % ends.length] + 1) % S;
    const length = ((end - start + S) % S);
    const samples = [[], [], []];
    for (let t = 2; t < length - 2; t++) for (let y = top + 3; y < bottom - 3; y++) {
      const c = rgb(maps.color.image.data, start + t, y); samples.forEach((s, k) => s.push(c[k]));
    }
    // Per-channel median ignores speckle flecks.
    const median = samples.map(s => s.sort((a, b) => a - b)[s.length >> 1]);
    const kind = Object.entries(PAVER_PALETTE).reduce((best, [k, v]) => diff(median, v.base) < diff(median, PAVER_PALETTE[best].base) ? k : best, 'granite');
    return { start, end, length, kind, mid };
  });
}

const rows = measuredCourses();
const courses = rows.map((row, k) => measuredPavers(k === 0 ? rows[rows.length - 1] + 1 - S : rows[k - 1] + 1, row));

test('courses run parallel to the curb with continuous straight joints every 12.5 cm', () => {
  assert.equal(rows.length, 32, 'one full-width joint row per course');
  rows.forEach((row, k) => assert.equal(row - (rows[k - 1] ?? -1), 0.125 * pxPerM, `course ${k} width`));
  assert.equal(rows.at(-1), S - 1, 'the last course joint closes the tile so courses wrap');
});

test('paver lengths are 3:1 to 4.5:1 and end joints stagger irregularly between courses', () => {
  const offsets = new Set();
  courses.forEach((pavers, c) => {
    assert.ok(pavers.length >= 7 && pavers.length <= 11, `course ${c} paver count ${pavers.length}`);
    for (const p of pavers) {
      const metres = p.length / pxPerM;
      assert.ok(metres >= .37 && metres <= .57, `paver length ${metres} m`);
    }
    const next = courses[(c + 1) % courses.length];
    for (const p of pavers) for (const q of next) {
      const d = Math.abs(p.end - q.end), gap = Math.min(d, S - d) / pxPerM;
      assert.ok(gap >= .12, `end joints in courses ${c}/${c + 1} only ${gap} m apart`);
    }
    offsets.add(pavers[0].end % (0.5 * pxPerM));
  });
  assert.ok(offsets.size >= 8, 'not a regular half bond');
});

test('measured colour shares follow the reference mix', () => {
  const area = {};
  for (const pavers of courses) for (const p of pavers) area[p.kind] = (area[p.kind] ?? 0) + p.length + 1;
  const total = Object.values(area).reduce((a, b) => a + b, 0);
  for (const [kind, spec] of Object.entries(PAVER_PALETTE)) {
    const share = (area[kind] ?? 0) / total;
    assert.ok(Math.abs(share - spec.share) < .03, `${kind} share ${share.toFixed(3)} vs ${spec.share}`);
  }
  const light = (area.granite ?? 0) / total;
  assert.ok(light >= .35 && light <= .4, 'light speckled granite leads the mix');
  const red = (area.terracotta ?? 0) / total;
  assert.ok(red >= .06 && red <= .085, 'terracotta stays sparse');
});

test('terracotta appears as 2-4 paver runs within single, non-adjacent courses', () => {
  const redCourses = [];
  courses.forEach((pavers, c) => {
    const flags = pavers.map(p => p.kind === 'terracotta');
    if (!flags.some(Boolean)) return;
    redCourses.push(c);
    // Rotate so a run never straddles the array start.
    const first = flags.findIndex(f => !f), rotated = flags.slice(first).concat(flags.slice(0, first));
    const lengths = rotated.join(',').split('false').map(s => s.split('true').length - 1).filter(Boolean);
    for (const run of lengths) assert.ok(run >= 2 && run <= 4, `course ${c} red run of ${run}`);
    const metres = pavers.filter(p => p.kind === 'terracotta').reduce((a, p) => a + p.length, 0) / pxPerM;
    assert.ok(metres >= .75 && metres <= 2.3, `course ${c} red strip ${metres} m`);
  });
  assert.ok(redCourses.length >= 4, 'red strips recur in each tile');
  for (const c of redCourses) assert.ok(!redCourses.includes((c + 1) % courses.length), `courses ${c} and ${c + 1} both red`);
});

test('every map wraps seamlessly across both tile edges', () => {
  for (const [name, map] of Object.entries(maps)) {
    const data = map.image.data;
    // The wrap must look like interior neighbour pairs at the same joint phase:
    // end joints fall on 1/16 m steps and Y wraps from a course joint row.
    let seamX = 0, seamY = 0, innerX = 0, innerY = 0;
    const columns = [128, 240, 336, 512, 608, 704, 880], boundaries = [8, 16, 24].map(c => c * S / 32);
    for (let k = 0; k < S; k++) {
      seamX += diff(rgb(data, S - 1, k), rgb(data, 0, k));
      seamY += diff(rgb(data, k, S - 1), rgb(data, k, 0));
      for (const x of columns) innerX += diff(rgb(data, x - 1, k), rgb(data, x, k)) / columns.length;
      for (const y of boundaries) innerY += diff(rgb(data, k, y - 1), rgb(data, k, y)) / boundaries.length;
    }
    const inner = { x: innerX, y: innerY };
    assert.ok(seamX < inner.x * 1.5, `${name} horizontal seam ${seamX} vs interior ${inner.x}`);
    assert.ok(seamY < inner.y * 1.5 && seamY > inner.y / 1.5, `${name} vertical seam ${seamY} vs interior ${inner.y}`);
  }
});

test('relief recesses joints and eases paver edges; stone stays matte and dielectric', () => {
  const n = maps.normal.image.data, arm = maps.arm.image.data;
  const p = courses[4][2], y = p.mid;
  const tilt = x => Math.abs(rgb(n, x, y)[0] - 128);
  assert.ok(tilt(p.start) > 12 && tilt(p.end - 1) > 12, 'chamfer tilts toward the joint');
  assert.ok(tilt(p.start + 40) < 8, 'paver face is flat');
  assert.ok(rgb(arm, p.end, y)[1] > rgb(arm, p.start + 40, y)[1], 'joint sand is rougher than the face');
  assert.ok(rgb(arm, p.end, y)[0] < rgb(arm, p.start + 40, y)[0], 'joint is occluded');
  for (let i = 0; i < arm.length; i += 4) {
    assert.ok(arm[i + 1] >= 190, 'stone stays rough');
    assert.equal(arm[i + 2], 0, 'stone is dielectric');
  }
});

test('granite carries fine salt-and-pepper speckle with per-paver tone variation', () => {
  const granite = courses.flat().filter(p => p.kind === 'granite');
  const means = granite.map(p => {
    let sum = 0, dark = 0, count = 0;
    for (let t = 3; t < p.length - 3; t++) for (let dy = -10; dy <= 10; dy++) {
      const c = rgb(maps.color.image.data, p.start + t, p.mid + dy), l = (c[0] + c[1] + c[2]) / 3;
      sum += l; count++; if (l < 110) dark++;
    }
    const share = dark / count;
    assert.ok(share > .02 && share < .12, `dark fleck share ${share}`);
    return sum / count;
  });
  const spread = Math.max(...means) - Math.min(...means);
  assert.ok(spread > 8 && spread < 50, `granite tone spread ${spread}`);
});

test('generation is deterministic', () => {
  const again = createPaverTextures();
  for (const kind of ['color', 'normal', 'arm']) assert.deepEqual(again[kind].image.data, maps[kind].image.data, kind);
  assert.deepEqual(createPaverLayout(), createPaverLayout());
});

test('district paving shares one set of authored maps across materials', () => {
  const a = paverSurface(), b = paverSurface();
  assert.ok(a.map.isDataTexture, 'paving must use the authored paver pattern');
  assert.equal(a.map, b.map);
  assert.equal(a.normalMap, b.normalMap);
  assert.equal(a.map.colorSpace, 'srgb');
  assert.equal(a.normalMap.colorSpace, '');
  assert.equal(a.roughnessMap.colorSpace, '');
  assert.equal(a.roughnessMap, a.aoMap);
  assert.equal(a.map.wrapS, a.map.wrapT);
  for (let i = 3; i < a.map.image.data.length; i += 4) assert.equal(a.map.image.data[i], 255);
  a.dispose(); b.dispose();
});
