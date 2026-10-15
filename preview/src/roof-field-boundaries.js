// Boundary of the already validated roof field cells. Removes internal seams;
// this does not choose surfaces, plant positions, or relax containment margins.
export function roofFieldBoundaries(fields) {
  if (!fields.length) return [];
  const size = fields[0].size, origin = fields[0].at;
  const edges = new Map(), key = p => p.join(',');
  for (const field of fields) {
    if (field.size !== size) throw new Error('Roof field cells must share a size');
    const x = Math.round((field.at[0] - origin[0]) / size), n = Math.round((field.at[1] - origin[1]) / size);
    const ring = [[x,n],[x+1,n],[x+1,n+1],[x,n+1]];
    for (let i = 0; i < 4; i++) {
      const a = ring[i], b = ring[(i+1)%4], reverse = `${key(b)}:${key(a)}`, forward = `${key(a)}:${key(b)}`;
      if (edges.has(reverse)) edges.delete(reverse); else edges.set(forward,{a,b});
    }
  }
  const outgoing = new Map();
  for (const edge of edges.values()) {
    const k = key(edge.a); if (!outgoing.has(k)) outgoing.set(k,[]); outgoing.get(k).push(edge);
  }
  const remaining = new Set(edges.values()), rings = [];
  while (remaining.size) {
    const first = remaining.values().next().value, ring = [], start = key(first.a);
    let edge = first;
    for (let count = 0; count <= edges.size; count++) {
      if (!remaining.delete(edge)) throw new Error('Invalid roof field boundary');
      ring.push(edge.a);
      if (key(edge.b) === start) break;
      const dx = edge.b[0]-edge.a[0], dn = edge.b[1]-edge.a[1];
      const next = (outgoing.get(key(edge.b)) ?? []).filter(e => remaining.has(e));
      next.sort((a,b) => {
        const turn = e => Math.atan2(dx*(e.b[1]-e.a[1])-dn*(e.b[0]-e.a[0]), dx*(e.b[0]-e.a[0])+dn*(e.b[1]-e.a[1]));
        return turn(b)-turn(a);
      });
      if (!next.length) throw new Error('Open roof field boundary');
      edge = next[0];
    }
    rings.push(ring.map(([x,n]) => [origin[0]+(x-.5)*size,origin[1]+(n-.5)*size]));
  }
  return rings;
}
