import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { referencePlan } from '../src/reference-facades.js';
import { hermesPavilionRing } from '../src/hermes-roof-surface.js';
const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
test('shared pavilion boundary exactly reproduces existing frame/vector geometry',()=>{
 const f=referencePlan(world).frontages.find(f=>f.kind==='hermes');assert.ok(f);
 const {edge,side,corner,width,sideWidth}=f;
 const point=(edge,fromB,s)=>new THREE.Vector2(edge.a[0]+edge.u[0]*((fromB?edge.length:0)+(fromB?-1:1)*s),edge.a[1]+edge.u[1]*((fromB?edge.length:0)+(fromB?-1:1)*s));
 const a=point(edge,corner===edge.b,0),b=point(edge,corner===edge.b,width),d=point(side,corner===side.b,sideWidth),c=b.clone().add(d).sub(a);
 assert.deepEqual(hermesPavilionRing(f),[a,b,c,d,a].map(p=>p.toArray()));
});
