// Bayou Terraces (#586 continuation toward 3×): the west bank of the bayou, north and
// south of Bayou Market Commons, reached over two footbridges from the Heights
// greenway. Constants only, so revision lists can name them without loading their
// recipes. The frame is the Commons recipe frame: x metres east of the District
// edge, y metres north of the promenade centreline (north -1335).
export const TERRACES_ID = 'bayou-terraces';
export const TERRACES_REVISION = 'bayou-terraces-1';
// The two manifest locations, exactly the reserved strips beside the Commons.
export const TERRACE_LOCATIONS = Object.freeze(['bayou-terrace-north', 'bayou-terrace-south']);
// Each footbridge continues a Heights cross street over the bayou; it is the only
// terrace ground east of the bank, and lands on the greenway trail.
export const TERRACE_BRIDGES = Object.freeze({ 'bayou-terrace-north': 'bayou-terrace-north/footbridge/walk', 'bayou-terrace-south': 'bayou-terrace-south/footbridge/walk' });
export const TERRACE_BANK = 115;
export const TERRACE_BRIDGE_EAST = 153;
export const TERRACE_ENTRIES = Object.freeze({ 'bayou-terrace-north': 'twentieth-footbridge', 'bayou-terrace-south': 'eighteenth-footbridge' });
// The north gardens' two-chair table plays the shared table games (server/table-games.js).
export const TERRACES_TABLE = 'chess-terrace';

/** True on terrace ground west of the bank: the part of a composed world that is the Bayou Terraces. */
export const inBayouTerraces = (layout, east, north) => Boolean(layout?.terraces) && east < layout.edge + TERRACE_BANK
  && layout.terraces.bounds.some(([w, s, e, n]) => east >= w && east <= e && north >= s && north <= n);
