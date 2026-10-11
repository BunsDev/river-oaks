import { STREET, streetSection } from './street-profile.js';

// Curb returns where three or more street arms meet, after the River Oaks
// District corners (e.g. Kettering Drive): a curved curb clips one paving
// field that runs across the whole corner, instead of two sidewalks laid
// over each other with crossing grains. Units are metres, [east, north].
export const CORNER_RADIUS = 3;
// Corners sharper than this keep the square junction; straight-through and
// reflex sides of a T are not corners.
const MIN_ANGLE = Math.PI / 6, MAX_ANGLE = Math.PI * 0.85;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const along = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
function intersect(p, d, q, e) {
  const denominator = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(denominator) < 1e-9) return null;
  const w = sub(q, p);
  return along(p, d, (w[0] * e[1] - w[1] * e[0]) / denominator);
}

// Street segments meeting at one shared vertex, keyed like joinStreetSegments.
// Each arm also lists the segments that continue it through gentle bends of
// the same street (`chain`, with stations from the junction), because a short
// first segment can end before the corner does.
export function junctionArms(segments) {
  const nodes = new Map();
  for (const segment of segments) {
    if (segment.walkway) continue;
    const dx = segment.b[0] - segment.a[0], dy = segment.b[1] - segment.a[1], length = Math.hypot(dx, dy);
    for (const end of [false, true]) {
      const point = end ? segment.b : segment.a, key = `${point[0]},${point[1]}`;
      if (!nodes.has(key)) nodes.set(key, []);
      nodes.get(key).push({ segment, end, point, length, away: end ? [-dx / length, -dy / length] : [dx / length, dy / length] });
    }
  }
  const junctions = [...nodes.values()].filter(arms => arms.length >= 3);
  for (const arms of junctions) for (const arm of arms) {
    arm.chain = [{ segment: arm.segment, end: arm.end, length: arm.length, offset: 0 }];
    let current = arm, offset = arm.length;
    while (offset < 16) {
      const far = current.end ? current.segment.a : current.segment.b;
      const next = nodes.get(`${far[0]},${far[1]}`)?.filter(item => item.segment !== current.segment);
      if (next?.length !== 1 || next[0].segment.road !== arm.segment.road || dot(next[0].away, current.away) < Math.cos(Math.PI / 9)) break;
      current = next[0]; arm.chain.push({ segment: current.segment, end: current.end, length: current.length, offset }); offset += current.length;
    }
    arm.reach = offset;
  }
  return junctions;
}

// One corner per angular gap between neighbouring arms. Each arm records the
// sidewalk side facing the corner (the `side` sidewalks.js and streetPoint
// use), and stations measured from the junction: `tangent` where the straight
// curb meets the return and `seam` where the shared corner paving hands over
// to that arm's own sidewalk.
export function streetCorners(segments, crossings = [], radius = CORNER_RADIUS) {
  const corners = [], streets = segments.filter(segment => !segment.walkway);
  // A corner that would reach another carriageway (a parallel street, a
  // short connector), or whose sidewalks stop just past it for one, keeps the
  // square junction it had.
  const onCarriageway = (point, own) => streets.some(s => {
    if (own.has(s)) return false;
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], t = Math.max(0, Math.min(1, ((point[0] - s.a[0]) * dx + (point[1] - s.a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point[0] - s.a[0] - dx * t, point[1] - s.a[1] - dy * t) < s.width / 2;
  });
  for (const arms of junctionArms(segments)) {
    arms.sort((p, q) => Math.atan2(p.away[1], p.away[0]) - Math.atan2(q.away[1], q.away[0]));
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i], b = arms[(i + 1) % arms.length];
      let angle = Math.atan2(b.away[1], b.away[0]) - Math.atan2(a.away[1], a.away[0]);
      if (angle <= 0) angle += Math.PI * 2;
      if (angle < MIN_ANGLE || angle > MAX_ANGLE) continue;
      const node = a.point;
      // Normals point into the block: anticlockwise of a, clockwise of b.
      const na = [-a.away[1], a.away[0]], nb = [b.away[1], -b.away[0]];
      const ha = a.segment.width / 2, hb = b.segment.width / 2;
      const curb = intersect(along(node, na, ha), a.away, along(node, nb, hb), b.away);
      const back = intersect(along(node, na, ha + STREET.sidewalkWidth), a.away, along(node, nb, hb + STREET.sidewalkWidth), b.away);
      if (!curb || !back) continue;
      const setback = radius / Math.tan(angle / 2);
      const tangents = [along(curb, a.away, setback), along(curb, b.away, setback)];
      const center = along(tangents[0], na, radius);
      const station = (point, arm) => dot(sub(point, node), arm.away);
      const entries = [[a, na], [b, nb]].map(([arm, normal], k) => {
        const tangent = station(tangents[k], arm), seam = Math.max(tangent, station(back, arm));
        // One trim per chained segment, on the lateral side (+1 is
        // anticlockwise of a→b) that faces this corner.
        const trims = arm.chain.filter(link => link.offset < seam).map(link => {
          const { segment } = link, dx = segment.b[0] - segment.a[0], dy = segment.b[1] - segment.a[1];
          return { segment, end: link.end, length: link.length, side: -dy * normal[0] + dx * normal[1] > 0 ? 1 : -1, tangent: tangent - link.offset, seam: seam - link.offset };
        });
        return { segment: arm.segment, end: arm.end, length: arm.length, reach: arm.reach, away: arm.away, normal, half: arm.segment.width / 2, tangent, seam, trims };
      });
      if (entries.some(entry => entry.seam >= entry.reach - 1e-6)) continue;
      const own = new Set(arms.flatMap(arm => arm.chain.map(link => link.segment)));
      const probes = [center, back, ...tangents, ...entries.flatMap(entry => [(entry.seam + entry.tangent) / 2, entry.seam, entry.seam + 1.5].flatMap(s =>
        [entry.half, entry.half + STREET.sidewalkWidth / 2, entry.half + STREET.sidewalkWidth].map(l => along(along(node, entry.away, s), entry.normal, l))))];
      if (probes.some(point => onCarriageway(point, own))) continue;
      // A crossing that could not move clear of the junction (a short stub
      // street) keeps its ramp; the corner stays square rather than cover it.
      const blocked = entries.some(entry => crossings.some(c => {
        if (c.road !== entry.segment.road) return false;
        const offset = sub(c.center, node), s = dot(offset, entry.away);
        return s > 0 && s - STREET.crossingWidth / 2 - STREET.flareRun < entry.seam && Math.abs(dot(offset, entry.normal)) < entry.half + 1e-6;
      }));
      if (blocked) continue;
      corners.push({ node, angle, radius, curb, back, center, tangents, arms: entries });
    }
  }
  return corners;
}

