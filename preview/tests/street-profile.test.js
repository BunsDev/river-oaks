import test from 'node:test';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { STREET, streetSection, streetOffset, sidewalkOffset } from '../src/street-profile.js';
import { buildRoads } from '../src/street-roads.js';
import { buildDesignatedSidewalks } from '../src/sidewalks.js';
import { kerbStrips, laneFixtures } from '../src/street-furniture.js';
import { createPedestrianNetwork } from '../src/pedestrian-network.js';
import { registerGroundSurfaces, groundSurfaceHeight } from '../src/world-surface.js';

const road={id:'street',kind:'service',width_m:6.5,points:[[-40,0,0],[40,0,0]]};
const world=()=>({bounds_m:[-50,-20,50,20],roads:[structuredClone(road)],collisionPolygons:[]});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

test('the retained road width has a two-percent crown and Type A gutter/curb relationship',()=>{
  const section=streetSection(road);
  close(section.curbFace,3.25);
  close(section.gutterWidth,.6096);
  close((streetOffset(6.5,0)-streetOffset(6.5,section.asphaltHalf))/section.asphaltHalf,.02);
  close(sidewalkOffset(6.5,0,Infinity)-streetOffset(6.5,3.25),.1524);
  assert.ok(section.sidewalkWidth>=3.048 && section.clearWidth>=2.4384);
});

test('ramps are flush at the flowline, stay below 7.5 percent and retain a 4 ft 2 in landing',()=>{
  const section=streetSection(road);
  close(sidewalkOffset(6.5,0,0),streetOffset(6.5,3.25,0));
  let previous=sidewalkOffset(6.5,0,0);
  for(let out=.01;out<section.sidewalkWidth;out+=.01){const next=sidewalkOffset(6.5,out,0);assert.ok((next-previous)/.01<=.075001);previous=next;}
  assert.ok(section.sidewalkWidth-STREET.rampRun>=1.27-1e-8);
  close(sidewalkOffset(6.5,section.sidewalkWidth,0),sidewalkOffset(6.5,section.sidewalkWidth,Infinity));
});

test('rendered ramps and sidewalks are the same ground that feet query, with no curb blocking crossings',()=>{
  const data=world(),network=createPedestrianNetwork(data),crossing=network.crossings[0];
  const sidewalks=buildDesignatedSidewalks(data,()=>true);
  registerGroundSurfaces(data,[sidewalks]);
  const section=streetSection(road);
  for(const out of [.02,.5,1,2,3,section.sidewalkWidth-.01]) {
    close(groundSurfaceHeight(data,crossing.center[0],-(section.curbFace+out)),sidewalkOffset(6.5,out,0));
  }
  for(const [x,,z,,length] of kerbStrips(data)) {
    assert.ok(Math.abs(x-crossing.center[0])>STREET.crossingWidth/2+length/2,'curb segment must stop before ramp opening');
  }
  assert.ok(sidewalks.userData.streetProfile.warningPanels>0);
});

test('street fixtures leave the eight-foot clear path and ramp mouths unobstructed',()=>{
  const data=world(),network=createPedestrianNetwork(data),section=streetSection(road);
  const fixtures=laneFixtures(data,()=>true);
  assert.ok(fixtures.lamps.length>0);
  for(const [x,,z] of [...fixtures.lamps,...fixtures.planters,...fixtures.bins]) {
    assert.ok(Math.abs(z)+.35<section.curbFace+section.furnitureWidth,'fixture footprint stays outside clear path');
    for(const c of network.crossings)assert.ok(Math.abs(x-c.center[0])>STREET.crossingWidth/2+STREET.flareRun+.8,'fixture clears ramp and flare');
  }
});

test('a wide pedestrian way never gains vehicle curbs or zebra crossings',()=>{
  const data=world();data.roads[0].kind='pedestrian';
  assert.equal(createPedestrianNetwork(data).crossings.length,0);
  assert.equal(kerbStrips(data).length,0);
});

test('gutter counter slope at a ramp stays within five percent',()=>{
  const section=streetSection(road);
  close((streetOffset(6.5,section.asphaltHalf,0)-streetOffset(6.5,section.curbFace,0))/section.gutterWidth,.05);
});

test('asphalt continues beneath the gutter envelope at intersecting streets',t=>{
  t.mock.method(THREE.TextureLoader.prototype,'load',()=>new THREE.Texture());
  const data=world();
  data.roads.push({...structuredClone(road),id:'cross',points:[[0,-15,0],[0,15,0]]});
  const roads=buildRoads(data);
  registerGroundSurfaces(data,[roads]);
  assert.ok(groundSurfaceHeight(data,3.1,-3.1)>.20,'intersection corner must remain paved');
});

test('clipped sidewalks report warning panels without claiming completed ramps',()=>{
  const sidewalks=buildDesignatedSidewalks(world(),()=>false);
  assert.equal(sidewalks.userData.streetProfile.warningPanels,0);
  assert.ok(sidewalks.userData.streetProfile.constrainedPanels>0);
  assert.equal(sidewalks.userData.streetProfile.ramps,undefined);
});

test('road, gutter and ramp supports meet flush with bounded slopes',t=>{
  t.mock.method(THREE.TextureLoader.prototype,'load',()=>new THREE.Texture());
  const data=world(),crossing=createPedestrianNetwork(data).crossings[0],section=streetSection(road);
  registerGroundSurfaces(data,[buildRoads(data),buildDesignatedSidewalks(data)]);
  let previous;
  for(let out=-section.gutterWidth+.001;out<STREET.sidewalkWidth;out+=.01) {
    const height=groundSurfaceHeight(data,crossing.center[0],-(section.curbFace+out));
    if(previous!==undefined)assert.ok(Math.abs(height-previous)<=.000751,'no curb step or excessive slope at ramp mouth');
    previous=height;
  }
  const out=0,core=STREET.crossingWidth/2;
  close((sidewalkOffset(6.5,out,core+STREET.flareRun)-sidewalkOffset(6.5,out,core))/STREET.flareRun,.0855);
});

test('zebra bars span the crossing along the road and warnings retain their depth',()=>{
  const data=world(),crossing=createPedestrianNetwork(data).crossings[0],sidewalks=buildDesignatedSidewalks(data);
  const paint=sidewalks.getObjectByName('Street markings').geometry.attributes.position;
  const xs=[],zs=[];
  for(let i=0;i<6;i++){xs.push(paint.getX(i));zs.push(paint.getZ(i));}
  close(Math.max(...xs)-Math.min(...xs),STREET.crossingWidth);
  close(Math.max(...zs)-Math.min(...zs),.44);
  const warnings=sidewalks.getObjectByName('Street warnings').geometry.attributes.position,offsets=[];
  for(let i=0;i<warnings.count;i++)if(Math.abs(warnings.getX(i)-crossing.center[0])<=STREET.crossingWidth/2+.001)offsets.push(Math.abs(warnings.getZ(i))-road.width_m/2);
  close(Math.min(...offsets),STREET.warningSetback);
  close(Math.max(...offsets)-Math.min(...offsets),STREET.warningDepth);
  // Stone curb and gutter, brick pavers, paint and tactile warnings: one mesh each.
  assert.equal(sidewalks.children.length,4,'street details stay batched');
});
