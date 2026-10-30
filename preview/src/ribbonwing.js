import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchCostumeAttachments } from './costume-batching.js';
import {
  RIBBONWING_PALETTE as P, RIBBONWING_VERSION, BODY_STATIONS, COCKPIT_OPENING, CANOPY_PROFILE, CANOPY_SECTION_POWER, CANOPY_HINGE,
  WING_PLANFORM, WING, FANS, THRUSTERS, PETALS, SEATS, CONTROLS, FEET, STEPS, ATTACHMENTS, LODS, MECHANISMS,
  bodyAt, sectionPoint, openingHalfAngle, openingEdge, profileAt, wingHeightAt, halfWidthAt,
} from './ribbonwing-design.js';
import { createRibbonwingRig, ribbonwingTargets, mechanismAngles } from './ribbonwing-rig.js';
import { createVehicleGlints } from './vehicle-glints.js';

// The Ribbonwing (#777): authored geometry built from the metric contract in
// ribbonwing-design.js, in the road-vehicle frame (front -X, up +Y, left +Z).
// Three levels of detail share one material set; every moving part hangs on a
// named pivot group so the rig (ribbonwing-rig.js) drives all levels at once.
// Static parts are batched per pivot group. The returned handle owns every
// geometry, material and texture it creates and releases them once.

const TAU = Math.PI * 2;

// A quilted upholstery normal map, generated (no image asset): diamond tufts
// on a 64 px tile. Linear data, so no colour space.
function quiltNormalMap() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + y) / size * 2 % 1 - .5, v = (x - y + size) / size * 2 % 1 - .5;
    const nx = -Math.sign(u) * Math.max(0, .5 - Math.abs(v)) * .5, ny = -Math.sign(v) * Math.max(0, .5 - Math.abs(u)) * .5;
    const i = (y * size + x) * 4, len = Math.hypot(nx, ny, 1);
    data[i] = (nx / len * .5 + .5) * 255;data[i + 1] = (ny / len * .5 + .5) * 255;data[i + 2] = (1 / len * .5 + .5) * 255;data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);texture.wrapS = texture.wrapT = THREE.RepeatWrapping;texture.repeat.set(3, 3);texture.colorSpace = THREE.NoColorSpace;texture.needsUpdate = true;texture.name = 'Ribbonwing quilt normal';
  return texture;
}

