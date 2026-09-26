import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBreakableGlass} from '../src/breakable-glass.js';

function facade(count=2) {
  const root=new THREE.Group(),mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial(),count);
  mesh.userData.breakableGlass=true;root.add(mesh);
  for(let i=0;i<count;i++)mesh.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(i*3,1.5,0),new THREE.Quaternion(),new THREE.Vector3(2,3,1)));
  root.updateMatrixWorld(true);return {root,mesh};
}
const projectile={velocity:[0,0,-4.5],mass:18,radius:.28,height:1};
const matrix=(mesh,index)=>{const value=new THREE.Matrix4();mesh.getMatrixAt(index,value);return value;};

test('a swept throw breaks only the struck pane and restores its exact instance matrix after twenty seconds',()=>{
  const {root,mesh}=facade(),original=matrix(mesh,0),neighbor=matrix(mesh,1),glass=createBreakableGlass({groundAt:()=>0});
  glass.setWorld(root);
  const hit=glass.sweep([0,1,2],[0,1,-2],projectile);
  assert.ok(hit);assert.equal(glass.inspect().broken,1);
  assert.equal(matrix(mesh,0).determinant(),0);assert.deepEqual(matrix(mesh,1).elements,neighbor.elements);
  glass.update(19.99);assert.equal(glass.inspect().broken,1);
  glass.update(.01);assert.equal(glass.inspect().broken,0);assert.deepEqual(matrix(mesh,0).elements,original.elements);
  glass.dispose();
});

test('frame misses and low-energy or tangential motion do not break glass',()=>{
  const {root}=facade(),glass=createBreakableGlass();glass.setWorld(root);
  assert.equal(glass.sweep([1.5,1,2],[1.5,1,-2],projectile),null);
  assert.equal(glass.sweep([0,5,2],[0,5,-2],projectile),null);
  assert.equal(glass.sweep([0,1,2],[0,1,-2],{...projectile,velocity:[0,0,-.1]}),null);
  assert.equal(glass.sweep([0,1,2],[0,1,-2],{...projectile,velocity:[4.5,0,0]}),null);
  root.visible=false;assert.equal(glass.sweep([0,1,2],[0,1,-2],projectile),null);
  assert.equal(glass.inspect().broken,0);glass.dispose();
});

test('rotated panes and moving door leaves use their rendered world transforms',()=>{
  const {root,mesh}=facade(1);root.position.set(12,2,-8);root.rotation.y=Math.PI/2;
  const door=new THREE.Mesh(new THREE.PlaneGeometry(2,3),new THREE.MeshStandardMaterial());door.userData.breakableGlass=true;door.userData.breakableGlassDynamic=true;
  door.position.set(0,1.5,4);root.add(door);root.updateMatrixWorld(true);
  const glass=createBreakableGlass();glass.setWorld(root);
  assert.ok(glass.sweep([14,3,-8],[10,3,-8],{...projectile,velocity:[-4.5,0,0]}));
  door.position.z=8;root.updateMatrixWorld(true);
  assert.equal(glass.sweep([18,3,-8],[14,3,-8],{...projectile,velocity:[-4.5,0,0]}),null);
  assert.ok(glass.sweep([22,3,-8],[18,3,-8],{...projectile,velocity:[-4.5,0,0]}));
  assert.equal(door.visible,false);glass.update(20);assert.equal(door.visible,true);
  assert.notEqual(matrix(mesh,0).determinant(),0);glass.dispose();
});

test('debris stays within a shared polygon budget and clears without touching source assets',()=>{
  const {root,mesh}=facade(20),glass=createBreakableGlass({maxShards:64,groundAt:()=>0});glass.setWorld(root);
  const geometry=glass.object.geometry,material=glass.object.material;
  let sourceDisposed=false,effectDisposed=false;mesh.geometry.addEventListener('dispose',()=>sourceDisposed=true);geometry.addEventListener('dispose',()=>effectDisposed=true);
  for(let i=0;i<20;i++)glass.sweep([i*3,1,2],[i*3,1,-2],projectile);
  const stats=glass.inspect();assert.equal(stats.broken,20);assert.ok(stats.shards>0&&stats.shards<=64);assert.ok(stats.triangles<=64);
  assert.equal(glass.object.geometry,geometry);assert.equal(glass.object.material,material);
  glass.update(4);assert.equal(glass.inspect().shards,0);assert.equal(glass.object.visible,false);
  glass.dispose();assert.equal(sourceDisposed,false);assert.equal(effectDisposed,true);
  for(let i=0;i<20;i++)assert.notEqual(matrix(mesh,i).determinant(),0);
});

test('falling debris keeps every triangle vertex above its ground support',()=>{
  const {root}=facade(1),groundAt=(x,z)=>z<0?.16:0;
  const glass=createBreakableGlass({groundAt});glass.setWorld(root);
  glass.sweep([0,1,2],[0,1,-2],projectile);
  const transform=new THREE.Matrix4(),point=new THREE.Vector3();
  for(let frame=0;frame<220;frame++) {
    glass.update(1/60);
    for(let i=0;i<glass.object.count;i++) {
      glass.object.getMatrixAt(i,transform);
      for(const [x,y]of [[0,0],[1,0],[0,1]]) {
        point.set(x,y,0).applyMatrix4(transform);
        assert.ok(point.y>=groundAt(point.x,point.z)-1e-6,`fragment ${i} penetrates ground at frame ${frame}: ${point.y}`);
      }
    }
  }
  glass.dispose();
});

test('the recessed-pane corridor never lets a slow prop pass through intact glass',()=>{
  const {root}=facade(1),glass=createBreakableGlass();glass.setWorld(root);
  assert.equal(glass.trace([0,1,1],[0,1,.5],projectile).opening,true);
  const slow=glass.trace([0,1,.5],[0,1,0],{...projectile,velocity:[0,0,-.1]});
  assert.equal(slow.hit,null);assert.equal(slow.blocked,true);
  assert.ok(glass.trace([0,1,.5],[0,1,0],projectile).hit);
  assert.equal(glass.trace([0,1,.5],[0,1,0],{...projectile,velocity:[0,0,-.1]}).blocked,false);
  assert.equal(glass.trace([1.5,1,1],[1.5,1,.5],projectile).opening,false);
  glass.dispose();
});
