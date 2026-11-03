// Woodland Heights (land proposal A′, toward 3×): a residential garden strip east of
// Studewood, reached along Twentieth and Eighteenth Streets. Constants only, so revision
// lists can name it without loading its recipes. The frame is the Commons recipe frame:
// x metres east of the District edge, y metres north of the promenade centreline (north -1335).
export const WOODLAND_ID = 'woodland-heights';
export const WOODLAND_REVISION = 'woodland-heights-1';
// The manifest location: 45 m east of Studewood's east edge, across the District's whole
// north/south span. It is new land beyond the original east envelope.
export const WOODLAND_FRAME = Object.freeze({ west: 507.8880807878523, east: 552.8880807878523 });
// Twentieth and Eighteenth Streets continue east from the ends of Studewood's. These two
// cross streets and their seams are the only Woodland ground west of its location.
export const WOODLAND_SEAMS = Object.freeze(['woodland-heights-north/twentieth-woodland/walk', 'woodland-heights-south/eighteenth-woodland/walk']);
export const WOODLAND_SEAM_WEST = 506.5;
// Studewood's ground ends here (its cross streets stop at x 507.5): everything walkable east
// of it, less the walking radius, is Woodland's.
export const WOODLAND_STUDEWOOD_EAST = 507.5;
export const WOODLAND_ENTRY = 'twentieth-street';
// The Woodland green's two-chair table plays the shared table games (server/table-games.js).
export const WOODLAND_TABLE = 'chess-woodland';

/** True east of Studewood's edge: the part of a composed world that is Woodland Heights. */
export const inWoodlandHeights = (layout, east) => Boolean(layout?.woodland) && east > layout.woodland.bounds[0];
