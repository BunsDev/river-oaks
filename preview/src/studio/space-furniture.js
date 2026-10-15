import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Garden Office pilot family (#416): the workstation desk and the side chair.
// Each form is drawn inside a group that cancels its editable root's width/height/depth
// scale, so legs keep a true section and rounded or turned parts are never stretched.
// Records: docs/design/garden-office/asset-manifest.json. Changing this file changes
// the forms; update the records' version, sha256 and measured cost with it.
const mm = value => Math.round(value * 1000);
const DEGREES = Math.PI / 180;

export function createFurnitureForms({ geometry, mesh }) {
  const metric = (root, item) => {
    const group = new THREE.Group();group.name = 'Metric parts';
    group.scale.set(1 / item.width, 1 / item.height, 1 / item.depth);root.add(group);
    return group;
  };
  // A box in metres; a radius rounds its edges at true size.
  const block = (parent, material, position, [x, y, z], name, radius = 0) => {
    const size = [Math.max(.002, x), Math.max(.002, y), Math.max(.002, z)];
    if (radius <= 0) return mesh(parent, geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), material, position, size, name);
    const edge = Math.min(radius, Math.min(...size) / 2 - .0005);
    const shape = geometry(`metric-round:${size.map(mm).join(':')}:${mm(edge)}`, () => new RoundedBoxGeometry(...size, 2, edge));
    return mesh(parent, shape, material, position, [1, 1, 1], name);
  };
  const turned = (parent, material, position, top, bottom, length, name) => {
    const shape = geometry(`metric-turned:${mm(top)}:${mm(bottom)}:${mm(length)}`, () => new THREE.CylinderGeometry(top, bottom, length, 12));
    return mesh(parent, shape, material, position, [1, 1, 1], name);
  };

  return {
    // Oak or walnut top on a slim powder-coated frame; the back panel leaves knee space open.
    desk(root, item, top, frame) {
      const group = metric(root, item), { width: W, depth: D, height: H } = item;
      const thickness = Math.min(.025, H * .1), leg = Math.min(.04, W / 6, D / 6), inset = Math.min(.05, W / 8, D / 8);
      const legHeight = Math.max(.002, H - thickness), rail = Math.min(.06, legHeight / 3);
      const x = W / 2 - inset - leg / 2, z = D / 2 - inset - leg / 2;
      block(group, top, [0, H - thickness / 2, 0], [W, thickness, D], 'Desktop', .004);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(group, frame, [sx * x, legHeight / 2, sz * z], [leg, legHeight, leg], 'Leg');
      for (const sx of [-1, 1]) block(group, frame, [sx * x, legHeight - rail / 2, 0], [leg, rail, 2 * z], 'Side rail');
      if (legHeight > .45) block(group, frame, [0, legHeight - rail - .15, -z], [2 * x - leg, .3, .012], 'Modesty panel');
    },
    // Upholstered seat and reclined back on tapered timber legs.
    chair(root, item, upholstery, timber) {
      const group = metric(root, item), { width: W, depth: D, height: H } = item;
      const seat = Math.min(.47, H * .55), cushion = Math.min(.06, seat * .2), apron = Math.min(.04, seat * .15);
      const legTop = Math.max(.002, seat - cushion - apron), radius = Math.min(.017, W / 12, D / 12), inset = Math.min(.045, W / 6, D / 6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) turned(group, timber, [sx * (W / 2 - inset), legTop / 2, sz * (D / 2 - inset)], radius, radius * .75, legTop, 'Leg');
      block(group, timber, [0, legTop + apron / 2, 0], [W - 2 * inset + 2 * radius, apron, D - 2 * inset + 2 * radius], 'Seat frame');
      block(group, upholstery, [0, seat - cushion / 2, .01], [W - .02, cushion, D - .04], 'Seat cushion', .02);
      const back = H - seat - .06;
      if (back <= .08) return;
      // The back leans 8° from its lower edge; its top stays inside the footprint.
      const lean = 8 * DEGREES, thickness = Math.min(.035, D / 10);
      const reach = Math.max(back * Math.sin(lean), .012 + back * .6 * Math.sin(lean));
      const pivot = new THREE.Group();pivot.name = 'Back pivot';
      pivot.position.set(0, seat + .04, -(D / 2 - thickness / 2 - reach - .003));
      pivot.rotation.x = -lean;group.add(pivot);
      block(pivot, upholstery, [0, back / 2, 0], [W - .06, back, thickness], 'Backrest', .012);
      for (const sx of [-1, 1]) block(pivot, timber, [sx * (W / 2 - .03 - .011), back * .3 - .02, -thickness / 2 - .006], [.022, back * .6 + .04, .012], 'Back support');
    },
    // A long footprint is a slim linear fitting on two cables; otherwise a round shade.
    // Returns where a practical light sits, in the form's metric group.
    pendant(root, item, shade, cord, emitter) {
      const group = metric(root, item), { width: W, depth: D, height: H } = item;
      const long = Math.max(W, D), short = Math.min(W, D), alongX = W >= D;
      const along = (a, b) => alongX ? [a, b] : [b, a];
      if (long >= 2 * short) {
        // The diffuser hangs under the body so the two never share a face.
        const body = Math.min(short, .08), lens = .006, drop = Math.min(.045, H / 4), top = lens + drop;
        const [bx, bz] = along(long, body), [dx, dz] = along(long - .02, body - .015);
        block(group, shade, [0, lens + drop / 2, 0], [bx, drop, bz], 'Linear body', .006);
        block(group, emitter, [0, lens / 2, 0], [dx, lens, dz], 'Diffuser');
        for (const side of [-1, 1]) {
          const [x, z] = along(side * long * .35, 0);
          turned(group, cord, [x, (top + H) / 2, z], .0015, .0015, Math.max(.002, H - top), 'Cable');
          turned(group, cord, [x, H - .0075, z], Math.min(.035, short / 2), Math.min(.035, short / 2), .015, 'Canopy');
        }
        return { group, y: .01 };
      }
      const radius = short / 2 * .95, height = Math.min(H * .5, radius * .9, .35);
      const cone = geometry(`metric-shade:${mm(radius)}:${mm(height)}`, () => new THREE.CylinderGeometry(radius * .4, radius, height, 28, 1, true));
      mesh(group, cone, shade, [0, height / 2, 0], [1, 1, 1], 'Shade');
      turned(group, emitter, [0, .006, 0], radius * .85, radius * .85, .012, 'Diffuser');
      turned(group, cord, [0, (height + H) / 2, 0], .0025, .0025, Math.max(.002, H - height), 'Cord');
      turned(group, cord, [0, H - .0075, 0], Math.min(.05, radius), Math.min(.05, radius), .015, 'Canopy');
      return { group, y: .01 };
    },
    // A tapered pot, three stems and three leaf clusters. Each cluster is one mesh of flat
    // blades placed at the golden angle, so the canopy reads full at a low triangle cost.
    plant(root, item, pot, soil, foliage) {
      const group = metric(root, item), { width: W, depth: D, height: H } = item;
      const radius = Math.min(W, D) / 2, potHeight = Math.min(H * .32, .42), potTop = radius * .62;
      const shape = geometry(`metric-pot:${mm(potTop)}:${mm(potHeight)}`, () => new THREE.CylinderGeometry(potTop, potTop * .78, potHeight, 24));
      mesh(group, shape, pot, [0, potHeight / 2, 0], [1, 1, 1], 'Planter');
      turned(group, pot, [0, potHeight - .01, 0], potTop * 1.06, potTop * 1.06, Math.min(.02, potHeight / 4), 'Planter rim');
      turned(group, soil, [0, potHeight - .02, 0], potTop * .92, potTop * .92, .012, 'Soil');
      const offset = radius * .22, length = Math.min(radius * .72, .22), rise = 60 * DEGREES;
      // Leaves gather on the upper stems, as on a floor plant, leaving bare stems above the pot.
      const low = potHeight + (H - potHeight) * .3, high = H - length * Math.sin(rise) - .005;
      for (let cluster = 0; cluster < 3; cluster++) {
        const angle = cluster * 2 * Math.PI / 3, x = Math.sin(angle) * offset, z = Math.cos(angle) * offset;
        const top = low + (high - low) * (1 - cluster * .18);
        turned(group, soil, [x, (potHeight + top) / 2, z], .006, .006, Math.max(.002, top - potHeight), 'Stem');
        // Tall, narrow canopies get more leaves so they read as full as squat ones.
        const count = Math.min(50, Math.round(30 * Math.max(1, (high - low) / radius / 1.6)));
        const leaves = geometry(`metric-foliage:${mm(length)}:${mm(low)}:${mm(top)}:${cluster}:${count}`, () => leafCluster(length, low, top, cluster, count));
        mesh(group, leaves, foliage, [x, 0, z], [1, 1, 1], 'Foliage');
      }
    },
  };
}

