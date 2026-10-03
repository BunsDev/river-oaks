import * as THREE from 'three';

// Sculpted anthropomorphic heads for the wolf, lynx and other beast forms, after the
// continuous-surface technique of sable-face.js: one smooth shell with sockets,
// a nasal bridge and a muzzle, fur colour painted by masks rather than stacked
// spheres, and almond eyes fitted onto that surface. Metres, in a head-aligned
// frame authored for a 0.153 skull top and scaled to each rig's measured skull.

export const ANIMAL_FACES = {
  wolf: { base: '#7d7976', light: '#e4ded5', dark: '#3b3634', iris: ['#8f5a26', '#e2a24a'], nose: '#1c1a1a', muzzle: .055, muzzleDrop: .012, eyeTilt: .2, ears: { height: .105, width: .052, tilt: .16 }, saddle: .55 },
  'host-wolf': { base: '#3c3634', light: '#b9aca2', dark: '#1d1919', iris: ['#8e5a22', '#d99a3a'], nose: '#141313', muzzle: .055, muzzleDrop: .012, eyeTilt: .2, ears: { height: .11, width: .052, tilt: .16 }, saddle: .5 },
  lynx: { base: '#c39a6b', light: '#f2e5cc', dark: '#4b3a33', iris: ['#6f6b2e', '#c9b55f'], nose: '#8a4f43', muzzle: .02, muzzleDrop: .004, eyeTilt: .12, ears: { height: .085, width: .045, tilt: .1, tuft: .05 }, spots: true, tearLines: true, ruff: true },
  // Beast forms of the humanoid characters reuse the same continuous sculpt.
  'rose-fox': { base: '#f1e9e4', light: '#fffaf7', dark: '#b98a96', iris: ['#6b3f52', '#d79ab4'], nose: '#3b2a2e', muzzle: .05, muzzleDrop: .01, eyeTilt: .24, ears: { height: .128, width: .056, tilt: .2, inner: '#e9aabd' }, saddle: .12 },
  panther: { base: '#1f1b1f', light: '#2f292e', dark: '#0d0b0d', iris: ['#6e4b10', '#e6b84a'], nose: '#161315', muzzle: .024, muzzleDrop: .005, eyeTilt: .16, ears: { height: .07, width: .05, tilt: .14, inner: '#3a3136' } },
  'snow-leopard': { base: '#b8b0a4', light: '#efebe4', dark: '#35302d', iris: ['#53706a', '#b8d4c7'], nose: '#8c6f6d', muzzle: .024, muzzleDrop: .005, eyeTilt: .1, ears: { height: .062, width: .048, tilt: .2 }, spots: { cell: 1 / 62, strength: .78, crown: true }, ruff: true },
  // A deer keeps its warm coat down to a narrow pale muzzle band and chin, with
  // pale rings around large dark eyes, rather than a canid's cream mask.
  deer: { base: '#8f6546', light: '#d9c1a6', dark: '#4f3a2a', iris: ['#1d120b', '#5b3b22'], nose: '#1b1514', muzzle: .078, muzzleDrop: .022, eyeTilt: .04, ears: { height: .142, width: .074, tilt: 1.16, x: .076, y: .094, z: -.03, inner: '#e9d9c9' }, saddle: .3, mask: .45, chin: '#f4ede4', eyeRings: '#efe3d3' },
};

