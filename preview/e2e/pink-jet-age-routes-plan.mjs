// Pink Jet-Age R9 (#747, #738): the fixed cameras, pinned hours and report shape for the
// matched visual baseline of two routes. pink-jet-age-routes.mjs renders them; the pure parts
// live here so tests/pink-jet-age-routes.test.js can hold them without a browser.
//   Route A, Gardens: arrival -> T2 facade -> entrance hall -> lift lobby -> Floor 4 skywalk
//     and gallery -> a seated terrace stop and the social pergola. Campus metres [u, v, z].
//   Route B, Commons: market-street gateway -> garden court -> seated court cafe -> green ->
//     Bayou Lantern water tower -> seated green bench and the pavilion chess table. Derived
//     from the placed destination (shared/commons-destination.js) by piece id, in source
//     metres [east, north, altitude], so the cameras follow the layout rather than a copy.
import { campusToScene } from '../../shared/garden-campus-layout.js';

// day and dusk match garden-campus-render-common.mjs HOURS. The client's #sun-hour slider stops
// at 19:00 (preview/index.html), where atmosphereFor's twilight is already 1; it has no later
// night, so "night" is pinned to 19 and the report says so.
export const ROUTE_HOURS = Object.freeze({ day: 15, dusk: 18.5, night: 19 });
export const CLIENT_LATEST_HOUR = 19;
export const GRAPHICS = Object.freeze(['sharp', 'smooth']);
// Finishes the live world can draw. R1 (#749) added `finish` to buildCityKit, but neither the
// Commons (east-garden-commons.js) nor the campus passes one yet, so only the classic look is
// reachable in the browser.
// TODO(#747 follow-up): when the live world accepts a finish (URL or localStorage), add it here
// and apply it in pink-jet-age-routes.mjs openRoutes() before the first capture.
export const LIVE_FINISHES = Object.freeze(['classic']);
export const EYE = 1.68, SEATED_EYE = 1.2;

const gardens = (id, stop, subject, position, target, fov, levelId = null) =>
  ({ id: `a${id}`, route: 'gardens', stop, subject, frame: 'campus', levelId, source: { position, target }, fov });

/** Route A in walking order. levelId names the campus level an eye-height camera stands on. */
export function gardensCameras() {
  const l0 = 'garden-campus/l0', l3 = 'garden-campus/l3';
  return [
    gardens('01-arrival-e1', 'arrival', 'South arrival at E1, north along the P1 promenade to the three towers', [33.5, -8, EYE], [30, 60, 8], 62),
    gardens('02-t2-facade-approach', 'facade', 'From P1 at the P4 approach, the Commons (T2) east facade and entrance', [33, 93, EYE], [24, 104, 7], 66, l0),
    gardens('03-t2-entrance-hall', 'entrance', 'Inside the T2 ground hall from its door, west to the core lobby', [23.4, 103, EYE], [11, 102.5, 1.8], 72, l0),
    gardens('04-t2-lift-lobby', 'lift', 'From the T2 hall, west across the core lobby to the lift (the car itself is not modelled)', [16.5, 101.8, EYE], [11, 101.3, 1.5], 70, l0),
    gardens('05-f4-b12-skywalk', 'skywalk', 'Floor 4 on the B12 skywalk, north into The Commons', [16, 71.5, 13 + EYE], [16, 93, 13 + 1.6], 70, l3),
    gardens('06-f4-t2-gallery', 'skywalk', 'Floor 4 T2 public gallery, north to the B23 skywalk', [16, 94.5, 13 + EYE], [16, 120, 13 + 1.5], 70, l3),
    // The Floor 4 terrace benches face the tower glazing, so the seated stop is the T2 roof
    // garden bench (seat-east-a), looking west across the roof beds and table.
    gardens('07-t2-roof-seat', 'seated', 'Seated on the T2 roof garden bench, west across the beds and the table', [18.1, 106, 29 + SEATED_EYE], [8, 108, 29.6], 70, 'garden-campus/l7'),
    gardens('08-social-pergola', 'social', 'Under the social pergola from the P7 approach, west across the terrace', [23, 161, EYE], [6, 163, 1.6], 72, l0),
  ];
}