// Flat leaf blades with a raised midrib around one stem: lower leaves droop, upper
// leaves rise to 60°, and each blade twists so the canopy does not read edge-on from
// player height. Tips stay within `length` of the stem horizontally.
function leafCluster(length, low, top, seed, count) {
  const width = length * .5, curl = width * .15, positions = [], matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  const blade = [[0,0,0],[0,curl,.5],[-.5,0,.45], [0,0,0],[.5,0,.45],[0,curl,.5], [-.5,0,.45],[0,curl,.5],[0,0,1], [0,curl,.5],[.5,0,.45],[0,0,1]]
    .map(([x, y, z]) => [x * width, y, z * length]);
  for (let index = 0; index < count; index++) {
    const along = (index + .5) / count, pitch = (-10 + 70 * along) * DEGREES, twist = Math.sin(index * 2.3 + seed) * 40 * DEGREES;
    const yaw = (index + seed * 7) * 137.508 * DEGREES, scale = .75 + .25 * Math.sin(index * 1.7 + seed);
    matrix.compose(new THREE.Vector3(0, low + (top - low) * along, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, twist, 'YXZ')), new THREE.Vector3(scale, scale, scale));
    for (const vertex of blade) positions.push(...point.set(...vertex).applyMatrix4(matrix).toArray());
  }
  const shape = new THREE.BufferGeometry();shape.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shape.computeVertexNormals();
  return shape;
}
