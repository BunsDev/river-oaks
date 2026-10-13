import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { officesFor, OFFICE_SPAWN, officeFree, officeSegmentFree, stepOffice, elevatorFrame } from '../src/office-contract.js';
import { createWalkingEnvironment } from '../src/walking.js';
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
test('elevator continuity: boarding, closing, ascent, opening, arrival; reduced motion and skip end at spawn',()=>{
 assert.deepEqual([0,2,3,5.5,6.5,8].map(t=>elevatorFrame(t).phase),['boarding','closing','ascending','opening','arriving','office']);
 assert.ok(elevatorFrame(0).position[1]<-4,'boarding begins outside the elevator car');
 assert.ok(elevatorFrame(2).position[1]>-4&&elevatorFrame(2).position[1]<0,'boarding ends inside the car');
 assert.deepEqual(elevatorFrame(8).position,OFFICE_SPAWN);assert.ok(elevatorFrame(0,{reducedMotion:true}).done);
 for(const t of [2,3,5.5,6.5,8]){const a=elevatorFrame(t-.001),b=elevatorFrame(t);assert.ok(Math.hypot(...a.position.map((n,i)=>n-b.position[i]))<.01);}
});
test('free walking reserves the measured turning circle for the longest playable avatar',()=>{
 assert.equal(officeFree([3.9,5.5]),false);assert.equal(officeSegmentFree([0,5.5],[3.9,5.5]),false);
});