const pieceAt = (plan, id) => {
  const piece = plan.pieces.find(item => item.id === `${plan.id}/${id}` || item.id.endsWith(`/${id}`));
  if (!piece) throw new Error(`Commons piece ${id} is missing from ${plan.id}`);
  return piece.at ?? [(piece.rect[0] + piece.rect[2]) / 2, (piece.rect[1] + piece.rect[3]) / 2];
};
const commons = (id, stop, subject, position, target, fov) => ({ id: `b${id}`, route: 'commons', stop, subject, frame: 'source', source: { position, target }, fov });

/** Route B in walking order, from world.eastGardenCommons (the composed Commons layout). */
export function commonsCameras(layout) {
  const plan = layout?.destination;
  if (!plan) throw new Error('Commons cameras need the composed destination (layout.destination)');
  const g = layout.ground, edge = layout.edge, centre = -1335;
  const [courtU, courtV] = pieceAt(plan, 'garden-court/court'), [cafeU, cafeV] = pieceAt(plan, 'court-cafe-1'), [lanternU, lanternV] = pieceAt(plan, 'lantern-court');
  const [towerU, towerV] = pieceAt(plan, 'bayou-lantern-tower'), [benchU, benchV] = pieceAt(plan, 'green-bench-n-0');
  const [t0, s0, t1, s1] = layout.activity.rect, tableU = (t0 + t1) / 2, tableV = (s0 + s1) / 2;
  return [
    commons('01-gateway', 'arrival', 'District gateway, east along the market street', [edge + 2, centre + 1, g + EYE], [edge + 40, centre, g + 3], 66),
    commons('02-garden-court', 'court', 'From the market street, south into the garden court and its loggias', [courtU, courtV + 17, g + EYE], [courtU, courtV - 6, g + 3], 66),
    commons('03-court-cafe-seat', 'seated', 'Seated at the court cafe, west across the court to its lantern', [cafeU + 1.1, cafeV + 0.4, g + SEATED_EYE], [lanternU - 4, lanternV + 1, g + 1.6], 70),
    commons('04-green-to-tower', 'tower', 'Across the bayou green, east to the Bayou Lantern water tower', [towerU - 40, towerV - 3, g + EYE], [towerU, towerV, g + 12], 60),
    commons('05-tower-base', 'tower', 'Below the Bayou Lantern, up the water tower from the green', [towerU - 12, towerV - 10, g + EYE], [towerU, towerV, g + 16], 70),
    commons('06-green-bench-seat', 'seated', 'Seated on the north green bench, south across the lawn', [benchU, benchV - 0.3, g + SEATED_EYE], [benchU + 4, benchV - 22, g + 1], 68),
    commons('07-pavilion-chess', 'social', 'The pavilion chess table under its canopy, from the green', [tableU - 9, tableV - 4, g + EYE], [tableU, tableV, g + 1], 62),
  ];
}

const sourceToScene = ([east, north, altitude]) => [east, altitude, -north];
/** The Three.js pose __riverRenderAudit.view takes. */
export function scenePose(camera) {
  const map = camera.frame === 'campus' ? campusToScene : sourceToScene;
  return { position: map(camera.source.position), target: map(camera.source.target), fov: camera.fov };
}

