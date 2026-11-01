// Measures the District for the Five Rooms contract (#838) and draws its plan from the data.
// Run from the repository root:  node docs/design/five-rooms/measure.mjs
// Prints the tenant, building, venue and segment tables used in layout.md and rewrites
// docs/design/five-rooms/plan.svg. Reads only repository data; changes nothing else.
import { readFileSync, writeFileSync } from 'node:fs';
import { expandFiveRooms, siteFromDistrict } from '../../../shared/city-kit/five-rooms-layout.js';
import { laneFixtures, storefrontBenchSpots } from '../../../preview/src/street-fixtures.js';
import { treePits } from '../../../preview/src/street-furniture.js';
import { matureTreePlacements } from '../../../preview/src/landscape-models.js';
import { winstonBed } from '../../../preview/src/reference-planting.js';
import { storeRoomsFor } from '../../../preview/src/store-rooms.js';
import { groundSurfaceHeight } from '../../../preview/src/world-surface.js';
import { validateVegetation } from '../../../preview/src/vegetation.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const world = read('../../../preview/public/data/district.json');
world.vegetation = validateVegetation(world, read('../../../preview/public/data/district-vegetation.json'));
const contract = read('../../../config/ribbon/five-rooms.json');
const tenants = storeRoomsFor(world).filter(room => world.stores.some(store => store.id === room.storeId));
const site = siteFromDistrict(world, { fixtures: laneFixtures(world), benches: storefrontBenchSpots(world), treePits: treePits(world), trees: matureTreePlacements(world), beds: [winstonBed(world)], tenants, groundAt: (x, y) => groundSurfaceHeight(world, x, -y) });
const plan = expandFiveRooms(contract, site);
const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2);
const area = ring => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const retiredBy = new Map(contract.venues.flatMap(venue => venue.retire.tenants.map(id => [id, venue.label])));
const alternativeFor = new Map(contract.venues.flatMap(venue => (venue.retire.alternatives ?? []).flatMap(alt => alt.tenants.map(id => [id, venue.label]))));

console.log('## Tenants\n\n| Tenant | Store id | Building | Category | Bay w x d (m) | Area (m2) | Floor (m) | Proposal |\n|---|---|---|---|---|---|---|---|');
const byBuilding = [...tenants].sort((a, b) => a.buildingId.localeCompare(b.buildingId) || a.facade[1] - b.facade[1]);
for (const room of byBuilding) {
  const store = world.stores.find(item => item.id === room.storeId);
  const proposal = retiredBy.has(room.storeId) ? `**retire -> ${retiredBy.get(room.storeId)}** (option A)` : alternativeFor.has(room.storeId) ? `keep (alternative for ${[...new Set(contract.venues.filter(v => (v.retire.alternatives ?? []).some(a => a.tenants.includes(room.storeId))).map(v => v.label))].join(', ')})` : 'keep';
  console.log(`| ${room.name} | ${room.storeId} | ${room.buildingId} | ${store.category} | ${f2(room.width)} x ${f2(room.depth)} | ${f1(area(room.footprint))} | ${f2(room.floor)} | ${proposal} |`);
}
console.log('\n## Buildings\n\n| Building | Kind | Plan area (m2) | Tenants |\n|---|---|---|---|');
for (const building of world.buildings) console.log(`| ${building.id} | ${building.kind} | ${f1(area(building.ring))} | ${world.stores.filter(store => store.building_id === building.id).length} |`);
console.log('\n## Venues\n\n| Venue | Kind | Host | Retires | Footprint (m2) | Floor (m) | Entrance (x, y), width | Link | Station (m) |\n|---|---|---|---|---|---|---|---|---|');
for (const venue of plan.venues) {
  const entrance = venue.entrances[0], link = plan.links.find(item => item.venue === venue.id);
  console.log(`| ${venue.label} | ${venue.kind} | ${venue.host.buildingId} | ${venue.retire.names.join(', ') || 'none'} | ${f1(area(venue.footprint))} | ${f2(venue.floor.height)} | ${entrance.centre.map(f2).join(', ')}, ${entrance.width} m | ${link.segment}${link.end ? ' (end)' : ` (${link.side})`} | ${link.station} |`);
}
console.log('\n## Segments\n\n| Segment | Status | Length (m) | Width (m) | Clear (m) | Modules | Posts | Blockers |\n|---|---|---|---|---|---|---|---|');
for (const segment of plan.segments) console.log(`| ${segment.id} | ${segment.status} | ${segment.length} | ${segment.width} | ${segment.clearHeight} | ${segment.stats.modules} | ${segment.stats.posts} | ${(segment.blocked?.blockers ?? []).join(', ')} |`);
console.log(`\nstats ${JSON.stringify(plan.stats)}\nhash ${plan.hash}`);

