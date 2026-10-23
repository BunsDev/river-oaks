import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { DISTRICT_REVISION_GARDENS } from '../src/garden-campus-district.js';
import { attachEastGardenCommons, buildEastGardenCommons } from '../src/east-garden-commons.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';
import { commonsAllows, createCommonsLayout } from '../../shared/east-garden-commons-layout.js';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { validateCommonsRegistration } from '../src/east-garden-commons-world.js';
const district=await loadDistrictData({districtRevision:DISTRICT_REVISION_GARDENS});
const world=attachEastGardenCommons(district), layout=world.eastGardenCommons;

test('commons composition preserves District and Gardens inputs and stable IDs',()=>{
  const before=structuredClone(district);
  const attached=attachEastGardenCommons(district);
  assert.deepEqual(district,before);
  for(const key of ['buildings','stores','roads','trees','terrain','gardenCampus','buildingInteriors'])assert.equal(attached[key],district[key]);
  assert.deepEqual(attached.collisionPolygons.slice(0,district.collisionPolygons.length),district.collisionPolygons);
  assert.throws(()=>attachEastGardenCommons(attached),/unexpanded/);
  assert.equal(new Set(layout.solids.map(s=>s.id)).size,layout.solids.length);
});

test('real walking controller traverses the seam to the plaza and returns',()=>{
  const environment=createWalkingEnvironment(world), start=[layout.edge-1,-1335,0];
  const walker=createWalkingState(environment,start,-Math.PI/2);
  for(let i=0;i<800;i++)stepWalking(walker,environment,{forward:1,fast:true},.04);
  assert.ok(walker.position[0]>layout.edge+90,`Reached ${walker.position[0]}`);
  walker.yaw=Math.PI/2;walker.velocity=[0,0];walker.acceleration=[0,0];
  for(let i=0;i<800;i++)stepWalking(walker,environment,{forward:1,fast:true},.04);
  assert.ok(Math.abs(walker.position[0]-start[0])<.05);
  assert.ok(Math.abs(walker.position[2]+start[1])<.01);
});

test('empty reservation stays blocked; plaza obstacles, flight and placement agree',()=>{
  const environment=createWalkingEnvironment(world);
  assert.equal(environment.isFree(layout.edge+15,1335),true);
  assert.equal(environment.isFree(layout.edge+15,1315),false);
  assert.equal(environment.isAreaFree(layout.edge+15,1335,4),false);
  assert.equal(environment.canFly(layout.edge+15,50,1315),false);
  for(const solid of layout.solids){
    const x=(solid.rect[0]+solid.rect[2])/2,n=(solid.rect[1]+solid.rect[3])/2;
    assert.equal(environment.isFree(x,-n),false,solid.id);
    assert.equal(environment.canFly(x,layout.ground+1,-n),false,solid.id);
  }
  const roof=layout.pavilion.rect,x=(roof[0]+roof[2])/2,n=(roof[1]+roof[3])/2;
  assert.equal(environment.isFree(x,-n),false,'shared table occupies the pavilion centre');
  assert.equal(environment.isFree(x,-n+2),true,'pavilion circulation beside the table stays clear');
  assert.equal(environment.canFly(x,layout.ground+3,-n),false,'bubble clears the roof');
  assert.equal(commonsAllows(layout,layout.edge, -1335),true,'no eroded seam gap');
});

test('ramp meets original edge ground and contains no controller-sized step',()=>{
  const original=createWalkingEnvironment(district),expanded=createWalkingEnvironment(world);
  for(let n=-1337.5;n<=-1332.5;n+=.5){
    const expected=original.groundAt(layout.edge,-n);
    assert.ok(Math.abs(expanded.groundAt(layout.edge+.001,-n)-expected)<.001);
    for(let x=layout.edge;x<layout.edge+12;x+=.1)assert.ok(Math.abs(expanded.groundAt(x+.1,-n)-expanded.groundAt(x,-n))<.04);
  }
});

test('blockout has named route surfaces, reusable primitives and disposes owned resources',()=>{
  // The approved blockout without its composed destination (see bayou-market-commons tests).
  const extra=layout.destination.solids.length,blockout={...layout,destination:undefined,surfaces:layout.surfaces.slice(0,2),solids:layout.solids.slice(0,layout.solids.length-extra)};
  const group=buildEastGardenCommons(blockout),geometry=new Set(),materials=new Set();
  group.traverse(mesh=>{if(mesh.isMesh){geometry.add(mesh.geometry);materials.add(mesh.material);assert.ok(mesh.name.startsWith('east-garden-commons/'));}});
  for(const surface of blockout.surfaces)assert.ok(group.getObjectByName(surface.id));
  assert.ok(group.getObjectByName(`${layout.pavilion.id}/roof`));
  let geometryDisposals=0,materialDisposals=0;
  for(const item of geometry)item.addEventListener('dispose',()=>geometryDisposals++);
  for(const item of materials)item.addEventListener('dispose',()=>materialDisposals++);
  const triangles=[...geometry].reduce((sum,item)=>sum+(item.index?.count??item.attributes.position.count)/3,0);
  assert.ok(triangles<2000,`Blockout budget: ${triangles} unique triangles`);
  group.userData.dispose();group.userData.dispose();
  assert.equal(geometryDisposals,geometry.size);assert.equal(materialDisposals,materials.size);assert.equal(group.children.length,0);
});

test('layout refuses malformed bounds and missing measured edge heights',()=>{
  assert.throws(()=>createCommonsLayout({districtBounds:[0,0,1,1],edgeHeights:[]}),/heights/);
  assert.throws(()=>createCommonsLayout({districtBounds:[0,0,NaN,1],edgeHeights:Array(13).fill(1)}),/bounds/);
});

test('Commons loading rejects a mismatched registered revision or gateway height',()=>{
  assert.equal(validateCommonsRegistration(manifest,layout),layout);
  for(const mutate of [location=>{location.content_revision='other-v1';},location=>{location.entries[0].position_m[2]+=1;}]) {
    const changed=structuredClone(manifest);mutate(changed.locations.find(location=>location.id===layout.id));
    assert.throws(()=>validateCommonsRegistration(changed,layout),/Commons manifest differs/);
  }
});

// The flight bubble is wider than a walker. A clear route must be continuous,
// including the overlap on the original District side of the gateway.
test('flight bubble crosses the entire District promenade seam', () => {
  const environment = createWalkingEnvironment(world);
  for (let offset = -4; offset <= 12; offset += .05) {
    assert.equal(environment.canFly(layout.edge + offset, layout.ground + 10, 1335), true, `east offset ${offset}`);
  }
});
