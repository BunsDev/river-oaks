import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeStudioScene } from '../src/studio/scene.js';
import { createSpaceScene, buildSpaceWorld } from '../src/studio/space-scene.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';

const create = createSpaceScene;
const object = (kind, patch = {}) => ({ id: kind, kind, label: kind, east: 0, north: 0, width: 2, depth: 1, height: 1, yaw: 0, elevation: 0, finish: 'oak', ...patch });
const space = (objects = [], patch = {}) => ({ schema_version: 1, document_type: 'studio-space', name: 'Room', lighting: 'daylight', bounds_m: [-12,-12,12,12], spawn: [0,-5], objects, ...patch });

test('furnished roots retain exact edit coordinates and are individually selectable', () => {
  const value = space([object('sofa', { east: 4, north: 3, elevation: .2, width: 2.6, depth: .95, height: .85, yaw: 35, finish: 'sage' })]);
  const scene = create(value), root = scene.items.get('sofa');
  assert.deepEqual(root.position.toArray(), [4,.2,-3]);
  assert.deepEqual(root.scale.toArray(), [2.6,.85,.95]);
  assert.equal(root.rotation.y, 35 * Math.PI / 180);
  assert.equal(root.userData.studioId, 'sofa');
  assert.equal(root.userData.kind, 'sofa');
  assert.equal(scene.items.get('@arrival').userData.studioId, '@arrival');
  assert.equal(scene.items.has('@environment'), false);
  assert.deepEqual(scene.world.walkSpawn, [0,-5,0]);
  assert.deepEqual(scene.world.buildings, []);
  disposeStudioScene(scene.group);
});

test('walking passes through the door gap and stops at real furniture footprints', () => {
  const value = space([
    object('floor', { width: 10, depth: 10, height: .06 }),
    object('wall', { id: 'left-wall', east: -3, width: 4, depth: .2, height: 3 }),
    object('wall', { id: 'right-wall', east: 3, width: 4, depth: .2, height: 3 }),
    object('sofa', { north: 3, width: 2.4, depth: 1, height: .9 }),
    object('rug', { north: -2, width: 3, depth: 2, height: .02 }),
    object('pendant', { north: -2, elevation: 2.4, width: .5, depth: .5, height: .5 }),
    object('cabinet', { east: 3, north: 3, elevation: 2.1, height: .7 }),
  ]);
  const { group, world } = create(value), environment = createWalkingEnvironment(world), state = createWalkingState(environment);
  assert.equal(environment.isFree(0,0), true, 'the doorway stays traversable');
  assert.equal(environment.isFree(-3,0), false, 'the wall blocks bodies');
  assert.equal(environment.isFree(0,-3), false, 'the sofa blocks bodies');
  assert.equal(environment.isFree(3,-3), true, 'overhead cabinets do not block the floor');
  assert.equal(environment.isFree(0,2), true, 'rug and ceiling pendant leave the route clear');
  assert.equal(environment.groundAt(0,2), 0);
  for (let index = 0; index < 450; index++) stepWalking(state,environment,{ forward: 1 },1/60);
  assert.ok(state.position[2] < -1, 'walking crosses the doorway');
  assert.ok(state.position[2] >= -2.151, 'walking stops before the sofa with body clearance');
  assert.equal(state.position[1], 1.68);
  disposeStudioScene(group);
});

test('rotated collision follows rendered geometry instead of its axis-aligned bounds', () => {
  const value = space([object('counter', { width: 5, depth: .5, height: 1, yaw: 45, east: 1, north: 2 })]);
  const { group, items, world } = create(value), root = items.get('counter'), environment = createWalkingEnvironment(world);
  const point = (x,z) => root.localToWorld(new THREE.Vector3(x, .5, z));
  const inside = point(.4,0), outside = point(0,2);
  assert.equal(environment.isFree(inside.x,inside.z), false);
  assert.equal(environment.isFree(outside.x,outside.z), true);
  assert.equal(world.collisionPolygons.length, 1);
  for (const [east,north] of world.collisionPolygons[0]) {
    const local = root.worldToLocal(new THREE.Vector3(east,0,-north));
    assert.ok(Math.abs(Math.abs(local.x)-.5) < 1e-7);
    assert.ok(Math.abs(Math.abs(local.z)-.5) < 1e-7);
  }
  disposeStudioScene(group);
});

