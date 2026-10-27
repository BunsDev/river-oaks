// Outdoor residents as figures for the remote-player renderer (#640 increment 3). Presentation
// only: the town owns the population, routes, ground positions and reactions. Bounded to the
// eight nearest neighbours within the renderer's own distance gate, so the street shows who is
// there and how they react to trouble (`life.reaction`: startle, flee, cower) without a second
// resident simulation on the client. Same figure ids as the outdoor-residents admin work
// (`resident:<id>`), so either can replace the other.
export const RESIDENT_FIGURE_CAP = 8, RESIDENT_FIGURE_RANGE = 120;
// A drawn resident stays until another is this much nearer, or they pass this far beyond the range,
// so the figure set does not flicker at the cut while everyone walks (one swap per snapshot).
export const RESIDENT_FIGURE_SWAP_M = 5, RESIDENT_FIGURE_KEEP_M = 10;
// Shipped human appearances anyone may wear (shared-appearances.js), never Jevica's.
export const RESIDENT_APPEARANCES = Object.freeze(['sable-human', 'rowan-human', 'woman-tailored', 'man-tailored', 'lyra-human', 'kai-explorer']);
const position = value => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite);
const hash = text => [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);

/** The reaction a figure shows, as a gesture name for crime-poses.js, or null. */
export const residentGesture = reaction => reaction === 'startle' ? 'startle' : reaction === 'cower' ? 'cower' : null;

/** `drawn`: the resident ids drawn last time (a Set), for a stable set across snapshots. */
export function residentFigures(locals, visitor, drawn = null) {
  if (!Array.isArray(locals) || !position(visitor)) return [];
  const ranked = locals.filter(local => typeof local?.id === 'string' && !local.indoor && position(local.position) && local.life)
    .map(local => ({ local, distance: Math.hypot(local.position[0] - visitor[0], local.position[1] - visitor[1]) }))
    .filter(entry => entry.distance < RESIDENT_FIGURE_RANGE + (drawn?.has(entry.local.id) ? RESIDENT_FIGURE_KEEP_M : 0))
    .sort((a, b) => a.distance - b.distance || a.local.id.localeCompare(b.local.id));
  let chosen = ranked.slice(0, RESIDENT_FIGURE_CAP);
  if (drawn?.size) {
    const kept = ranked.filter(entry => drawn.has(entry.local.id)).slice(0, RESIDENT_FIGURE_CAP), fresh = ranked.filter(entry => !drawn.has(entry.local.id));
    while (kept.length < RESIDENT_FIGURE_CAP && fresh.length) kept.push(fresh.shift());
    const farthest = kept.reduce((far, entry) => !far || entry.distance > far.distance ? entry : far, null);
    if (fresh.length && farthest && fresh[0].distance + RESIDENT_FIGURE_SWAP_M < farthest.distance) kept.splice(kept.indexOf(farthest), 1, fresh[0]);
    chosen = kept.sort((a, b) => a.distance - b.distance || a.local.id.localeCompare(b.local.id));
  }
  return chosen.map(({ local }) => {
      const seat = local.life.seat;
      return {
        id: `resident:${local.id}`, name: typeof local.name === 'string' ? local.name : 'Neighbour',
        // Chosen by id so a resident keeps one look.
        appearance: RESIDENT_APPEARANCES[hash(local.id) % RESIDENT_APPEARANCES.length],
        position: local.position.slice(0, 3), altitude: 0, vehicle: null, movement: 'upright', performing: false, interaction: null,
        // The simulation stores body heading; peer rendering adds pi to camera-style yaw.
        yaw: (Number.isFinite(local.life.heading) ? local.life.heading : 0) - Math.PI,
        sitting: seat && Number.isFinite(seat.height) ? { id: seat.id, height: seat.height, yaw: seat.heading } : null,
        gesture: residentGesture(local.life.reaction),
        reaction: local.life.reaction ?? null,
      };
    });
}
