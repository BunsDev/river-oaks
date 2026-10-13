import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { officesFor, officeLobbyFor, officeRetailOpenings, OFFICE_SPAWN, officeFree, officeSegmentFree, stepOffice, elevatorFrame } from '../src/office-contract.js';
import { createWalkingEnvironment } from '../src/walking.js';
import { ARRIVAL, arrivalCamera } from '../src/office-arrival-model.js';
test('lobby is an outdoor walkable point beside the existing office frontage',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url))),env=createWalkingEnvironment(data),office=officesFor(data)[0];
 assert.ok(env.isFree(office.entrance[0],-office.entrance[1]));assert.equal(env.roomAt(office.entrance[0],-office.entrance[1]),null);assert.deepEqual(officesFor({buildings:[],stores:[]}),[]);
});
test('walking follows circulation and cannot cross desks, chairs or walls',()=>{
 assert.ok(officeFree(OFFICE_SPAWN));assert.ok(officeSegmentFree(OFFICE_SPAWN,[0,5]));
 for(const p of [[5,2],[0,8],[-4,2.2],[-3.15,2.2],[3.1,3.4],[0,0],[-Infinity,0]])assert.equal(officeFree(p),false,JSON.stringify(p));
 let p=[...OFFICE_SPAWN];for(let i=0;i<200;i++)p=stepOffice(p,0,.05);assert.ok(p[1]<6.4);assert.ok(officeFree(p));
 assert.equal(officeSegmentFree([-2,3.4],[4,3.4]),false);
});
test('the authored lobby removes overlapping retail alcoves and preserves adjacent bays',()=>{
 const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url))),site=officeLobbyFor(world),n=site.outward,u=[-n[1],n[0]];
 const at=(s,d=0)=>site.facade.map((v,i)=>v+u[i]*s+n[i]*d),half=site.width/2;
 assert.deepEqual(officeRetailOpenings(site,site.buildingId,at(-1),at(1),[0,1]),[]);
 const clipped=officeRetailOpenings(site,site.buildingId,at(half-1),at(half+1),[0,1]);
 assert.equal(clipped.length,1);assert.ok(Math.abs(clipped[0][0]-.5)<1e-8);assert.equal(clipped[0][1],1);
 for(const [id,a,b] of [[site.buildingId,at(half+1),at(half+3)],['another-building',at(-1),at(1)],[site.buildingId,at(-1,10),at(1,10)]])assert.deepEqual(officeRetailOpenings(site,id,a,b,[.1,.9]),[[.1,.9]]);
 assert.deepEqual(officeRetailOpenings(site,site.buildingId,at(-1),at(1),null),[]);
});
test('elevator continuity: boarding, closing, ascent, opening, arrival; reduced motion and skip end at spawn',()=>{
 const ends=[0,1.3,ARRIVAL.boardingEnd,ARRIVAL.closingEnd,ARRIVAL.ascentEnd,ARRIVAL.openingEnd,ARRIVAL.duration];
 assert.deepEqual(ends.map(t=>elevatorFrame(t).phase),['lobby','boarding','closing','ascending','opening','arriving','office']);
 assert.ok(elevatorFrame(0).position[1]<-4,'boarding begins outside the elevator car');
 assert.ok(elevatorFrame(ARRIVAL.boardingEnd).position[1]>-4&&elevatorFrame(ARRIVAL.boardingEnd).position[1]<0,'boarding ends inside the car');
 assert.deepEqual(elevatorFrame(ARRIVAL.duration).position,OFFICE_SPAWN);assert.ok(elevatorFrame(0,{reducedMotion:true}).done);
 for(const t of ends.slice(1)){const a=elevatorFrame(t-.001),b=elevatorFrame(t);assert.ok(Math.hypot(...a.position.map((n,i)=>n-b.position[i]))<.01);}
});
test('camera follows continuously through open portals and meets the first-person eye',()=>{
 for(const aspect of [1.44,768/1024,390/844,320/700]){
  let previous=arrivalCamera(0,{aspect});
  for(let t=.01;t<=ARRIVAL.duration;t+=.01){
   const c=arrivalCamera(t,{aspect}),f=elevatorFrame(t);
   assert.ok(Math.hypot(...c.position.map((n,i)=>n-previous.position[i]))<.04,`camera cut at ${t}`);
   assert.ok(Math.hypot(...c.target.map((n,i)=>n-previous.target[i]))<.05,`aim cut at ${t}`);
   for(const z of [ARRIVAL.frontPortalZ,4])if(Math.abs(c.position[2]-z)<.1){
    assert.ok(Math.abs(c.position[0])+.05<ARRIVAL.doorWidth/2,'camera stays in doorway');
    assert.ok(c.position[1]+.05<ARRIVAL.doorHeight);
    assert.equal(f.doors,1,'camera crosses only an open door');
   }
   previous=c;
  }
  const end=arrivalCamera(ARRIVAL.duration,{aspect});assert.deepEqual(end.position,[0,1.68,-OFFICE_SPAWN[1]]);assert.deepEqual(end.target,[0,1.68,-4.25]);
 }
});
test('arrival admits the full conservative body envelope and seals both portals during ascent',()=>{
 const radius=.888;
 for(let t=0;t<=ARRIVAL.duration;t+=.01){const f=elevatorFrame(t),z=-f.position[1];
  if(Math.abs(z)<radius||Math.abs(z-4)<radius)assert.equal(f.doors,1,'doors stay open across the whole body');
  if(f.phase==='ascending'){assert.equal(f.doors,0);assert.ok(z-radius>0&&z+radius<4);assert.ok(f.floor>=1&&f.floor<=6);}
 }
 assert.ok(ARRIVAL.doorWidth>=1.01+.2);assert.ok(ARRIVAL.doorHeight>=2.45+.1);
});
test('free walking reserves the measured turning circle for the longest playable avatar',()=>{
 assert.equal(officeFree([3.9,5.5]),false);assert.equal(officeSegmentFree([0,5.5],[3.9,5.5]),false);
});
