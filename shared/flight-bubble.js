// Jevica's bubble, measured from the flight foot datum. The shimmer ring extends
// slightly beyond the glass; both the renderer and authoritative clearance use it.
export const FLIGHT_BUBBLE = Object.freeze({
  radius: 1.3, centreY: 1, scaleXZ: 0.88, scaleY: 1.08, ringRadius: 1.295, ringTube: 0.006,
});
const reach = Math.max(FLIGHT_BUBBLE.radius, FLIGHT_BUBBLE.ringRadius + FLIGHT_BUBBLE.ringTube) * FLIGHT_BUBBLE.scaleY;
export const FLIGHT_BUBBLE_CLEARANCE = Object.freeze({
  radius: 1.3, // Preserve the existing conservative horizontal flight radius.
  above: FLIGHT_BUBBLE.centreY + reach, below: reach - FLIGHT_BUBBLE.centreY,
});
