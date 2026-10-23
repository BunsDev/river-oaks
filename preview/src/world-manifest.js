// Location coordinates are metres east/north/up relative to the existing GIS origin.
// Registration describes content; it never grants movement or changes world-room authority.
const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const check = (condition, message) => { if (!condition) throw new Error(`Invalid world manifest: ${message}`); };
const contains = (bounds, point) => point[0] >= bounds[0] && point[0] <= bounds[2] && point[1] >= bounds[1] && point[1] <= bounds[3];

export function localToWorld(location, point) {
  check(vector(point, 3) && vector(location?.translation_m, 3), 'finite coordinate required');
  const result = point.map((value, axis) => value + location.translation_m[axis]);
  check(result.every(Number.isFinite), 'coordinate overflow');
  return result;
}

export function worldToLocal(location, point) {
  check(vector(point, 3) && vector(location?.translation_m, 3), 'finite coordinate required');
  const result = point.map((value, axis) => value - location.translation_m[axis]);
  check(result.every(Number.isFinite), 'coordinate overflow');
  return result;
}

export function locationWorldBounds(location) {
  const [west, south, east, north] = location.bounds_m;
  const low = localToWorld(location, [west, south, 0]);
  const high = localToWorld(location, [east, north, 0]);
  return [low[0], low[1], high[0], high[1]];
}

export function validateWorldManifest(input) {
  check(input?.schema_version === 1, 'unsupported schema version');
  check(input.axes === 'east-north-up' && input.units === 'metres', 'unsupported coordinate frame');
  check(vector(input.origin, 2) && Math.abs(input.origin[0]) <= 180 && Math.abs(input.origin[1]) <= 90, 'invalid geographic origin');
  check(input.crs === 'EPSG:32615', 'unsupported projection');
  check(Array.isArray(input.locations) && input.locations.length > 0 && input.locations.length <= 64, 'expected 1–64 locations');
  const ids = new Set();
  for (const location of input.locations) {
    check(location && typeof location.id === 'string' && idPattern.test(location.id) && !ids.has(location.id), 'invalid or duplicate location ID');
    ids.add(location.id);
    check(vector(location.bounds_m, 4) && location.bounds_m[0] < location.bounds_m[2] && location.bounds_m[1] < location.bounds_m[3], 'invalid bounds');
    check(vector(location.translation_m, 3), 'invalid translation');
    check(typeof location.content_revision === 'string' && idPattern.test(location.content_revision), 'invalid content revision');
    check(['authored', 'reserved'].includes(location.status), 'invalid content status');
    check(Array.isArray(location.entries) && location.entries.length <= 64, 'invalid entries');
    const entries = new Set();
    for (const entry of location.entries) {
      check(entry && typeof entry.id === 'string' && idPattern.test(entry.id) && !entries.has(entry.id), 'invalid or duplicate entry ID');
      entries.add(entry.id);
      check(vector(entry.position_m, 3) && contains(location.bounds_m, entry.position_m), 'entry outside location');
      localToWorld(location, entry.position_m);
    }
    check(Array.isArray(location.adjacent) && new Set(location.adjacent).size === location.adjacent.length, 'invalid adjacency');
    const bounds = locationWorldBounds(location);
    check(Number.isFinite((bounds[2] - bounds[0]) * (bounds[3] - bounds[1])), 'area overflow');
  }
  check(ids.has(input.default_location), 'missing default location');
  for (const location of input.locations) {
    for (const neighbor of location.adjacent) {
      check(neighbor !== location.id && ids.has(neighbor), 'unknown or self adjacency');
      const other = input.locations.find(item => item.id === neighbor);
      check(other.adjacent.includes(location.id), 'adjacency must be reciprocal');
      const a = locationWorldBounds(location), b = locationWorldBounds(other);
      const edgeX = (a[2] === b[0] || b[2] === a[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);
      const edgeY = (a[3] === b[1] || b[3] === a[1]) && Math.min(a[2], b[2]) > Math.max(a[0], b[0]);
      check(edgeX || edgeY, 'adjacent locations must share an edge');
    }
  }
  for (let i = 0; i < input.locations.length; i++) {
    for (let j = i + 1; j < input.locations.length; j++) {
      const a = locationWorldBounds(input.locations[i]), b = locationWorldBounds(input.locations[j]);
      check(!(Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1])), 'overlapping locations');
    }
  }
  return structuredClone(input);
}

/** Validate the legacy frame without rewriting any entity ID, geometry or revision overlay. */
export function validateDistrictLocation(manifest, district) {
  const validated = validateWorldManifest(manifest);
  const location = validated.locations.find(item => item.id === 'river-oaks-district');
  check(location?.status === 'authored' && location.translation_m.every(value => value === 0), 'District must retain its identity transform');
  check(district?.schema_version === 1 && district.scene === 'district', 'unsupported District data');
  check(JSON.stringify(district.origin) === JSON.stringify(validated.origin) && district.crs === validated.crs, 'District origin mismatch');
  check(JSON.stringify(district.bounds_m) === JSON.stringify(location.bounds_m), 'District bounds mismatch');
  return district;
}