test('catalog objects have furnished silhouettes inside their editable collision bounds', () => {
  const minimumParts = { wall: 3, glazing: 5, floor: 1, sofa: 10, chair: 6, table: 5, desk: 6, bed: 8, cabinet: 6, shelf: 8, counter: 6, sink: 8, toilet: 5, shower: 5, plant: 8, rug: 2, art: 5, pendant: 3, appliance: 6 };
  for (const [kind, minimum] of Object.entries(minimumParts)) {
    const { group, items } = create(space([object(kind)])), root = items.get(kind), box = new THREE.Box3();
    let meshes = 0;
    root.traverse(child => {
      if (!child.isMesh) return;
      meshes++;
      const positions = child.geometry.attributes.position;
      for (let index = 0; index < positions.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions,index);
        child.localToWorld(point);root.worldToLocal(point);box.expandByPoint(point);
      }
    });
    assert.ok(meshes >= minimum, `${kind} includes its functional parts`);
    assert.ok(box.min.x >= -.50001 && box.max.x <= .50001, `${kind} width remains in bounds`);
    assert.ok(box.min.z >= -.50001 && box.max.z <= .50001, `${kind} depth remains in bounds`);
    const bottom = kind === 'floor' ? -1 : 0, top = kind === 'floor' ? 0 : 1;
    assert.ok(box.min.y >= bottom-.00001 && box.max.y <= top+.00001, `${kind} height remains in bounds: ${box.min.y}..${box.max.y}`);
    disposeStudioScene(group);
  }
});

test('tables preserve open knee space under a solid tabletop', () => {
  const { group, items } = create(space([object('table')])), root = items.get('table');
  const castAt = y => new THREE.Raycaster(new THREE.Vector3(0,y,2),new THREE.Vector3(0,0,-1)).intersectObject(root,true);
  assert.equal(castAt(.4).length, 0, 'table legs leave knee space');
  assert.ok(castAt(.96).length > 0, 'tabletop is visible');
  disposeStudioScene(group);
});

test('basins have recessed interiors instead of solid blocks beneath their rims', () => {
  for (const kind of ['sink','toilet']) {
    const { group,items } = create(space([object(kind,{width:1,depth:1})])),root = items.get(kind);
    const hits = new THREE.Raycaster(new THREE.Vector3(0,2,.03),new THREE.Vector3(0,-1,0)).intersectObject(root,true);
    assert.ok(hits.length > 0);
    assert.ok(hits[0].point.y < (kind === 'sink' ? .6 : .45), `${kind} has a visible cavity`);
    disposeStudioScene(group);
  }
});

test('counter appliances leave a cup recess while tall appliances have full doors', () => {
  for (const [height,elevation,recess] of [[.6,1.07,true],[1.9,0,false]]) {
    const { group,items } = create(space([object('appliance',{width:1,depth:.7,height,elevation})])),root=items.get('appliance');
    const origin=root.localToWorld(new THREE.Vector3(0,.3,.7));
    const hits=new THREE.Raycaster(origin,new THREE.Vector3(0,0,-1),0,.35).intersectObject(root,true);
    assert.equal(hits.length === 0,recess);
    disposeStudioScene(group);
  }
});

test('long cabinet runs repeat human-scale doors and pulls', () => {
  const {group,items}=create(space([object('cabinet',{width:6.5,height:.9,depth:.65})]));
  const root=items.get('cabinet'),doors=root.children.filter(child=>child.name==='Door'),pulls=root.children.filter(child=>child.name==='Pull');
  assert.ok(doors.length>=10);assert.equal(doors.length,pulls.length);
  for(const door of doors)assert.ok(new THREE.Box3().setFromObject(door).getSize(new THREE.Vector3()).x<.7);
  for(const pull of pulls)assert.ok(new THREE.Box3().setFromObject(pull).getSize(new THREE.Vector3()).x<.025);
  disposeStudioScene(group);
});

