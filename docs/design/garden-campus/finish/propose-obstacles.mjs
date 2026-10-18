// The #511 contract-obstacle proposal: terrace and roof furniture and ground tree pits, derived
// from the current contract by one pattern, written to proposed-obstacles.json beside this file.
//   node docs/design/garden-campus/finish/propose-obstacles.mjs
// preview/tests/garden-campus-finish.test.js checks the written file against the contract.
import { writeFile } from 'node:fs/promises';
import { GARDEN_CAMPUS_LAYOUT as C } from '../../../../shared/garden-campus-layout.js';
const r2 = n => Math.round(n * 100) / 100, rect = (...a) => a.map(r2);
const out = [];
const add = (level, id, kind, r, note) => out.push({ level, id, kind, rect: rect(...r), note });
const levelId = z => `garden-campus/l${[0,5,9,13,17,21,25,29].indexOf(z)}`;
for (const tower of C.towers) for (const t of tower.terraces) {
  const [E, S] = t.parts, L = levelId(t.z), [ui, eV0, uo, eV1] = E, door = t.door;
  // East part: planted bed along the outer guard, a view gap opposite the door, a meeting table at the dead (north) end.
  const tableV0 = eV1 - 0.1 - 2.6, bedLo = eV0 + 0.6, bedHi = tableV0 - 0.4, gap = [door[1] - 2, door[1] + 2];
  for (const [a, b] of [[bedLo, gap[0]], [gap[1], bedHi]]) if (b - a >= 1.5) add(L, `${t.id}/bed-east-${r2(a)}`, 'planter', [uo - 0.85, a, uo - 0.05, b], 'bed along the outer guard; 2.15 m clear to the facade');
  add(L, `${t.id}/table-north`, 'table', [ui + 0.35, tableV0, uo - 0.1, eV1 - 0.1], 'outdoor meeting table with four chairs at the dead end');
  // South part: depth decides. 2.5 m: benches on the guard (1.95 m clear) and a planted west end.
  const [sw, vo, se, vi] = S, depth = vi - vo, bridgeCut = C.bridges.filter(b => b.deckZ === t.z && b.rect[0] < se && b.rect[2] > sw).map(b => [b.rect[0] - 0.5, b.rect[2] + 0.5]);
  add(L, `${t.id}/bed-west-end`, 'planter', [sw + 0.05, vo + 0.05, sw + 0.85, vi], 'planted dead end against the facade corner');
  const free = [[sw + 1.3, ui - 0.3]];
  let runs = free; for (const [c0, c1] of bridgeCut) runs = runs.flatMap(([a, b]) => [[a, Math.min(b, c0)], [Math.max(a, c1), b]].filter(([x, y]) => y - x > 1));
  let k = 0;
  for (const [a, b] of runs) {
    // Alternate a 3 m bench and (only where the part is deep enough) a 2.5 m bed along the outer guard.
    for (let s = a; s + 2.4 <= b; k++) {
      const bench = depth < 2.95 || k % 2 === 0, len = Math.min(bench ? 3 : 2.5, b - s);
      if (len < 1.5) break;
      add(L, `${t.id}/${bench ? 'seat' : 'bed'}-south-${r2(s)}`, bench ? 'seat' : 'planter', bench ? [s, vo + 0.05, s + len, vo + 0.55] : [s, vo + 0.05, s + len, vo + 0.85], bench ? `bench on the guard; ${r2(depth - 0.55)} m clear` : 'bed on the guard; 2.15 m clear');
      s += len + 0.8;
    }
  }
}
for (const tower of C.towers) {
  const roof = tower.roof, [u0, v0, u1, v1] = roof.rect, L = levelId(roof.z), [c0, c1, c2, c3] = roof.headhouse.rect;
  add(L, `${roof.id}/table-south-east`, 'table', [u1 - 0.05 - 2.6, v0 + 0.6, u1 - 0.35, v0 + 0.6 + 2.6], 'roof meeting table');
  add(L, `${roof.id}/seat-east-a`, 'seat', [u1 - 0.55, (v0 + v1) / 2 - 1.5, u1 - 0.05, (v0 + v1) / 2 + 1.5], 'bench on the east parapet');
  add(L, `${roof.id}/seat-east-b`, 'seat', [u1 - 0.55, v1 - 0.6 - 3, u1 - 0.05, v1 - 0.6], 'bench on the east parapet');
  add(L, `${roof.id}/bed-north`, 'planter', [c0 + 1.2, v1 - 0.85, u1 - 1.2, v1 - 0.05], 'low bed on the north parapet');
}
// Ground tree pits (1.2 m), on lawn clear of paths, approaches, the pergola, the café, the pool and both skywalks.
for (const [id, u, v] of [['tree-west-t1-a', 3, 50.5], ['tree-west-t1-b', 3, 65.5], ['tree-west-t2-a', 3, 95], ['tree-west-t2-b', 3, 111], ['tree-west-t3', 3, 139],
  ['tree-south-a', 8, 9], ['tree-south-b', 12, 19], ['tree-south-c', 23.5, 42.5], ['tree-cross-west', 3.5, 86], ['tree-cross-east', 24.5, 86], ['tree-north-a', 26.3, 168]])
  add('garden-campus/l0', `ground/${id}`, 'tree', [u - 0.6, v - 0.6, u + 0.6, v + 0.6], 'tree pit; crown above 3.2 m');
const head = {
  for: 'shared/garden-campus-layout.js campusLevels() obstacles (owner: #506, river-oaks-c5)', proposedBy: '#511 finish pass', contract: { ...C.versions },
  kinds: { planter: 'planted bed: solid to walkers, drawn by garden-campus-planting.js', seat: 'bench: solid to walkers, seated use is #510', table: 'meeting table with four chairs inside the rect: solid to walkers, seated use is #510', tree: 'ground tree pit: trunk and kerb solid; crown above 3.2 m' },
  rule: 'Every rect is inside its surface, outside every keepClear rect, landing, portal approach, passage and door threshold, and leaves a 1.8 m route from the door to each part (preview/tests/garden-campus-finish.test.js).',
};
// One obstacle per line, so a review reads the rects directly.
const body = JSON.stringify(head, null, 1).replace(/\n}$/, `,\n "obstacles": [\n${out.map(item => `  ${JSON.stringify(item)}`).join(',\n')}\n ]\n}\n`);
await writeFile(new URL('proposed-obstacles.json', import.meta.url), body);
JSON.parse(body);
console.log(out.length, out.filter(o=>o.kind==='planter').length, out.filter(o=>o.kind==='seat').length, out.filter(o=>o.kind==='table').length, out.filter(o=>o.kind==='tree').length);
