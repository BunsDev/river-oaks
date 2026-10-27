import * as THREE from 'three';

// Two parallel faces of different materials that overlap a few millimetres apart fight for
// depth: past some distance the depth buffer cannot tell which is in front, and the farther
// one shows through in triangle-shaped patches that crawl as the camera moves. Val saw the
// city-kit planter's brass slab, 1.5 mm under its soil, do this (2026-10-26).
//
// Depth resolution falls with distance squared. With a 24-bit buffer and the walking near
// plane (6 cm), faces `gap` metres apart separate out to about sqrt(gap * near * 2^24 / slack)
// metres; `slack` covers interpolation error and steep viewing angles. A fight matters while
// the overlap still covers a few pixels at that distance, so the allowed gap grows with the
// overlap's size: a planter needs centimetres, a 30 cm tray a few millimetres.
export const DEPTH_MODEL = Object.freeze({ near: 0.06, bits: 24, slack: 4, focalPixels: 700, minPixels: 4, maxMetres: 120 });

export const fightMetres = (gap, model = DEPTH_MODEL) => Math.sqrt(Math.max(0, gap) * model.near * 2 ** model.bits / model.slack);
// How far a patch `size` metres across stays at least `minPixels` tall on screen, capped where
// fog, level of detail and the street's own enclosure make farther fights irrelevant.
export const visibleMetres = (size, model = DEPTH_MODEL) => Math.min(model.maxMetres, size * model.focalPixels / model.minPixels);
// The smallest gap that keeps a patch of that size apart for as long as it is visible.
export const safeGap = (size, model = DEPTH_MODEL) => visibleMetres(size, model) ** 2 * model.slack / (model.near * 2 ** model.bits);

// A material whose faces never fight: not drawn or not depth-tested. Alpha-cut foliage and
// lettering are left out too: their cards are mostly holes, and they would swamp a town scan.
const exempt = material => !material || material.visible === false || material.depthTest === false || material.colorWrite === false
  || (material.transparent && material.opacity === 0) || material.alphaTest > 0 || material.alphaHash;
// Polygon offset pulls a layer forward by whole depth steps at every distance (ground overlays,
// decals): `units` steps, plus `factor` times the face's depth slope. It settles a pair when the
// front layer is pulled at least as far as the back one on both terms, and further on one.
const offset = material => material.polygonOffset ? [material.polygonOffsetUnits ?? 0, material.polygonOffsetFactor ?? 0] : [0, 0];
const pulledAhead = (front, back) => { const [fu, ff] = offset(front), [bu, bf] = offset(back); return fu <= bu && ff <= bf && (fu < bu || ff < bf); };

