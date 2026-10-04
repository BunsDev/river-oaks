// A local editing model for schema v1 creator regions. The server remains the
// publication authority; these helpers keep map interaction and drafts bounded.
export const REGION_MAP_SIZE = 600;
export const REGION_DRAFT_STORAGE_KEY = 'river-oaks-creator-region-draft-v1';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key));
const slug = value => typeof value === 'string' && value.length <= 48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const label = value => typeof value === 'string' && value === value.trim() && [...value].length > 0 && [...value].length <= 64
  && !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(value);
const between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const interior = value => keys(value, ['name', 'category', 'entrance']) && label(value.name)
  && ['clothes', 'art', 'restaurant', 'wellness'].includes(value.category)
  && ['south', 'east', 'north', 'west'].includes(value.entrance);

export function blankRegion() {
  return {
    schema_version: 1,
    bounds_m: [-96, -96, 96, 96],
    terrain: { width: 9, height: 9, heights_m: Array(81).fill(0) },
    spawn: [0, -20],
    roads: [{ id: 'main-walk', name: 'Main Walk', kind: 'footway', width_m: 4, points: [[0, -80], [0, 80]] }],
    buildings: [], trees: [],
    places: [
      { id: 'south-garden', name: 'South Garden', position: [-36, -54] },
      { id: 'east-garden', name: 'East Garden', position: [54, -36] },
      { id: 'north-garden', name: 'North Garden', position: [36, 54] },
      { id: 'west-garden', name: 'West Garden', position: [-54, 36] },
    ],
  };
}

export function buildingFits(region, building) {
  if (!point(building.center) || !Array.isArray(building.size) || building.size.length !== 3 || !Number.isFinite(building.yaw_deg)) return false;
  const [width, depth] = building.size, angle = building.yaw_deg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
    .every(([x, y]) => insideRegion(region, [building.center[0] + x * c - y * s, building.center[1] + x * s + y * c]));
}

export function spawnClear(region) {
  return region.buildings.every(building => {
    const angle = building.yaw_deg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const dx = region.spawn[0] - building.center[0], dy = region.spawn[1] - building.center[1];
    return Math.abs(dx * c + dy * s) >= building.size[0] / 2 + .35
      || Math.abs(-dx * s + dy * c) >= building.size[1] / 2 + .35;
  });
}

export function editableRegion(value) {
  if (!keys(value, ['schema_version', 'bounds_m', 'terrain', 'spawn', 'roads', 'buildings', 'trees', 'places'])
    || value.schema_version !== 1 || !Array.isArray(value.bounds_m) || value.bounds_m.length !== 4
    || !value.bounds_m.every(number => between(number, -10000, 10000))
    || !between(value.bounds_m[2] - value.bounds_m[0], 40, 512)
    || !between(value.bounds_m[3] - value.bounds_m[1], 40, 512)
    || !keys(value.terrain, ['width', 'height', 'heights_m']) || !Number.isInteger(value.terrain.width) || !Number.isInteger(value.terrain.height)
    || value.terrain.width < 5 || value.terrain.width > 65 || value.terrain.height < 5 || value.terrain.height > 65
    || !Array.isArray(value.terrain.heights_m) || value.terrain.heights_m.length !== value.terrain.width * value.terrain.height
    || !value.terrain.heights_m.every(number => between(number, -50, 500)) || !point(value.spawn) || !insideRegion(value, value.spawn)
    || !Array.isArray(value.roads) || value.roads.length < 1 || value.roads.length > 64
    || !Array.isArray(value.buildings) || value.buildings.length > 80
    || value.buildings.filter(item => item?.interior !== undefined).length > 8
    || !Array.isArray(value.trees) || value.trees.length > 256
    || !Array.isArray(value.places) || value.places.length < 4 || value.places.length > 64) return false;
  const ids = new Set();
  const id = item => { if (!slug(item.id) || ids.has(item.id)) return false; ids.add(item.id); return true; };
  return value.roads.every(item => keys(item, ['id', 'name', 'kind', 'width_m', 'points']) && id(item) && label(item.name)
    && ['footway', 'residential'].includes(item.kind)
    && between(item.width_m, item.kind === 'footway' ? 2 : 6, item.kind === 'footway' ? 8 : 16)
    && Array.isArray(item.points) && item.points.length >= 2 && item.points.length <= 128
    && item.points.every(position => point(position) && insideRegion(value, position))
    && item.points.some((position, index) => index > 0 && Math.hypot(position[0] - item.points[index - 1][0], position[1] - item.points[index - 1][1]) >= .1))
    && value.buildings.every(item => keys(item, ['id', 'center', 'size', 'yaw_deg', 'kind', 'interior']) && id(item)
      && point(item.center) && Array.isArray(item.size) && item.size.length === 3
      && between(item.size[0], 4, 80) && between(item.size[1], 4, 80) && between(item.size[2], 5.5, 50)
      && between(item.yaw_deg, -180, 180) && ['retail', 'residential', 'parking'].includes(item.kind) && buildingFits(value, item)
      && (item.interior === undefined || item.kind === 'retail' && item.size[0] >= 6 && item.size[1] >= 6 && interior(item.interior)))
    && value.trees.every(item => keys(item, ['id', 'position', 'height_m', 'crown_radius_m']) && id(item)
      && point(item.position) && insideRegion(value, item.position) && between(item.height_m, 2, 35) && between(item.crown_radius_m, .5, 10))
    && value.places.every(item => keys(item, ['id', 'name', 'position']) && id(item) && label(item.name)
      && point(item.position) && insideRegion(value, item.position))
    && spawnClear(value);
}

export function mapPoint(region, [east, north]) {
  const [west, south, right, top] = region.bounds_m;
  return [(east - west) / (right - west) * REGION_MAP_SIZE, (top - north) / (top - south) * REGION_MAP_SIZE];
}

export function regionPoint(region, [x, y]) {
  const [west, south, right, top] = region.bounds_m;
  return [Math.round((west + x / REGION_MAP_SIZE * (right - west)) * 10) / 10,
    Math.round((top - y / REGION_MAP_SIZE * (top - south)) * 10) / 10];
}

export function insideRegion(region, [east, north], margin = 1) {
  const [west, south, right, top] = region.bounds_m;
  return east >= west + margin && east <= right - margin && north >= south + margin && north <= top - margin;
}

export function nextRegionId(region, stem) {
  const ids = new Set([...region.roads, ...region.buildings, ...region.trees, ...region.places].map(item => item.id));
  let index = 1;
  while (ids.has(`${stem}-${index}`)) index++;
  return `${stem}-${index}`;
}

export function terrainIndex(region, [east, north]) {
  const [west, south, right, top] = region.bounds_m, { width, height } = region.terrain;
  const column = Math.max(0, Math.min(width - 1, Math.round((east - west) / (right - west) * (width - 1))));
  const row = Math.max(0, Math.min(height - 1, Math.round((north - south) / (top - south) * (height - 1))));
  return row * width + column;
}