export function createAnimalFace(head, species, { add, ball, tube, material, textures, fit = null }) {
  const P = ANIMAL_FACES[species];
  const smooth = THREE.MathUtils.smoothstep, gauss = (x, w) => Math.exp(-((x / w) ** 2));
  const base = new THREE.Color(P.base), light = new THREE.Color(P.light), dark = new THREE.Color(P.dark);
  // Scale the authored head (skull top .153, radius .097) to the rig's skull.
  const frame = new THREE.Group(); frame.name = `${species} sculpted head`;
  const scale = (fit?.skull.radius ?? .097) / .097;
  frame.scale.setScalar(scale); frame.position.y = (fit?.skull.top ?? .153) - .153 * scale; head.add(frame);

  const furPixels = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const strand = Math.sin(x * 2.35 + Math.sin(y * .055) * 2.5), grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const value = 128 + strand * 25 + (grain - Math.floor(grain) - .5) * 18, n = (y * 256 + x) * 4;
    furPixels[n] = furPixels[n + 1] = furPixels[n + 2] = value; furPixels[n + 3] = 255;
  }
  const fur = new THREE.DataTexture(furPixels, 256, 256); fur.wrapS = fur.wrapT = THREE.RepeatWrapping; fur.repeat.set(3, 2); fur.needsUpdate = true; textures.add(fur);

  // Profile rings [y, half-width, half-depth, depth offset], back of skull to crown.
  const rings = [
    [-.083,.009,.036,.023],[-.072,.031,.052,.025],[-.052,.057,.066,.027],[-.027,.084,.079,.015],
    [.001,.101,.087,.003],[.036,.099,.094,-.004],[.071,.095,.086,-.008],[.108,.081,.076,-.012],
    [.138,.056,.056,-.016],[.154,.023,.029,-.018],[.158,0,0,-.018],
  ];
  function section(y) {
    let i = 0; while (i < rings.length - 2 && y > rings[i + 1][0]) i++;
    const t = THREE.MathUtils.clamp((y - rings[i][0]) / (rings[i + 1][0] - rings[i][0]), 0, 1);
    return [1, 2, 3].map(k => {
      const p0 = rings[Math.max(0, i - 1)][k], p1 = rings[i][k], p2 = rings[i + 1][k], p3 = rings[Math.min(rings.length - 1, i + 2)][k];
      return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    });
  }
  // The muzzle is a forward swell under the eyes whose length is the species' own;
  // the bridge rises into the brow, and sockets are recessed under it.
  const muzzleY = -.024 - P.muzzleDrop;
  function surface(y, angle) {
    const [rx, rz, cz] = section(y), front = Math.max(0, Math.cos(angle)), x = Math.sin(angle) * Math.max(0, rx);
    const muzzle = (.022 + P.muzzle) * gauss(y - muzzleY, .03 + P.muzzle * .35) * Math.exp(-((x / (.05 - P.muzzle * .15)) ** 4));
    const bridge = (.011 + P.muzzle * .45) * gauss(x, .019) * gauss(y - .012, .05) + .017 * gauss(x, .021) * gauss(y - .008, .022);
    const socket = .010 * gauss(Math.abs(x) - .043, .024) * gauss(y - .05, .022);
    return new THREE.Vector3(x, y, Math.cos(angle) * Math.max(0, rz) + cz + front ** 6 * (muzzle + bridge - socket));
  }
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  function furColor(p, front) {
    const feather = .0017 * Math.sin(p.x * 1900 + Math.sin(p.y * 270) * 2);
    // Cream muzzle, cheeks and chin below a line that rises toward the cheeks.
    const mask = 1 - smooth(p.y + feather, -.03 + Math.abs(p.x) * .55, -.008 + Math.abs(p.x) * .55);
    let color = base.clone().lerp(light, mask * smooth(front, .05, .4) * (P.mask ?? 1));
    // Lighter brows over each eye, a darker saddle over the crown (wolves).
    color.lerp(light, gauss(Math.abs(p.x) - .04, .016) * gauss(p.y - .078, .01) * smooth(front, .5, .9) * .7);
    if (P.saddle) color.lerp(dark, smooth(p.y, .085, .13) * P.saddle * (1 - smooth(front, .7, 1) * .5));
    if (P.tearLines) color.lerp(dark, gauss(Math.abs(p.x) - .03 - (.045 - p.y) * .35, .0045) * smooth(p.y, -.005, .02) * (1 - smooth(p.y, .045, .055)) * smooth(front, .5, .85));
    const spots = P.spots === true ? {} : P.spots;
    if (spots && ((Math.abs(p.x) > .04 && p.y < .05 && p.y > -.045) || (spots.crown && p.y > .07))) {
      // Round spots: a jittered centre per cell, each with a soft edge.
      const cell = spots.cell ?? 1 / 90, sx = Math.floor(p.x / cell), sy = Math.floor(p.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const cx = sx + dx, cy = sy + dy; if (hash(cx, cy) < .72) continue;
        const ox = (cx + .25 + hash(cy, cx) * .5) * cell, oy = (cy + .25 + hash(cx + 7, cy) * .5) * cell;
        color.lerp(dark, (spots.strength ?? .5) * gauss(Math.hypot(p.x - ox, p.y - oy), cell * (.18 + hash(cx, cy + 3) * .12)));
      }
    }
    if (P.chin) color.lerp(new THREE.Color(P.chin), Math.max(gauss(p.y - muzzleY + .003, .006), (1 - smooth(p.y, muzzleY - .03, muzzleY - .018)) * .9) * smooth(front, .55, .9) * gauss(p.x, .03));
    if (P.eyeRings) color.lerp(new THREE.Color(P.eyeRings), gauss(Math.hypot(Math.abs(p.x) - .044, p.y - .05) - .02, .0045) * smooth(front, .45, .8) * .85);
    const eyeshadow = gauss(Math.abs(p.x) - .045, .025) * gauss(p.y - .067, .022) * smooth(front, .5, .9);
    return color.multiplyScalar(1 - eyeshadow * .2);
  }
  const rows = 80, cols = 96, positions = [], colors = [], uv = [], indices = [];
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const y = -.083 + row / rows * .241, angle = col / cols * Math.PI * 2, p = surface(y, angle), c = furColor(p, Math.max(0, Math.cos(angle)));
    positions.push(...p); colors.push(c.r, c.g, c.b); uv.push(col / cols, row / rows);
    if (row < rows && col < cols) { const n = row * (cols + 1) + col; indices.push(n, n + 1, n + cols + 1, n + 1, n + cols + 2, n + cols + 1); }
  }
  const skull = new THREE.BufferGeometry();
  skull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); skull.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  skull.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); skull.setIndex(indices); skull.computeVertexNormals();
  add(frame, skull, material('#ffffff', { vertexColors: true, roughness: .86, bumpMap: fur, bumpScale: .00035, sheen: .25, sheenColor: light }), [0, 0, 0], [1, 1, 1], `${species} sculpted face`);

  const onFace = (x, y, lift = .0007) => { const [rx] = section(y), p = surface(y, Math.asin(THREE.MathUtils.clamp(x / Math.max(rx, 1e-4), -1, 1))); return [x, y, p.z + lift]; };
  // Nose at the end of the muzzle: a rounded wedge, wider at the top.
  const tip = onFace(0, muzzleY + .016, .004);
  const nose = ball(frame, material(P.nose, { roughness: .4, clearcoat: .25 }), tip, [.017 + P.muzzle * .05, .011, .012], `${species} nose`);
  const np = nose.geometry.attributes.position; for (let i = 0; i < np.count; i++) np.setX(i, np.getX(i) * (.58 + .42 * (np.getY(i) + 1) / 2)); nose.geometry.computeVertexNormals();
  const mouth = material('#3a2b27', { roughness: .8 });
  tube(frame, mouth, [onFace(0, muzzleY + .004), onFace(0, muzzleY - .004), onFace(0, muzzleY - .011)], .0007, `${species} philtrum`);
  tube(frame, mouth, [onFace(-.026, muzzleY - .01), onFace(-.016, muzzleY - .015), onFace(0, muzzleY - .016), onFace(.016, muzzleY - .015), onFace(.026, muzzleY - .01)], .0009, `${species} mouth`);

  // Fibred iris: a dark pupil, warm collarette and a limbal ring.
  const [irisBase, irisGold] = P.iris.map(c => new THREE.Color(c));
  const irisPixels = new Uint8Array(256 * 256 * 4), irisColor = new THREE.Color();
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const dx = (x - 127.5) / 127.5, dy = (y - 127.5) / 127.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), ir = r / .56;
    const fibre = Math.sin(a * 93 + Math.sin(r * 31) * .8) * .09 + Math.sin(a * 173 - r * 13) * .045;
    const c = irisColor.copy(irisBase).lerp(irisGold, (1 - smooth(ir, .3, .75)) * .65).multiplyScalar((.9 + fibre) * (1 - smooth(ir, .8, 1) * .75));
    if (ir < .32) c.set('#0d0907'); if (ir > 1) c.set('#efe4d2');
    const n = (y * 256 + x) * 4; c.convertLinearToSRGB(); irisPixels[n] = c.r * 255; irisPixels[n + 1] = c.g * 255; irisPixels[n + 2] = c.b * 255; irisPixels[n + 3] = 255;
  }
  const irisMap = new THREE.DataTexture(irisPixels, 256, 256); irisMap.colorSpace = THREE.SRGBColorSpace; irisMap.needsUpdate = true; textures.add(irisMap);
  const lidColor = material(base.clone().multiplyScalar(.7).getStyle(), { roughness: .8 }), lash = material('#1b1412', { roughness: .6 });
  const glint = material('#fff8ee', { emissive: '#b0a396', roughness: .1 }), socketDark = material('#1b1412', { roughness: .45 });
  const eyes = [];
  for (const side of [-1, 1]) {
    const opening = new THREE.Group(); opening.name = `${species} eye ${side}`; opening.position.set(side * .044, .05, .075); opening.rotation.z = side * P.eyeTilt; frame.add(opening); eyes.push(opening);
    const pos = [], idx = [], er = 20, ec = 48;
    for (let row = 0; row <= er; row++) for (let col = 0; col <= ec; col++) {
      const u = col / ec * 2 - 1, h = Math.max(0, 1 - u * u) ** .85;
      pos.push(u * .027, (-.0115 + row / er * .025) * h, .010 + .007 * (1 - u * u));
      if (row < er && col < ec) { const n = row * (ec + 1) + col; idx.push(n, n + 1, n + ec + 1, n + 1, n + ec + 2, n + ec + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const uvs = new Float32Array(pos.length / 3 * 2); for (let i = 0; i < pos.length / 3; i++) { uvs[i * 2] = pos[i * 3] / .056 + .5; uvs[i * 2 + 1] = pos[i * 3 + 1] / .056 + .5; }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.computeVertexNormals();
    add(opening, g.clone(), socketDark, [0, 0, -.0006], [1.08, 1.1, 1]);
    add(opening, g, material('#ffffff', { map: irisMap, roughness: .5, specularIntensity: .15 }), [0, 0, 0], [1, 1, 1], `${species} eye`);
    ball(opening, glint, [-.004, .006, .018], [.0022, .0027, .0008]);
    tube(opening, lidColor, [[-.027, 0, .01], [-.014, .0105, .016], [0, .014, .018], [.015, .0105, .016], [.027, 0, .01]], .0024, `${species} upper lid`);
    tube(opening, lash, [[-.027, 0, .012], [-.014, .0105, .018], [0, .014, .02], [.015, .0105, .018], [.027, 0, .012]], .0012);
    tube(opening, lidColor, [[-.027, 0, .01], [-.013, -.0095, .016], [0, -.0125, .018], [.013, -.0095, .016], [.027, 0, .01]], .0013);
    // Fit every eye layer onto the sculpted surface so nothing floats off the temple.
    frame.updateMatrixWorld(true);
    opening.traverse(mesh => {
      if (!mesh.isMesh) return;
      const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(mesh.matrixWorld), fromFrame = toFrame.clone().invert();
      const toOpening = new THREE.Matrix4().copy(opening.matrixWorld).invert().multiply(mesh.matrixWorld), v = mesh.geometry.attributes.position;
      for (let i = 0; i < v.count; i++) {
        const local = new THREE.Vector3().fromBufferAttribute(v, i), depth = local.clone().applyMatrix4(toOpening).z, p = local.applyMatrix4(toFrame), [rx] = section(p.y);
        p.z = surface(p.y, Math.asin(THREE.MathUtils.clamp(p.x / Math.max(rx, 1e-4), -1, 1))).z + .0018 + (depth - .010) * .45;
        p.applyMatrix4(fromFrame); v.setXYZ(i, p.x, p.y, p.z);
      }
      v.needsUpdate = true; mesh.geometry.computeVertexNormals();
    });
  }

  // Cupped ears with a rounded rim, a furred back and a pale interior; the lynx's carry black tufts.
  const E = P.ears;
  for (const side of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(side * (E.x ?? .066), E.y ?? .118, E.z ?? -.024); ear.rotation.set(-.1, side * .2, -side * E.tilt); frame.add(ear);
    const outer = [], inner = [], oi = [], rows = 24, cols = 24;
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const v = r / rows, u = c / cols * 2 - 1, half = (1 - v) ** .9 * E.width, cup = (1 - u * u) * (1 - v) * .016;
      outer.push(u * half, v * E.height, -cup); inner.push(u * half * .78, v * E.height * .86 + .004, -cup * .7 + .003);
      if (r < rows && c < cols) { const n = r * (cols + 1) + c; oi.push(n, n + cols + 1, n + 1, n + 1, n + cols + 1, n + cols + 2); }
    }
    for (const [pts, surf] of [[outer, material(P.base, { roughness: .9, bumpMap: fur, bumpScale: .0004, side: THREE.DoubleSide })], [inner, material(E.inner ?? P.light, { roughness: .9, side: THREE.DoubleSide })]]) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geometry.setIndex(oi); geometry.computeVertexNormals();
      add(ear, geometry, surf, [0, 0, 0], [1, 1, 1], `${species} ear`);
    }
    if (E.tuft) { const tuft = add(ear, new THREE.ConeGeometry(.0045, E.tuft, 8), material('#16110f', { roughness: .9 }), [0, E.height + E.tuft * .45, -.001]); tuft.rotation.z = side * .08; }
  }

  // Swept cheek fibres soften the silhouette; the lynx's form a full ruff.
  const fibres = [], fibreColors = [];
  for (const side of [-1, 1]) for (let i = 0; i < (P.ruff ? 700 : 380); i++) {
    const t = ((i * 137) % 367) / 367, y = (P.ruff ? -.07 : -.052) + t * (P.ruff ? .09 : .077), angle = side * (1.05 + ((i * 79) % 359) / 359 * (P.ruff ? .55 : .5));
    // Ruff fibres take the fur beneath them, slightly lighter, and lengthen toward the jaw.
    const p = surface(y, angle), c = furColor(p, Math.max(0, Math.cos(angle))).lerp(light, P.ruff ? .25 : 0), len = P.ruff ? .003 + (1 - t) * .007 + (i % 5) * .0006 : .0018 + (i % 5) * .0004;
    const end = p.clone().add(new THREE.Vector3(side * len, -len * .55, len * .1));
    fibres.push(p.x, p.y + .0003, p.z + .0002, p.x, p.y - .0003, p.z + .0002, ...end);
    for (let k = 0; k < 3; k++) fibreColors.push(c.r, c.g, c.b);
  }
  const fuzz = new THREE.BufferGeometry(); fuzz.setAttribute('position', new THREE.Float32BufferAttribute(fibres, 3)); fuzz.setAttribute('color', new THREE.Float32BufferAttribute(fibreColors, 3)); fuzz.computeVertexNormals();
  add(frame, fuzz, material('#ffffff', { vertexColors: true, roughness: 1, side: THREE.DoubleSide }), [0, 0, 0], [1, 1, 1], `${species} cheek fur`);
  return { frame, eyes };
}

