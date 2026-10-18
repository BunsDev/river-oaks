// The Gardens (#506): the measured campus, floor and connection contract that
// replaces the parking garage osm-way-625330790. Renderer, collision, level
// authority, unit inventory and tests read this one description. Pure data and
// geometry: no Three.js, DOM or server state, so the browser and the Node
// service share it.
//
// Frame: local metres u (east, across the plot), v (north, along it), z (height
// above the garage base). campusToSource and campusToScene convert; the renderer
// maps source [east, north, altitude] to [east, altitude, -north].
//
// Source geometry (SOURCE, the garage ring as pinned in district.json) and the
// authored replacement (everything else) stay separately identifiable. The
// validator re-derives the parcel from a district and refuses a mismatch.

export const GARDEN_CAMPUS_ID = 'river-oaks-garden-campus';
// Versions. schema: the shape of this object. layout: the design revision (any
// change to an id, dimension, elevation or connection). floors: floor numbering
// and elevations. support: the meaning of surfaces, levels and transitions.
// units: suite identities and boundaries. Persisted positions, leases and level
// state record {id, layout, floors, support, units} and must refuse or relocate
// on any major mismatch (checkCampusCompatibility).
export const GARDEN_CAMPUS_VERSIONS = Object.freeze({ schema: 1, layout: '3.0', floors: 1, support: 1, units: 1 });

// Conservative body envelope (preview/src/workplace-room.js AVATAR_ENVELOPE, kept
// equal by a test) and the clearances derived from it. Remeasured against the
// current human-only catalog in docs/design/garden-campus/avatar-envelope.json.
export const CAMPUS_BODY = Object.freeze({ bodyHalfWidth: 0.505, turningRadius: 0.888, height: 2.45, seatedRadius: 1.27 });
export const CAMPUS_HEADROOM = 0.3;
export const CAMPUS_DOOR_WIDTH = 1.7; // 2 x store-rooms DOOR_HALF_WIDTH
export const CAMPUS_PASSAGE_WIDTH = 1.8; // workplace-room CIRCULATION_WIDTH
export const CAMPUS_SUITE_MIN_SIDE = 3.0;

const SOURCE = {
  repository: 'BunsDev/river-oaks', commit: '153471bc2075e0d02e764a97b0a72129d6da5207',
  districtPath: 'preview/public/data/district.json', districtBlob: '566d7c52295f8811b50890c23f448261bbf9a0a7',
  buildingId: 'osm-way-625330790', kind: 'parking', height: 20, attribution: '© OpenStreetMap contributors; ODbL-1.0',
  // The ring is also one of district.collisionPolygons (index 1 at this blob): the parcel
  // blocks walking until a campus revision removes it (#507).
  collision: 'district.collisionPolygons holds this ring exactly',
  ring: [
    [-2681.34210183291, -1186.853444818873], [-2690.127958538709, -1186.755477138795], [-2719.059281110647, -1186.4290162688121],
    [-2720.159361360711, -1285.1007009684108], [-2720.223349907552, -1290.8442606572062], [-2721.0810608329484, -1367.6393737783656],
    [-2687.5821342889685, -1368.0184901249595], [-2683.324572555837, -1368.064591454342], [-2683.008998002042, -1339.0916268555447],
    [-2681.34210183291, -1186.853444818873],
  ],
};
const FRAME = {
  units: 'metres', axes: 'u east across the plot; v north along it; z above the reference base',
  sourceCrs: 'origin-relative EPSG:32615, origin lon/lat [-95.425, 29.755]',
  origin: [-2721.0810608329484, -1367.6393737783656], east: [0.9999377655151228, -0.011156392634869974], north: [0.011156392634869974, 0.9999377655151228],
  baseAltitude: 18.25939189446673, renderer: 'source [east, north, altitude] -> scene [east, altitude, -north]',
};
// Mapped neighbours that bound the design (district.json, same revision).
const CONTEXT = {
  ipic: { buildingId: 'osm-way-625330798', height: 18.5, baseAltitude: 18.321182917894696, wall: { from: [0.0008082693165905042, 82.54381889937359], to: [0, 181.2216357447026], length: 98.6778168486393 },
    rule: 'Retained party wall: no opening, path end, portal or implied IPIC entrance on this edge.' },
  office: { buildingId: 'osm-way-625330785', height: 33, baseAltitude: 18.28382827097783, nominalRoofAltitude: 51.28382827097783 },
  east: 'No continuous east street is mapped; the 6 m promenade P1 lies inside the garage polygon.',
};

const rect = (u0, v0, u1, v1) => [u0, v0, u1, v1];
// The authored campus. Rects are [u0, v0, u1, v1]; z in metres above the base.
const TOWERS = [
  { id: 'T1', name: 'Grove Offices', tiers: [[2, rect(6, 46, 25, 70)], [2, rect(6, 48.5, 22, 70)], [2, rect(6, 51, 19, 70)]],
    core: rect(8, 55, 13, 61), spur: rect(13, 56, 14.5, 59), door: [25, 58], approach: 'P9', capZ: 28.1, groundUse: 'Shared work lounge and rental reception' },
  { id: 'T2', name: 'The Commons', tiers: [[3, rect(6, 90, 25, 116)], [2, rect(6, 93, 22, 116)], [2, rect(6, 96, 19, 116)]],
    core: rect(8, 100, 13, 106), spur: rect(13, 101.5, 14.5, 104.5), door: [25, 103], approach: 'P4', capZ: 32.1, groundUse: 'Shared collaboration and project demo space' },
  { id: 'T3', name: 'Atelier Offices', tiers: [[2, rect(6, 128, 25, 150)], [2, rect(6, 131, 22, 150)], [2, rect(6, 134, 19, 150)]],
    core: rect(8, 136, 13, 142), spur: rect(13, 137.5, 14.5, 140.5), door: [25, 139], approach: 'P6', capZ: 28.1, groundUse: 'Atelier and creator workspace' },
];
const GROUND_FLOOR_HEIGHT = 5, UPPER_FLOOR_HEIGHT = 4, PARAPET = 1, PUBLIC_LEVEL = 4, PUBLIC_Z = 13;
// The public Floor 4 spine through every tower (u 14.5-17.5, the bridge clear strip).
const SPINE_U = [14.5, 17.5];
const BRIDGES = [
  { id: 'B12', name: 'Grove to Commons skywalk', rect: rect(14, 70, 18, 93), clear: rect(14.5, 70, 17.5, 93), from: { tower: 'T1', side: 'north' }, to: { tower: 'T2', side: 'south' }, span: 23 },
  { id: 'B23', name: 'Commons to Atelier skywalk', rect: rect(14, 116, 18, 131), clear: rect(14.5, 116, 17.5, 131), from: { tower: 'T2', side: 'north' }, to: { tower: 'T3', side: 'south' }, span: 15 },
];
const BRIDGE_DECK = { z: PUBLIC_Z, slab: 0.35, guard: 1.25, edgeZone: 0.5, portalClearHeight: 3.2, landingDepth: 3 };
const GALLERIES = { T1: rect(14.5, 49.5, 17.5, 70), T2: rect(14.5, 93, 17.5, 116), T3: rect(14.5, 131, 17.5, 149) };
const TERRACES = [
  { id: 'T1-terrace-3', tower: 'T1', level: 3, door: [22, 59.25] }, { id: 'T1-terrace-5', tower: 'T1', level: 5, door: [19, 60.5] },
  { id: 'T2-terrace-4', tower: 'T2', level: 4, door: [22, 104.5] }, { id: 'T2-terrace-6', tower: 'T2', level: 6, door: [19, 106] },
  { id: 'T3-terrace-3', tower: 'T3', level: 3, door: [22, 140.5] }, { id: 'T3-terrace-5', tower: 'T3', level: 5, door: [19, 142] },
];
// Ground program. Open pergola and the pool: the pergola is walkable under, the pool is not.
const GROUND_BUILDINGS = [
  { id: 'C', kind: 'cafe', name: 'Garden café', rect: rect(4, 25, 16, 39), height: 4.8, door: [16, 32], approach: 'P3', walkableBelow: false },
  // Posts are 0.3 m square on the perimeter: 5 m bays along the south and north edges, one
  // mid post on the west edge (about 6.9 m bays), and only corners on the east edge so the
  // 6 m P7 approach stays clear.
  { id: 'S', kind: 'pergola', name: 'Social pergola', rect: rect(4, 154, 24, 168), height: 4.2, approach: 'P7', walkableBelow: true,
    posts: [[4, 154], [9, 154], [14, 154], [19, 154], [23.7, 154], [4, 167.7], [9, 167.7], [14, 167.7], [19, 167.7], [23.7, 167.7], [4, 160.85]]
      .map(([u, v], i) => ({ id: `S-post-${i + 1}`, rect: rect(u, v, u + 0.3, v + 0.3) })) },
  { id: 'POOL', kind: 'pool', name: 'South reflecting pool', rect: rect(18, 12, 25, 24), height: 0, walkableBelow: false },
];
const PATHS = [
  { id: 'P1', name: 'Main promenade', rect: rect(28.5, 0, 34.5, 181.2) }, { id: 'P2', name: 'District cross-route', rect: rect(0.01, 73.8, 34.5, 79.8) },
  { id: 'P3', name: 'Café approach', rect: rect(16, 29.5, 30, 34.5) }, { id: 'P4', name: 'T2 workspace entrance approach', rect: rect(25, 100, 30, 106) },
  { id: 'P5', name: 'Internal garden crossing (stops inside the west edge)', rect: rect(3, 119, 30, 124) }, { id: 'P6', name: 'T3 Atelier entrance approach', rect: rect(25, 136.5, 30, 141.5) },
  { id: 'P7', name: 'Social terrace approach', rect: rect(24, 158, 30, 164) }, { id: 'P8', name: 'North garden path', rect: rect(5, 172, 30, 177) },
  { id: 'P9', name: 'T1 workspace entrance approach', rect: rect(25, 55.5, 30, 60.5) },
];
// Entries are parcel vertices where mapped lanes meet the plot. laneAltitude is
// the lane's own vertex altitude, so the threshold to z 0 is explicit.
const ENTRIES = [
  { id: 'E1', name: 'South arrival / office lane', position: [33.5010713263594, -0.00536557511209973], path: 'P1', end: 'south', lane: 'osm-way-627662384-0', laneAltitude: 18.2283 },
  { id: 'E2', name: 'West district lane', position: [0.000901111780007291, 76.79990277670413], path: 'P2', end: 'west', lane: 'osm-way-625330795-0', laneAltitude: 18.248187825169524 },
  { id: 'E3', name: 'North arrival / Bettis driveway', position: [28.933164171626295, 181.2179643859025], path: 'P1', end: 'north', lane: 'osm-way-1038886262-0', laneAltitude: 18.317961897145146 },
];
const CAMERAS = [
  { id: '01-southeast-aerial', name: 'Whole campus, three crowns and two skywalks', position: [125, -90, 155], target: [12, 93, 12], fov: 42 },
  { id: '02-street-under-b12', name: 'Ground cross-route P2 below the Grove-Commons skywalk', position: [32, 74.5, 1.7], target: [16, 89, 12], fov: 77 },
  { id: '03-floor4-bridge-walk', name: 'On B12 at eye height, walking north into The Commons', position: [16, 71.5, PUBLIC_Z + 1.68], target: [16, 93, PUBLIC_Z + 1.6], fov: 70 },
  { id: '04-northwest-high-oblique', name: 'Opposite high oblique over the IPIC roof', position: [-70, 245, 95], target: [15, 95, 14], fov: 45 },
  { id: '05-office-terrace-outlook', name: 'From the existing office roof edge nearest the campus (approximate), looking north', position: [10, -16, 33.02 + 1.68], target: [15, 100, 16], fov: 60 },
];
// Roof access emerges inside each core: lift overrun and stair enclosure.
const ROOF_HEADHOUSE_HEIGHT = 3.0, ROOF_EDGE_ZONE = 0.5;
// Roof and terrace planting is declared, not drawn: beds that stay out of clear routes.
const PLANTING = { roofBedWidth: 1.0, terraceBedDepth: 0.8 };