const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
/** Throws on a malformed table: ids, routes, frames, finite poses, a real look direction. */
export function validateCameras(cameras) {
  const ids = new Set();
  for (const camera of cameras) {
    const where = camera?.id ?? JSON.stringify(camera);
    if (!/^[ab]\d\d-[a-z0-9-]+$/.test(camera?.id ?? '')) throw new Error(`${where}: id must be a<nn>-name or b<nn>-name`);
    if (ids.has(camera.id)) throw new Error(`${where}: duplicate id`);
    ids.add(camera.id);
    if (!['gardens', 'commons'].includes(camera.route) || camera.id[0] !== (camera.route === 'gardens' ? 'a' : 'b')) throw new Error(`${where}: route and id prefix disagree`);
    if (!['campus', 'source'].includes(camera.frame)) throw new Error(`${where}: unknown frame`);
    if (!vector(camera.source?.position) || !vector(camera.source?.target)) throw new Error(`${where}: position and target must be finite [x, y, z]`);
    if (Math.hypot(...camera.source.position.map((value, i) => value - camera.source.target[i])) < 3) throw new Error(`${where}: target closer than 3 m`);
    if (!(camera.fov >= 30 && camera.fov <= 100)) throw new Error(`${where}: fov out of 30-100`);
    if (!camera.subject || !camera.stop) throw new Error(`${where}: subject and stop are required`);
  }
  return cameras;
}

/** --graphics=sharp|smooth, --hours=day,dusk,night, --cameras=id,id, --finish=classic, --out=dir. */
export function routeOptions(args, now = new Date()) {
  const options = { graphics: 'sharp', hours: Object.keys(ROUTE_HOURS), cameras: null, finish: 'classic', out: null }, seen = new Set();
  for (const arg of args) {
    const [, key, value] = /^--(graphics|hours|cameras|finish|out)=(.+)$/.exec(arg) ?? [];
    if (!key || seen.has(key)) throw new Error(`Invalid or duplicate option: ${arg}`);
    seen.add(key);
    if (key === 'graphics') { if (!GRAPHICS.includes(value)) throw new Error(`Invalid or duplicate option: ${arg}`); options.graphics = value; }
    if (key === 'hours') { options.hours = value.split(','); if (!options.hours.every(label => Object.hasOwn(ROUTE_HOURS, label))) throw new Error(`Invalid or duplicate option: ${arg}`); }
    if (key === 'cameras') options.cameras = value.split(',');
    if (key === 'finish') {
      if (!LIVE_FINISHES.includes(value)) throw new Error(`Finish ${value} is not wired into the live world yet; only ${LIVE_FINISHES.join(', ')} can be captured (see the TODO in pink-jet-age-routes-plan.mjs)`);
      options.finish = value;
    }
    if (key === 'out') options.out = value;
  }
  options.out ??= `.runtime/pink-jet-age-r9/${now.toISOString().replace(/[:.]/g, '-')}`;
  return options;
}

// A capture whose luma barely varies is a camera inside a wall or a black frame, not a view.
export const BLANK_LUMA_SPREAD = 6;
export const imageVerdict = ({ mean, spread }) => (spread < BLANK_LUMA_SPREAD ? 'blank' : mean < 12 ? 'dark' : 'ok');

export const viewName = (camera, label) => `${camera.id}-${label}`;

/** Throws unless the report holds one measured, non-blank view per camera and hour. */
export function validateReport(report) {
  if (report?.status !== 'passed') throw new Error('report status must be passed');
  for (const key of ['revision', 'graphics', 'finish', 'head']) if (typeof report[key] !== 'string' || !report[key]) throw new Error(`report.${key} is required`);
  validateCameras(report.cameras);
  const views = new Map(report.views.map(view => [view.name, view]));
  for (const camera of report.cameras) for (const [label, hour] of Object.entries(report.hours)) {
    const view = views.get(viewName(camera, label));
    if (!view) throw new Error(`missing view ${viewName(camera, label)}`);
    if (view.hour !== hour || view.camera !== camera.id || view.route !== camera.route) throw new Error(`${view.name}: camera, route or hour mismatch`);
    for (const key of ['calls', 'triangles', 'frameP50', 'frameP95']) if (!Number.isFinite(view[key])) throw new Error(`${view.name}: ${key} must be a number`);
    if (view.image?.verdict !== 'ok') throw new Error(`${view.name}: image ${view.image?.verdict ?? 'unmeasured'}`);
    if (typeof view.png !== 'string' || !view.png.endsWith('.png')) throw new Error(`${view.name}: png path required`);
  }
  if (report.views.length !== report.cameras.length * Object.keys(report.hours).length) throw new Error('views must be exactly cameras x hours');
  return report;
}
