// Build-local render provenance, never an interaction or permission registry.
export const SURFACE_PROVENANCE = 'jetAgeParts';

export function surfaceProvenance(hit) {
  const unknown = { status: 'unavailable', venueId: null, partOrdinal: null, materialKey: null, triangleRange: null, contractVersion: null,
    bindings: { entrance: 'unavailable', attachment: 'unavailable', action: 'unavailable' } };
  const geometry = hit?.object?.geometry, record = geometry?.userData?.[SURFACE_PROVENANCE], face = hit?.faceIndex;
  const triangles = geometry?.attributes?.position?.count / 3;
  if (geometry?.index || record?.version !== 1 || !Array.isArray(record.ranges) || !Number.isInteger(triangles)
    || !Number.isInteger(face) || face < 0 || face >= triangles) return unknown;
  // The producer writes sorted, disjoint ranges in the final non-indexed triangle order.
  let low = 0, high = record.ranges.length - 1, part;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2), entry = record.ranges[middle];
    if (!entry || !Number.isInteger(entry.start) || !Number.isInteger(entry.count) || entry.start < 0 || entry.count <= 0 || entry.start + entry.count > triangles) return unknown;
    if (face < entry.start) high = middle - 1;
    else if (face >= entry.start + entry.count) low = middle + 1;
    else { part = entry; break; }
  }
  if (!part || !Number.isInteger(part.ordinal) || part.ordinal < 0) return unknown;
  let contractVersion = null;
  for (let node = hit.object, depth = 0; node && depth < 64; node = node.parent, depth++) {
    if (typeof node.userData?.fiveRooms?.version === 'string') { contractVersion = node.userData.fiveRooms.version; break; }
  }
  return { ...unknown, status: 'available', venueId: typeof part.venue === 'string' ? part.venue : null, partOrdinal: part.ordinal,
    materialKey: typeof record.material === 'string' ? record.material : null, triangleRange: [part.start, part.start + part.count], contractVersion };
}
