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
    // Open shelving with a back on the local -z edge: 25 mm sides, 22 mm boards about 36 cm
    // apart above a recessed kick, bays at most 0.9 m wide. A third of the bay spaces hold two
    // folded garments, a third a lidded box, the rest stay open; all are sized in metres.
    shelf(root, item, carcass, kick, textiles) {
      const group = metric(root, item), { width: W, depth: D, height: H } = item;
      const side = Math.min(.025, W / 10), board = Math.min(.022, H / 12), back = Math.min(.009, D / 10);
      const plinth = Math.min(.06, H * .08), inner = W - 2 * side, bays = Math.max(1, Math.ceil(inner / .9)), bay = (inner - (bays - 1) * board) / bays;
      const usable = H - plinth - board, levels = Math.max(1, Math.round(usable / .36)), pitch = usable / levels;
      for (const sx of [-1, 1]) block(group, carcass, [sx * (W / 2 - side / 2), H / 2, 0], [side, H, D], 'Side panel');
      block(group, carcass, [0, H - board / 2, 0], [inner, board, D], 'Top');
      block(group, carcass, [0, H / 2, -D / 2 + back / 2], [inner, H - board, back], 'Back panel');
      block(group, kick, [0, plinth / 2, .01], [inner, plinth, D - back - .02], 'Recessed kick');
      for (let index = 1; index < bays; index++) block(group, carcass, [-inner / 2 + index * (bay + board) - board / 2, (plinth + H - board) / 2, back / 2], [board, H - plinth - board, D - back], 'Shelf divider');
      const clear = pitch - board, deep = D - back - .04, front = back / 2 + .01;
      for (let level = 0; level < levels; level++) {
        const base = plinth + level * pitch;
        block(group, carcass, [0, base + board / 2, back / 2], [inner, board, D - back], 'Shelf');
        for (let index = 0; index < bays; index++) {
          const x = -inner / 2 + index * (bay + board) + bay / 2, slot = (level * 2 + index) % 3;
          if (slot === 0 && clear > .08 && bay > .2 && deep > .15) for (let fold = 0; fold < Math.min(2, Math.floor((clear - .04) / .05)); fold++)
            block(group, textiles[(level + index + fold) % textiles.length], [x - bay * .1, base + board + .025 + fold * .05, front], [Math.min(.32, bay * .6), .048, Math.min(.26, deep)], 'Folded stack', .012);
          else if (slot === 1 && clear > .12 && bay > .2 && deep > .15) {
            const tall = Math.min(.16, clear - .04);
            block(group, textiles[(level + index) % textiles.length], [x + bay * .15, base + board + tall / 2, front], [Math.min(.24, bay * .45), tall, Math.min(.2, deep)], 'Lidded box');
          }
        }
      }
    },
    // One table family with the Garden Office desk: a 30 mm top with a 3 mm edge on 45 mm
    // square legs set 5 cm in, joined by aprons under the top. Every template's tables use it.
    table(root, item, top, timber) {
      const group = metric(root, item), { width: W, depth: D, height: H } = item;
      const thick = Math.min(.03, H * .08), leg = Math.min(.045, W / 8, D / 8), inset = Math.min(.05, W / 8, D / 8);
      const legHeight = Math.max(.002, H - thick), apron = Math.min(.08, legHeight / 4), rail = Math.min(.018, leg / 2);
      const x = W / 2 - inset - leg / 2, z = D / 2 - inset - leg / 2;
      block(group, top, [0, H - thick / 2, 0], [W, thick, D], 'Tabletop', .003);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(group, timber, [sx * x, legHeight / 2, sz * z], [leg, legHeight, leg], 'Leg');
      for (const sz of [-1, 1]) block(group, timber, [0, legHeight - apron / 2, sz * (z + leg / 2 - rail / 2)], [2 * x - leg, apron, rail], 'Apron');
      for (const sx of [-1, 1]) block(group, timber, [sx * (x + leg / 2 - rail / 2), legHeight - apron / 2, 0], [rail, apron, 2 * z - leg], 'Apron');
    },
    // A raised glass display case: a base in the object's finish, glass sides and top on slim
    // corner posts, one glass shelf, and rows of pastries on the base and the shelf.
    displayCase(root, item, frame, glass, pastries) {
      const group = metric(root, item), { width: W, depth: D, height: H } = item;
      const base = Math.min(.04, H / 8), post = Math.min(.015, W / 20, D / 20), pane = .006;
      block(group, frame, [0, base / 2, 0], [W, base, D], 'Case base', .003);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(group, frame, [sx * (W / 2 - post / 2), (base + H) / 2, sz * (D / 2 - post / 2)], [post, H - base, post], 'Case post');
      for (const sz of [-1, 1]) block(group, glass, [0, (base + H) / 2, sz * (D / 2 - pane / 2)], [W - 2 * post, H - base, pane], 'Case glass');
      for (const sx of [-1, 1]) block(group, glass, [sx * (W / 2 - pane / 2), (base + H) / 2, 0], [pane, H - base, D - 2 * post], 'Case glass');
      block(group, glass, [0, H - pane / 2, 0], [W - 2 * post, pane, D - 2 * post], 'Case glass');
      const shelf = base + (H - base) * .48;
      block(group, glass, [0, shelf, 0], [W - 2 * post - .01, pane, D - 2 * post - .01], 'Display shelf');
      // Four pastries a level, sized in metres and spaced along the case.
      const count = Math.max(1, Math.min(4, Math.floor((W - .1) / .2))), size = [Math.min(.16, (W - .1) / count - .03), Math.min(.05, (H - base) * .2), Math.min(.12, D * .4)];
      for (const [level, y] of [[0, base], [1, shelf + pane / 2]]) for (let index = 0; index < count; index++)
        block(group, pastries[(index + level) % pastries.length], [-W / 2 + .05 + (index + .5) * (W - .1) / count, y + size[1] / 2, 0], size, 'Pastry', Math.min(.02, size[1] / 2.2));
    },
  };
}
