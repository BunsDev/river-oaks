import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPedestrianNetwork } from '../src/pedestrian-network.js';
import { createResidentNavigation } from '../src/navigation.js';
import { createResidentLife } from '../src/resident-life.js';
import { createCommunity } from '../src/community.js';
const world={scene:'district',bounds_m:[-30,-15,30,15],collisionPolygons:[],roads:[{id:'street',width_m:6.5,points:[[-20,0,0],[20,0,0]]}]};
test('residents follow sidewalks and cross the roadway only at marked crossings',()=>{
  const network=createPedestrianNetwork(world),navigation=createResidentNavigation(world),start=[-2,-5],end=[-2,5];
  assert.equal(network.classify([0,0]),'road');assert.equal(network.classify([-14,0]),'crossing');assert.equal(network.classify([0,5]),'sidewalk');
  const route=navigation.route(start,end);assert.ok(route?.length>1,'crossing requires a detour');
  let previous=start,length=0;
  for(const point of route){const span=Math.hypot(point[0]-previous[0],point[1]-previous[1]);for(let t=0;t<=1;t+=0.02){const p=[previous[0]+(point[0]-previous[0])*t,previous[1]+(point[1]-previous[1])*t];assert.notEqual(network.classify(p),'road','no unmarked shortcut');}length+=span;previous=point;}
  assert.ok(length>25);assert.deepEqual(route.at(-1),end);
});
test('district residents start on legal pedestrian surfaces without changing map records',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url))),before=JSON.stringify(data);
  data.vegetation=JSON.parse(readFileSync(new URL('../public/data/district-vegetation.json',import.meta.url)));
  const community=createCommunity(data),life=createResidentLife(data,community);
  const pedestrians=community.locals.filter(local=>!local.stationary);assert.equal(pedestrians.length,24);
  for(const resident of pedestrians)assert.notEqual(life.navigation.pedestrian.classify(resident.position),'road',resident.id);
  delete data.vegetation;assert.equal(JSON.stringify(data),before);
});

test('route segments cannot skip narrow road-edge gaps between legal endpoints',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
  const network=createPedestrianNetwork(data),start=[-2770.7888276220483,-1343.2890495727813],end=[-2764.280118916899,-1341.6085898216527];
  assert.notEqual(network.classify(start),'road');assert.notEqual(network.classify(end),'road');
  assert.equal(network.segmentCost(start,end),Infinity,'The first 18 cm crosses outside a marked crossing');
});
