import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Courtyard House family (#418), drawn like the Garden Office forms (space-furniture.js):
// inside a group that cancels the editable root's scale, so soft parts keep true-size
// rounding at any v1 size. Every part stays inside the object's footprint and height.
const mm = value => Math.round(value * 1000);

export function createHomeForms({ geometry, mesh }) {
  const metric = (root, item) => {
    const group = new THREE.Group();group.name = 'Metric parts';
    group.scale.set(1 / item.width, 1 / item.height, 1 / item.depth);root.add(group);
    return group;
  };
  const block = (parent, material, position, [x, y, z], name, radius = 0) => {
    const size = [Math.max(.002, x), Math.max(.002, y), Math.max(.002, z)];
    if (radius <= 0) return mesh(parent, geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), material, position, size, name);
    const edge = Math.min(radius, Math.min(...size) / 2 - .0005);
    const shape = geometry(`metric-round:${size.map(mm).join(':')}:${mm(edge)}`, () => new RoundedBoxGeometry(...size, 2, edge));
    return mesh(parent, shape, material, position, [1, 1, 1], name);
  };

  return {
    // A timber frame on short legs and an upholstered headboard on the local -z (head)
    // edge. The duvet covers the lower two thirds and hangs over the sides and foot; the
    // sheet folds back over its top edge, two pillows rest on the headboard and a throw
    // crosses the foot.
    bed(root, item, { cover, linen, timber, accent }) {
      const group = metric(root, item), { width: W, depth: D, height: H } = item;
      const board = Math.min(.07, D / 12), inset = Math.min(.03, W / 20), leg = Math.min(.05, W / 10);
      const legHeight = Math.min(.12, H * .12), frameTop = Math.min(.32, H * .32), mattressTop = Math.min(.56, H * .55);
      const head = -D / 2 + board, length = D - board, frameWidth = W - 2 * inset;
      for (const sx of [-1, 1]) for (const z of [head + leg, D / 2 - leg])
        block(group, timber, [sx * (frameWidth / 2 - leg / 2), legHeight / 2, z], [leg, legHeight, leg], 'Leg');
      block(group, timber, [0, (legHeight + frameTop) / 2, head + length / 2], [frameWidth, frameTop - legHeight, length - .004], 'Bed frame', .006);
      block(group, cover, [0, (legHeight + H) / 2, -D / 2 + board / 2], [W, H - legHeight, board], 'Headboard', .025);
      const mattressWidth = frameWidth - .05, mattressLength = length - .04, thick = mattressTop - frameTop;
      block(group, linen, [0, frameTop + thick / 2, head + .02 + mattressLength / 2], [mattressWidth, thick, mattressLength], 'Mattress', .04);
      // The duvet lofts 5 cm above the mattress and drapes most of the way down its sides.
      const loft = Math.min(.05, (H - mattressTop) / 3), drape = Math.min(.2, thick * .85), cloth = Math.min(frameWidth, mattressWidth + .05);
      const start = head + .02 + mattressLength * .32, end = D / 2 - .005;
      block(group, cover, [0, mattressTop + (loft - drape) / 2, (start + end) / 2], [cloth, loft + drape, end - start], 'Duvet', .03);
      block(group, linen, [0, mattressTop + loft * .9, start + .07], [Math.min(frameWidth, cloth + .004), loft * .7, .16], 'Sheet fold', .025);
      // Pillows lean 10° back onto the headboard; half the height above the mattress leaves room for the lean.
      const pillow = Math.min(.7, (mattressWidth - .08) / 2), pillowDepth = Math.min(.45, mattressLength * .22), pillowHeight = Math.min(.15, (H - mattressTop) / 2);
      for (const sx of [-1, 1]) {
        const part = block(group, linen, [sx * (pillow / 2 + .02), mattressTop + pillowHeight / 2, head + .03 + pillowDepth / 2], [pillow, pillowHeight, pillowDepth], 'Pillow', .06);
        part.rotation.x = -.18;
      }
      const throwDepth = Math.min(.5, (end - start) * .4);
      block(group, accent, [0, mattressTop + (loft + .012 - drape * .7) / 2, end - throwDepth / 2 - .02], [Math.min(frameWidth, cloth + .006), loft + .012 + drape * .7, throwDepth], 'Throw', .02);
    },
  };
}
