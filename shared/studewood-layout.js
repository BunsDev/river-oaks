// Studewood (#586 continuation toward 3×): the east side of Bayou Heights beyond
// Heights Boulevard. Constants only, so revision lists can name it without loading
// its recipes. The frame is the Commons recipe frame: x metres east of the District
// edge, y metres north of the promenade centreline (north -1335).
export const STUDEWOOD_ID = 'studewood';
export const STUDEWOOD_REVISION = 'heights-studewood-1';
// The manifest location: from the Heights east edge (x 422.5) to the east edge of the
// original reserve, across the District's whole north/south span. It is the whole of the
// reserve that Bayou Heights left, so no reserved land remains east of the bayou.
export const STUDEWOOD_FRAME = Object.freeze({ west: 422.5, east: 507.8880807878523 });
// Twentieth and Eighteenth Streets continue east through the gaps between Heights
// Boulevard's frontage blocks. These two cross-street seams are the only Studewood
// ground west of its location, and they stop at the boulevard's east sidewalk.
export const STUDEWOOD_SEAMS = Object.freeze(['studewood-north/twentieth-studewood/walk', 'studewood-south/eighteenth-studewood/walk']);
export const STUDEWOOD_SEAM_WEST = 404;
export const STUDEWOOD_ENTRY = 'twentieth-street';
// Studewood Park's two-chair table plays the shared table games (server/table-games.js).
export const STUDEWOOD_TABLE = 'chess-studewood';

/** True east of the Heights frontage: the part of a composed world that is Studewood. */
export const inStudewood = (layout, east) => Boolean(layout?.studewood) && east > layout.studewood.bounds[0];