test('building the walk world preserves the document and does not require a renderer', () => {
  const value = space([object('wall',{yaw:30})]), before=structuredClone(value);
  const world=buildSpaceWorld(value);world.bounds_m[0]=-50;world.walkSpawn[0]=5;world.collisionPolygons[0][0][0]=20;
  assert.deepEqual(value,before);
});

test('materials use shipped PBR surfaces and preserve finishes across appearance changes', () => {
  const { group, items, setAppearance, setWalk } = create(space([object('floor', { finish:'limestone', height: .06 })]));
  const materials = [];
  items.get('floor').traverse(child => { if(child.isMesh) materials.push(...[child.material].flat()); });
  assert.ok(materials.some(material => material.map && material.normalMap && material.roughnessMap && material.userData.sharedTextures));
  const colors = materials.map(material => material.color.getHex());
  setAppearance('dark');
  assert.deepEqual(materials.map(material => material.color.getHex()), colors, 'appearance does not rewrite authored finishes');
  setWalk(true);assert.equal(items.get('@arrival').visible,false);
  setWalk(false);assert.equal(items.get('@arrival').visible,true);
  disposeStudioScene(group);
});

test('overlapping room floors have deterministic depth priority without raising the walking surface', () => {
  const {group,items}=create(space([
    object('floor',{id:'room',width:8,depth:8,height:.025,finish:'oak'}),
    object('floor',{id:'bath',width:3,depth:3,height:.025,finish:'limestone'}),
  ]));
  const base=items.get('room').children[0],overlay=items.get('bath').children[0];
  assert.equal(base.material.polygonOffset,true);assert.equal(overlay.material.polygonOffset,true);
  assert.ok(overlay.material.polygonOffsetUnits < base.material.polygonOffsetUnits);
  assert.equal(new THREE.Box3().setFromObject(items.get('bath')).max.y,0);
  disposeStudioScene(group);
});

test('each allocated catalog material is reachable by the existing scene disposer', () => {
  for(const kind of ['floor','table','desk','shower','sink','sofa','appliance']) {
    // Three assigns increasing material IDs; brackets count allocations, including
    // any material accidentally constructed without being attached to the scene.
    const before=new THREE.MeshBasicMaterial(),{group}=create(space([object(kind,{finish:'limestone'})])),after=new THREE.MeshBasicMaterial();
    const reachable=new Set();group.traverse(child=>{for(const material of [child.material].flat().filter(Boolean))reachable.add(material);});
    assert.equal(reachable.size,after.id-before.id-1,`${kind} owns every allocated material through its graph`);
    disposeStudioScene(group);before.dispose();after.dispose();
  }
});

test('disposal releases each scene resource once without releasing shared textures', () => {
  const first = create(space([object('floor',{finish:'limestone'}),object('sofa'),object('pendant')]));
  const second = create(space([object('floor',{finish:'limestone'})]));
  const resources = new Set(), textures = new Set();
  first.group.traverse(child => {
    if(child.geometry) resources.add(child.geometry);
    for(const material of [child.material].flat().filter(Boolean)) {
      resources.add(material);
      for(const value of Object.values(material)) if(value?.isTexture) textures.add(value);
    }
  });
  let disposed = 0, disposedTextures = 0;
  for(const resource of resources) resource.addEventListener('dispose',()=>disposed++);
  for(const texture of textures) texture.addEventListener('dispose',()=>disposedTextures++);
  const host = new THREE.Group();host.add(first.group);disposeStudioScene(first.group);
  assert.equal(disposed,resources.size);
  assert.equal(disposedTextures,0);
  assert.equal(first.group.parent,null);
  assert.ok(second.items.get('floor').children.some(child => textures.has(child.material?.map)));
  disposeStudioScene(second.group);
});
