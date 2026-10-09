import { boutiquePlanters } from '../src/world-interactions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {winstonBed} from '../src/reference-planting.js';
import {clearOfRoads} from '../src/street-fixtures.js';
const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
test('Winston planting surrounds the photographed right-hand stem clear of the door and road',()=>{
 const before=JSON.stringify(world),bed=winstonBed(world),store=world.stores.find(s=>s.name==='Harry Winston');
 assert.ok(bed);assert.equal(JSON.stringify(world),before);
 for(const [x,n] of bed.ring){assert.ok(Math.hypot(x-store.facade[0],n-store.facade[1])>3);assert.ok(clearOfRoads(world,x,-n,.05,{vehiclesOnly:true}),'bed stays outside the carriageway');}
 assert.ok(bed.ring.every(([x])=>x < -2759.5 && x > -2762.5));
 assert.ok(bed.ring.some(([,n])=>n < -1365) && bed.ring.some(([,n])=>n > -1365));
 assert.equal(winstonBed({stores:[]}),null);
});

test('Winston watering targets follow visible bed shrubs with stable IDs',()=>{
 const store=world.stores.find(s=>s.name==='Harry Winston'),bed=winstonBed(world);
 const targets=boutiquePlanters(world).filter(p=>p.id.startsWith(`planter:${store.id}:`));
 assert.deepEqual(targets.map(p=>[p.x,p.north]),[bed.shrubs[0].position,bed.shrubs.at(-1).position]);
 assert.deepEqual(targets.map(p=>p.id),[0,1].map(i=>`planter:${store.id}:${i}`));
});
