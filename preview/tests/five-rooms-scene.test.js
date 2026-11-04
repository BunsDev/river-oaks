import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { buildPlazaSurface } from '../src/plaza-surface.js';
import { buildRoads } from '../src/street-roads.js';
import { buildDesignatedSidewalks } from '../src/sidewalks.js';
import { registerGroundSurfaces, groundSurfaceHeight } from '../src/world-surface.js';
import * as landscape from '../src/five-rooms/landscape.js';
import { fiveRoomsGroundPieces, PAVING_LIFT } from '../src/five-rooms/ground.js';
import { campusGroundAt } from '../src/garden-campus-district.js';

test('paving covers each apron once and follows the upper street surface across a kerb and overlapping supports', () => {
  const quad = (left, right, height) => [[[left, height(left), 0], [right, height(right), 0], [right, height(right), 2]], [[left, height(left), 0], [right, height(right), 2], [left, height(left), 2]]];
  const base = quad(0, 4, () => 0), kerb = quad(2, 4, () => 0.2), slope = quad(0, 4, x => x * 0.1 - 0.1);
  const plan = { paving: [{ id: 'apron', ring: [[0, 0], [4, 0], [4, -2], [0, -2]] }], courts: [] };
  const triangleArea = ([a, b, c]) => Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2;
  for (const surfaces of [[...base, ...kerb], [...base, ...base, ...kerb, ...slope]]) {
    const [{ triangles }] = fiveRoomsGroundPieces(plan, { groundAt: () => 0, supportTriangles: () => surfaces });
    assert.ok(Math.abs(triangles.reduce((sum, t) => sum + triangleArea(t), 0) - 8) < 1e-5, 'complete apron area, with no doubled lower surfaces');
    for (const triangle of triangles) {
      const [x, y] = [0, 1].map(axis => triangle.reduce((sum, p) => sum + p[axis], 0) / 3);
      const top = Math.max(0, x > 2 ? 0.2 : 0, surfaces.length > 4 ? x * 0.1 - 0.1 : 0);
      assert.ok(Math.abs(y - top - PAVING_LIFT) < 1e-5, `paving follows the visible surface at ${x}`);
      assert.ok(triangleArea(triangle) > 0);
    }
  }
});

for (const districtRevision of [undefined, 'river-oaks-gardens-3', 'woodland-heights-1']) test(`${districtRevision ?? 'original District'} builds v2 landscape over the drawn streets in every appearance, without changing tenants`, async () => {
  const world=await loadDistrictData({districtRevision}), before=structuredClone(world), server=createWalkingEnvironment(before);
  const supports=[buildPlazaSurface(world),buildRoads(world),...buildDesignatedSidewalks(world,(x,z)=>server.isFree(x,z)&&!server.roomAt(x,z)&&campusGroundAt(world,x,-z)===null).children];
  registerGroundSurfaces(world,supports);
  const groundAt=(x,north)=>groundSurfaceHeight(world,x,-north);
  for(const finish of ['classic','pink-jet-age']) {
    // Reset base supports on each world build; an old apron must not lift the next one again.
    registerGroundSurfaces(world,supports);
    const group=landscape.buildFiveRoomsLandscapeForWorld(world,{groundAt,finish});
    assert.equal(group.name,'Five Rooms landscape');
    assert.equal(group.userData.fiveRoomsLandscape.stats.paving,5);
    assert.equal(group.userData.fiveRoomsLandscape.stats.courts,0);
    assert.equal(group.userData.fiveRoomsLandscape.stats.beds,0);
    assert.equal(group.userData.fiveRoomsLandscape.pending.length,36);
    const paving=group.children[0],p=paving.children[0].geometry.attributes.position;
    registerGroundSurfaces(world,[...supports,paving]);
    // Paving retains the actual street edges instead of bridging kerbs with a sample grid.
    let checked=0;
    for(let i=0;i<p.count;i+=3) {
      const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;
      if(!server.isFree(x,z)||server.roomAt(x,z))continue;
      assert.ok(Math.abs(groundSurfaceHeight(world,x,z)-y)<0.01,`${finish}: drawn paving supports the client at ${x},${z}; delta ${groundSurfaceHeight(world,x,z)-y}`);
      assert.ok(Math.abs(server.groundAt(x,z)-y)<0.15,`${finish}: paving retains 5 cm margin within the server's 20 cm pose tolerance`);
      checked++;
    }
    assert.ok(checked>0);
    assert.equal(paving.userData.pieces.length,5);
    assert.ok(paving.userData.pieces.every(piece=>piece.triangles>0),"every entrance has paving");
    group.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material??[]))m.dispose();});
  }
  assert.deepEqual(world,before,'saved tenants, source geometry and world metadata are unchanged');
});