const round = value => Math.round(value * 1e6) / 1e6;
const area = ([u0, v0, u1, v1]) => round((u1 - u0) * (v1 - v0));

function towerFloors(tower) {
  const floors = [];let level = 1, z = 0;
  tower.tiers.forEach(([count, plate], tier) => {
    for (let i = 0; i < count; i++) {
      const height = level === 1 ? GROUND_FLOOR_HEIGHT : UPPER_FLOOR_HEIGHT;
      floors.push({ id: `${tower.id}-F${level}`, tower: tower.id, level, tier: tier + 1, z0: z, z1: z + height, rect: [...plate], access: level === 1 ? 'public' : 'mixed' });
      z += height;level++;
    }
  });
  return floors;
}

// Core: lift, enclosed stair and a lobby on the face that meets the public spur.
// The reserved 5 x 6 m core does not hold a walkable switchback stair as well as
// the lift and a lobby meeting the 3 m spur (see CORE_DECISION), so stairs are
// level-change portals, as in generated interiors, and the lift is the step-free route.
function coreParts(tower) {
  const [u0, v0, u1, v1] = tower.core;
  return {
    rect: [...tower.core],
    lobby: { id: `${tower.id}-core-lobby`, rect: [11, v0, u1, v1], access: 'public' },
    lift: { id: `${tower.id}-lift`, rect: [u0, v0, 11, v0 + 2.6], portal: [11, v0 + 1.3], kind: 'lift' },
    stair: { id: `${tower.id}-stair`, rect: [u0, v0 + 2.6, 11, v1], portal: [11, (v0 + 2.6 + v1) / 2], kind: 'stairs', walkable: false },
  };
}
export const CORE_DECISION = Object.freeze({
  decision: 'Stairs are enclosed level-change portals; the lift is the step-free route. The reserved 5 x 6 m core is kept.',
  measured: 'A code-like switchback (risers <= 0.18 m, goings >= 0.28 m, two 1.2 m flights) needs about 2.6 x 7.0 m for a 4 m storey and 2.6 x 8.4 m for the 5 m ground storey. With a 2.2 m lift shaft and a 2 m lobby meeting the 3 m spur, the core would grow to about 5 x 9.4 m.',
  effectIfAdopted: 'Extending each core 3.4 m north would remove about 8.5 m x 3.4 m = 28.9 m2 of lettable west-band suite per upper floor (19 floors, about 549 m2 campus-wide) and move every core spur. Not adopted; #508 may revise the core under a new layout version if walked stairs are required.',
});

function spineFor(floor, tower) {
  const [, v0, , v1] = floor.rect;
  if (floor.level === PUBLIC_LEVEL) return { id: `${floor.id}-public`, rect: [...GALLERIES[tower.id]], access: 'public', kind: 'gallery' };
  // Other upper floors: the same spine, stopping 1 m short of each facade.
  return { id: `${floor.id}-spine`, rect: [SPINE_U[0], v0 + 1, SPINE_U[1], v1 - 1], access: 'public', kind: 'corridor' };
}

// Net suites: what is left of a plate after the core, the spur, the spine and any
// terrace passage, kept only where a suite can hold a seated desk with clearance.
function floorUnits(floor, tower, spine, passage) {
  const [pu0, pv0, pu1, pv1] = floor.rect, [, c0, , c1] = tower.core, suites = [], residual = [];
  const candidates = [
    { side: 'W-S', rect: [pu0, pv0, SPINE_U[0], c0], doorEdge: 'east' }, { side: 'W-N', rect: [pu0, c1, SPINE_U[0], pv1], doorEdge: 'east' },
  ];
  const east = [SPINE_U[1], pv0, pu1, pv1];
  if (passage) candidates.push({ side: 'E-S', rect: [east[0], pv0, pu1, passage.rect[1]], doorEdge: 'west' }, { side: 'E-N', rect: [east[0], passage.rect[3], pu1, pv1], doorEdge: 'west' });
  else candidates.push({ side: 'E', rect: east, doorEdge: 'west' });
  residual.push({ id: `${floor.id}-core-west`, rect: [pu0, c0, tower.core[0], c1], reason: 'service and riser zone beside the core' });
  residual.push({ id: `${floor.id}-spur-south`, rect: [tower.core[2], c0, SPINE_U[0], tower.spur[1]], reason: 'narrow strip beside the spur' });
  residual.push({ id: `${floor.id}-spur-north`, rect: [tower.core[2], tower.spur[3], SPINE_U[0], c1], reason: 'narrow strip beside the spur' });
  if (spine.rect[1] > pv0) residual.push({ id: `${floor.id}-facade-south`, rect: [SPINE_U[0], pv0, SPINE_U[1], spine.rect[1]], reason: 'facade zone at the spine end' });
  if (spine.rect[3] < pv1) residual.push({ id: `${floor.id}-facade-north`, rect: [SPINE_U[0], spine.rect[3], SPINE_U[1], pv1], reason: 'facade zone at the spine end' });
  let n = 1;
  for (const candidate of candidates) {
    const [u0, v0, u1, v1] = candidate.rect, w = u1 - u0, d = v1 - v0;
    if (w < CAMPUS_SUITE_MIN_SIDE - 1e-9 || d < CAMPUS_SUITE_MIN_SIDE - 1e-9) {
      if (w > 1e-9 && d > 1e-9) residual.push({ id: `${floor.id}-${candidate.side}`, rect: [...candidate.rect], reason: `below the ${CAMPUS_SUITE_MIN_SIDE} m suite minimum (${round(w)} x ${round(d)} m)` });
      continue;
    }
    // Door: on the edge shared with the spine, centred on the shared span.
    const [s0, s1] = [Math.max(v0, spine.rect[1]), Math.min(v1, spine.rect[3])];
    if (s1 - s0 < CAMPUS_DOOR_WIDTH) { residual.push({ id: `${floor.id}-${candidate.side}`, rect: [...candidate.rect], reason: 'no door-width contact with public circulation' });continue; }
    const doorU = candidate.doorEdge === 'east' ? u1 : u0, doorV = round((s0 + s1) / 2);
    const inward = candidate.doorEdge === 'east' ? -0.6 : 0.6;
    const desk = [round((u0 + u1) / 2), round((v0 + v1) / 2)];
    suites.push({ id: `${floor.id}-${candidate.side}`, number: `${tower.id}-${floor.level}${String(n++).padStart(2, '0')}`, tower: tower.id, level: floor.level, z: floor.z0,
      rect: [...candidate.rect], netArea: area(candidate.rect), access: 'private-suite',
      door: { position: [doorU, doorV], width: CAMPUS_DOOR_WIDTH, opensTo: spine.id, inside: [round(doorU + inward), doorV] },
      desk: { anchor: desk, clearance: CAMPUS_BODY.seatedRadius } });
  }
  return { suites, residual };
}