const area2 = points => { let sum = 0; for (let i = 0; i < points.length; i++) { const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length]; sum += x0 * y1 - x1 * y0; } return sum / 2; };
// Overlap of two convex polygons (counter-clockwise), by clipping one against each edge of the other.
function overlapArea(subject, clip) { const polygon = overlapPolygon(subject, clip); return polygon.length < 3 ? 0 : Math.abs(area2(polygon)); }
function overlapPolygon(subject, clip) {
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i++) {
    const [ax, ay] = clip[i], [bx, by] = clip[(i + 1) % clip.length], input = output; output = [];
    const side = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], sp = side(p), sq = side(q);
      if (sp >= 0) output.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return output;
}
// Narrowest width of a convex polygon: the least, over its edges, of the farthest vertex from that
// edge's line. A long thin band is as visible as its width, not its area.
const narrowest = polygon => {
  let least = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[(i + 1) % polygon.length], length = Math.hypot(bx - ax, by - ay);
    if (length < 1e-9) continue;
    let far = 0; for (const [x, y] of polygon) far = Math.max(far, Math.abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / length);
    least = Math.min(least, far);
  }
  return least === Infinity ? 0 : least;
};
const insideTriangle = ([x, y], [[ax, ay], [bx, by], [cx, cy]]) => {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

// Visible, depth-writing triangles in world space, with their plane. Skinned and morphing
// meshes (people, animals, cloth) move every frame and are left out, as are lines and points.
// Triangles smaller than `minArea` (trim, lettering) are skipped for speed. Past `maxFaces` the
// list is cut short and marked `truncated`, so a scan that could not finish never reads as clean.
// `focus` ({ at: [east, up, north], radius }) keeps only triangles centred within `radius` of a spot.
export function depthFaces(root, { minArea = 0.002, skip = () => false, maxFaces = 1.5e6, focus = null } = {}) {
  const near = focus ? new THREE.Vector3(focus.at[0], focus.at[1], -focus.at[2]) : null, centre = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const faces = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  const world = new THREE.Matrix4(), instance = new THREE.Matrix4();
  root.traverseVisible(object => {
    if (!object.isMesh || object.isSkinnedMesh || object.morphTargetInfluences?.length || skip(object)) return;
    const geometry = object.geometry, position = geometry?.attributes.position, index = geometry?.index;
    if (!position) return;
    // Only what is drawn: the geometry's draw range, by group when it has them.
    const total = index ? index.count : position.count, from = geometry.drawRange.start, count = Math.min(total, from + geometry.drawRange.count), materials = [object.material].flat();
    const groups = (geometry.groups.length && Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }])
      .map(group => ({ ...group, start: Math.max(group.start, from) })).filter(group => group.start < count);
    const copies = object.isInstancedMesh ? object.count : 1;
    for (let copy = 0; copy < copies; copy++) {
      world.copy(object.matrixWorld);
      if (object.isInstancedMesh) { object.getMatrixAt(copy, instance); world.multiply(instance); }
      for (const group of groups) {
        const material = Array.isArray(object.material) ? materials[group.materialIndex] : object.material;
        if (exempt(material)) continue;
        const end = Math.min(count, group.start + group.count);
        for (let i = group.start; i + 2 < end; i += 3) {
          const [ia, ib, ic] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
          a.fromBufferAttribute(position, ia).applyMatrix4(world); b.fromBufferAttribute(position, ib).applyMatrix4(world); c.fromBufferAttribute(position, ic).applyMatrix4(world);
          normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
          const length = normal.length();
          if (length / 2 < minArea) continue;
          if (near && centre.copy(a).add(b).add(c).divideScalar(3).distanceTo(near) > focus.radius) continue;
          normal.divideScalar(length);
          if (faces.length >= maxFaces) { faces.truncated = true; return; }
          faces.push({ object, material, normal: normal.toArray(), offset: normal.dot(a), points: [a.toArray(), b.toArray(), c.toArray()], doubleSided: material.side === THREE.DoubleSide });
        }
      }
    }
  });
  return faces;
}

// Pairs of faces that face the same way, lie within `maxGap` of each other, belong to different
// materials, overlap by enough to fight at a distance where they are still visible, and are open
// to the side they face. A pair buried in a solid (floors between storeys, a box sunk below the
// paving) never reaches the screen, so it is not reported.
// `groundAt(east, north)` (optional) is the terrain height: overlaps below it are buried.
// The height at `point` of the plane through three projected corners with these heights.
function planeHeight([a, b, c], [ha, hb, hc], [x, y]) {
  const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(det) < 1e-12) return (ha + hb + hc) / 3;
  const s = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / det, t = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / det;
  return ha + s * (hb - ha) + t * (hc - ha);
}

