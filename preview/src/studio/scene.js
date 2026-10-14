import { isSpaceDocument } from './space-document.js';
import { createSpaceScene, buildSpaceWorld } from './space-scene.js';
import * as THREE from 'three';
import { terrainHeight } from '../geometry.js';
import { registerGroundSurfaces, groundSurfaceHeight } from '../world-surface.js';
import { assertStudioBudget } from './limits.js';
import { previewBuildingInteriorPlan } from './interior-plan.js';
import { createInteriorLevelPreview, showInteriorPreview } from './interior-scene.js';

// Viewport backdrop per resolved appearance; matches the --sage panel token.
const CLEAR_COLORS={light:'#e8eeea',dark:'#111815'};
export function studioClearColor(theme) { return CLEAR_COLORS[theme]??CLEAR_COLORS.light; }

export function frameStudioObject(camera, object) {
  const sphere=new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
  const vertical=THREE.MathUtils.degToRad(camera.fov)/2,horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
  const distance=Math.max(14,sphere.radius/Math.sin(Math.min(vertical,horizontal))*1.08);
  camera.position.copy(sphere.center).add(new THREE.Vector3(.6,.85,.7).normalize().multiplyScalar(distance));
  camera.far=Math.max(2000,distance*2+sphere.radius*3);camera.updateProjectionMatrix();
  camera.lookAt(sphere.center);camera.updateMatrixWorld(true);
  return sphere.center;
}