function buildLayout() {
  const towers = TOWERS.map(tower => {
    const floors = towerFloors(tower), top = floors.at(-1), roofZ = top.z1;
    const core = coreParts(tower), headhouseTop = roofZ + ROOF_HEADHOUSE_HEIGHT;
    const roof = { id: `${tower.id}-roof`, z: roofZ, rect: [...top.rect], parapetTop: roofZ + PARAPET, access: 'public', use: 'planted shared roof garden',
      headhouse: { id: `${tower.id}-headhouse`, rect: [...tower.core], z0: roofZ, z1: headhouseTop, door: [tower.core[2], (tower.core[1] + tower.core[3]) / 2] },
      planting: { beds: [{ id: `${tower.id}-roof-bed-west`, rect: [top.rect[0] + ROOF_EDGE_ZONE, top.rect[1] + ROOF_EDGE_ZONE, top.rect[0] + ROOF_EDGE_ZONE + PLANTING.roofBedWidth, top.rect[3] - ROOF_EDGE_ZONE] }], maxTop: tower.capZ } };
    const levels = floors.map(floor => {
      const spine = floor.level === 1 ? null : spineFor(floor, tower);
      const terrace = TERRACES.find(item => item.tower === tower.id && item.level === floor.level);
      const passage = terrace ? { id: `${terrace.id}-passage`, rect: [SPINE_U[1], terrace.door[1] - CAMPUS_PASSAGE_WIDTH / 2, terrace.door[0], terrace.door[1] + CAMPUS_PASSAGE_WIDTH / 2], access: 'public', to: terrace.id } : null;
      const units = spine ? floorUnits(floor, tower, spine, passage) : { suites: [], residual: [] };
      return { ...floor, core: { lobby: core.lobby.id }, spine, passage, spur: spine ? { id: `${floor.id}-core-spur`, rect: [...tower.spur], access: 'public' } : null,
        hall: floor.level === 1 ? { id: `${floor.id}-hall`, rect: [...floor.rect], access: 'public', use: tower.groundUse, door: { position: [...tower.door], width: CAMPUS_DOOR_WIDTH, opensTo: tower.approach } } : null,
        ...units };
    });
    const terraces = TERRACES.filter(item => item.tower === tower.id).map(item => {
      const lower = floors.find(floor => floor.level === item.level - 1), upper = floors.find(floor => floor.level === item.level);
      const [ou0, ov0, ou1, ov1] = lower.rect, [, iv0, iu1] = upper.rect;
      return { id: item.id, tower: tower.id, level: item.level, z: upper.z0, outer: [...lower.rect], inner: [...upper.rect], access: 'public', use: 'shared planted work deck',
        parts: [[iu1, ov0, ou1, ov1], [ou0, ov0, iu1, iv0]], door: [...item.door, upper.z0], bedDepth: PLANTING.terraceBedDepth };
    });
    return { id: tower.id, name: tower.name, tiers: tower.tiers.map(([count, plate]) => ({ levels: count, rect: [...plate] })),
      tierLevelCounts: tower.tiers.map(([count]) => count), levelElevations: [...floors.map(floor => floor.z0), roofZ],
      core, levels, terraces, roof, silhouette: { parapetTop: roofZ + PARAPET, headhouseTop, plantingTop: tower.capZ, capZ: tower.capZ } };
  });
  const tower = id => towers.find(item => item.id === id), level = (id, n) => tower(id).levels.find(item => item.level === n);
  const bridges = BRIDGES.map(bridge => {
    const a = level(bridge.from.tower, PUBLIC_LEVEL), b = level(bridge.to.tower, PUBLIC_LEVEL);
    const fromV = bridge.from.side === 'north' ? a.rect[3] : a.rect[1], toV = bridge.to.side === 'north' ? b.rect[3] : b.rect[1];
    const portal = (end, tw, v, side) => ({ id: `${bridge.id}-${end}`, bridge: bridge.id, tower: tw, level: PUBLIC_LEVEL, side, position: [16, v, PUBLIC_Z],
      opening: [...SPINE_U], width: SPINE_U[1] - SPINE_U[0], clearHeight: BRIDGE_DECK.portalClearHeight, access: 'public' });
    const landing = (tw, v, side) => ({ id: `${tw}-F4-${side}`, tower: tw, level: PUBLIC_LEVEL, z: PUBLIC_Z, access: 'public',
      rect: side === 'north' ? [SPINE_U[0], v - BRIDGE_DECK.landingDepth, SPINE_U[1], v] : [SPINE_U[0], v, SPINE_U[1], v + BRIDGE_DECK.landingDepth] });
    return { ...bridge, rect: [...bridge.rect], clear: [...bridge.clear], deckZ: BRIDGE_DECK.z, slab: BRIDGE_DECK.slab, underside: round(BRIDGE_DECK.z - BRIDGE_DECK.slab),
      guard: BRIDGE_DECK.guard, edgeZone: BRIDGE_DECK.edgeZone, grossWidth: bridge.rect[2] - bridge.rect[0], clearWidth: bridge.clear[2] - bridge.clear[0], access: 'public',
      from: { ...bridge.from, level: PUBLIC_LEVEL, v: fromV }, to: { ...bridge.to, level: PUBLIC_LEVEL, v: toV },
      portals: [portal('from', bridge.from.tower, fromV, bridge.from.side), portal('to', bridge.to.tower, toV, bridge.to.side)],
      landings: [landing(bridge.from.tower, fromV, bridge.from.side), landing(bridge.to.tower, toV, bridge.to.side)],
      supportModel: 'Authored elevated deck at deckZ. Never ordinary terrain: a ground walker below stays on the ground.' };
  });
  return {
    id: GARDEN_CAMPUS_ID, versions: { ...GARDEN_CAMPUS_VERSIONS }, name: 'The Gardens: rental offices and public skywalks',
    source: structuredClone(SOURCE), frame: structuredClone(FRAME), context: structuredClone(CONTEXT),
    parcel: { polygon: SOURCE.ring.map(point => sourceToCampus(point)).map(([u, v]) => [u, v]) },
    body: { ...CAMPUS_BODY, headroom: CAMPUS_HEADROOM, source: 'preview/src/workplace-room.js AVATAR_ENVELOPE' },
    towers, bridges, groundBuildings: structuredClone(GROUND_BUILDINGS), paths: structuredClone(PATHS),
    entries: ENTRIES.map(entry => ({ ...entry, position: [...entry.position], threshold: round(entry.laneAltitude - FRAME.baseAltitude) })),
    seams: ENTRIES.map(entry => seamFor(entry)), cameras: structuredClone(CAMERAS), coreDecision: { ...CORE_DECISION },
    obstacles: [],
    policy: {
      public: 'Ground paths, the F1 halls, every core lobby and spur, every spine, terrace passage, terrace and roof garden, and both skywalks are public. Crossing the campus never needs a lease.',
      private: 'Suites are private and branch off public spines by one door each. No suite is ever part of the public route.',
      levels: 'F1 is the ground floor at z 0. F4 finished floor and both skywalk decks are z 13. Floor ids are <tower>-F<level>; suite numbers are <tower>-<level><nn>.',
      support: 'A position resolves against the surface its occupant is on (ground, a floor, a terrace, a roof or a deck), never the highest surface at that point. Level changes only through declared portals.',
      commercialTerms: 'Unset by this contract: pricing, currency, period, operator, payment provider, refunds and cancellation belong to #509.',
    },
  };
}

