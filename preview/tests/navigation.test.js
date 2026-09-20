import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createResidentNavigation } from '../src/navigation.js';

const world = { scene:'district', bounds_m:[-20,-20,20,20], collisionPolygons:[[[-3,-8],[3,-8],[3,8],[-3,8],[-3,-8]]] };
const checkRoute = (nav, route, start, end) => {
  assert.ok(route?.length, 'A reachable destination needs a route');
  assert.deepEqual(route.at(-1),end);
  let previous=start;
  for(const point of route) { assert.ok(nav.canTravel(previous,point), 'Every complete segment must clear obstacles'); previous=point; }
};

test('routes around footprint walls without cutting diagonal corners', () => {
  const nav=createResidentNavigation(world);
  assert.ok(nav, 'District navigation must be available');
  const start=[-10,0],end=[10,0];
  assert.equal(nav.canTravel(start,end),false);
  checkRoute(nav,nav.route(start,end),start,end);
});

test('rejects unreachable, nonfinite and out-of-bounds destinations without relocation', () => {
  const nav=createResidentNavigation(world);
  assert.ok(nav);
  assert.equal(nav.route([-10,0],[0,0]),null);
  assert.equal(nav.route([-10,0],[40,0]),null);
  assert.equal(nav.route([NaN,0],[10,0]),null);
  const split=createResidentNavigation({...world,collisionPolygons:[[[-2,-20],[2,-20],[2,20],[-2,20]]]});
  assert.equal(split.route([-10,0],[10,0]),null);
  assert.equal(createResidentNavigation({...world,bounds_m:[-2000,-2000,2000,2000]}),null,'Large neighborhood must not allocate a district grid');
});

test('avoids interpreted trunks', () => {
  const nav=createResidentNavigation({...world,collisionPolygons:[],vegetation:{branch_supports:[{position:[0,0,0],height_m:20,radius_m:3}]}});
  assert.ok(nav);
  assert.equal(nav.canTravel([-4,0],[4,0]),false);
  checkRoute(nav,nav.route([-4,0],[4,0]),[-4,0],[4,0]);
});

test('shipped district has reachable public stops and bounded routes', () => {
  const data=JSON.parse(fs.readFileSync('preview/public/data/district.json'));
  data.vegetation=JSON.parse(fs.readFileSync('preview/public/data/district-vegetation.json'));
  const nav=createResidentNavigation(data);
  assert.ok(nav);
  const stops=data.communityLocations.map(x=>x.position.slice(0,2));
  let connected=0;
  for(const start of stops) {
    const neighbors=stops.filter(end=>end!==start && Math.hypot(start[0]-end[0],start[1]-end[1])>3).sort((a,b)=>Math.hypot(a[0]-start[0],a[1]-start[1])-Math.hypot(b[0]-start[0],b[1]-start[1])).slice(0,3);
    const end=neighbors.find(end=>nav.route(start,end));
    if(end) { connected++;checkRoute(nav,nav.route(start,end),start,end); }
  }
  assert.ok(connected>=24,`Only ${connected} of ${stops.length} stops connected`);
});