export function buildStudioWorld(region) {
  if(isSpaceDocument(region))return buildSpaceWorld(region);
  const [w,s,e,n] = region.bounds_m;
  const terrain = { ...region.terrain, grid_origin_m:[w,s], spacing_m:[(e-w)/(region.terrain.width-1),(n-s)/(region.terrain.height-1)] };
  return { bounds_m:[...region.bounds_m], terrain, walkSurfaceOffset:0,
    buildings:region.buildings.map(b=>({...b,center:[...b.center,terrainHeight(terrain,...b.center)]})),
    stores:[], walkSpawn:[...region.spawn,terrainHeight(terrain,...region.spawn)] };
}
export function createStudioScene(region, theme = 'light') {
  if(isSpaceDocument(region))return createSpaceScene(region,theme);
  assertStudioBudget(region);
  const group = new THREE.Group(),items = new Map(), interiorViews = new Map(), world = buildStudioWorld(region);
  const material = color => new THREE.MeshStandardMaterial({ color, roughness:.88 });
  const stone = material('#b9c8bf'), roof = material('#647b70'), bark = material('#887367'), leaves = material('#6f9976'), place = material('#c29a7c');
  const mesh = (geometry,mat,parent) => { const result=new THREE.Mesh(geometry,mat);result.castShadow=true;result.receiveShadow=true;parent.add(result);return result; };
  const root = (id,east,north) => { const result=new THREE.Group();result.name=id;result.userData.studioId=id;result.position.set(east,groundSurfaceHeight(world,east,-north),-north);group.add(result);items.set(id,result);return result; };
  const [w,s,e,n] = region.bounds_m;
  const terrain = new THREE.PlaneGeometry(e-w,n-s,region.terrain.width-1,region.terrain.height-1);
  terrain.rotateX(-Math.PI/2);terrain.translate((w+e)/2,0,-(s+n)/2);
  const vertices=terrain.attributes.position;
  for(let i=0;i<vertices.count;i++)vertices.setY(i,terrainHeight(world.terrain,vertices.getX(i),-vertices.getZ(i)));
  terrain.computeVertexNormals();const ground=mesh(terrain,material('#d3e0d3'),group);
  const surfaces=[ground];registerGroundSurfaces(world,surfaces);
  const roadMaterial=material('#b5bfba');
  for(const road of region.roads)for(let i=1;i<road.points.length;i++){
    const [ax,ay]=road.points[i-1],[bx,by]=road.points[i],distance=Math.hypot(bx-ax,by-ay),segments=Math.max(1,Math.min(64,Math.ceil(distance/2)));
    const strip=new THREE.PlaneGeometry(road.width_m,distance,1,segments);strip.rotateX(-Math.PI/2);
    strip.rotateY(-Math.atan2(bx-ax,by-ay));strip.translate((ax+bx)/2,0,-(ay+by)/2);
    const p=strip.attributes.position;for(let j=0;j<p.count;j++)p.setY(j,groundSurfaceHeight(world,p.getX(j),p.getZ(j))+.035);
    strip.computeVertexNormals();surfaces.push(mesh(strip,roadMaterial,group));
  }
  registerGroundSurfaces(world,surfaces);
  for(const b of region.buildings){
    const object=root(b.id,...b.center);object.rotation.y=b.yaw_deg*Math.PI/180;object.scale.set(b.size[0],b.size[2],b.size[1]);
    // Color the top face directly; overlapping roof slabs cause shadow acne.
    const exterior=mesh(new THREE.BoxGeometry(1,1,1),[stone,stone,roof,stone,stone,stone],object);exterior.position.y=.5;
    if(b.interior?.generation){
      const plan=previewBuildingInteriorPlan(region,b.id),preview=createInteriorLevelPreview(plan);
      preview.group.position.y=(plan.anchor.baseElevation-object.position.y)/b.size[2];
      preview.group.scale.set(1/b.size[0],1/b.size[2],1/b.size[1]);
      object.add(preview.group);interiorViews.set(b.id,{exterior,preview});
    }
  }
  for(const t of region.trees){
    const object=root(t.id,...t.position);object.scale.set(t.crown_radius_m,t.height_m,t.crown_radius_m);
    mesh(new THREE.CylinderGeometry(.085,.12,.65,8),bark,object).position.y=.325;
    const crown=mesh(new THREE.SphereGeometry(1,12,8),leaves,object);crown.scale.y=.35;crown.position.y=.65;
  }
  for(const p of region.places){
    const object=root(p.id,...p.position);mesh(new THREE.CylinderGeometry(.8,.8,.12,24),place,object).position.y=.06;
    mesh(new THREE.CylinderGeometry(.06,.06,2,8),place,object).position.y=1;
    mesh(new THREE.SphereGeometry(.28,12,8),place,object).position.y=2;
  }
  const spawn=root('@arrival',...region.spawn),spawnMat=material('#3b7962');
  mesh(new THREE.ConeGeometry(.7,1.8,4),spawnMat,spawn).position.y=.9;
  const grid=new THREE.GridHelper(Math.max(e-w,n-s),Math.max(4,Math.ceil(Math.max(e-w,n-s)/4)),'#8ca697','#b5c6b9');
  grid.position.set((w+e)/2,Math.min(...region.terrain.heights_m)+.045,-(s+n)/2);group.add(grid);
  grid.material.transparent=true;
  function setAppearance(theme) {
    const dark=theme==='dark';
    ground.material.color.set(dark?'#344b3b':'#8c9f83');
    roadMaterial.color.set(dark?'#58685a':'#a0ae9b');
    grid.material.opacity=dark?.3:.45;
  }
  setAppearance(theme);
  let activeInteriorView=null,walking=false;
  function applyInteriorView(){
    for(const [id,{exterior,preview}] of interiorViews){
      const shown=!walking&&activeInteriorView?.buildingId===id;
      exterior.visible=!shown;
      showInteriorPreview(preview,shown?activeInteriorView.levelIndex:null,shown?activeInteriorView.layers:{});
    }
  }
  group.updateMatrixWorld(true);
  return {group,items,world,setAppearance,interiorViews,
    setInteriorView(view){activeInteriorView=view;applyInteriorView();},
    setWalk(enabled){walking=enabled;applyInteriorView();}};
}
export function disposeStudioScene(group) {
  const geometries=new Set(),materials=new Set();
  group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const m of [object.material].flat().filter(Boolean))materials.add(m);});
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
  group.removeFromParent();
}
