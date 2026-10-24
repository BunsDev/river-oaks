// Small bounded polygon predicates used independently of the Shapely fit producer.
const EPS = 1e-7;
export function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export const edges = ring => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]).filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]);
export function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if ((abC > 0 && abD < 0 || abC < 0 && abD > 0) && (cdA > 0 && cdB < 0 || cdA < 0 && cdB > 0)) return true;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b)) < EPS;
}
export function inRing(point, ring) {
  let inside = false;
  for (const [a, b] of edges(ring)) {
    if (pointSegmentDistance(point, a, b) < EPS) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export const polygonArea = ({ring, holes = []}) => {
  const area = points => Math.abs(edges(points).reduce((sum, [a, b]) => sum + a[0] * b[1] - b[0] * a[1], 0)) / 2;
  return area(ring) - holes.reduce((sum, hole) => sum + area(hole), 0);
};
export function footprint(building) {
  const angle = building.yaw_deg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [building.center[0] + x * building.size[0] / 2 * c - y * building.size[1] / 2 * s,
    building.center[1] + x * building.size[0] / 2 * s + y * building.size[1] / 2 * c]);
}
export function containsWithSetback(polygon, ring, setback) {
  if (!ring.every(p => inRing(p, polygon.ring) && !(polygon.holes ?? []).some(hole => inRing(p, hole)))) return false;
  // A hole entirely enclosed by the footprint is missed by corner-only checks.
  if ((polygon.holes ?? []).some(hole => hole.some(point => inRing(point, ring)))) return false;
  for (const boundary of [polygon.ring, ...(polygon.holes ?? [])]) for (const [a, b] of edges(boundary)) for (const [c, d] of edges(ring)) {
    if (segmentsIntersect(a, b, c, d)) return false;
    if (Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b)) < setback - EPS) return false;
  }
  return true;
}
export function polygonsOverlap(polygon, ring) {
  const inside = p => inRing(p, polygon.ring) && !(polygon.holes ?? []).some(hole => inRing(p, hole));
  return ring.some(inside) || polygon.ring.some(p => inRing(p, ring))
    || [polygon.ring, ...(polygon.holes ?? [])].some(boundary => edges(boundary).some(([a, b]) => edges(ring).some(([c, d]) => segmentsIntersect(a, b, c, d))));
}
export function validPolygon(value) {
  const pair = p => Array.isArray(p) && p.length === 2 && p.every(x => Number.isFinite(x) && Math.abs(x) <= 10000);
  if (!value || !Array.isArray(value.holes) || value.holes.length > 16) return false;
  for (const ring of [value.ring, ...value.holes]) {
    if (!Array.isArray(ring) || ring.length < 4 || ring.length > 512 || !ring.every(pair) || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return false;
    const segments = edges(ring);
    if (segments.length !== ring.length - 1) return false;
    for (let i = 0; i < segments.length; i++) for (let j = i + 2; j < segments.length; j++) {
      if (i === 0 && j === segments.length - 1) continue;
      if (segmentsIntersect(...segments[i], ...segments[j])) return false;
    }
  }
  if (polygonArea(value) <= EPS) return false;
  for (let i = 0; i < value.holes.length; i++) {
    if (!containsWithSetback({ring: value.ring, holes: []}, value.holes[i], 0)) return false;
    if (value.holes.slice(i + 1).some(hole => polygonsOverlap({ring: hole, holes: []}, value.holes[i]))) return false;
  }
  return true;
}
