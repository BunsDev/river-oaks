import { commonsGroundAt } from '../../shared/east-garden-commons-layout.js';

// Names the connected location a walker stands in, so the HUD and its polite
// live region tell keyboard and screen-reader players when they cross between
// the District and East Garden Commons. Uses the shared movement surfaces.
export const COMMONS_NAME = 'East Garden Commons';
export const MARKET_NAME = 'Bayou Market Commons';
export const DISTRICT_NAME = 'River Oaks District';

/** Location name at east/north metres, or null for a world without connected locations. */
export function connectedLocationAt(world, east, north) {
  const layout = world?.eastGardenCommons;
  if (!layout) return null;
  return commonsGroundAt(layout, east, north) === null ? DISTRICT_NAME : layout.destination ? MARKET_NAME : COMMONS_NAME;
}

/** Announcement for a crossing, or null when the location did not change. */
export function locationCrossing(previous, next) {
  if (!previous || !next || previous === next) return null;
  return next !== DISTRICT_NAME ? `Entering ${next}` : `Back in ${DISTRICT_NAME}`;
}