// Distance from a point inside the corner to its curb face: the straight curb
// beyond each tangent, or the return between them. This is the "outward"
// distance the sidewalk grade uses, so the corner meets both sidewalks exactly.
export function cornerCurbDistance(corner, point) {
  let distance = Infinity;
  for (const arm of corner.arms) {
    const s = dot(sub(point, corner.node), arm.away);
    if (s >= arm.tangent - 1e-9) distance = Math.min(distance, dot(sub(point, corner.node), arm.normal) - arm.half);
  }
  const [ta, tb] = corner.tangents, r = sub(point, corner.center), length = Math.hypot(...r);
  const start = Math.atan2(ta[1] - corner.center[1], ta[0] - corner.center[0]);
  let sweep = Math.atan2(tb[1] - corner.center[1], tb[0] - corner.center[0]) - start;
  sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
  let offset = Math.atan2(r[1], r[0]) - start;
  offset = Math.atan2(Math.sin(offset), Math.cos(offset));
  if (offset * sweep >= 0 && Math.abs(offset) <= Math.abs(sweep)) distance = Math.min(distance, corner.radius - length);
  else for (const t of corner.tangents) distance = Math.min(distance, Math.hypot(point[0] - t[0], point[1] - t[1]));
  return distance;
}

// Points along the curb return from the first arm's tangent to the second's,
// `inset` metres toward the block. The count follows the curb face, at most
// `step` metres apart, so inset arcs pair point for point with it.
export function cornerArc(corner, inset = 0, step = 0.3) {
  const [ta, tb] = corner.tangents, c = corner.center, radius = corner.radius - inset;
  const start = Math.atan2(ta[1] - c[1], ta[0] - c[0]);
  let sweep = Math.atan2(tb[1] - c[1], tb[0] - c[0]) - start;
  sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
  const count = Math.max(2, Math.ceil(Math.abs(sweep) * corner.radius / step));
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = start + sweep * i / count;
    return [c[0] + Math.cos(angle) * radius, c[1] + Math.sin(angle) * radius];
  });
}

// Crossing stations a street keeps clear of each junction it meets, so the
// ramp, its flares and the warning strip all land beyond the shared corner.
// The metre of slack covers corners that are not square, whose paving
// reaches a little further along each street.
export function junctionClearance(otherHalfWidth, radius = CORNER_RADIUS) {
  return otherHalfWidth + Math.max(STREET.sidewalkWidth, radius * 1.2) + STREET.crossingWidth / 2 + STREET.flareRun + 1;
}

// The roadway inside a curb return: a gutter band of the street's own width
// along the curve, and asphalt from there back to where the two asphalt
// edges meet. `apex` is that meeting point; `edge` pairs with cornerArc().
export function cornerMouth(corner) {
  const gutter = Math.min(...corner.arms.map(arm => streetSection({ width_m: arm.segment.width }).gutterWidth));
  const [a, b] = corner.arms;
  const apex = intersect(along(corner.node, a.normal, a.half - gutter), a.away, along(corner.node, b.normal, b.half - gutter), b.away);
  return { gutter, apex, edge: cornerArc(corner, -gutter) };
}
