// Words for the walking HUD's stair and lift actions. A lift names the floor it goes to, as a
// real lift's buttons do, so nobody has to count presses or see the shaft to know where it
// lands. Floors read as a building's signs do: level 0 is the ground floor and level n is
// Floor n + 1, the numbering the Gardens' rooms already use ("The Gardens · Floor 2").
const levelIndex = levelId => Number(/\/l(\d+)$/.exec(levelId ?? '')?.[1] ?? NaN);
export const levelFloorName = levelId => { const index = levelIndex(levelId);return index === 0 ? 'the ground floor' : Number.isFinite(index) ? `Floor ${index + 1}` : 'the next floor'; };
export function portalActionLabel(portal, up) {
  if (portal.kind === 'lift') return levelIndex(portal.toLevelId) === 0 ? 'Take the lift to the ground floor' : `Take the lift ${up ? 'up' : 'down'} to ${levelFloorName(portal.toLevelId)}`;
  return up ? 'Go up one level' : levelIndex(portal.toLevelId) === 0 ? 'Go down to ground floor' : 'Go down one level';
}
// Said once a stair or lift lands, through the HUD's polite status line.
export const levelArrivalNotice = levelId => `Now on ${levelFloorName(levelId)}.`;