export function createRibbonwing({ rubberName = 'Road tyre rubber' } = {}) {
  const owned = new Set();
  const own = resource => { owned.add(resource);return resource; };
  const physical = (name, color, options = {}) => { const m = own(new THREE.MeshPhysicalMaterial({ color, roughness: .4, ...options }));m.name = name;return m; };
  const quilt = own(quiltNormalMap());
  const M = {
    lacquer: physical('Ribbonwing pink lacquer', P.lacquer, { roughness: .3, clearcoat: 1, clearcoatRoughness: .06 }),
    ivory: physical('Ribbonwing ivory composite', P.ivory, { roughness: .36, clearcoat: .55, clearcoatRoughness: .16 }),
    chrome: physical('Ribbonwing chrome', P.chrome, { metalness: 1, roughness: .13 }),
    edge: physical('Ribbonwing blue chrome edge', P.edgeBlue, { metalness: 1, roughness: .2 }),
    glass: physical('Ribbonwing mint canopy glass', P.mint, { transparent: true, opacity: .3, roughness: .05, metalness: .1, depthWrite: false }),
    glassFar: physical('Ribbonwing tinted canopy (distance)', '#6E9C92', { roughness: .12, metalness: .35, clearcoat: 1 }),
    seat: physical('Ribbonwing ivory upholstery', P.upholsteryIvory, { roughness: .8, sheen: .4, sheenColor: '#fbf4ea', normalMap: quilt, normalScale: new THREE.Vector2(.35, .35) }),
    seatPink: physical('Ribbonwing pink upholstery', P.upholsteryPink, { roughness: .78, sheen: .4, sheenColor: '#fde0e8', normalMap: quilt, normalScale: new THREE.Vector2(.35, .35) }),
    harness: physical('Ribbonwing harness webbing', P.harness, { roughness: .72 }),
    cockpitIvory: physical('Ribbonwing ivory bulkhead', P.upholsteryIvory, { roughness: .8, side: THREE.DoubleSide }),
    cockpit: physical('Ribbonwing cockpit teal', P.cockpit, { roughness: .62, side: THREE.DoubleSide }),
    mechanical: physical('Ribbonwing dark mechanical', P.mechanical, { metalness: .6, roughness: .45 }),
    bronze: physical('Ribbonwing bronze', P.bronze, { metalness: .9, roughness: .3 }),
    rubber: physical(rubberName, '#151719', { roughness: .88 }),
    gauge: physical('Ribbonwing instrument glow', '#d8f3ea', { emissive: '#bfeee0', emissiveIntensity: .35, roughness: .3 }),
    petal: physical('Ribbonwing pink lacquer (two-sided)', P.lacquer, { roughness: .3, clearcoat: 1, clearcoatRoughness: .06, side: THREE.DoubleSide }),
    glow: physical('Ribbonwing thruster glow', '#ffe3ea', { emissive: '#ffc2d1', emissiveIntensity: 0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  };
  M.glow.userData.bloomless = true;
  const root = new THREE.Group();root.name = 'Ribbonwing';root.userData.ribbonwingVersion = RIBBONWING_VERSION;
  const lod = new THREE.LOD();lod.name = 'Ribbonwing LOD';root.add(lod);
  const batchGroups = [], bakeGroups = [];
  const group = (name, parent, position = [0, 0, 0]) => { const g = new THREE.Group();g.name = name;g.position.fromArray(position);parent.add(g);batchGroups.push(g);return g; };
  const mesh = (geometry, material, parent, { shadow = true, name } = {}) => { own(geometry);const m = new THREE.Mesh(geometry, material);m.castShadow = m.receiveShadow = shadow;if (name) m.name = name;parent.add(m);return m; };
  const rbox = (size, material, parent, position, radius = .02) => { const m = mesh(new RoundedBoxGeometry(...size, 2, radius), material, parent);m.position.fromArray(position);return m; };
  const cylinder = (rTop, rBottom, height, segments, material, parent, position, open = false) => { const m = mesh(new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1, open), material, parent);m.position.fromArray(position);return m; };
  const tube = (points, radius, material, parent, segments = 8, closed = false) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed), Math.max(8, points.length * 6), radius, segments, closed), material, parent);
  const torus = (radius, thickness, material, parent, position, rotation = [0, 0, 0], segments = 48) => { const m = mesh(new THREE.TorusGeometry(radius, thickness, 8, segments), material, parent);m.position.fromArray(position);m.rotation.set(...rotation);return m; };
  // A grid surface sampled by sample(u, v) -> [x, y, z]; front faces follow du x dv.
  const surface = (nu, nv, sample, material, parent, options) => {
    const positions = [], uv = [], indices = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { positions.push(...sample(i / nu, j / nv));uv.push(i / nu, j / nv); }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1;indices.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));g.setIndex(indices);g.computeVertexNormals();
    return mesh(g, material, parent, options);
  };
  const xFrom = s => { const nose = BODY_STATIONS[0][0], tail = BODY_STATIONS[BODY_STATIONS.length - 1][0];return nose + (tail - nose) * (1 - Math.cos(s * Math.PI)) / 2; };
  const cosine = (a, b, s) => a + (b - a) * (1 - Math.cos(s * Math.PI)) / 2;
  // Body loft. With `open`, the top arc is cut for the cockpit.
  const body = (parent, nu, nv, open) => surface(nu, nv, (u, v) => {
    const x = xFrom(u), a = open ? openingHalfAngle(x) : 0, angle = Math.PI / 2 + a + (TAU - 2 * a) * v, [y, z] = sectionPoint(bodyAt(x), angle);return [x, y, z];
  }, M.ivory, parent);
  // Pink lacquer flank swoosh (both sides), 4 mm proud of the ivory.
  const swoosh = (parent, nu, nv, side) => surface(nu, nv, (u, v) => {
    const x = cosine(-2.86, 1.62, u), s = (x + 2.86) / 4.48, centre = .34 - .62 * s, half = .02 + .34 * Math.sin(Math.min(1, s * 1.7) * Math.PI / 2) * (1 - .45 * Math.max(0, s - .6) / .4);
    const angle = centre + half * (v * 2 - 1), section = bodyAt(x), [y, z] = sectionPoint({ ...section, halfWidth: section.halfWidth + .004, bottom: section.bottom - .004, top: section.top + .004 }, side > 0 ? angle : Math.PI - angle);return [x, y, z];
  }, M.lacquer, parent);
  const canopySample = (u, v) => {
    const x = COCKPIT_OPENING.from + (COCKPIT_OPENING.to - COCKPIT_OPENING.from) * u, edge = openingEdge(x) ?? [sectionPoint(bodyAt(x), Math.PI / 2)[0], 0];
    const apex = Math.max(edge[0], profileAt(CANOPY_PROFILE, u)), t = v * Math.PI, sin = Math.sin(t);
    return [x - CANOPY_HINGE[0], edge[0] + (apex - edge[0]) * Math.abs(sin) ** CANOPY_SECTION_POWER - CANOPY_HINGE[1], edge[1] * Math.cos(t)];
  };

  // ---- Wings ------------------------------------------------------------
  const lePoints = WING_PLANFORM.slice(0, 9), tePoints = WING_PLANFORM.slice(8).reverse();
  const chordAt = z => {
    const along = points => { for (let i = 1; i < points.length; i++) if (z <= points[i][1]) { const [x0, z0] = points[i - 1], [x1, z1] = points[i], t = (z - z0) / (z1 - z0 || 1);return x0 + (x1 - x0) * t; } return points[points.length - 1][0]; };
    return [along(lePoints), along(tePoints)];
  };
  const wingShape = (inset = 0, holes = true) => {
    const curve = new THREE.SplineCurve(WING_PLANFORM.map(([x, z]) => new THREE.Vector2(x, z)));
    const shape = new THREE.Shape(curve.getPoints(96).map(p => new THREE.Vector2(p.x, p.y)));
    if (holes) { const [fx, fz] = FANS.centres[0], hole = new THREE.Path();hole.absarc(fx, fz, FANS.shroud - .03 + inset, 0, TAU, true);shape.holes.push(hole); }
    return shape;
  };
  // Reverse every triangle's winding (indexed or not), then renormal.
  const flip = geometry => {
    if (geometry.index) { const a = geometry.index.array;for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]]; }
    else for (const attribute of Object.values(geometry.attributes)) { const n = attribute.itemSize, a = attribute.array;for (let i = 0; i < attribute.count; i += 3) for (let k = 0; k < n; k++) [a[(i + 1) * n + k], a[(i + 2) * n + k]] = [a[(i + 2) * n + k], a[(i + 1) * n + k]]; }
    geometry.computeVertexNormals();return geometry;
  };
  // Extrude a planform shape (x, z) and bend it onto the chord surface. The
  // remap swaps two axes, so the winding is flipped back to face outward.
  const bendWing = (geometry, thickness, lift = 0) => {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getY(i), d = p.getZ(i), taper = 1 - .75 * Math.max(0, Math.min(1, (z - WING.planformRoot) / (2.92 - WING.planformRoot)));
      p.setXYZ(i, x, wingHeightAt(z) + (d - thickness / 2 + lift) * taper, z);
    }
    return flip(geometry);
  };
  // Mirror a left-wing geometry to the right (z -> -z, winding flipped).
  const mirror = geometry => flip(geometry.clone().scale(1, 1, -1));
  const pinkInset = () => {
    const outline = [];
    for (let i = 0; i <= 24; i++) { const z = .92 + (2.86 - .92) * i / 24, [le] = chordAt(z);outline.push(new THREE.Vector2(le + .035 + .02 * (1 - i / 24), z)); }
    for (let i = 24; i >= 0; i--) { const z = .92 + (2.86 - .92) * i / 24, [le, te] = chordAt(z);outline.push(new THREE.Vector2(le + (te - le) * (.6 + .12 * i / 24), z)); }
    const shape = new THREE.Shape(outline), [fx, fz] = FANS.centres[0], hole = new THREE.Path();hole.absarc(fx, fz, FANS.shroud + .03, 0, TAU, true);shape.holes.push(hole);
    return shape;
  };

  // ---- Pivots registered per level, driven together by the rig ------------
  const pivots = { canopy: [], wings: [], fans: [], nozzles: [], gear: [], steps: [], glows: [], stick: [] };

  const buildWing = (parent, side, detail) => {
    const [px, py, pz] = WING.pivot, pivot = group(`Ribbonwing ${side > 0 ? 'left' : 'right'} wing pivot`, parent, [px, py, side * pz]);
    pivots.wings.push({ side, group: pivot });
    const local = geometry => { geometry.translate(-px, -py, -pz);return side > 0 ? geometry : (() => { const m = mirror(geometry);geometry.dispose();return m; })(); };
    const curveSegments = detail === 'far' ? 10 : detail === 'medium' ? 18 : 36;
    const wing = new THREE.ExtrudeGeometry(wingShape(0, detail !== 'far'), { depth: WING.thickness, bevelEnabled: false, curveSegments });
    mesh(local(bendWing(wing, WING.thickness)), M.ivory, pivot);
    if (detail !== 'far') {
      const inset = new THREE.ExtrudeGeometry(pinkInset(), { depth: .004, bevelEnabled: false, curveSegments });
      mesh(local(bendWing(inset, .004, WING.thickness / 2 + .001)), M.lacquer, pivot);
      // Blue-chrome trailing edge from the tip back to the root.
      const edge = tePoints.map(([x, z]) => [x - px, wingHeightAt(z) - py, side * (z - pz)]);
      tube(edge, detail === 'near' ? .022 : .018, M.edge, pivot, 6);
      tube(lePoints.slice(3).map(([x, z]) => [x - px - .005, wingHeightAt(z) - py, side * (z - pz)]), .012, M.chrome, pivot, 6);
    }
    // The shrouded lift fan in the wing: chrome lips, dark duct, spinning rotor.
    const [fx, fz] = FANS.centres[0], fy = wingHeightAt(fz), fan = [fx - px, fy - py, side * (fz - pz)];
    if (detail === 'far') { const disc = mesh(new THREE.CircleGeometry(FANS.rotor, 20), M.mechanical, pivot);disc.position.set(fan[0], fan[1] + WING.thickness * .2, fan[2]);disc.rotation.x = -Math.PI / 2;return; }
    for (const dy of [WING.thickness * .45, -WING.thickness * .45]) torus(FANS.shroud - .04, .032, M.chrome, pivot, [fan[0], fan[1] + dy, fan[2]], [Math.PI / 2, 0, 0], detail === 'near' ? 56 : 32);
    cylinder(FANS.rotor + .03, FANS.rotor + .03, FANS.depth, detail === 'near' ? 40 : 24, M.mechanical, pivot, fan, true).material = M.mechanical;
    for (let i = 0; i < 4; i++) { const strut = rbox([FANS.rotor * 2, .025, .03], M.mechanical, pivot, [fan[0], fan[1] - FANS.depth * .38, fan[2]], .005);strut.rotation.y = i * Math.PI / 4; }
    const rotor = new THREE.Group();rotor.name = `Ribbonwing ${side > 0 ? 'left' : 'right'} fan rotor`;rotor.position.fromArray(fan);pivot.add(rotor);pivots.fans.push(rotor);batchGroups.push(rotor);
    const blades = detail === 'near' ? FANS.blades : 7;
    for (let i = 0; i < blades; i++) {
      const blade = rbox([FANS.rotor - .09, .012, .09], M.mechanical, rotor, [0, 0, 0], .004), a = i / blades * TAU;
      blade.position.set(Math.cos(a) * (FANS.rotor + .09) / 2, 0, Math.sin(a) * (FANS.rotor + .09) / 2);blade.rotation.set(.45 * side, -a, 0, 'YXZ');
    }
    const hub = mesh(new THREE.SphereGeometry(.1, 20, 12, 0, TAU, 0, Math.PI / 2), M.chrome, rotor);hub.scale.y = .8;
    cylinder(.1, .1, .05, 20, M.bronze, rotor, [0, -.025, 0]);
  };

  const buildThruster = (parent, side, detail) => {
    const [cx, cy, cz] = THRUSTERS.centres[0], z = side * cz, L = THRUSTERS.length, R = THRUSTERS.radius;
    // Static pylon from the spine to the knuckle on the nacelle's inboard side.
    const knuckle = [cx + THRUSTERS.gimbalOffset, cy, side * (cz - R - .02)];
    if (detail !== 'far') {
      const pylon = rbox([.42, .1, .34], M.ivory, parent, [cx - .1, cy - .24, side * (cz - R - .02) * .55], .04);pylon.rotation.x = side * .75;
      cylinder(.085, .085, .16, 20, M.chrome, parent, knuckle).rotation.x = Math.PI / 2;
      cylinder(.095, .095, .05, 20, M.bronze, parent, [knuckle[0], knuckle[1], knuckle[2] + side * .06]).rotation.x = Math.PI / 2;
    }
    const gimbal = group(`Ribbonwing ${side > 0 ? 'left' : 'right'} nozzle gimbal`, parent, [cx + THRUSTERS.gimbalOffset, cy, z]);pivots.nozzles.push({ side, group: gimbal });
    const offset = -THRUSTERS.gimbalOffset, segments = detail === 'near' ? 40 : detail === 'medium' ? 24 : 12;
    const lathe = (profile, material) => { const g = new THREE.LatheGeometry(profile.map(([r, x]) => new THREE.Vector2(r, x)), segments);g.rotateZ(-Math.PI / 2);g.translate(offset, 0, 0);return mesh(g, material, gimbal); };
    lathe([[.24, -L / 2], [.28, -L / 2 + .04], [R, -L / 2 + .14], [R, -.08], [R * .98, .2], [R * .82, L / 2 - .06], [R * .7, L / 2]], M.ivory);
    if (detail === 'far') return;
    lathe([[R + .003, -.06], [R + .003, .12]], M.petal);
    torus(.255, .03, M.chrome, gimbal, [offset - L / 2 + .015, 0, 0], [0, Math.PI / 2, 0], segments);
    torus(R * .7 - .01, .022, M.chrome, gimbal, [offset + L / 2, 0, 0], [0, Math.PI / 2, 0], segments);
    // Intake fan face and the nozzle's dark throat with its bounded glow.
    const face = cylinder(.235, .235, .02, segments, M.mechanical, gimbal, [offset - L / 2 + .09, 0, 0]);face.rotation.z = Math.PI / 2;
    if (detail === 'near') for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, blade = rbox([.012, .2, .05], M.bronze, gimbal, [offset - L / 2 + .07, Math.cos(a) * .11, Math.sin(a) * .11], .004);blade.rotation.set(a, 0, .4, 'XYZ'); }
    const spinner = mesh(new THREE.SphereGeometry(.07, 16, 10), M.bronze, gimbal);spinner.position.set(offset - L / 2 + .05, 0, 0);spinner.scale.x = 1.4;
    cylinder(R * .66, R * .66, .03, segments, M.mechanical, gimbal, [offset + L / 2 - .05, 0, 0]).rotation.z = Math.PI / 2;
    const glow = mesh(new THREE.CircleGeometry(R * .6, segments), M.glow, gimbal, { shadow: false });glow.position.set(offset + L / 2 - .02, 0, 0);glow.rotation.y = Math.PI / 2;glow.userData.aoExclude = true;pivots.glows.push(glow);
  };

  const buildPetal = (parent, side, detail) => {
    const root = PETALS.roots[0], tip = PETALS.tips[0], mid = [root[0] + (tip[0] - root[0]) * .38, root[1] + (tip[1] - root[1]) * .55, root[2] + (tip[2] - root[2]) * .5];
    const spine = new THREE.CatmullRomCurve3([root, mid, tip].map(([x, y, z]) => new THREE.Vector3(x, y, side * z)));
    const across = new THREE.Vector3(-1, 0, side).normalize(), nu = detail === 'near' ? 28 : detail === 'medium' ? 14 : 8, nv = detail === 'far' ? 2 : 6;
    surface(nu, nv, (u, v) => {
      const point = spine.getPoint(u), tangent = spine.getTangent(u), width = PETALS.width * Math.sin(Math.PI * Math.min(1, u * 1.08)) ** .75 * (1 - .25 * u);
      const side2 = new THREE.Vector3().crossVectors(tangent, across).normalize(), w = (v * 2 - 1) * width / 2, cup = (1 - (v * 2 - 1) ** 2) * width * .12;
      return point.addScaledVector(across.clone().projectOnPlane(tangent).normalize(), w).addScaledVector(side2, cup * side).toArray();
    }, M.petal, parent);
    if (detail === 'near') tube(spine.getPoints(12).map(p => p.toArray()), .014, M.ivory, parent, 6);
  };

  const buildFoot = (parent, index, detail) => {
    const [hx, hy, hz] = FEET.hinges[index], [px, pz] = FEET.pads[index], foot = group(`Ribbonwing ${['nose', 'left', 'right'][index]} foot`, parent, [hx, hy, hz]);
    pivots.gear.push({ index, side: Math.sign(hz), group: foot });
    const length = hy - .005, segments = detail === 'near' ? 16 : 8;
    cylinder(.045, .045, length * .55, segments, M.chrome, foot, [0, -length * .275, 0]);
    if (detail !== 'far') { const knee = mesh(new THREE.SphereGeometry(.06, segments, 8), M.mechanical, foot);knee.position.set(0, -length * .55, 0); }
    cylinder(.035, .04, length * .45, segments, detail === 'far' ? M.mechanical : M.chrome, foot, [0, -length * .775, 0]);
    // The pad: a dark rubber foot on a chrome rim, its bottom on the ground.
    cylinder(FEET.padRadius, FEET.padRadius, .035, detail === 'near' ? 28 : 12, M.mechanical, foot, [px - hx, -length + .0175, pz - hz]);
    if (detail !== 'far') torus(FEET.padRadius, .012, M.chrome, foot, [px - hx, -length + .03, pz - hz], [Math.PI / 2, 0, 0], 28);
  };

  const buildSteps = (parent, side) => {
    const [hx, hy, hz] = STEPS.hinges[0], pivot = group(`Ribbonwing ${side > 0 ? 'left' : 'right'} boarding steps`, parent, [hx, hy, side * hz]);
    pivots.steps.push({ side, group: pivot });
    // The housing (static) and the telescoping ladder (rails scale, treads follow).
    rbox([.5, .1, .06], M.ivory, parent, [hx, hy - .02, side * (hz + .01)], .025);
    tube([[hx - .25, hy - .07, side * (hz + .04)], [hx + .25, hy - .07, side * (hz + .04)]], .008, M.chrome, parent, 6);
    const rails = new THREE.Group();rails.name = 'Ribbonwing ladder rails';pivot.add(rails);batchGroups.push(rails);
    for (const dx of [-STEPS.width / 2, STEPS.width / 2]) cylinder(.016, .016, 1, 10, M.chrome, rails, [dx, -.5, 0]);
    // Treads ride in the rails' unit length, level at full deployment, so the
    // ladder extends as one batched assembly.
    for (let i = 0; i < STEPS.treads; i++) {
      const at = -(i + 1) / (STEPS.treads + .4), tread = rbox([STEPS.width, .03 / STEPS.reach, .15], M.ivory, rails, [0, at, 0], .008), grip = rbox([STEPS.width * .9, .006 / STEPS.reach, .12], M.mechanical, rails, [0, at + .018 / STEPS.reach, 0], .002);
      tread.rotation.x = grip.rotation.x = side * MECHANISMS.steps.deployed;grip.castShadow = false;
    }
    pivot.userData.ladder = { rails };
  };

  const buildSeat = (parent, seat, side) => {
    const [x, y, z] = seat.root, s = new THREE.Group();s.name = `Ribbonwing ${side > 0 ? 'pilot' : 'passenger'} seat`;parent.add(s);bakeGroups.push(s);
    rbox([.5, .12, .46], M.seat, s, [x + .02, y - .06, z], .05);
    rbox([.3, .02, .3], M.seatPink, s, [x, y + .001, z], .01);
    const back = new THREE.Group();back.position.set(x + .25, y - .02, z);back.rotation.z = -.16;s.add(back);bakeGroups.push(back);
    rbox([.12, .6, .44], M.seat, back, [0, .3, 0], .05);
    rbox([.02, .4, .26], M.seatPink, back, [-.065, .33, 0], .01);
    rbox([.11, .12, .28], M.seat, back, [.01, .66, 0], .05);
    // Four-point harness: shoulder straps, lap belt and a chrome buckle.
    for (const dz of [-.1, .1]) rbox([.012, .56, .045], M.harness, back, [-.068, .3, dz], .004);
    rbox([.05, .012, .42], M.harness, s, [x - .21, y + .03, z], .004);
    torus(.035, .009, M.chrome, s, [x - .23, y + .05, z], [0, Math.PI / 2, 0], 20);
  };

  const buildCockpit = parent => {
    const t = .035, { to, dashFace } = COCKPIT_OPENING;
    // Inner tub (normals inward) from the dash face to the rear bulkhead.
    surface(28, 32, (u, v) => {
      const x = dashFace + (to - dashFace) * u, a = openingHalfAngle(x), section = bodyAt(x), inset = { ...section, halfWidth: section.halfWidth - t, bottom: section.bottom + t, top: section.top - t };
      const angle = Math.PI / 2 + a + (TAU - 2 * a) * (1 - v), [y, z] = sectionPoint(inset, angle);return [x, y, z];
    }, M.cockpit, parent);
    const cap = (x, material, facing) => {
      const section = bodyAt(x), a = openingHalfAngle(x), shape = new THREE.Shape(), n = 32;
      for (let i = 0; i <= n; i++) { const angle = Math.PI / 2 + a + (TAU - 2 * a) * i / n, [y, z] = sectionPoint({ ...section, halfWidth: section.halfWidth - t, bottom: section.bottom + t, top: section.top - t }, angle);i ? shape.lineTo(z, y) : shape.moveTo(z, y); }
      const g = new THREE.ShapeGeometry(shape);g.rotateY(facing > 0 ? Math.PI / 2 : -Math.PI / 2);
      const m = mesh(g, material, parent);m.position.x = x;return m;
    };
    cap(dashFace, M.cockpit, 1);
    cap(to - .01, M.cockpitIvory, -1);
    // Glare shield over the dash, from the canopy's front to the dash face.
    surface(10, 12, (u, v) => {
      const x = COCKPIT_OPENING.from + .02 + (dashFace - COCKPIT_OPENING.from - .02) * u, edge = openingEdge(x) ?? [1.1, 0], z = edge[1] * (1 - 2 * v);
      return [x, edge[0] + .012 + .05 * (1 - (z / Math.max(edge[1], .01)) ** 2) * u, z];
    }, M.cockpit, parent);
    // Floor, dash face instruments, console, controls.
    // The floor follows the tub: at each station it spans the hull's inner width at floor height.
    surface(16, 8, (u, v) => { const x = dashFace + (-.9 - dashFace) * u, half = Math.max(0, halfWidthAt(bodyAt(x), SEATS.pilot.floor) - t - .01);return [x, SEATS.pilot.floor, half * (2 * v - 1)]; }, M.cockpit, parent);
    const [dx, dy] = CONTROLS.dashboard;
    rbox([.08, .2, 1.12], M.cockpit, parent, [dashFace + .03, dy - .02, 0], .03);
    torus(.075, .012, M.bronze, parent, [dashFace + .075, dy, 0], [0, Math.PI / 2, 0], 28);
    const gauge = cylinder(.07, .07, .01, 24, M.gauge, parent, [dashFace + .072, dy, 0]);gauge.rotation.z = Math.PI / 2;
    for (const side of [1, -1]) { const screen = rbox([.01, .1, .2], M.gauge, parent, [dashFace + .072, dy - .01, side * .3], .01);screen.castShadow = false; }
    rbox([.02, .04, .04], M.lacquer, parent, [dashFace + .075, dy - .1, .12], .01);
    rbox([1.05, .3, .18], M.seat, parent, [-1.52, .73, 0], .05);
    rbox([.5, .02, .12], M.cockpit, parent, [-1.58, .885, 0], .008);
    // Pilot side stick (right hand) on a gimbal that tilts with steering.
    const stick = group('Ribbonwing pilot side stick', parent, CONTROLS.stickPivot);pivots.stick.push(stick);
    const [sx, sy, sz] = CONTROLS.stickPivot, [gx, gy, gz] = CONTROLS.stickGrip;
    tube([[0, 0, 0], [(gx - sx) * .5, (gy - sy) * .55, (gz - sz) * .5], [gx - sx, gy - sy - .05, gz - sz]], .012, M.chrome, stick, 8);
    const grip = mesh(new THREE.CapsuleGeometry(.024, .08, 4, 12), M.lacquer, stick);grip.position.set(gx - sx, gy - sy, gz - sz);
    cylinder(.04, .05, .03, 16, M.harness, parent, [sx, sy - .005, sz]);
    // Throttle on the left sill (left hand) and passenger grab handles.
    const [tx, ty, tz] = CONTROLS.throttleGrip;
    rbox([.26, .05, .06], M.cockpit, parent, [tx + .02, ty - .1, tz + .02], .015);
    tube([[tx + .04, ty - .08, tz + .02], [tx, ty - .02, tz]], .01, M.chrome, parent, 8);
    mesh(new THREE.SphereGeometry(.028, 14, 10), M.lacquer, parent).position.set(tx, ty, tz);
    for (const name of ['hand.passenger.right', 'hand.passenger.left']) { const [hx, hy, hz] = ATTACHMENTS[name];tube([[hx + .06, hy - .02, hz], [hx, hy, hz], [hx - .06, hy - .02, hz]], .011, M.chrome, parent, 8); }
    buildSeat(parent, SEATS.pilot, 1);buildSeat(parent, SEATS.passenger, -1);
  };

  const buildLevel = detail => {
    const level = new THREE.Group();level.name = `Ribbonwing ${detail}`;batchGroups.push(level);
    const nu = { near: 72, medium: 32, far: 14 }[detail], nv = { near: 48, medium: 22, far: 10 }[detail];
    body(level, nu, nv, detail === 'near');
    if (detail !== 'far') for (const side of [1, -1]) swoosh(level, Math.round(nu * .6), 6, side);
    // Nose emblem: a small pink inverted triangle.
    if (detail !== 'far') { const tri = new THREE.Shape([new THREE.Vector2(-.05, .04), new THREE.Vector2(.05, .04), new THREE.Vector2(0, -.045)]), g = new THREE.ShapeGeometry(tri);g.rotateY(-Math.PI / 2);const m = mesh(g, M.lacquer, level);m.position.set(-2.835, .86, 0);m.rotation.z = -.5; }
    // Canopy (rear-hinged) with its chrome rim; distance levels get an opaque tint.
    const canopy = group('Ribbonwing canopy', level, CANOPY_HINGE);pivots.canopy.push(canopy);
    const cu = { near: 40, medium: 18, far: 8 }[detail], cv = { near: 28, medium: 12, far: 6 }[detail];
    if (detail === 'near') {
      // Back faces first, then front faces: no per-triangle sorting either way.
      const inner = surface(cu, cv, canopySample, M.glass, canopy, { shadow: false, name: 'Ribbonwing canopy inner' });inner.renderOrder = 10;
      const outerMaterial = M.glass.clone();outerMaterial.name = 'Ribbonwing mint canopy glass (outer)';own(outerMaterial);
      const outer = surface(cu, cv, canopySample, outerMaterial, canopy, { shadow: false, name: 'Ribbonwing canopy outer' });outer.renderOrder = 11;
      M.glass.side = THREE.BackSide;outerMaterial.side = THREE.FrontSide;
      inner.userData.aoExclude = outer.userData.aoExclude = true;
    } else surface(cu, cv, canopySample, M.glassFar, canopy);
    if (detail !== 'far') {
      const rim = [];for (let i = 0; i <= 24; i++) rim.push(canopySample(i / 24, 0));for (let i = 24; i >= 0; i--) rim.push(canopySample(i / 24, 1));
      tube(rim, detail === 'near' ? .016 : .014, M.chrome, canopy, 6, true);
    }
    for (const side of [1, -1]) { buildWing(level, side, detail);buildThruster(level, side, detail);buildPetal(level, side, detail); }
    for (let i = 0; i < 3; i++) buildFoot(level, i, detail);
    if (detail === 'near') { buildCockpit(level);for (const side of [1, -1]) buildSteps(level, side); }
    // Gear bay outlines under the body and wings (dark recesses).
    if (detail === 'near') for (const [x, , z] of FEET.hinges) { const bay = mesh(new THREE.CircleGeometry(.16, 20), M.mechanical, level);bay.scale.set(1.8, 1, 1);bay.rotation.x = Math.PI / 2;bay.position.set(x, (z ? wingHeightAt(z) - WING.thickness / 2 : bodyAt(x).bottom) - .004, z); }
    return level;
  };

  const levels = {};
  for (const { name, distance } of LODS) { levels[name] = buildLevel(name);lod.addLevel(levels[name], distance); }

  // Ground contacts at the three pads: invisible rubber spheres in wheel
  // groups, so the shared ground fitting and tyre-clearance maths apply.
  const wheels = FEET.pads.map(([x, z], i) => {
    const wheel = new THREE.Group();wheel.name = `Ribbonwing ${['nose', 'left', 'right'][i]} contact`;wheel.position.set(x, .06, z);root.add(wheel);
    const contact = mesh(new THREE.SphereGeometry(.06, 12, 8), M.rubber, wheel, { shadow: false });contact.visible = false;contact.name = 'Ribbonwing ground contact';
    return wheel;
  });

  // Named attachment points.
  const attachments = new Map();
  for (const [name, point] of Object.entries(ATTACHMENTS)) { const a = new THREE.Object3D();a.name = `attach:${name}`;a.position.fromArray(point);root.add(a);attachments.set(name, a); }

  // Static sub-assemblies (seats, seat backs) are baked into their parents, deepest first.
  for (const g of bakeGroups.reverse()) { g.updateMatrix();for (const child of [...g.children]) { child.applyMatrix4(g.matrix);g.parent.add(child); } g.removeFromParent(); }
  batchCostumeAttachments(batchGroups.map(g => ({ group: g })), owned, m => !m.name && m.material !== M.glow);

  // ---- Rig application ------------------------------------------------------
  const rig = createRibbonwingRig();
  let fanPhase = 0, flight = { phase: 'parked', altitude: 0, speed: 0, occupied: false, boarding: false, tuck: 0, turn: 0 };
  const apply = (value, dt, reducedMotion) => {
    const a = mechanismAngles(value);
    for (const c of pivots.canopy) c.rotation.z = -a.canopy;
    for (const { side, group: w } of pivots.wings) w.rotation.set(side * a.wingDroop, side * a.wingSweep, 0, 'XYZ');
    fanPhase = (fanPhase + (reducedMotion ? Math.min(value.fanRate, 6) : value.fanRate) * dt) % TAU;
    for (const f of pivots.fans) f.rotation.y = fanPhase;
    for (const { side, group: n } of pivots.nozzles) n.rotation.set(0, -a.nozzleYaw, -a.nozzlePitch, 'YXZ');
    for (const { index, side, group: g } of pivots.gear) { if (index === 0) g.rotation.set(0, 0, -a.gear);else g.rotation.set(-side * a.gear, 0, 0); }
    for (const { side, group: s } of pivots.steps) {
      s.rotation.x = -side * a.steps;
      s.userData.ladder.rails.scale.y = STEPS.collapsed + (STEPS.reach - STEPS.collapsed) * value.steps;
    }
    const thrust = Math.min(1, value.fanRate / MECHANISMS.fans.hover);
    M.glow.opacity = (reducedMotion ? .25 : .45) * thrust;M.glow.emissiveIntensity = 1.6 * thrust;
    for (const glow of pivots.glows) glow.visible = thrust > .02;
  };
  apply(rig.value, 0, false);
  root.updateMatrixWorld(true);

  let disposed = false;
  return {
    object: root, lod, levels, wheels, attachments, rig, pivots, materials: M,
    get steering() { return pivots.stick[0]; },
    /** The accepted state the mechanisms follow (see ribbonwingTargets). */
    setFlightState(next) { flight = { ...flight, ...next }; },
    get flightState() { return { ...flight }; },
    setSteering(angle) { root.userData.driveSteeringAngle = angle;for (const stick of pivots.stick) stick.rotation.x = angle * .6; },
    /** Jump the mechanisms to the current state's targets. */
    settle() { apply(rig.settle(ribbonwingTargets(flight)), 0, true); },
    animate(dt, reducedMotion = false) { apply(rig.step(ribbonwingTargets(flight), dt), dt, reducedMotion); },
    /** Force a level of detail ('near', 'medium', 'far') or null for automatic. */
    setLod(name) { lod.autoUpdate = !name;if (name) for (const [key, level] of Object.entries(levels)) level.visible = key === name; },
    stats() {
      let triangles = 0, meshes = 0;const geometries = new Set(), materials = new Set();
      root.traverse(o => { if (!o.isMesh) return;meshes++;geometries.add(o.geometry);materials.add(o.material);const g = o.geometry;triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; });
      const perLevel = Object.fromEntries(Object.entries(levels).map(([key, level]) => { let tri = 0, draws = 0;level.traverse(o => { if (o.isMesh) { draws++;tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });return [key, { draws, triangles: Math.round(tri) }]; }));
      return { meshes, triangles: Math.round(triangles), geometries: geometries.size, materials: materials.size, textures: 1, owned: owned.size, perLevel };
    },
    get disposed() { return disposed; },
    dispose() { if (disposed) return;disposed = true;root.removeFromParent();for (const r of owned) r.dispose();owned.clear();root.clear(); },
  };
}

