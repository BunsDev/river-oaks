// TypeSafe Place Residential Heights (beyond 3×, Val 2026-10-28): towers, garden-roofed
// residences, shop rows and a neighborhood green east of Woodland Heights, reached along
// Twentieth and Eighteenth Streets. Constants only, so revision lists can name it without
// loading its recipes. The frame is the Commons recipe frame: x metres east of the District
// edge, y metres north of the promenade centreline (north -1335).
export const TYPESAFE_ID = 'typesafe-place';
export const TYPESAFE_REVISION = 'typesafe-place-1';
// The manifest location: 150 m east of Woodland Heights' east edge, across the District's
// whole north/south span.
export const TYPESAFE_FRAME = Object.freeze({ west: 552.8880807878523, east: 702.8880807878523 });
// Twentieth and Eighteenth Streets continue east from the ends of Woodland's. These two
// cross streets and their seams are the only TypeSafe ground west of its location.
export const TYPESAFE_SEAMS = Object.freeze(['typesafe-place-north/twentieth-typesafe/walk', 'typesafe-place-green/eighteenth-typesafe/walk']);
export const TYPESAFE_SEAM_WEST = 551.5;
// Woodland's ground ends here (its cross streets stop at x 552.5): everything walkable east
// of it, less the walking radius, is TypeSafe Place's.
export const TYPESAFE_WOODLAND_EAST = 552.5;
export const TYPESAFE_ENTRY = 'twentieth-street';

/** True east of Woodland Heights' edge: the part of a composed world that is TypeSafe Place. */
export const inTypeSafePlace = (layout, east) => Boolean(layout?.typesafe) && east > layout.typesafe.bounds[0];
