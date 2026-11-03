// Bayou Heights (#586 continuation): the district across the bayou from Bayou
// Market Commons. Constants only, so revision lists can name it without loading
// its recipes. The frame is the Commons recipe frame: x metres east of the
// District edge, y metres north of the promenade centreline (north -1335).
export const HEIGHTS_ID = 'bayou-heights';
export const HEIGHTS_REVISION = 'bayou-heights-1';
// The manifest location: from the Commons east edge (x 115) to x 422.5, across the
// District's whole north/south span. The rest of the original reserve stays reserved.
export const HEIGHTS_FRAME = Object.freeze({ west: 115, east: 422.5 });
export const HEIGHTS_ENTRY = 'market-footbridge';
// The icehouse patio's two-chair table plays the shared table games (server/table-games.js).
export const HEIGHTS_TABLE = 'chess-icehouse';

/** True east of the footbridge's west end: the part of a composed world that is Bayou Heights. */
export const inBayouHeights = (layout, east) => Boolean(layout?.heights) && east > layout.heights.bounds[0];