// Plan drawing: north up, 1 px per 0.25 m, the area east of the central lane.
const box = [-2790, -1400, -2675, -1180], scale = 4, W = (box[2] - box[0]) * scale, H = (box[3] - box[1]) * scale;
const X = x => f1((x - box[0]) * scale), Y = y => f1((box[3] - y) * scale);
const poly = (ring, attrs) => `<polygon points="${ring.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')}" ${attrs}/>`;
const rect = (r, attrs) => `<rect x="${X(r[0])}" y="${Y(r[3])}" width="${f1((r[2] - r[0]) * scale)}" height="${f1((r[3] - r[1]) * scale)}" ${attrs}/>`;
const moduleRing = m => { const d = [Math.cos(m.yaw), Math.sin(m.yaw)], n = [-d[1], d[0]], c = [(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2]; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [c[0] + i * d[0] * m.length / 2 + j * n[0] * m.width / 2, c[1] + i * d[1] * m.length / 2 + j * n[1] * m.width / 2]); };
const inView = r => r[2] > box[0] && r[0] < box[2] && r[3] > box[1] && r[1] < box[3];
const blockers = new Set(plan.segments.flatMap(segment => segment.blocked?.blockers ?? []));
const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif" font-size="11">`, `<rect width="${W}" height="${H}" fill="#f7f4ef"/>`];
for (const road of world.roads) parts.push(`<polyline points="${road.points.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="${['footway', 'pedestrian'].includes(road.kind) ? '#d8d2c6' : '#b9b4ac'}" stroke-width="${f1(road.width_m * scale)}" stroke-linejoin="round"/>`);
for (const building of world.buildings) parts.push(poly(building.ring, 'fill="#e4ded3" stroke="#8c867c" stroke-width="1"'));
for (const room of tenants) if (!retiredBy.has(room.storeId)) parts.push(poly(room.footprint, 'fill="none" stroke="#a49e93" stroke-width="0.6" stroke-dasharray="3 2"'));
for (const venue of plan.venues) parts.push(poly(venue.footprint, 'fill="#f3c6d6" stroke="#b0336a" stroke-width="1.5"'));
for (const zone of plan.exclusions) if (inView(zone.rect) && zone.kind === 'doorway') parts.push(rect(zone.rect, 'fill="#7fb0d8" fill-opacity="0.45"'));
for (const zone of plan.exclusions) if (inView(zone.rect) && zone.id.startsWith('tree-pit')) parts.push(rect(zone.rect, `fill="${blockers.has(zone.id) ? '#d1495b' : '#5d8a4e'}"`));
for (const tree of site.trees) if (tree.x > box[0] && tree.x < box[2] && tree.y > box[1] && tree.y < box[3]) parts.push(`<circle cx="${X(tree.x)}" cy="${Y(tree.y)}" r="${f1(tree.radius * scale)}" fill="none" stroke="${blockers.has(tree.id) ? '#d1495b' : '#5d8a4e'}" stroke-width="0.8" stroke-dasharray="${blockers.has(tree.id) ? '' : '2 2'}"/>`);
for (const module of plan.modules) parts.push(poly(moduleRing(module), 'fill="#f0a35e" fill-opacity="0.55" stroke="#c0661c" stroke-width="0.5"'));
for (const post of plan.posts) parts.push(`<rect x="${f1(X(post.position[0]) - 0.6)}" y="${f1(Y(post.position[1]) - 0.6)}" width="1.2" height="1.2" fill="#3b2a1a"/>`);
for (const link of plan.links) parts.push(poly(link.reach, 'fill="#2f7d5b" fill-opacity="0.6"'));
for (const venue of plan.venues) { const c = venue.footprint.reduce((s, p) => [s[0] + p[0] / venue.footprint.length, s[1] + p[1] / venue.footprint.length], [0, 0]); parts.push(`<text x="${X(c[0] + (venue.kind === 'threshold' ? 3 : 0))}" y="${Y(c[1])}" text-anchor="${venue.kind === 'threshold' ? 'start' : 'middle'}" fill="#5a1235">${venue.label}</text>`); }
parts.push(`<text x="8" y="16" fill="#333">${contract.version} from config/ribbon/five-rooms.json; north up; 10 m = ${10 * scale} px</text>`, '<text x="8" y="30" fill="#333">pink venues, orange Ribbon, blue door zones, green link reaches, red blockers</text>', '</svg>');
writeFileSync(new URL('./plan.svg', import.meta.url), parts.join('\n') + '\n');
