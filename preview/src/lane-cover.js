import { plazaSalonPlan } from './plaza-salon-plan.js';

// A service yard on the south edge of the south service lane (the walkable boundary) (world-policy.js
// `south-service-lane`): the one place in either danger zone where a wanted player can
// break an officer's sight (#599, escape by concealment; content decision 2026-10-30).
// Stacked crates face the lane, a roll-off container closes the west end, and a crate
// partition splits an outer bay, open to the east, from an inner bay behind it. An
// officer standing at the outer bay's mouth, where a fleeing player was last seen, cannot
// see the inner bay's south half, so its search there ends without a sighting. Every
// piece is taller than the 1.2 m chest-height sight line police use (server/world.js).
// Boxes are axis-aligned: `center` [east, north], `size` [east-west, north-south] metres.
const PIECES = [
  { id: 'lane-yard-front', kind: 'crates', center: [-2770.0, -1452.6], size: [12.0, 1.2], height: 1.9 },
  { id: 'lane-yard-container', kind: 'container', center: [-2775.4, -1455.3], size: [1.2, 4.6], height: 1.6 },
  { id: 'lane-yard-partition', kind: 'crates', center: [-2770.0, -1456.2], size: [1.2, 2.8], height: 1.9 },
].map(piece => Object.freeze({ ...piece, center: Object.freeze(piece.center), size: Object.freeze(piece.size) }));

// Where a player stands hidden from the outer bay's mouth, and that mouth (tests and journeys).
export const LANE_YARD = Object.freeze({ hide: Object.freeze([-2773.2, -1456.6]), mouth: Object.freeze([-2763.2, -1455.0]) });

// The yard stands in the District only, where the danger lane does.
export function laneCover(world) {
  return plazaSalonPlan(world) ? PIECES : [];
}

// Each piece as the walking model blocks it: [east, north, radius, height] discs of 0.3 m
// on a grid no coarser than 0.4 m, inset by their radius, so the box keeps square-ish
// corners (a sight line cannot slip round a rounded crate end), no body (0.35 m) fits
// between two discs and no 0.15 m sight sample passes between them.
const DISC = 0.3, PITCH = 0.4;
export function laneCoverFootprints(world) {
  return laneCover(world).map(piece => {
    const axis = [0, 1].map(i => { const span = piece.size[i] - 2 * DISC, steps = Math.max(1, Math.ceil(span / PITCH));
      return Array.from({ length: steps + 1 }, (_, k) => piece.center[i] - span / 2 + span * k / steps); });
    return axis[0].flatMap(east => axis[1].map(north => [east, north, DISC, piece.height]));
  });
}
