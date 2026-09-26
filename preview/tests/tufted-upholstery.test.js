import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitTuftedButtons } from '../src/tufted-upholstery.js';

test('seat and rotated backrest buttons contact the indented upholstery triangles',()=>{
  for(const back of [false,true]) {
    const surface=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.MeshStandardMaterial());
    surface.scale.fromArray(back?[.13,.45,.71]:[.32,.10,.69]);
    surface.position.set(-1.2,1.82,.4);surface.rotation.set(.1,.7,-.1);
    const points=[];
    for(let i=-2;i<=2;i++)for(let j=-1;j<=1;j++){
      const a=i*.28,b=j*.4,h=Math.sqrt(1-a*a-b*b);
      points.push(back?[h,b,a]:[a,h,b]);
    }
    const contacts=fitTuftedButtons(surface,points),ray=new THREE.Raycaster();
    for(const {position,normal} of contacts){
      ray.set(position.clone().addScaledVector(normal,.05),normal.clone().negate());
      const hit=ray.intersectObject(surface,false)[0];
      assert.ok(hit);assert.ok(Math.abs(hit.distance-.05)<1e-6,'button anchor is on the final cushion, including its rotation');
    }
    surface.geometry.dispose();surface.material.dispose();
  }
});
