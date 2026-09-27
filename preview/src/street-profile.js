// Game adaptation of Palo Alto SD 101/105/133/201 and PMC 18.24.020.
// Dimensions are metres. Source records and mapped curb-to-curb widths stay intact.
export const FOOT = 0.3048;
export const STREET = Object.freeze({
  crownHeight: 0.30, roadCrossSlope: 0.02,
  gutterWidth: 2 * FOOT, gutterDepression: 1.5 * FOOT / 12,
  curbWidth: 6 * FOOT / 12, curbReveal: 6 * FOOT / 12,
  sidewalkCrossSlope: 0.015, clearWidth: 8 * FOOT,
  // 12.5 ft fits the perpendicular ramp and its 4 ft 2 in landing, and
  // exceeds the commercial minimum of 10 ft without narrowing the clear path.
  sidewalkWidth: 12.5 * FOOT, rampRun: 2.54, landing: 50 * FOOT / 12,
  rampSlope: 0.075, rampGutterSlope: 0.05, flareRun: 0.1524 / 0.09,
  warningDepth: 3 * FOOT, warningSetback: 7 * FOOT / 12,
  crossingWidth: 4.4, // Retained game crossing corridor, not a city siting rule.
});
export const WALKWAY_KINDS = new Set(['footway', 'pedestrian', 'path', 'steps']);
export const isWalkway = road => WALKWAY_KINDS.has(road.kind);

export function streetSection(road) {
  const curbFace = road.width_m / 2;
  const gutterWidth = Math.min(STREET.gutterWidth, curbFace / 2);
  return { curbFace, gutterWidth, asphaltHalf: curbFace - gutterWidth,
    sidewalkWidth: STREET.sidewalkWidth, clearWidth: STREET.clearWidth,
    furnitureWidth: STREET.sidewalkWidth - STREET.clearWidth };
}

function flareBlend(distance) {
  return Math.max(0, Math.min(1, (Math.abs(distance) - STREET.crossingWidth / 2) / STREET.flareRun));
}

export function streetOffset(width, lateral, crossingDistance = Infinity) {
  const { curbFace, gutterWidth, asphaltHalf } = streetSection({ width_m: width });
  const d = Math.min(curbFace, Math.abs(lateral));
  const rampDepression = Math.min(STREET.gutterDepression, gutterWidth * STREET.rampGutterSlope);
  const depression = rampDepression + (STREET.gutterDepression - rampDepression) * flareBlend(crossingDistance);
  return STREET.crownHeight - Math.min(d, asphaltHalf) * STREET.roadCrossSlope
    - Math.max(0, d - asphaltHalf) / gutterWidth * depression;
}

export function sidewalkOffset(width, outward, crossingDistance = Infinity) {
  const flowline = streetOffset(width, width / 2);
  const normal = flowline + STREET.curbReveal + outward * STREET.sidewalkCrossSlope;
  const rampFlowline = streetOffset(width, width / 2, 0);
  const rise = flowline + STREET.curbReveal - rampFlowline;
  const ramp = rampFlowline + rise * Math.min(1, Math.max(0, outward) / STREET.rampRun) + outward * STREET.sidewalkCrossSlope;
  const blend = flareBlend(crossingDistance);
  return ramp + (normal - ramp) * blend;
}

export function crossingDistance(network, roadId, point) {
  let nearest = Infinity;
  for (const c of network.crossings) {
    if (c.road !== roadId) continue;
    const dx = point[0] - c.center[0], dy = point[1] - c.center[1];
    if (Math.abs(dx * c.direction[1] - dy * c.direction[0]) > c.width / 2 + STREET.sidewalkWidth + 1) continue;
    nearest = Math.min(nearest, Math.abs(dx * c.direction[0] + dy * c.direction[1]));
  }
  return nearest;
}

// Shared tessellation makes asphalt, gutters and ramp flares meet at the same stations.
export function streetStations(segment, crossings) {
  const dx=segment.b[0]-segment.a[0],dy=segment.b[1]-segment.a[1],length=Math.hypot(dx,dy);
  const cuts=[0,length];
  for(let t=1.4;t<length;t+=1.4)cuts.push(t);
  for(const c of crossings) {
    if(c.road!==segment.road)continue;
    const station=((c.center[0]-segment.a[0])*dx+(c.center[1]-segment.a[1])*dy)/length;
    for(const delta of [-STREET.crossingWidth/2-STREET.flareRun,-STREET.crossingWidth/2,STREET.crossingWidth/2,STREET.crossingWidth/2+STREET.flareRun]) {
      if(station+delta>0&&station+delta<length)cuts.push(station+delta);
    }
  }
  return [...new Set(cuts)].sort((a,b)=>a-b);
}