// Explicit seam: the strip between an entry's boundary edge and its path's end,
// following the boundary's own vertices, so a millimetre gap is real connected
// geometry rather than collision tolerance.
function seamFor(entry) {
  const path = PATHS.find(item => item.id === entry.path).rect, polygon = SOURCE.ring.map(point => sourceToCampus(point));
  const [u0, v0, u1, v1] = path, axis = entry.end === 'west' ? 1 : 0, other = 1 - axis;
  const near = point => entry.end === 'west' ? point[0] < 1 : entry.end === 'south' ? point[1] < 1 : point[1] > 180;
  const boundaryAt = value => {
    for (let i = 0; i < polygon.length - 1; i++) {
      const [a, b] = [polygon[i], polygon[i + 1]];
      if (!near(a) || !near(b) || Math.abs(b[axis] - a[axis]) < 1e-12) continue;
      if (value < Math.min(a[axis], b[axis]) - 1e-12 || value > Math.max(a[axis], b[axis]) + 1e-12) continue;
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      return axis === 0 ? [value, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), value];
    }
    return null;
  };
  const [lo, hi] = axis === 0 ? [u0, u1] : [v0, v1];
  const chain = [boundaryAt(lo), ...polygon.slice(0, -1).filter(p => near(p) && p[axis] > lo + 1e-12 && p[axis] < hi - 1e-12).sort((a, b) => a[axis] - b[axis]), boundaryAt(hi)];
  const end = entry.end === 'west' ? [[u0, v1], [u0, v0]] : entry.end === 'south' ? [[u1, v0], [u0, v0]] : [[u1, v1], [u0, v1]];
  return { id: `${entry.id}-seam`, entry: entry.id, path: entry.path, polygon: chain.includes(null) ? [null] : [...chain, ...end, chain[0]].map(p => [...p]) };
}

export function sourceToCampus([east, north]) {
  const du = east - FRAME.origin[0], dv = north - FRAME.origin[1];
  return [du * FRAME.east[0] + dv * FRAME.east[1], du * FRAME.north[0] + dv * FRAME.north[1]];
}
export function campusToSource([u, v, z = 0]) {
  return [FRAME.origin[0] + u * FRAME.east[0] + v * FRAME.north[0], FRAME.origin[1] + u * FRAME.east[1] + v * FRAME.north[1], FRAME.baseAltitude + z];
}
export function campusToScene(point) {
  const [east, north, altitude] = campusToSource(point);
  return [east, altitude, -north];
}

function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value);for (const item of Object.values(value)) deepFreeze(item); }
  return value;
}
export const GARDEN_CAMPUS_LAYOUT = deepFreeze(buildLayout());

