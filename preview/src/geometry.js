export function localToScene([east, north, altitude = 0]) {
  return [east, altitude, -north || 0];
}

export function buildingTransform(building) {
  const [width, depth, height] = building.size;
  const position = localToScene(building.center);
  position[1] += height / 2;
  return { position, scale: [width, height, depth], rotationY: building.yaw_deg * Math.PI / 180 };
}

export function parcelSegments(parcel) {
  return [parcel.ring, ...(parcel.holes ?? [])].flatMap((ring) =>
    ring.slice(1).map((point, index) => [ring[index], point]),
  );
}

export function routeSegments(points) {
  const segments = [];
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = localToScene(points[index - 1]);
    const end = localToScene(points[index]);
    const span = Math.hypot(end[0] - start[0], end[2] - start[2]);
    if (!Number.isFinite(span) || span === 0) continue;
    segments.push({ start, end, offset: length, span });
    length += span;
  }
  return length ? { segments, length } : null;
}

export function sampleRoute(route, distance) {
  const wrapped = ((distance % route.length) + route.length) % route.length;
  const segment = route.segments.find((item) => item.offset + item.span > wrapped) ?? route.segments.at(-1);
  const fraction = (wrapped - segment.offset) / segment.span;
  return {
    position: segment.start.map((value, axis) => value + (segment.end[axis] - value) * fraction),
    direction: [(segment.end[0] - segment.start[0]) / segment.span, (segment.end[2] - segment.start[2]) / segment.span],
  };
}

export function terrainHeight(terrain, east, north) {
  if (!terrain) return 0;
  const x = Math.max(0, Math.min(terrain.width - 1, (east - terrain.grid_origin_m[0]) / terrain.spacing_m[0]));
  const y = Math.max(0, Math.min(terrain.height - 1, (north - terrain.grid_origin_m[1]) / terrain.spacing_m[1]));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, terrain.width - 1), y1 = Math.min(y0 + 1, terrain.height - 1);
  const at = (column, row) => terrain.heights_m[row * terrain.width + column];
  const south = at(x0, y0) * (1 - (x - x0)) + at(x1, y0) * (x - x0);
  const northEdge = at(x0, y1) * (1 - (x - x0)) + at(x1, y1) * (x - x0);
  return south * (1 - (y - y0)) + northEdge * (y - y0);
}