// Remove the human head from one instance's skin mesh (never the cached rig):
// triangles above the jaw are dropped, so the sculpted head replaces it.
export function trimHumanHead(model, { geometries, replacements }) {
  const headBone = model.getObjectByName('head'); if (!headBone) return;
  model.updateMatrixWorld(true);
  const headY = model.worldToLocal(headBone.getWorldPosition(new THREE.Vector3())).y, p = new THREE.Vector3();
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh || !/^(young|middleage|old)_.*(male|female)$/i.test(mesh.material?.name ?? '')) return;
    const original = mesh.geometry, geometry = original.clone(), keep = [];
    mesh.skeleton.update();
    const ys = Array.from({ length: geometry.attributes.position.count }, (_, i) => { p.fromBufferAttribute(geometry.attributes.position, i); mesh.applyBoneTransform(i, p).applyMatrix4(mesh.matrixWorld); return model.worldToLocal(p).y; });
    const cutoff = headY - .068, index = geometry.index;
    for (let i = 0; i < index.count; i += 3) {
      const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (tri.some(j => ys[j] <= cutoff)) { keep.push(...tri); for (const j of tri) if (ys[j] > cutoff) geometry.attributes.position.setY(j, original.attributes.position.getY(j) - (ys[j] - cutoff)); }
    }
    geometry.setIndex(keep); geometry.computeVertexNormals(); mesh.geometry = geometry; geometries.add(geometry); replacements.push([mesh, original]);
  });
}
