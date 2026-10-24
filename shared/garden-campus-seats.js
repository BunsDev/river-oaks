// The Gardens' seats on campus levels (#510), the rules #508's level movement calls through
// its action and occupancy hooks: sit, stand, the collision a taken seat adds for everyone
// else on its floor, and what a restored seat must still satisfy. Pure; the server holds who
// sits where (player.campusSeat) and asks #509 whether a suite admits the sitter.
//
// As in the penthouse (office-layouts.js): a seat is claimed from within reach of its stand
// point on the visitor's own level, one occupant per seat, never while another standing body
// is on it. A taken seat keeps the turning radius plus the seated radius clear around it and
// body spacing around its stand point, so the occupant can always stand up.
import { CAMPUS_BODY, GARDEN_CAMPUS_LAYOUT as CAMPUS, checkCampusCompatibility } from './garden-campus-layout.js';
import { campusFitoutSeat } from './garden-campus-fitout.js';

export const CAMPUS_SEAT_REACH = 1.3, CAMPUS_BODY_SPACING = 0.7;
export const CAMPUS_OCCUPIED_CLEARANCE = CAMPUS_BODY.turningRadius + CAMPUS_BODY.seatedRadius;
const far = (a, b, d) => Math.hypot(a[0] - b[0], a[1] - b[1]) > d;
const reject = error => ({ ok: false, error });

/**
 * May this visitor sit here? `at` is the visitor's {levelId, position:[u,v]}; `taken` the seat
 * ids already claimed; `bodies` other visitors' [u,v] on this level; `access(unitId)` #509's
 * suiteAccess answer for suite seats.
 */
export function campusSit({ seatId, at, taken = new Set(), bodies = [], access = () => ({ ok: false, reason: 'campus_access_required' }) }) {
  const seat = campusFitoutSeat(seatId);
  if (!seat) return reject('campus_seat_unknown');
  if (at?.levelId !== seat.levelId) return reject('campus_seat_out_of_reach');
  if (!Array.isArray(at.position) || far(at.position, seat.stand, CAMPUS_SEAT_REACH)) return reject('campus_seat_out_of_reach');
  if (taken.has(seat.id)) return reject('campus_seat_occupied');
  if (seat.unitId) { const entry = access(seat.unitId);if (!entry?.ok) return reject(entry?.reason ?? 'campus_access_required'); }
  if (bodies.some(body => !far(body, seat.position, CAMPUS_BODY_SPACING))) return reject('campus_seat_blocked');
  return { ok: true, seat: { seatId: seat.id, levelId: seat.levelId, layout: CAMPUS.versions.layout }, position: [...seat.position], facing: [...seat.facing], height: seat.height };
}

/** Standing up: back to the seat's stand point, which a taken seat keeps clear. */
export function campusStand(campusSeat) {
  const seat = campusSeat && campusFitoutSeat(campusSeat.seatId);
  return seat ? { ok: true, levelId: seat.levelId, position: [...seat.stand] } : reject('campus_seat_unknown');
}

/** Collision others meet on a level while seats are taken (#508 registerCampusOccupancy). */
export function campusSeatOccupancy(levelId, takenSeatIds) {
  const circles = [];
  for (const id of takenSeatIds) {
    const seat = campusFitoutSeat(id);
    if (seat?.levelId !== levelId) continue;
    circles.push({ position: [...seat.position], radius: CAMPUS_OCCUPIED_CLEARANCE }, { position: [...seat.stand], radius: CAMPUS_BODY_SPACING });
  }
  return circles;
}

/** Is a seat a private workstation the sitter may use for their desk right now? */
export const campusSeatWorkstation = (campusSeat, access) => {
  const seat = campusSeat && campusFitoutSeat(campusSeat.seatId);
  return Boolean(seat?.workstation && (!seat.unitId || access(seat.unitId)?.ok));
};

/**
 * A restored player.campusSeat stays only if its seat still exists on that level, the layout is
 * compatible, no one else holds it, and a suite seat still admits the sitter; otherwise the
 * restore clears it and the visitor stands at the stand point (or #508 relocates them).
 */
export function campusSeatRestorable(campusSeat, { levelId, claimed = new Set(), access = () => ({ ok: false }) } = {}) {
  if (!campusSeat || typeof campusSeat !== 'object') return false;
  const seat = campusFitoutSeat(campusSeat.seatId);
  return Boolean(seat && seat.levelId === levelId && campusSeat.levelId === levelId && !claimed.has(seat.id)
    && checkCampusCompatibility({ id: CAMPUS.id, layout: campusSeat.layout }).ok && (!seat.unitId || access(seat.unitId)?.ok));
}
