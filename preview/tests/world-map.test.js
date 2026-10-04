import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingFootprint, mapProjection, nearestMapPlace } from '../src/world-map.js';

test('world map preserves scale, keeps north up, and round-trips creator-world coordinates',()=>{
  const projection=mapProjection([-80,-40,120,60]);
  assert.ok(projection);
  const west=projection.toMap([-80,0]),east=projection.toMap([120,0]);
  const north=projection.toMap([0,60]),south=projection.toMap([0,-40]);
  assert.ok(west[0]<east[0]&&north[1]<south[1]);
  assert.ok(Math.abs((east[0]-west[0])/200-(south[1]-north[1])/100)<1e-9);
  const point=[23.4,-12.7],returned=projection.toWorld(projection.toMap(point));
  assert.ok(Math.hypot(point[0]-returned[0],point[1]-returned[1])<1e-9);
  assert.equal(projection.contains(point),true);
  assert.equal(projection.contains([121,0]),false);
  assert.equal(mapProjection([0,0,0,10]),null);
  assert.equal(mapProjection([0,0,10,Infinity]),null);
});

test('map uses surveyed rings when present and rotates authored rectangular buildings',()=>{
  const ring=[[0,0],[3,0],[3,2],[0,2]];
  assert.deepEqual(buildingFootprint({ring,center:[90,90],size:[2,2]}),ring);
  const rotated=buildingFootprint({center:[10,20],size:[4,2],yaw_deg:90});
  assert.deepEqual(rotated.map(point=>point.map(value=>Math.round(value))),[[11,18],[11,22],[9,22],[9,18]]);
  assert.deepEqual(buildingFootprint({center:[0],size:[4,2]}),[]);
});

test('map selects only a nearby visible destination',()=>{
  const projection=mapProjection([-50,-50,50,50]);
  const arrival={id:'arrival',position:[0,0]},garden={id:'garden',position:[10,10]};
  assert.equal(nearestMapPlace([arrival,garden],projection.toMap([10,10]),projection),garden);
  assert.equal(nearestMapPlace([arrival,garden],projection.toMap([35,35]),projection),null);
  assert.equal(nearestMapPlace([arrival],null,projection),null);
});
