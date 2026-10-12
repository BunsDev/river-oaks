import test from 'node:test';
import * as worldMap from '../src/world-map.js';
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


test('street labels use a long visible segment once per name and omit walking paths',()=>{
  const projection=mapProjection([-100,-100,100,100]);
  const roads=[
    {name:'Oak Lane',kind:'residential',points:[[-70,0],[70,0]]},
    {name:'Oak Lane',kind:'residential',points:[[-70,10],[70,10]]},
    {name:'Garden walk',kind:'footway',points:[[-70,40],[70,40]]},
    {name:'Too short for its name',kind:'residential',points:[[0,80],[1,80]]},
    {name:'Outside',kind:'residential',points:[[200,200],[300,300]]},
  ];
  const labels=worldMap.mapRoadLabels?.(roads,projection);
  assert.deepEqual(labels,[{name:'Oak Lane',position:[500,500],angle:0}]);
});


test('street names stay upright for reversed geometry and tolerate invalid input',()=>{
  const projection=mapProjection([-100,-100,100,100]);
  const [label]=worldMap.mapRoadLabels([{name:'Oak',kind:'residential',points:[[70,0],[-70,0]]}],projection);
  assert.equal(label.angle,0);
  assert.deepEqual(worldMap.mapRoadLabels([{name:'Broken',points:[[NaN,0],[0,0]]}],projection),[]);
  assert.deepEqual(worldMap.mapRoadLabels([],null),[]);
});

// Absolute M/L/H/V coordinates of a marker path, or the circle an arc path draws.
const extent=d=>{
  const arc=d.match(/^M (\S+) (\S+) a (\S+)/);
  if(arc){const [x,y,r]=arc.slice(1).map(Number);return [x,y-r,x+2*r,y+r];}
  const xs=[],ys=[];let x=0,y=0;
  for(const [,command,args] of d.matchAll(/([MLHVZ])\s*([^MLHVZ]*)/g)){
    const values=args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if(command==='H')x=values[0];else if(command==='V')y=values[0];
    else if(command!=='Z')for(let i=0;i<values.length;i+=2){x=values[i];y=values[i+1];xs.push(x);ys.push(y);continue;}
    if(command==='H'||command==='V'){xs.push(x);ys.push(y);}
  }
  return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
};

test('each kind of place has its own map silhouette, centred on the place so a click selects it',()=>{
  const places=[{kind:'arrival'},{kind:'shop',category:'Shopping & culture'},{kind:'shop',category:'Dining'},
    {kind:'shop',category:'Jewelry & accessories'},{kind:'spot',category:'Beauty & wellness'},{kind:'shop',category:'Homes'},{kind:'spot'}];
  const shapes=places.map(worldMap.placeShape);
  assert.deepEqual(shapes,['sparkle','square','plate','gem','flower','house','dot']);
  for(const shape of shapes){
    const [x0,y0,x1,y1]=extent(worldMap.markerPath(shape,400,300,9.5));
    // Within a map unit or so of the anchor: nearestMapPlace selects within 20.
    assert.ok(Math.abs((x0+x1)/2-400)<1.5&&Math.abs((y0+y1)/2-300)<1.5,`${shape} is centred`);
    assert.ok(x1-x0>12&&x1-x0<30&&y1-y0>12&&y1-y0<30,`${shape} is marker sized`);
  }
});

test('the map arrow points where the walker faces and turns the short way round',()=>{
  // Walking forward moves (-sin yaw, -cos yaw) on the north-up map; the arrow is drawn up.
  for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI,2.3,-0.7]){
    const angle=worldMap.headingDegrees(yaw)*Math.PI/180,arrow=[Math.sin(angle),-Math.cos(angle)];
    assert.ok(Math.hypot(arrow[0]+Math.sin(yaw),arrow[1]+Math.cos(yaw))<1e-9,`yaw ${yaw}`);
  }
  assert.equal(worldMap.unwrapDegrees(null,42),42);
  assert.equal(worldMap.unwrapDegrees(170,-170),190);
  assert.equal(worldMap.unwrapDegrees(-170,170),-190);
  assert.equal(worldMap.unwrapDegrees(720,10),730);
  assert.equal(worldMap.unwrapDegrees(30,40),40);
});

test('the map key names the symbols this map can show',()=>{
  const labels=places=>worldMap.mapLegend(places,false).map(key=>key.label);
  assert.deepEqual(labels([{kind:'arrival'},{kind:'shop',category:'Dining'},{kind:'shop',category:'Beauty & wellness'}]),
    ['You','Arrival','Dining','Beauty','Saved place','Player']);
  assert.deepEqual(labels([{kind:'spot'}]),['You','Destination','Saved place','Player']);
  assert.ok(worldMap.mapLegend([],true).some(key=>key.label==='Parcel'));
  for(const key of worldMap.mapLegend([{kind:'arrival'},{kind:'shop',category:'Jewelry & accessories'}],true))
    assert.match(worldMap.legendPath(key.shape),/^M /,`${key.label} has a drawn key`);
});
