#!/usr/bin/env node
// Publishes the #506 garden campus contract and its deterministic review views:
//   node scripts/garden-campus-views.mjs          write docs/design/garden-campus/{layout-contract.json,manifest.json,views/*.svg}
//   node scripts/garden-campus-views.mjs --check  fail if any published file differs or the contract has findings
// Everything is generated from shared/garden-campus-layout.js; nothing here is edited by hand.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  GARDEN_CAMPUS_LAYOUT as LAYOUT, campusLevels, campusUnitInventory, validateGardenCampus,
} from '../shared/garden-campus-layout.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const OUT = 'docs/design/garden-campus';
const f = value => Number(value.toFixed(2));
const sha256 = text => createHash('sha256').update(text).digest('hex');
const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Plan views: u to the right, v up. s pixels per metre.
function planFrame(s, pad = 40) {
  const umax = 38, vmax = 181.3;
  return { s, pad, width: Math.round(umax * s + pad * 2 + 260), height: Math.round(vmax * s + pad * 2),
    x: u => f(pad + u * s), y: v => f(pad + (vmax - v) * s) };
}
const rectEl = (P, [u0, v0, u1, v1], attrs) => `<rect x="${P.x(u0)}" y="${P.y(v1)}" width="${f((u1 - u0) * P.s)}" height="${f((v1 - v0) * P.s)}" ${attrs}/>`;
const polyEl = (P, points, attrs) => `<polygon points="${points.map(([u, v]) => `${P.x(u)},${P.y(v)}`).join(' ')}" ${attrs}/>`;
const label = (x, y, text, size = 9, anchor = 'middle') => `<text x="${f(x)}" y="${f(y)}" font-size="${size}" text-anchor="${anchor}">${esc(text)}</text>`;
const svg = (width, height, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">
<title>${esc(title)}</title>
<rect width="${width}" height="${height}" fill="#fbfaf7"/>
${body.join('\n')}
</svg>
`;
const legend = (x, y, lines) => lines.map((line, i) => label(x, y + i * 14, line, 10, 'start')).join('\n');

function sitePlan() {
  const P = planFrame(4, 60), body = [];
  body.push(polyEl(P, LAYOUT.parcel.polygon, 'fill="#eef1ea" stroke="#3b4a3f" stroke-width="1.2"'));
  for (const path of LAYOUT.paths) body.push(rectEl(P, path.rect, 'fill="#e2dccd" stroke="#b9ae96" stroke-width="0.5"'));
  for (const seam of LAYOUT.seams) body.push(polyEl(P, seam.polygon, 'fill="#c96f4a" stroke="#c96f4a" stroke-width="0.6"'));
  for (const item of LAYOUT.groundBuildings) body.push(rectEl(P, item.rect, item.kind === 'pool' ? 'fill="#a9c9d8" stroke="#6b93a6"' : item.kind === 'pergola' ? 'fill="none" stroke="#7a6a4f" stroke-dasharray="3 2"' : 'fill="#c9d8b6" stroke="#5c7048"'), label(P.x((item.rect[0] + item.rect[2]) / 2), P.y((item.rect[1] + item.rect[3]) / 2) + 3, item.id));
  const shades = ['#d9d3c7', '#c4bcae', '#aea594'];
  for (const tower of LAYOUT.towers) {
    tower.tiers.forEach((tier, i) => body.push(rectEl(P, tier.rect, `fill="${shades[i]}" stroke="#5a5246" stroke-width="0.8"`)));
    body.push(rectEl(P, tower.core.rect, 'fill="#4d463c"'), rectEl(P, tower.core.lobby.rect, 'fill="#8c8273"'));
    const [, , , v1] = tower.tiers[0].rect;
    body.push(label(P.x(15.5), P.y(v1) - 4, `${tower.id}: ${tower.levels.length} floors, roof z ${tower.roof.z}`, 8));
  }
  for (const bridge of LAYOUT.bridges) body.push(rectEl(P, bridge.rect, 'fill="#e3a46b" stroke="#9a5a2c" stroke-width="0.8"'), rectEl(P, bridge.clear, 'fill="#f2c79a"'), label(P.x(20.5), P.y((bridge.rect[1] + bridge.rect[3]) / 2) + 3, `${bridge.id} ${bridge.span} m, z ${bridge.deckZ}`, 8, 'start'));
  const wall = LAYOUT.context.ipic.wall;
  body.push(`<line x1="${P.x(wall.from[0])}" y1="${P.y(wall.from[1])}" x2="${P.x(wall.to[0])}" y2="${P.y(wall.to[1])}" stroke="#8e2f2f" stroke-width="4"/>`,
    `<text x="${P.x(-1.5)}" y="${P.y(130)}" font-size="9" text-anchor="middle" transform="rotate(-90 ${P.x(-1.5)} ${P.y(130)})">IPIC wall (retained)</text>`);
  for (const entry of LAYOUT.entries) body.push(`<circle cx="${P.x(entry.position[0])}" cy="${P.y(entry.position[1])}" r="4" fill="#c96f4a"/>`, label(P.x(entry.position[0]) + 8, P.y(entry.position[1]) + (entry.id === 'E3' ? -6 : 14), entry.id, 10, 'start'));
  for (const camera of LAYOUT.cameras.filter(c => c.position[0] >= 0 && c.position[0] <= 38 && c.position[1] >= 0 && c.position[1] <= 181.3))
    body.push(`<circle cx="${P.x(camera.position[0])}" cy="${P.y(camera.position[1])}" r="2.5" fill="#2f5d8e"/>`, label(P.x(camera.position[0]) + 5, P.y(camera.position[1]) - 4, camera.id, 7, 'start'));
  const lx = P.pad + 38 * P.s + 20;
  body.push(legend(lx, 60, ['The Gardens: site plan (z 0)', `${LAYOUT.id} layout ${LAYOUT.versions.layout}`, `source ${LAYOUT.source.buildingId}`, `commit ${LAYOUT.source.commit.slice(0, 12)}`, '',
    'u east (right), v north (up), metres', 'shade: tier 1 / 2 / 3', 'dark: core; mid: core lobby', 'orange: skywalk deck and 3 m clear route', 'red dots: entries; red strips: seams', 'blue dots: ground-level review cameras',
    '', ...LAYOUT.cameras.map(c => `${c.id}: [${c.position.map(f).join(', ')}]`)]));
  return svg(P.width, P.height, 'The Gardens site plan', body);
}

function floor4Plan() {
  const P = planFrame(6), body = [], levels = campusLevels(), l3 = levels[3];
  body.push(polyEl(P, LAYOUT.parcel.polygon, 'fill="none" stroke="#3b4a3f" stroke-width="1" stroke-dasharray="4 3"'));
  const style = { suite: 'fill="#f3e7d3" stroke="#7d6a4a" stroke-width="0.6"', service: 'fill="#dedad3" stroke="#a9a397" stroke-width="0.4"',
    gallery: 'fill="#f6d9b8" stroke="#a8682f" stroke-width="0.8"', spur: 'fill="#f6d9b8" stroke="#a8682f" stroke-width="0.6"', lobby: 'fill="#e9c9a3" stroke="#a8682f" stroke-width="0.6"',
    passage: 'fill="#f6d9b8" stroke="#a8682f" stroke-width="0.4"', terrace: 'fill="#d5e5c2" stroke="#5c7048" stroke-width="0.6"', deck: 'fill="#f2c79a" stroke="#9a5a2c" stroke-width="0.8"' };
  const order = ['terrace', 'service', 'suite', 'gallery', 'spur', 'passage', 'lobby', 'deck'];
  for (const kind of order) for (const surface of l3.surfaces.filter(s => s.kind === kind)) {
    body.push(rectEl(P, surface.rect, style[kind]));
    if (kind === 'suite') {
      const unit = campusUnitInventory().find(u => u.id === surface.id);
      const size = (surface.rect[2] - surface.rect[0]) * P.s < 40 ? 6 : 8;
      body.push(label(P.x((surface.rect[0] + surface.rect[2]) / 2), P.y((surface.rect[1] + surface.rect[3]) / 2), unit.number, size),
        label(P.x((surface.rect[0] + surface.rect[2]) / 2), P.y((surface.rect[1] + surface.rect[3]) / 2) + size + 2, `${unit.netArea} m2`, size - 1));
    }
  }
  for (const obstacle of l3.obstacles) body.push(rectEl(P, obstacle.rect, obstacle.kind === 'guard' ? 'fill="#5a5246"' : 'fill="#4d463c"'));
  for (const item of l3.keepClear.filter(k => /-F4-(north|south)$/.test(k.id))) body.push(rectEl(P, item.rect, 'fill="none" stroke="#c0392b" stroke-width="1" stroke-dasharray="2 2"'));
  for (const opening of l3.openings) body.push(`<circle cx="${P.x(opening.position[0])}" cy="${P.y(opening.position[1])}" r="${opening.kind === 'skywalk-portal' ? 4 : 2.5}" fill="${opening.kind === 'suite-door' ? '#7d6a4a' : '#c0392b'}"/>`);
  for (const portal of l3.portals) body.push(`<rect x="${f(P.x(portal.position[0]) - 3)}" y="${f(P.y(portal.position[1]) - 3)}" width="6" height="6" fill="${portal.kind === 'lift' ? '#2f5d8e' : '#6b4f8e'}"/>`);
  for (const tower of LAYOUT.towers) { const r = tower.levels[3].rect;body.push(label(P.x(r[0]) - 4, P.y((r[1] + r[3]) / 2), `${tower.id}-F4`, 10, 'end')); }
  const lx = P.pad + 38 * P.s + 20;
  body.push(legend(lx, 60, ['The Gardens: Floor 4 (z 13, garden-campus/l3)', `layout ${LAYOUT.versions.layout}, support ${LAYOUT.versions.support}`, '',
    'orange: public gallery, spur, lobby, passage, deck', 'red dashes: 3 m bridge landings (keep clear)', 'red dots: skywalk portals, terrace door', 'brown dots: suite doors', 'cream: private suites (number, net m2)', 'grey: service residual', 'green: T2 z 13 terrace', 'blue / violet squares: lift / stair portals', 'dark: lift and stair shafts, guards']));
  return svg(P.width, P.height, 'The Gardens Floor 4 plan', body);
}

function section() {
  // Long section at u 16, the skywalk centreline: v to the right, z up.
  const s = 5, pad = 40, vmax = 181.3, zmax = 36, width = Math.round(vmax * s + pad * 2), height = Math.round(zmax * s + pad * 2 + 120);
  const x = v => f(pad + v * s), y = z => f(pad + (zmax - z) * s), body = [], U = 16;
  body.push(`<line x1="${x(0)}" y1="${y(0)}" x2="${x(vmax)}" y2="${y(0)}" stroke="#3b4a3f" stroke-width="1.2"/>`);
  const band = (v0, v1, z0, z1, attrs) => `<rect x="${x(v0)}" y="${y(z1)}" width="${f((v1 - v0) * s)}" height="${f((z1 - z0) * s)}" ${attrs}/>`;
  const dashed = (v0, v1, z, color, text) => `<line x1="${x(v0)}" y1="${y(z)}" x2="${x(v1)}" y2="${y(z)}" stroke="${color}" stroke-dasharray="5 3" stroke-width="1"/>` + (text ? label(x(v1) - 2, y(z) - 4, text, 8, 'end') : '');
  for (const tower of LAYOUT.towers) {
    for (const level of tower.levels) if (level.rect[0] <= U && level.rect[2] >= U) body.push(band(level.rect[1], level.rect[3], level.z0, level.z1, 'fill="#e6e0d4" stroke="#5a5246" stroke-width="0.6"'), label(x(level.rect[1]) + 10, y(level.z0) - 4, `F${level.level} z${level.z0}`, 7, 'start'));
    body.push(band(tower.roof.rect[1], tower.roof.rect[3], tower.roof.z, tower.silhouette.parapetTop, 'fill="none" stroke="#5a5246" stroke-dasharray="2 2"'));
    const [, v0, , v1] = tower.tiers[0].rect;
    body.push(dashed(v0, v1, tower.silhouette.capZ, '#5c7048', null), label(x((v0 + v1) / 2), y(tower.silhouette.capZ) - 4, `${tower.id} cap ${tower.silhouette.capZ}`, 8));
    for (const terrace of tower.terraces) for (const part of terrace.parts) if (part[0] <= U && part[2] >= U) body.push(band(part[1], part[3], terrace.z - 0.3, terrace.z, 'fill="#9bbf7a"'));
  }
  for (const bridge of LAYOUT.bridges) body.push(band(bridge.rect[1], bridge.rect[3], bridge.underside, bridge.deckZ, 'fill="#e3a46b" stroke="#9a5a2c" stroke-width="0.6"'),
    band(bridge.rect[1], bridge.rect[3], bridge.deckZ, bridge.deckZ + bridge.guard, 'fill="none" stroke="#9a5a2c" stroke-dasharray="1 2"'), label(x((bridge.rect[1] + bridge.rect[3]) / 2), y(bridge.deckZ + bridge.guard) - 4, `${bridge.id}: ${bridge.span} m facade to facade, deck z ${bridge.deckZ}`, 8));
  const office = LAYOUT.context.office.nominalRoofAltitude - LAYOUT.frame.baseAltitude, ipic = LAYOUT.context.ipic.baseAltitude + LAYOUT.context.ipic.height - LAYOUT.frame.baseAltitude;
  body.push(dashed(0, vmax, office, '#8e2f2f', `existing office roof z ${f(office)}`), dashed(LAYOUT.context.ipic.wall.from[1], vmax, ipic, '#8e2f2f', `IPIC z ${f(ipic)}`));
  const p2 = LAYOUT.paths.find(p => p.id === 'P2');
  body.push(band(p2.rect[1], p2.rect[3], 0, 1.8, 'fill="#c96f4a" opacity="0.5"'), label(x((p2.rect[1] + p2.rect[3]) / 2), y(2.4), 'P2 below B12', 8));
  for (let v = 0; v <= 180; v += 20) body.push(label(x(v), y(0) + 14, `v ${v}`, 8));
  body.push(legend(pad, height - 90, ['The Gardens: long section at u 16 (skywalk centreline), z above the garage base 18.259 m', `Floors 5 m then 4 m; skywalk slab 0.35 m, guard 1.25 m; caps include roof access and planting`,
    'Below the decks: P2 ground route under B12 (12.65 m clear), T3 z 9 terrace under B23 (3.65 m clear)', `layout ${LAYOUT.versions.layout}, source ${LAYOUT.source.commit.slice(0, 12)}`]));
  return svg(width, height, 'The Gardens long section', body);
}

export function renderCampusArtifacts() {
  const contract = { ...JSON.parse(JSON.stringify(LAYOUT)), levels: campusLevels(), unitInventory: campusUnitInventory() };
  const json = JSON.stringify(contract, null, 2) + '\n';
  const views = { 'views/site-plan.svg': sitePlan(), 'views/floor-4.svg': floor4Plan(), 'views/section-u16.svg': section() };
  const manifest = JSON.stringify({ id: LAYOUT.id, versions: LAYOUT.versions, source: { commit: LAYOUT.source.commit, districtBlob: LAYOUT.source.districtBlob, buildingId: LAYOUT.source.buildingId },
    generator: 'scripts/garden-campus-views.mjs', files: { 'layout-contract.json': sha256(json), ...Object.fromEntries(Object.entries(views).map(([name, text]) => [name, sha256(text)])) } }, null, 2) + '\n';
  return { 'layout-contract.json': json, 'manifest.json': manifest, ...views };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const district = JSON.parse(await readFile(new URL('../preview/public/data/district.json', import.meta.url), 'utf8'));
  const result = validateGardenCampus(LAYOUT, { district });
  for (const finding of result.findings) console.error(`finding ${finding.rule} ${finding.id}: ${finding.message}`);
  const artifacts = renderCampusArtifacts(), stale = [];
  for (const [name, text] of Object.entries(artifacts)) {
    const path = `${root}${OUT}/${name}`;
    if (check) { const current = await readFile(path, 'utf8').catch(() => null);if (current !== text) stale.push(name); }
    else { await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });await writeFile(path, text); }
  }
  const units = campusUnitInventory();
  console.log(JSON.stringify({ ok: result.ok && !stale.length, findings: result.findings.length, stale, towers: LAYOUT.towers.map(t => `${t.id} ${t.levels.length}F roof z${t.roof.z}`),
    bridges: LAYOUT.bridges.map(b => `${b.id} ${b.span} m z${b.deckZ}`), suites: units.length, netArea: Number(units.reduce((s, u) => s + u.netArea, 0).toFixed(2)) }));
  if (!result.ok || stale.length) process.exitCode = 1;
}