export function findDepthFights(root, { model = DEPTH_MODEL, maxGap = 0.25, minOverlap = 0.004, minArea, skip, groundAt = null, focus = null } = {}) {
  const faces = depthFaces(root, { minArea, skip, focus });
  const direction = n => n.map(v => Math.round(v * 100) + 0).join(',');
  // Bucket by direction (to 0.01) and by plane offset in maxGap steps; a face meets its own and
  // the next offset bucket. Double-sided faces also enter facing the other way.
  const buckets = new Map(), byDirection = new Map();
  for (const face of faces) for (const sign of face.doubleSided ? [1, -1] : [1]) {
    const n = face.normal.map(v => v * sign + 0), offset = face.offset * sign, entry = { face, n, offset, sign };
    const d = direction(n), id = `${d}|${Math.floor(offset / maxGap)}`;
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(entry);
    if (!byDirection.has(d)) byDirection.set(d, []);
    byDirection.get(d).push(entry);
  }
  const bases = new Map(), basisFor = (d, n) => {
    if (bases.has(d)) return bases.get(d);
    const axis = Math.abs(n[1]) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), normal = new THREE.Vector3(...n);
    const u = new THREE.Vector3().crossVectors(axis, normal).normalize(), w = new THREE.Vector3().crossVectors(normal, u);
    const project = p => [u.x * p[0] + u.y * p[1] + u.z * p[2], w.x * p[0] + w.y * p[1] + w.z * p[2]];
    project.unproject = ([a, b], h) => [u.x * a + w.x * b + normal.x * h, u.y * a + w.y * b + normal.y * h, u.z * a + w.z * b + normal.z * h];
    project.height = p => normal.x * p[0] + normal.y * p[1] + normal.z * p[2];
    bases.set(d, project); return project;
  };
  const ccw = polygon => area2(polygon) < 0 ? polygon.slice().reverse() : polygon;
  const bounds = points => [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  // A coarse grid over projected boxes keeps the search near linear. Faces wider than `large`
  // cells (the context ground, kilometres across) go on a short list every query checks instead.
  const cell = 4, large = 1024, cells = ([x0, y0, x1, y1], visit) => { for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) visit(`${i},${j}`); };
  const spread = ([x0, y0, x1, y1]) => (Math.floor(x1 / cell) - Math.floor(x0 / cell) + 1) * (Math.floor(y1 / cell) - Math.floor(y0 / cell) + 1);
  // Opaque faces parallel to a direction, either way round, indexed on the plane across it:
  // what a ray leaving a face along its normal crosses.
  const occluders = new Map(), occludersFor = (d, n) => {
    if (occluders.has(d)) return occluders.get(d);
    const project = basisFor(d, n), opposite = direction(n.map(v => -v + 0)), grid = new Map(), wide = [];
    for (const [key, ahead] of [[d, true], [opposite, false]]) for (const entry of byDirection.get(key) ?? []) {
      const material = entry.face.material;
      if (material.transparent || material.alphaTest > 0 || material.alphaHash) continue;
      // Heights across the shared frame, as the faces being tested are measured.
      const flat = entry.face.points.map(project), item = { flat, heights: entry.face.points.map(project.height), ahead, mesh: entry.face.object }, extent = bounds(flat);
      if (spread(extent) > large) wide.push(item); else cells(extent, k => { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(item); });
    }
    const index = { grid, wide }; occluders.set(d, index); return index;
  };
  // A point just in front of a face is buried when the ray onward from it leaves some mesh more
  // often than it enters it: it starts inside one of that mesh's solids (a floor between storeys,
  // a pier inside a slab). Open sheets such as the draped paving only ever enter, so a sheet
  // passing through a building cannot hide what is inside it. Below the terrain is buried too.
  // Undersides within 10 cm of the terrain (a bench foot, a bollard base, a planter sunk under
  // paving that stands 6 cm proud) cannot be seen either: no camera gets below them.
  const open = ({ grid, wide }, project, point, height, normal) => {
    if (groundAt) {
      const [x, y, z] = project.unproject(point, height + 1e-3), ground = groundAt(x, -z);
      if (y < ground - 0.005 || (normal[1] < -0.5 && y < ground + 0.1)) return false;
    }
    const balance = new Map();
    for (const item of [...(grid.get(`${Math.floor(point[0] / cell)},${Math.floor(point[1] / cell)}`) ?? []), ...wide])
      if (insideTriangle(point, item.flat) && planeHeight(item.flat, item.heights, point) > height + 1e-4) balance.set(item.mesh, (balance.get(item.mesh) ?? 0) + (item.ahead ? 1 : -1));
    for (const value of balance.values()) if (value > 0) return false;
    return true;
  };
  const pairs = new Map(), name = face => `${face.object.name || face.object.type}|${face.material.name || face.material.type}`;
  for (const [id, list] of buckets) {
    const [d, slot] = id.split('|'), next = buckets.get(`${d}|${Number(slot) + 1}`) ?? [];
    const project = basisFor(d, list[0].n);
    const flat = entry => entry.flat ??= ccw(entry.face.points.map(project)), box = entry => entry.box ??= bounds(flat(entry));
    // A face's height across the bucket's plane at a projected point. Faces in a bucket are only
    // near-parallel: far from the origin a 0.1° slope moves a plane's offset by metres, so two faces
    // are as far apart as their heights where they overlap.
    const heightAt = (entry, point) => planeHeight(entry.face.points.map(project), entry.face.points.map(project.height), point);
    const grid = new Map(), wide = [], others = [...list, ...next], everyone = others.map((_, index) => index);
    others.forEach((entry, index) => { if (spread(box(entry)) > large) wide.push(index); else cells(box(entry), k => { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(index); }); });
    list.forEach((first, index) => {
      const seen = new Set(), [x0, y0, x1, y1] = box(first);
      // A wide face meets everything in its bucket; any other face its grid cells and the wide ones.
      const candidates = visit => spread(box(first)) > large ? visit(everyone) : (cells(box(first), k => visit(grid.get(k) ?? [])), visit(wide));
      candidates(list_ => { for (const other of list_) {
        if ((other <= index && other < list.length) || seen.has(other)) continue;
        seen.add(other);
        const second = others[other];
        if (first.face.material === second.face.material) continue;
        const dot = first.n[0] * second.n[0] + first.n[1] * second.n[1] + first.n[2] * second.n[2];
        if (dot < 0.99995 || Math.abs(first.offset - second.offset) > maxGap) continue;
        const [u0, v0, u1, v1] = box(second);
        if (u1 <= x0 || u0 >= x1 || v1 <= y0 || v0 >= y1) continue;
        const polygon = overlapPolygon(flat(first), flat(second)), overlap = polygon.length < 3 ? 0 : Math.abs(area2(polygon));
        if (overlap < minOverlap) continue;
        const centre = polygon.reduce((sum, p) => [sum[0] + p[0] / polygon.length, sum[1] + p[1] / polygon.length], [0, 0]);
        const heights = [heightAt(first, centre), heightAt(second, centre)], gap = Math.abs(heights[0] - heights[1]);
        if (gap > maxGap) continue;
        // On one plane (to float noise) neither face is in front, so the one pulled further forward wins.
        const [front, back] = heights[0] >= heights[1] ? [first, second] : [second, first], coplanar = gap < 2e-4;
        if (pulledAhead(front.face.material, back.face.material) || (coplanar && pulledAhead(back.face.material, front.face.material))) continue;
        const size = narrowest(polygon);
        if (fightMetres(gap, model) >= visibleMetres(size, model)) continue;
        // Sample the overlap's centre and points toward its corners, just in front of the nearer face.
        // A small skew keeps samples off the diagonals that split each rectangle into two triangles.
        const samples = [centre, ...polygon.slice(0, 6).map(p => [centre[0] + (p[0] - centre[0]) * 0.8, centre[1] + (p[1] - centre[1]) * 0.8])].map(([x, y]) => [x + 0.00137, y + 0.00071]);
        const nearer = Math.max(...heights), blockers = occludersFor(d, first.n);
        if (!samples.some(point => open(blockers, project, point, nearer, first.n))) continue;
        const pair = [first.face, second.face].sort((p, q) => name(p) < name(q) ? -1 : 1);
        const pairKey = `${name(pair[0])}~${name(pair[1])}~${gap.toFixed(4)}~${d}`;
        const at = front.face.points[0];
        const found = pairs.get(pairKey) ?? { a: name(pair[0]), b: name(pair[1]), gap, normal: first.n.map(v => Math.round(v * 1000) / 1000), overlap: 0, largest: 0, count: 0, at: [at[0], at[1], -at[2]] };
        found.overlap += overlap; found.count++; found.size = Math.max(found.size ?? 0, size);
        if (overlap > found.largest) { found.largest = overlap; const c = polygon.reduce((sum, p) => [sum[0] + p[0] / polygon.length, sum[1] + p[1] / polygon.length], [0, 0]); found.at = [at[0], at[1], -at[2]]; found.centre2d = c; found.faces = [first, second].map(entry => ({ offset: entry.offset, object: entry.face.object, points: entry.face.points.map(p => p.map(v => Math.round(v * 1000) / 1000)) })); }
        pairs.set(pairKey, found);
      } });
    });
  }
  const fights = [...pairs.values()].map(pair => {
    const fight = fightMetres(pair.gap, model), visible = visibleMetres(pair.size, model);
    return { ...pair, fightMetres: fight, visibleMetres: visible, needs: safeGap(pair.size, model) };
  }).sort((p, q) => q.visibleMetres / Math.max(q.fightMetres, 1e-3) - p.visibleMetres / Math.max(p.fightMetres, 1e-3));
  return Object.assign(fights, { faces: faces.length, truncated: Boolean(faces.truncated) });
}