// ---- Geometry helpers -------------------------------------------------------
const EPS = 1e-9;
export const rectContains = ([u0, v0, u1, v1], [u, v]) => u >= u0 - EPS && u <= u1 + EPS && v >= v0 - EPS && v <= v1 + EPS;
const rectInside = (inner, outer) => inner[0] >= outer[0] - EPS && inner[1] >= outer[1] - EPS && inner[2] <= outer[2] + EPS && inner[3] <= outer[3] + EPS;
// Positive-area overlap only: shared edges are adjacency, not overlap.
export const rectsOverlap = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > EPS && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > EPS;
const corners = ([u0, v0, u1, v1]) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
function pointInPolygon([u, v], polygon) {
  // Points on an edge count as inside.
  for (let i = 0; i < polygon.length - 1; i++) {
    const [a, b] = [polygon[i], polygon[i + 1]], cross = (b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0]);
    if (Math.abs(cross) < 1e-9 && u >= Math.min(a[0], b[0]) - EPS && u <= Math.max(a[0], b[0]) + EPS && v >= Math.min(a[1], b[1]) - EPS && v <= Math.max(a[1], b[1]) + EPS) return true;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length - 1; j = i++) {
    const [ui, vi] = polygon[i], [uj, vj] = polygon[j];
    if ((vi > v) !== (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}
const polygonArea = polygon => { let sum = 0;for (let i = 0; i < polygon.length - 1; i++) sum += polygon[i][0] * polygon[i + 1][1] - polygon[i + 1][0] * polygon[i][1];return Math.abs(sum) / 2; };
// Two rects touch along an edge with at least `width` of shared length.
function sharedEdge(a, b) {
  const du = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), dv = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (Math.abs(du) < EPS && dv > EPS) return dv;
  if (Math.abs(dv) < EPS && du > EPS) return du;
  return du > EPS && dv > EPS ? Math.min(du, dv) : 0;
}

// ---- Levels, surfaces and support (#508 consumes this) ----------------------
// Campus levels are keyed by elevation across all three towers (agreed with the
// #508 owner): garden-campus/l0..l7 at z 0, 5, 9, 13, 17, 21, 25, 29. l3 (z 13)
// holds the three F4 galleries, both skywalks and T2's z 13 terrace as one set.
// Upper surfaces never enter the district ground (groundSurfaceHeight): a street
// walker under a skywalk stays on the ground. l0 is published as data; the street
// environment owns ground-level movement.
export const CAMPUS_BUILDING_ID = 'garden-campus';
export const CAMPUS_ELEVATIONS = Object.freeze([0, 5, 9, 13, 17, 21, 25, 29]);
export const campusLevelId = z => {
  const index = CAMPUS_ELEVATIONS.indexOf(z);
  if (index < 0) throw new RangeError(`No campus level at z ${z}`);
  return `${CAMPUS_BUILDING_ID}/l${index}`;
};
const GUARD = 0.1;
// Edges of a rect that face open air: not on the facade above, not shared with another part.
function guardEdges(part, { facade, others = [], gaps = [] }) {
  const [u0, v0, u1, v1] = part, edges = [['south', [u0, v0, u1, v0]], ['north', [u0, v1, u1, v1]], ['west', [u0, v0, u0, v1]], ['east', [u1, v0, u1, v1]]];
  const covered = ([a0, b0, a1, b1], r) => a0 === a1 ? Math.abs(a0 - r[0]) < EPS || Math.abs(a0 - r[2]) < EPS ? [Math.max(b0, r[1]), Math.min(b1, r[3])] : null
    : Math.abs(b0 - r[1]) < EPS || Math.abs(b0 - r[3]) < EPS ? [Math.max(a0, r[0]), Math.min(a1, r[2])] : null;
  const guards = [];
  for (const [side, segment] of edges) {
    const vertical = segment[0] === segment[2], [lo, hi] = vertical ? [segment[1], segment[3]] : [segment[0], segment[2]];
    const cuts = [...[facade, ...others].map(r => r && covered(segment, r)), ...gaps.filter(g => g.side === side).map(g => g.span)]
      .filter(c => c && c[1] - c[0] > EPS).sort((a, b) => a[0] - b[0]);
    let at = lo;
    for (const [c0, c1] of [...cuts, [hi, hi]]) {
      if (c0 - at > EPS) guards.push(vertical ? [segment[0] - GUARD / 2, at, segment[0] + GUARD / 2, c0] : [at, segment[1] - GUARD / 2, c0, segment[1] + GUARD / 2]);
      at = Math.max(at, c1);
    }
  }
  return guards;
}
export function campusLevels(layout = GARDEN_CAMPUS_LAYOUT) {
  const levels = new Map(CAMPUS_ELEVATIONS.map((z, index) => [z, { id: `${CAMPUS_BUILDING_ID}/l${index}`, index, z, surfaces: [], obstacles: [], keepClear: [], portals: [], openings: [] }]));
  const at = z => { const level = levels.get(z);if (!level) throw new RangeError(`No campus level at z ${z}`);return level; };
  const ground = at(0);
  ground.surfaces.push({ id: 'ground', kind: 'ground', polygon: layout.parcel.polygon, access: 'public',
    holes: [...layout.towers.map(tower => tower.tiers[0].rect), ...layout.groundBuildings.filter(item => !item.walkableBelow).map(item => item.rect)] });
  for (const item of layout.groundBuildings.filter(b => b.walkableBelow)) {
    for (const post of item.posts ?? []) ground.obstacles.push({ id: post.id, kind: 'post', rect: [...post.rect] });
    const inset = item.posts?.length ? 0.3 : 0;
    ground.keepClear.push({ id: `${item.id}-below`, rect: [item.rect[0] + inset, item.rect[1] + inset, item.rect[2] - inset, item.rect[3] - inset] });
  }
  for (const tower of layout.towers) {
    for (const [i, floor] of tower.levels.entries()) {
      const level = at(floor.z0), surface = (id, kind, rect, access) => level.surfaces.push({ id, kind, rect: [...rect], access, tower: tower.id, floor: floor.id });
      const lobby = `${floor.id}/lobby`;
      surface(lobby, 'lobby', tower.core.lobby.rect, 'public');level.keepClear.push({ id: lobby, rect: tower.core.lobby.rect });
      level.obstacles.push({ id: `${floor.id}/lift`, kind: 'lift', rect: [...tower.core.lift.rect] }, { id: `${floor.id}/stair`, kind: 'stair', rect: [...tower.core.stair.rect] });
      if (floor.hall) {
        surface(floor.hall.id, 'hall', floor.hall.rect, 'public');
        level.openings.push({ id: `${floor.id}/entrance`, kind: 'entrance', position: [...floor.hall.door.position], width: floor.hall.door.width, from: floor.hall.door.opensTo, to: floor.hall.id });
      } else {
        surface(floor.spine.id, floor.spine.kind, floor.spine.rect, 'public');surface(floor.spur.id, 'spur', floor.spur.rect, 'public');
        level.keepClear.push({ id: floor.spine.id, rect: floor.spine.rect }, { id: floor.spur.id, rect: floor.spur.rect });
        if (floor.passage) { surface(floor.passage.id, 'passage', floor.passage.rect, 'public');level.keepClear.push({ id: floor.passage.id, rect: floor.passage.rect }); }
        for (const suite of floor.suites) {
          surface(suite.id, 'suite', suite.rect, 'private-suite');
          level.openings.push({ id: `${suite.id}/door`, kind: 'suite-door', position: [...suite.door.position], width: suite.door.width, from: suite.door.opensTo, to: suite.id });
        }
        for (const zone of floor.residual) surface(zone.id, 'service', zone.rect, 'service');
      }
      // Level changes: lift and stairs between this floor's lobby and the next, or the roof.
      const next = tower.levels[i + 1], toZ = next ? next.z0 : tower.roof.z, toFloor = next ? next.id : tower.roof.id;
      for (const part of [tower.core.lift, tower.core.stair]) {
        const kind = part.kind, up = { id: `${floor.id}/${kind}-up`, kind, tower: tower.id, position: [...part.portal], toLevel: campusLevelId(toZ), toPortal: `${toFloor}/${kind}-down` };
        level.portals.push(up);
        // Roof access emerges through the headhouse; without one there is no roof portal.
        const arrive = next ? [...part.portal] : tower.roof.headhouse ? [...tower.roof.headhouse.door] : null;
        if (!arrive) { level.portals.pop();continue; }
        at(toZ).portals.push({ id: `${toFloor}/${kind}-down`, kind, tower: tower.id, position: arrive, toLevel: level.id, toPortal: up.id });
      }
    }
    for (const terrace of tower.terraces) {
      const level = at(terrace.z), floor = tower.levels.find(item => item.level === terrace.level);
      const gaps = layout.bridges.filter(bridge => bridge.deckZ === terrace.z).flatMap(bridge => terrace.parts
        .filter(part => rectsOverlap(part, bridge.rect)).map(part => ({ part, side: Math.abs(bridge.rect[1] - part[1]) < EPS || bridge.rect[1] < part[1] ? 'south' : 'north', span: [bridge.rect[0], bridge.rect[2]] })));
      for (const [i, part] of terrace.parts.entries()) {
        level.surfaces.push({ id: `${terrace.id}/${i}`, kind: 'terrace', rect: [...part], access: 'public', tower: tower.id, terrace: terrace.id });
        for (const rect of guardEdges(part, { facade: terrace.inner, others: terrace.parts.filter(other => other !== part), gaps: gaps.filter(g => g.part === part) }))
          level.obstacles.push({ id: `${terrace.id}/${i}/guard-${level.obstacles.length}`, kind: 'guard', rect });
      }
      level.openings.push({ id: `${terrace.id}/door`, kind: 'terrace-door', position: terrace.door.slice(0, 2), width: CAMPUS_DOOR_WIDTH, from: floor.passage.id, to: `${terrace.id}/0` });
    }
    const roof = at(tower.roof.z);
    roof.surfaces.push({ id: tower.roof.id, kind: 'roof', rect: [...tower.roof.rect], access: 'public', tower: tower.id });
    roof.obstacles.push(...(tower.roof.headhouse ? [{ id: tower.roof.headhouse.id, kind: 'headhouse', rect: [...tower.roof.headhouse.rect] }] : []),
      ...tower.roof.planting.beds.map(bed => ({ id: bed.id, kind: 'planter', rect: [...bed.rect] })),
      ...guardEdges(tower.roof.rect, {}).map((rect, i) => ({ id: `${tower.roof.id}/parapet-${i}`, kind: 'guard', rect })));
  }
  const deckLevel = at(PUBLIC_Z);
  for (const bridge of layout.bridges) {
    deckLevel.surfaces.push({ id: bridge.id, kind: 'deck', rect: [...bridge.clear], access: 'public', bridge: bridge.id });
    deckLevel.obstacles.push({ id: `${bridge.id}/edge-west`, kind: 'guard', rect: [bridge.rect[0], bridge.rect[1], bridge.clear[0], bridge.rect[3]] },
      { id: `${bridge.id}/edge-east`, kind: 'guard', rect: [bridge.clear[2], bridge.rect[1], bridge.rect[2], bridge.rect[3]] });
    deckLevel.keepClear.push({ id: bridge.id, rect: [...bridge.clear] }, ...bridge.landings.map(landing => ({ id: landing.id, rect: [...landing.rect] })));
    for (const [i, portal] of bridge.portals.entries())
      deckLevel.openings.push({ id: portal.id, kind: 'skywalk-portal', position: portal.position.slice(0, 2), width: portal.width, clearHeight: portal.clearHeight, from: bridge.landings[i].id, to: bridge.id });
  }
  // Reachability as data: the portals and doors that land on each roof and terrace.
  for (const level of levels.values()) for (const surface of level.surfaces.filter(item => item.kind === 'roof' || item.kind === 'terrace')) {
    surface.reachedBy = [...level.portals.filter(portal => surfaceCovers(surface, portal.position) && !insideObstacle(level, portal.position)).map(portal => portal.id),
      ...level.openings.filter(opening => opening.to === surface.id).map(opening => opening.id)];
  }
  return [...levels.values()];
}
const surfaceCovers = (surface, point) => {
  if (surface.holes?.some(hole => rectContains(hole, point) && !onRectEdge(hole, point))) return false;
  return surface.polygon ? pointInPolygon(point, surface.polygon) : rectContains(surface.rect, point);
};
const onRectEdge = ([u0, v0, u1, v1], [u, v]) => Math.abs(u - u0) < EPS || Math.abs(u - u1) < EPS || Math.abs(v - v0) < EPS || Math.abs(v - v1) < EPS;
const insideObstacle = (level, point) => level.obstacles.some(item => rectContains(item.rect, point) && !onRectEdge(item.rect, point));
const span = surface => surface.rect ? (surface.rect[2] - surface.rect[0]) * (surface.rect[3] - surface.rect[1]) : Infinity;
// The support on one level: the most specific surface covering (u, v), or null
// (inside a shaft, guard or planter, or off the level). There is deliberately no
// lookup that returns the highest surface at a point.
export function campusSupportAt(levelId, u, v, layout = GARDEN_CAMPUS_LAYOUT) {
  const level = campusLevels(layout).find(item => item.id === levelId);
  if (!level || !Number.isFinite(u) || !Number.isFinite(v) || insideObstacle(level, [u, v])) return null;
  const surface = level.surfaces.filter(item => surfaceCovers(item, [u, v])).sort((a, b) => span(a) - span(b) || a.id.localeCompare(b.id))[0];
  return surface ? { surfaceId: surface.id, kind: surface.kind, z: level.z, access: surface.access, levelId } : null;
}
// Every level that has a surface at (u, v): what is stacked here, lowest first.
export function campusSurfacesAt(u, v, layout = GARDEN_CAMPUS_LAYOUT) {
  return campusLevels(layout).map(level => campusSupportAt(level.id, u, v, layout)).filter(Boolean);
}

// ---- Connection graph -------------------------------------------------------
// Nodes are circulation zones and destinations; edges are walks across shared
// edges at one z, or declared portals between levels. publicOnly ignores private nodes.
export function campusGraph(layout = GARDEN_CAMPUS_LAYOUT) {
  const nodes = new Map(), edges = [];
  const node = (id, data) => nodes.set(id, { id, ...data });
  const edge = (a, b, kind, width = null) => edges.push({ a, b, kind, width });
  for (const path of layout.paths) node(path.id, { kind: 'path', z: 0, rect: path.rect, access: 'public' });
  for (const seam of layout.seams) { node(seam.id, { kind: 'seam', z: 0, access: 'public' });node(seam.entry, { kind: 'entry', z: 0, access: 'public' });edge(seam.entry, seam.id, 'walk');edge(seam.id, seam.path, 'walk'); }
  for (const [i, a] of layout.paths.entries()) for (const b of layout.paths.slice(i + 1)) { const w = sharedEdge(a.rect, b.rect);if (w > EPS) edge(a.id, b.id, 'walk', w); }
  for (const item of layout.groundBuildings) if (item.approach) { node(item.id, { kind: item.kind, z: 0, rect: item.rect, access: 'public' });edge(item.approach, item.id, item.door ? 'door' : 'walk'); }
  const obstacleIn = rect => layout.obstacles.some(obstacle => rectsOverlap(obstacle.rect, rect));
  for (const tower of layout.towers) {
    for (const level of tower.levels) {
      const lobby = `${level.id}/lobby`;node(lobby, { kind: 'lobby', z: level.z0, rect: tower.core.lobby.rect, access: 'public', blocked: obstacleIn(tower.core.lobby.rect) });
      if (level.hall) { node(level.hall.id, { kind: 'hall', z: 0, rect: level.hall.rect, access: 'public' });edge(level.hall.door.opensTo, level.hall.id, 'door', CAMPUS_DOOR_WIDTH);edge(level.hall.id, lobby, 'walk'); }
      if (level.spine) {
        node(level.spine.id, { kind: level.spine.kind, z: level.z0, rect: level.spine.rect, access: 'public', blocked: obstacleIn(level.spine.rect) });
        node(level.spur.id, { kind: 'spur', z: level.z0, rect: level.spur.rect, access: 'public', blocked: obstacleIn(level.spur.rect) });
        edge(lobby, level.spur.id, 'walk', sharedEdge(tower.core.lobby.rect, level.spur.rect));
        edge(level.spur.id, level.spine.id, 'walk', sharedEdge(level.spur.rect, level.spine.rect));
      }
      if (level.passage) { node(level.passage.id, { kind: 'passage', z: level.z0, rect: level.passage.rect, access: 'public', blocked: obstacleIn(level.passage.rect) });edge(level.spine.id, level.passage.id, 'walk', sharedEdge(level.spine.rect, level.passage.rect));edge(level.passage.id, level.passage.to, 'door', CAMPUS_DOOR_WIDTH); }
      for (const suite of level.suites) { node(suite.id, { kind: 'suite', z: level.z0, rect: suite.rect, access: 'private-suite' });edge(suite.door.opensTo, suite.id, 'door', suite.door.width); }
    }
    for (let i = 1; i < tower.levels.length; i++) for (const kind of ['lift', 'stairs']) edge(`${tower.levels[i - 1].id}/lobby`, `${tower.levels[i].id}/lobby`, kind);
    node(tower.roof.id, { kind: 'roof', z: tower.roof.z, rect: tower.roof.rect, access: 'public' });
    for (const kind of ['lift', 'stairs']) edge(`${tower.levels.at(-1).id}/lobby`, tower.roof.id, kind);
    for (const terrace of tower.terraces) node(terrace.id, { kind: 'terrace', z: terrace.z, access: 'public' });
  }
  for (const bridge of layout.bridges) {
    node(bridge.id, { kind: 'deck', z: bridge.deckZ, rect: bridge.clear, access: 'public', blocked: obstacleIn(bridge.clear) });
    for (const [i, portal] of bridge.portals.entries()) {
      const landing = bridge.landings[i], gallery = `${portal.tower}-F${PUBLIC_LEVEL}-public`;
      node(landing.id, { kind: 'landing', z: landing.z, rect: landing.rect, access: 'public', blocked: obstacleIn(landing.rect) });
      node(portal.id, { kind: 'portal', z: portal.position[2], access: 'public' });
      edge(gallery, landing.id, 'walk', sharedEdge(nodes.get(gallery).rect, landing.rect) || (rectInside(landing.rect, nodes.get(gallery).rect) ? landing.rect[2] - landing.rect[0] : 0));
      edge(landing.id, portal.id, 'walk', portal.width);edge(portal.id, bridge.id, 'walk', portal.width);
    }
  }
  // B12 lands on T2's z 13 terrace before the facade: a same-level junction.
  for (const bridge of layout.bridges) for (const tower of layout.towers) for (const terrace of tower.terraces)
    if (terrace.z === bridge.deckZ && terrace.parts.some(part => rectsOverlap(part, bridge.rect))) edge(bridge.id, terrace.id, 'walk', bridge.clearWidth);
  return { nodes, edges };
}
export function campusRoute(from, to, { publicOnly = true, layout = GARDEN_CAMPUS_LAYOUT, walkOnly = false } = {}) {
  const { nodes, edges } = campusGraph(layout), usable = id => nodes.has(id) && !nodes.get(id).blocked && (!publicOnly || nodes.get(id).access === 'public');
  if (!usable(from) || !usable(to)) return null;
  const adjacency = new Map();
  for (const e of edges) {
    if (walkOnly && !['walk', 'door'].includes(e.kind)) continue;
    if (e.width !== null && e.width < 3 - EPS && ['portal', 'deck', 'landing'].some(kind => [nodes.get(e.a)?.kind, nodes.get(e.b)?.kind].includes(kind))) continue;
    for (const [a, b] of [[e.a, e.b], [e.b, e.a]]) { if (!adjacency.has(a)) adjacency.set(a, []);adjacency.get(a).push(b); }
  }
  const previous = new Map([[from, null]]), queue = [from];
  while (queue.length) {
    const id = queue.shift();if (id === to) break;
    for (const next of adjacency.get(id) ?? []) if (!previous.has(next) && usable(next)) { previous.set(next, id);queue.push(next); }
  }
  if (!previous.has(to)) return null;
  const route = [];for (let id = to; id !== null; id = previous.get(id)) route.unshift(id);
  return route;
}

// ---- Compatibility ----------------------------------------------------------
const major = value => Number(String(value).split('.')[0]);
export function checkCampusCompatibility(required, layout = GARDEN_CAMPUS_LAYOUT) {
  if (required?.id !== layout.id) return { ok: false, reason: `layout id ${required?.id} is not ${layout.id}` };
  for (const key of ['schema', 'floors', 'support', 'units', 'layout'])
    if (required[key] !== undefined && major(required[key]) !== major(layout.versions[key])) return { ok: false, reason: `incompatible ${key} version ${required[key]} (contract ${layout.versions[key]})` };
  return { ok: true };
}

// ---- Validator --------------------------------------------------------------
// Returns every finding; an accepted contract has none. district is optional:
// with it, provenance and mapped lanes are checked against the actual file.
export function validateGardenCampus(layout = GARDEN_CAMPUS_LAYOUT, { district = null, required = null } = {}) {
  const findings = [], fail = (rule, id, message) => findings.push({ rule, id, message });
  const polygon = layout.parcel.polygon, body = layout.body, clearance = body.height + body.headroom;
  if (required) { const check = checkCampusCompatibility(required, layout);if (!check.ok) fail('version', layout.id, check.reason); }
  // Provenance: the parcel is the garage ring, transformed.
  if (district) {
    const garage = district.buildings?.find(item => item.id === layout.source.buildingId);
    if (!garage) fail('provenance', layout.source.buildingId, 'garage not in the district');
    else {
      if (JSON.stringify(garage.ring) !== JSON.stringify(layout.source.ring)) fail('provenance', garage.id, 'district ring differs from the pinned source ring');
      if (Math.abs(garage.center?.[2] - layout.frame.baseAltitude) > 1e-9) fail('datum', garage.id, 'base altitude differs from the garage base');
    }
    for (const entry of layout.entries) if (!district.roads?.some(road => road.id === entry.lane)) fail('entry', entry.id, `lane ${entry.lane} not in the district`);
  }
  const derived = layout.source.ring.map(point => sourceToCampus(point));
  if (derived.some((p, i) => Math.hypot(p[0] - polygon[i][0], p[1] - polygon[i][1]) > 1e-9)) fail('provenance', 'parcel', 'parcel polygon is not the transformed source ring');
  if (Math.abs(polygonArea(polygon) - 6838.982905168) > 1e-4) fail('provenance', 'parcel', `parcel area ${polygonArea(polygon)} is not 6838.982905 m2`);
  const inParcel = (id, r) => { for (const c of corners(r)) if (!pointInPolygon(c, polygon)) { fail('offsite', id, `corner ${c.map(x => round(x)).join(', ')} lies outside the parcel`);return; } };
  // Footprints: ground program and towers inside the parcel, disjoint from each other.
  const footprints = [...layout.towers.map(t => ({ id: t.id, rect: t.tiers[0].rect })), ...layout.groundBuildings.map(b => ({ id: b.id, rect: b.rect }))];
  for (const item of [...footprints, ...layout.paths, ...layout.bridges]) inParcel(item.id, item.rect);
  for (const [i, a] of footprints.entries()) for (const b of footprints.slice(i + 1)) if (rectsOverlap(a.rect, b.rect)) fail('overlap', `${a.id}/${b.id}`, 'footprints overlap');
  for (const path of layout.paths) for (const item of footprints) if (rectsOverlap(path.rect, item.rect) && !(layout.groundBuildings.find(b => b.id === item.id)?.walkableBelow)) fail('overlap', `${path.id}/${item.id}`, 'path runs through a footprint');
  // Ground posts stay inside their structure, out of paths and out of keep-clear zones.
  const groundLevel = campusLevels(layout)[0];
  for (const obstacle of groundLevel.obstacles.filter(item => item.kind === 'post')) {
    const owner = layout.groundBuildings.find(item => item.posts?.some(post => post.id === obstacle.id));
    if (!owner || !rectInside(obstacle.rect, owner.rect)) fail('support', obstacle.id, 'post lies outside its structure');
    for (const path of layout.paths) if (rectsOverlap(obstacle.rect, path.rect)) fail('blocked', `${obstacle.id}/${path.id}`, 'post stands in a path');
    for (const zone of groundLevel.keepClear) if (rectsOverlap(obstacle.rect, zone.rect)) fail('blocked', `${obstacle.id}/${zone.id}`, 'post stands in a keep-clear zone');
    if (owner?.approach) { const approach = layout.paths.find(item => item.id === owner.approach).rect;
      if (obstacle.rect[2] >= owner.rect[2] - EPS && obstacle.rect[3] > approach[1] + EPS && obstacle.rect[1] < approach[3] - EPS) fail('blocked', `${obstacle.id}/${owner.approach}`, 'post narrows the approach opening'); }
  }
  // Towers: 6/7/6, shared datum, nested tiers, roofs, silhouette.
  const expected = { T1: [2, 2, 2], T2: [3, 2, 2], T3: [2, 2, 2] };
  for (const tower of layout.towers) {
    if (JSON.stringify(tower.tierLevelCounts) !== JSON.stringify(expected[tower.id])) fail('tiers', tower.id, `tiers ${tower.tierLevelCounts} are not ${expected[tower.id]}`);
    const starts = tower.levels.map(level => level.z0), wanted = [0, 5, 9, 13, 17, 21, 25].slice(0, tower.levels.length);
    if (JSON.stringify(starts) !== JSON.stringify(wanted)) fail('elevation', tower.id, `floor starts ${starts} are not ${wanted}`);
    for (const [i, level] of tower.levels.entries()) {
      if (level.z1 - level.z0 !== (level.level === 1 ? GROUND_FLOOR_HEIGHT : UPPER_FLOOR_HEIGHT)) fail('elevation', level.id, 'storey height');
      if (i > 0 && !rectInside(level.rect, tower.levels[i - 1].rect)) fail('support', level.id, 'plate overhangs the floor below');
      if (!rectInside(tower.core.rect, level.rect)) fail('support', level.id, 'core is not inside the plate');
    }
    const roofWanted = { T1: 25, T2: 29, T3: 25 }[tower.id];
    if (tower.roof.z !== roofWanted) fail('elevation', tower.roof.id, `roof deck ${tower.roof.z} is not ${roofWanted}`);
    if (!tower.roof.headhouse) fail('reach', tower.roof.id, 'roof has no access headhouse');
    else if (!rectInside(tower.roof.headhouse.rect, tower.roof.rect)) fail('support', tower.roof.headhouse.id, 'roof access lies beyond the roof deck');
    for (const bed of tower.roof.planting.beds) if (!rectInside(bed.rect, tower.roof.rect)) fail('support', bed.id, 'planting lies beyond the roof deck');
    const top = Math.max(tower.silhouette.parapetTop, tower.silhouette.headhouseTop, tower.silhouette.plantingTop);
    if (top > tower.silhouette.capZ + EPS) fail('silhouette', tower.id, `silhouette ${top} exceeds the cap ${tower.silhouette.capZ}`);
    if (layout.frame.baseAltitude + tower.silhouette.capZ >= layout.context.office.nominalRoofAltitude) fail('silhouette', tower.id, 'cap reaches the existing office roof');
    for (const terrace of tower.terraces) {
      const upper = tower.levels.find(level => level.level === terrace.level);
      if (terrace.z !== upper.z0) fail('elevation', terrace.id, 'terrace is not at its floor');
      for (const part of terrace.parts) if (!rectInside(part, terrace.outer) || rectsOverlap(part, terrace.inner)) fail('support', terrace.id, 'terrace part is not on the roof of the tier below');
      if (!rectContains([terrace.inner[2], terrace.inner[1], terrace.inner[2], terrace.inner[3]], terrace.door)) fail('support', terrace.id, 'terrace door is not on the upper facade');
    }
  }
  // Bridges: facade-to-facade spans, deck at F4, real openings, landings, clearance below.
  for (const bridge of layout.bridges) {
    const ends = [bridge.from, bridge.to].map(end => ({ end, level: layout.towers.find(t => t.id === end.tower)?.levels.find(l => l.level === end.level) }));
    for (const { end, level } of ends) {
      if (!level) { fail('endpoint', bridge.id, `no ${end.tower} F${end.level}`);continue; }
      const facade = end.side === 'north' ? level.rect[3] : level.rect[1];
      if (Math.abs(end.v - facade) > EPS) fail('endpoint', bridge.id, `${end.tower} end at v ${end.v} is not on its F${end.level} ${end.side} facade (v ${facade})`);
      if (bridge.deckZ !== level.z0) fail('elevation', bridge.id, `deck z ${bridge.deckZ} is not ${end.tower} F${end.level} at z ${level.z0}`);
      if (bridge.clear[0] < level.rect[0] || bridge.clear[2] > level.rect[2]) fail('endpoint', bridge.id, `clear route leaves ${end.tower}'s facade`);
    }
    if (Math.abs(bridge.to.v - bridge.from.v - bridge.span) > EPS) fail('span', bridge.id, `facade span ${round(bridge.to.v - bridge.from.v)} is not ${bridge.span}`);
    if (Math.abs(bridge.rect[1] - bridge.from.v) > EPS || Math.abs(bridge.rect[3] - bridge.to.v) > EPS) fail('endpoint', bridge.id, 'deck does not reach both facades');
    if (Math.abs(bridge.clearWidth - 3) > EPS || Math.abs(bridge.grossWidth - 4) > EPS) fail('clear', bridge.id, 'bridge must be 4 m overall with a 3 m clear route');
    for (const portal of bridge.portals) {
      if (portal.opening[0] !== bridge.clear[0] || portal.opening[1] !== bridge.clear[2]) fail('portal', portal.id, 'facade opening does not match the clear route');
      if (portal.position[2] !== bridge.deckZ) fail('elevation', portal.id, 'portal is not at deck level');
      if (portal.clearHeight < clearance - EPS) fail('clearance', portal.id, 'portal headroom');
      const end = portal.id.endsWith('from') ? bridge.from : bridge.to;
      if (Math.abs(portal.position[1] - end.v) > EPS) fail('endpoint', portal.id, 'portal is not at the bridge end');
    }
    for (const landing of bridge.landings) {
      const gallery = layout.towers.find(t => t.id === landing.tower).levels.find(l => l.level === PUBLIC_LEVEL).spine;
      if (!rectInside(landing.rect, gallery.rect)) fail('landing', landing.id, 'landing is not inside the public gallery');
      if (Math.abs(landing.rect[3] - landing.rect[1] - BRIDGE_DECK.landingDepth) > EPS) fail('landing', landing.id, 'landing is not 3 m deep');
    }
    // Clearance below: every lower surface the deck crosses keeps standing headroom.
    for (const level of campusLevels(layout)) for (const surface of level.surfaces) {
      if (level.z >= bridge.deckZ - EPS) continue;
      const crossed = surface.polygon ? true : rectsOverlap(surface.rect, bridge.rect);
      if (crossed && bridge.underside - level.z < clearance - EPS) fail('clearance', `${bridge.id}/${surface.id}`, `only ${round(bridge.underside - level.z)} m below the deck`);
    }
  }
  // Public galleries, spurs, landings and passages keep 3 m (1.8 m passages) clear; nothing sits in them.
  const clearZones = [];
  for (const tower of layout.towers) {
    clearZones.push({ id: tower.core.lobby.id, rect: tower.core.lobby.rect });
    for (const level of tower.levels) {
      if (level.spine) {
        clearZones.push({ id: level.spine.id, rect: level.spine.rect }, { id: level.spur.id, rect: level.spur.rect });
        if (level.spine.rect[2] - level.spine.rect[0] < 3 - EPS) fail('clear', level.spine.id, 'spine is narrower than 3 m');
        if (level.spur.rect[3] - level.spur.rect[1] < 3 - EPS) fail('clear', level.spur.id, 'core spur is narrower than 3 m');
        if (sharedEdge(level.spur.rect, level.spine.rect) < 3 - EPS || sharedEdge(level.spur.rect, tower.core.lobby.rect) < 3 - EPS) fail('connection', level.spur.id, 'core spur does not join the lobby and the spine across its width');
      }
      if (level.passage) clearZones.push({ id: level.passage.id, rect: level.passage.rect });
      for (const suite of level.suites) for (const zone of [level.spine, level.spur, level.passage, tower.core.lobby, { id: 'core', rect: tower.core.rect }].filter(Boolean))
        if (rectsOverlap(suite.rect, zone.rect)) fail('overlap', `${suite.id}/${zone.id}`, 'suite takes public circulation or core');
    }
  }
  for (const bridge of layout.bridges) clearZones.push({ id: bridge.id, rect: bridge.clear }, ...bridge.landings.map(l => ({ id: l.id, rect: l.rect })));
  for (const obstacle of layout.obstacles) for (const zone of clearZones) if (rectsOverlap(obstacle.rect, zone.rect)) fail('blocked', `${obstacle.id}/${zone.id}`, `${obstacle.kind ?? 'object'} sits in a clear public route`);
  // The retained IPIC wall: nothing opens onto it.
  const wall = layout.context.ipic.wall, onWall = ([u, v]) => u < 0.01 && v >= wall.from[1] - EPS && v <= wall.to[1] + EPS;
  for (const item of [...layout.paths, ...layout.groundBuildings]) if (corners(item.rect).some(onWall)) fail('ipic', item.id, 'touches the retained IPIC wall');
  for (const entry of layout.entries) if (onWall(entry.position)) fail('ipic', entry.id, 'entry on the retained IPIC wall');
  // Entries: on the parcel boundary, joined to their path by an explicit seam.
  for (const entry of layout.entries) {
    if (!polygon.some(p => Math.hypot(p[0] - entry.position[0], p[1] - entry.position[1]) < 1e-9)) fail('entry', entry.id, 'entry is not a parcel vertex');
    const seam = layout.seams.find(item => item.entry === entry.id), path = layout.paths.find(item => item.id === entry.path);
    if (!seam || seam.polygon.some(point => !point)) { fail('seam', entry.id, 'no connected seam to its path');continue; }
    if (!pointInPolygon(entry.position, seam.polygon)) fail('seam', entry.id, 'seam does not reach the entry');
    if (!seam.polygon.every(point => pointInPolygon(point, polygon))) fail('seam', entry.id, 'seam leaves the parcel');
    const touches = seam.polygon.filter(point => rectContains(path.rect, point) && onRectEdge(path.rect, point)).length >= 2;
    if (!touches) fail('seam', entry.id, 'seam does not share an edge with its path');
    if (Math.abs(entry.threshold) > 0.1) fail('threshold', entry.id, `threshold ${entry.threshold} m needs a ramp`);
  }
  // Every advertised public roof and terrace is reached by a portal or a door; a
  // terrace's parts join each other across a passable edge.
  for (const level of campusLevels(layout)) {
    for (const surface of level.surfaces.filter(item => item.kind === 'roof')) if (!surface.reachedBy.length) fail('reach', surface.id, 'public roof has no lift, stair or door reaching it');
    const terraces = new Map();
    for (const surface of level.surfaces.filter(item => item.kind === 'terrace')) terraces.set(surface.terrace, [...(terraces.get(surface.terrace) ?? []), surface]);
    for (const [id, parts] of terraces) {
      if (!parts.some(part => part.reachedBy.length)) fail('reach', id, 'public terrace has no door reaching it');
      for (const part of parts) if (parts.length > 1 && !parts.some(other => other !== part && sharedEdge(other.rect, part.rect) >= CAMPUS_PASSAGE_WIDTH - EPS)) fail('reach', part.id, 'terrace part is cut off from the rest of its terrace');
    }
  }
  // Public route: the three F4 galleries join through both bridges, landings and
  // spurs without any private suite; every public destination is reachable from the street.
  const galleries = layout.towers.map(t => `${t.id}-F${PUBLIC_LEVEL}-public`);
  for (const [a, b] of [[galleries[0], galleries[1]], [galleries[1], galleries[2]]]) {
    const route = campusRoute(a, b, { layout, walkOnly: true });
    if (!route) fail('route', `${a}->${b}`, 'no public walking route at Floor 4');
    else if (!layout.bridges.some(bridge => route.includes(bridge.id))) fail('route', `${a}->${b}`, 'route does not use a skywalk');
  }
  const { nodes } = campusGraph(layout);
  for (const [id, node] of nodes) if (node.access === 'public' && !['entry', 'seam', 'portal'].includes(node.kind) && !campusRoute('E1', id, { layout })) fail('route', id, 'public destination unreachable from the street');
  // Suites: real net geometry, a door on public circulation, a seated desk with clearance.
  for (const tower of layout.towers) for (const level of tower.levels) {
    for (const suite of level.suites) {
      const [u0, v0, u1, v1] = suite.rect, inset = suite.desk.clearance;
      if (u1 - u0 < CAMPUS_SUITE_MIN_SIDE - EPS || v1 - v0 < CAMPUS_SUITE_MIN_SIDE - EPS) fail('unit', suite.id, 'below the suite minimum');
      if (!rectContains([u0 + inset, v0 + inset, u1 - inset, v1 - inset], suite.desk.anchor)) fail('unit', suite.id, 'desk anchor lacks seated clearance');
      if (!rectContains(suite.rect, suite.door.inside)) fail('unit', suite.id, 'door does not open into the suite');
      const opens = [level.spine, level.passage].find(zone => zone?.id === suite.door.opensTo);
      if (!opens || sharedEdge(opens.rect, suite.rect) < suite.door.width - EPS) fail('unit', suite.id, 'door does not open onto public circulation');
      if (!rectInside(suite.rect, level.rect)) fail('unit', suite.id, 'suite leaves the floor plate');
    }
    for (const [i, a] of level.suites.entries()) for (const b of level.suites.slice(i + 1)) if (rectsOverlap(a.rect, b.rect)) fail('overlap', `${a.id}/${b.id}`, 'suites overlap');
    if (level.level !== 1) {
      const parts = [...level.suites.map(s => s.rect), ...level.residual.map(r => r.rect), level.spine.rect, level.spur.rect, tower.core.rect, ...(level.passage ? [level.passage.rect] : [])];
      const total = parts.reduce((sum, r) => sum + area(r), 0) - (level.passage ? level.residual.filter(r => rectsOverlap(r.rect, level.passage.rect)).reduce((s, r) => s + area(intersect(r.rect, level.passage.rect)), 0) : 0);
      if (Math.abs(total - area(level.rect)) > 1e-6) fail('unit', level.id, `suites, circulation, core and residual cover ${round(total)} m2, plate ${area(level.rect)} m2`);
    }
  }
  return { ok: findings.length === 0, findings };
}
const intersect = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];

// Inventory summary for #509: per tower and floor, suite ids, numbers and net areas.
export function campusUnitInventory(layout = GARDEN_CAMPUS_LAYOUT) {
  return layout.towers.flatMap(tower => tower.levels.flatMap(level => level.suites.map(suite => ({
    id: suite.id, number: suite.number, tower: tower.id, level: level.level, z: level.z0, netArea: suite.netArea, door: suite.door.position, desk: suite.desk.anchor, terms: 'unset (#509)' }))));
}