// The road-vehicle interface (road-vehicles.js) over the Ribbonwing, so the
// garage, parking, ground fitting, tyre clearances, driving hands and remote
// riders treat it as the `hover` kind. `wheels` are the three pads' ground
// contacts; nothing rolls. `setFlightState` takes the accepted state the
// mechanisms follow; `animate` advances them.
export function createRibbonwingVehicle(spec) {
  const craft = createRibbonwing(), object = craft.object;object.name = spec.label;
  object.updateMatrixWorld(true);
  const wheelTreads = craft.wheels.map(wheel => {
    const samples = [], seen = new Set();
    wheel.traverse(mesh => {
      if (!mesh.isMesh || mesh.material !== craft.materials.rubber) return;
      const matrix = wheel.matrixWorld.clone().invert().multiply(mesh.matrixWorld), p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const point = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(matrix), key = point.toArray().map(v => v.toFixed(6)).join(',');if (!seen.has(key)) { seen.add(key);samples.push(point); } }
    });
    return samples;
  });
  const glints = createVehicleGlints(spec);object.add(glints.object);
  let lastTime = null, disposed = false;
  return {
    object, wheels: craft.wheels, wheelTreads, spec, spinners: [], pedals: {}, ribbonwing: craft,
    get steering() { return craft.steering; },
    setFlightState(state) { craft.setFlightState(state); },
    animate(now, speed = 0, reducedMotion = false) {
      const dt = lastTime === null ? 0 : Math.max(0, Math.min(.08, (now - lastTime) / 1000));lastTime = now;
      craft.setFlightState({ speed });craft.animate(dt, reducedMotion);glints.update(now, reducedMotion);
    },
    setSaddle() {}, setCrank() {},
    updateSteering(angle) { craft.setSteering(angle); },
    dispose() { if (disposed) return;disposed = true;glints.dispose();craft.dispose(); },
  };
}