// The depth buffer's real reach, measured on this renderer: a red plane a known gap under a green
// one, seen from each distance and elevation through the walking camera's near plane, counting the
// red pixels near the centre of the frame. The model's `slack` is what these measurements imply.
export function measureDepthPrecision(renderer, {
  near = DEPTH_MODEL.near, far = 6000, fov = 65, size = 96, samples = 4,
  gaps = [0.0015, 0.005, 0.01, 0.02, 0.05, 0.1], distances = [5, 10, 20, 40, 80, 160, 320], elevations = [10, 30, 60],
} = {}) {
  const target = new THREE.WebGLRenderTarget(size, size, { samples: Math.min(samples, renderer.capabilities.maxSamples) });
  const scene = new THREE.Scene(), plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const back = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: 0xff0000 })), front = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  scene.add(back, front);
  const camera = new THREE.PerspectiveCamera(fov, 1, near, far), window = Math.round(size * 0.3), from = Math.round((size - window) / 2);
  const pixels = new Uint8Array(window * window * 4), previous = renderer.getRenderTarget(), measurements = [];
  try {
    for (const elevation of elevations) for (const gap of gaps) for (const distance of distances) {
      const radians = elevation * Math.PI / 180;
      back.scale.setScalar(distance * 4); front.scale.setScalar(distance * 4); front.position.y = gap;
      camera.position.set(0, distance * Math.sin(radians), distance * Math.cos(radians)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, from, from, window, window, pixels);
      let red = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > pixels[i + 1]) red++;
      measurements.push({ elevation, gap, distance, red: red / (window * window) });
    }
  } finally { renderer.setRenderTarget(previous); target.dispose(); plane.dispose(); back.material.dispose(); front.material.dispose(); }
  // For each gap and elevation, the nearest distance where the lower plane shows through.
  const onsets = [];
  for (const elevation of elevations) for (const gap of gaps) {
    const first = measurements.find(m => m.elevation === elevation && m.gap === gap && m.red > 0.005);
    onsets.push({ elevation, gap, fightsFrom: first?.distance ?? null, slack: first ? gap * near * 2 ** DEPTH_MODEL.bits / first.distance ** 2 : null });
  }
  return { near, measurements, onsets };
}
