import test from 'node:test';
import assert from 'node:assert/strict';
import {loadDistrictData} from '../../server/district-data.js';
import {commonsGroundAt} from '../../shared/east-garden-commons-layout.js';
import {buildEastGardenCommons} from '../src/east-garden-commons.js';
const world=await loadDistrictData({districtRevision:'east-garden-commons-market-1'}),layout=world.eastGardenCommons;
async function ramp(destination,check){
  const extra=layout.destination.solids.length;
  const fixture=destination?{...layout,destination:{...layout.destination,pieces:[]}}:
    {...layout,destination:undefined,surfaces:layout.surfaces.slice(0,2),solids:layout.solids.slice(0,layout.solids.length-extra)};
  const group=buildEastGardenCommons(fixture);
  try{await group.userData.ready;await check(group.getObjectByName(layout.surfaces[0].id).geometry,fixture);}
  finally{group.userData.dispose();}
}
function topFaces(geometry,fixture){
  const p=geometry.attributes.position,idx=geometry.index,result=[];
  const onTop=i=>Math.abs(p.getY(i)-(commonsGroundAt(fixture,Math.max(p.getX(i),fixture.edge+1e-6),-p.getZ(i))??NaN))<.001;
  for(let i=0;i<idx.count;i+=3){const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);if(![a,b,c].every(onTop))continue;
    result.push((p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a)));
  }
  return result;
}
test('destination gateway ramp stops where the city-kit paving begins',()=>ramp(true,geometry=>{
  const paving=layout.destination.surfaces.find(surface=>surface.id==='bayou-market-commons/market-street/walk');
  assert.ok(paving);assert.ok(Math.abs(paving.rect[0]-(layout.edge+3))<.001);
  geometry.computeBoundingBox();
  assert.ok(Math.abs(geometry.boundingBox.min.x-layout.edge)<.001);
  assert.ok(Math.abs(geometry.boundingBox.max.x-paving.rect[0])<.001,`ramp overhangs paving by ${geometry.boundingBox.max.x-paving.rect[0]} m`);
}));
test('destination ramp has only upward nondegenerate ground triangles',()=>ramp(true,(geometry,fixture)=>{
  const faces=topFaces(geometry,fixture);assert.ok(faces.length>0);assert.ok(faces.every(area=>area>1e-9),`${faces.filter(area=>area<0).length} folded top triangles`);
}));
test('legacy blockout keeps the full original ramp and its ground profile',()=>ramp(false,(geometry,fixture)=>{
  geometry.computeBoundingBox();assert.ok(Math.abs(geometry.boundingBox.max.x-fixture.surfaces[1].rect[0])<.001);
  const p=geometry.attributes.position;
  for(let i=0;i<p.count/2;i++)assert.ok(Math.abs(p.getY(i)-commonsGroundAt(fixture,Math.max(p.getX(i),fixture.edge+1e-6),-p.getZ(i)))<.001,`top vertex ${i} must match authoritative ground`);
  const faces=topFaces(geometry,fixture);assert.ok(faces.length>0);assert.ok(faces.every(area=>area>1e-9));
}));
