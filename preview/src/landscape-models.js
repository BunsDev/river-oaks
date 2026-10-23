import { treeSupports } from './tree-placements.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { groundSurfaceHeight } from './world-surface.js';
import { spatialInstanceBatches } from './spatial-instances.js';
import { seeThroughNearCamera } from './near-camera-fade.js';
import { composePlanter, seedFromPosition, MODEL_SPECIES } from './planting-palette.js';
import { buildProceduralPlants } from './procedural-plants.js';
import { winstonBedPlants } from './reference-planting.js';

const loader = new GLTFLoader(), templates = new Map();
function template(name) {
  if (!templates.has(name)) templates.set(name,loader.loadAsync(`/assets/landscape/${name}.glb`).then(gltf=>{
    gltf.scene.updateMatrixWorld(true);
    return gltf.scene;
  }).catch(error=>{templates.delete(name);throw error;}));
  return templates.get(name);
}
function materialFrom(source, foliage = false, preserveTint = false) {
  const material=source.clone();
  material.transparent=false;material.depthWrite=true;material.alphaTest=foliage?0.45:0;
  material.side=foliage?THREE.DoubleSide:THREE.FrontSide;
  material.roughness=foliage?0.86:1;material.metalness=0;
  material.envMapIntensity=0.55;
  if(foliage) {
    if(!preserveTint)material.color.set('#f4ffea');
    material.emissive.set('#29421a');material.emissiveIntensity=preserveTint?0.08:0.16;
  }
  seeThroughNearCamera(material);
  return material;
}

export function matureTreePlacements(world) {
  return treeSupports(world).map((tree,index)=>({
    position:[tree.position[0],groundSurfaceHeight(world,tree.position[0],-tree.position[1]),-tree.position[1]],
    height:Math.max(7.5,Math.min(16,tree.height_m)),
    radius:tree.referencePlacement ? tree.radius_m : Math.max(3.1,Math.min(5.2,(tree.radius_m ?? tree.crown_radius_m)*1.3)),
    yaw:index*2.399963,
  }));
}

// Crowns switch detail at these distances (m). EZ Tree's authored branch/leaf
// clusters need one shell, avoiding overlapping alpha-tested overdraw passes.
export const TREE_LOD_DISTANCES = [22, 60];
export const TREE_LEAF_LAYERS = [1, 1, 1];
export function treeDetailLevel(distance) {
  return distance < TREE_LOD_DISTANCES[0] ? 0 : distance < TREE_LOD_DISTANCES[1] ? 1 : 2;
}
// Sun shadows use the silhouette LOD. Fine leaf tessellation disappears in
// the filtered shadow map; keeping the branching silhouette costs less, and
// every tree in the shadow frustum casts whatever its visible detail level.
// Three builds the beauty render list before it renders shadows, so a proxy
// shown as the light prepares its shadow and hidden after its own shadow draw
// never reaches the beauty, AO or reflection passes.
export function castShadowsFromProxies(light, proxies) {
  const updateMatrices = light.shadow.updateMatrices.bind(light.shadow);
  light.shadow.updateMatrices = (...args) => {
    const result = updateMatrices(...args), frustum = light.shadow.getFrustum();
    // Only proxies three will actually draw, so each one hides itself again.
    for (const proxy of proxies()) proxy.visible = frustum.intersectsObject(proxy);
    return result;
  };
  return { hide() { for (const proxy of proxies()) proxy.visible = false; } };
}
function hideAfterShadow() { this.visible = false; }

// Baked EZ Tree models replace only the visual crowns at existing stems.
// Terrain, navigation, source vegetation records and all street fixtures stay put.
// Authored neighborhoods (city-kit/render.js) pass their own placements.
export function buildMatureTrees(world, placements=matureTreePlacements(world)) {
  const group=new THREE.Group();group.name='Mature urban shade trees';
  const levels=[],shadowProxies=[];
  group.userData.shadowProxies=shadowProxies;
  let disposed=false;
  group.userData.observedVoxels=world.vegetation?.voxels.length ?? 0;
  group.userData.treeCount=placements.length;
  group.userData.cancelLandscapeLoad=()=>{disposed=true;};
  if(!placements.length)return group;
  group.userData.ready=Promise.all(['ez-oak-high','ez-oak-mid','ez-oak-low'].map(template)).then(sources=>{
    if(disposed) return;
    const bounds=new THREE.Box3().setFromObject(sources[0]),size=bounds.getSize(new THREE.Vector3());
    // The source origin is the stem. Keep it, rather than moving it to the crown's center.
    const materials=new Map();
    const parts=sources.map(source=>{
      const out=[];source.traverse(item=>{if(item.isMesh){
        const geometry=item.geometry.clone().applyMatrix4(item.matrixWorld);
        const leafy=/leav/i.test(item.material.name);
        if(!materials.has(item.material.name)) materials.set(item.material.name,materialFrom(item.material,leafy,true));
        out.push({geometry,material:materials.get(item.material.name),leafy});
      }});return out;
    });
    // Twelve-meter batches limit offscreen instances without making each tree
    // a separate draw call. Stem positions stay fixed.
    const tiles=new Map();
    placements.forEach(tree=>{const key=`${Math.floor(tree.position[0]/12)}:${Math.floor(tree.position[2]/12)}`;if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(tree);});
    const dummy=new THREE.Object3D();
    for(const trees of tiles.values()) {
      const center=new THREE.Vector3();trees.forEach(tree=>center.add(new THREE.Vector3(...tree.position)));center.divideScalar(trees.length);
      const instance=(level,index,shadow)=>level.map(part=>{
        const copies=part.leafy?TREE_LEAF_LAYERS[shadow?0:index]:1;
        const mesh=new THREE.InstancedMesh(part.geometry,part.material,trees.length*copies);
        trees.forEach((tree,i)=>{for(let layer=0;layer<copies;layer++){
          dummy.position.fromArray(tree.position);dummy.position.y-=bounds.min.y*tree.height/size.y;
          dummy.scale.set(tree.radius*2/Math.max(size.x,size.z),tree.height/size.y,tree.radius*2/Math.max(size.x,size.z));
          if(layer)dummy.scale.multiply(new THREE.Vector3(0.94,0.94,0.94));
          dummy.rotation.set(0,tree.yaw+layer*1.618,0);dummy.updateMatrix();mesh.setMatrixAt(i*copies+layer,dummy.matrix);
          mesh.setColorAt(i*copies+layer,new THREE.Color().setHSL(0.22+(i%5)*0.003,0.07,0.86+(i%4)*0.025));
        }});
        if(shadow){mesh.castShadow=true;mesh.receiveShadow=false;mesh.visible=false;mesh.onAfterShadow=hideAfterShadow;shadowProxies.push(mesh);}
        else {mesh.castShadow=false;mesh.receiveShadow=true;mesh.visible=index===0;}
        if(part.leafy)mesh.userData.aoExclude=true;
        mesh.computeBoundingSphere();group.add(mesh);return mesh;
      });
      const batches=parts.map((level,index)=>instance(level,index,false));
      instance(parts[2],2,true);
      levels.push({center,batches});
    }
    const host=document.querySelector('#canvas-host');if(host)host.dataset.matureTrees=String(placements.length);
  }).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  group.userData.update=position=>{for(const tile of levels){const selected=treeDetailLevel(position.distanceTo(tile.center));tile.batches.forEach((meshes,index)=>meshes.forEach(mesh=>{mesh.visible=index===selected;}));}};
  return group;
}

function normalizedParts(source, variant=0) {
  const meshes=[];source.traverse(item=>{if(item.isMesh)meshes.push(item);});
  const mesh=meshes[variant%meshes.length],geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();const box=geometry.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x,-box.min.y,-center.z);geometry.scale(1/size.x,1/size.y,1/size.z);
  return {geometry,material:materialFrom(mesh.material,true)};
}

// Each lane planter gets its own layered mix, seeded by its position so a
// reload, another browser and the tests all see the same planting.
export function planterCompositions(planters) {
  return planters.map(([x,,z])=>composePlanter(seedFromPosition(x,z)));
}
export function planterPlacements(planters) {
  const compositions=planterCompositions(planters),models={boxwood:[],'fountain-grass':[]},procedural=[];
  planters.forEach(([x,y,z,angle],index)=>compositions[index].plants.forEach(plant=>{
    const [a,d]=plant.at,origin=[x+Math.cos(angle)*a+Math.sin(angle)*d,y+0.62,z-Math.sin(angle)*a+Math.cos(angle)*d];
    (MODEL_SPECIES.has(plant.species)?models[plant.species]:procedural).push({plant,origin,yaw:angle});
  }));
  return {compositions,models,procedural};
}

export function buildPlanterPlanting(planters) {
  const group=new THREE.Group();group.name='Clipped boxwood and fountain grasses';let disposed=false;
  group.userData.cancelLandscapeLoad=()=>{disposed=true;};
  const {compositions,models,procedural}=planterPlacements(planters);
  // Authored ferns, broadleaf colour, flowers and succulents draw immediately.
  group.add(...buildProceduralPlants(procedural));
  // A dense clipped volume inside each boxwood's leaf-and-twig model.
  if(models.boxwood.length) {
    const fills=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),new THREE.MeshStandardMaterial({color:'#34492a',roughness:1}),models.boxwood.length),volume=new THREE.Object3D();
    models.boxwood.forEach(({origin:[x,y,z],yaw,plant},i)=>{volume.position.set(x,y+plant.size*.42,z);volume.rotation.set(0,yaw,0);volume.scale.set(.19*plant.spread,plant.size*.42,.24);volume.updateMatrix();fills.setMatrixAt(i,volume.matrix);});
    fills.castShadow=fills.receiveShadow=true;fills.computeBoundingSphere();
    group.add(...spatialInstanceBatches(fills));fills.dispose();
  }
  group.userData.species=[...new Set(compositions.flatMap(c=>c.plants.map(p=>p.species)))].sort();
  group.userData.ready=Promise.all([template('boxwood-source'),template('fountain-grass-source')]).then(([shrub,grass])=>{
    if(disposed)return;
    const boxwood=normalizedParts(shrub),tuft=normalizedParts(grass,2);
    // Shape a dense leaf-and-twig model into a trimmed hedge with softened corners.
    const position=boxwood.geometry.attributes.position;
    for(let i=0;i<position.count;i++) {
      position.setXYZ(i,Math.max(-0.43,Math.min(0.43,position.getX(i)*1.12)),Math.min(0.88,position.getY(i)),Math.max(-0.43,Math.min(0.43,position.getZ(i)*1.12)));
    }
    position.needsUpdate=true;boxwood.geometry.computeVertexNormals();boxwood.geometry.computeBoundingSphere();
    const dummy=new THREE.Object3D(),color=new THREE.Color();
    const place=(mesh,index,{origin,yaw},scale,turn,hsl)=>{
      dummy.position.fromArray(origin);dummy.rotation.set(0,yaw+turn,0);dummy.scale.fromArray(scale);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
      if(hsl)mesh.setColorAt(index,color.setHSL(...hsl));
    };
    const hedgeRecords=models.boxwood,grassRecords=models['fountain-grass'];
    const meshes=[];
    if(hedgeRecords.length) {
      const hedges=new THREE.InstancedMesh(boxwood.geometry,boxwood.material,hedgeRecords.length);
      // Clipped hedges stay square to their planter: only half turns.
      hedgeRecords.forEach((record,i)=>{const {plant}=record;place(hedges,i,record,[0.48*plant.spread,plant.size,0.57],plant.yaw>Math.PI?Math.PI:0,plant.color);});
      meshes.push(hedges);
    }
    if(grassRecords.length) {
      const grasses=new THREE.InstancedMesh(tuft.geometry,tuft.material,grassRecords.length*2);
      grassRecords.forEach((record,i)=>{const {plant}=record;for(let side=0;side<2;side++){
        const offset=(side?1:-1)*0.08,[x,y,z]=record.origin;
        place(grasses,i*2+side,{origin:[x+Math.sin(record.yaw)*offset,y,z+Math.cos(record.yaw)*offset],yaw:record.yaw},[0.56*plant.spread,plant.size*(side?1:0.86),0.56*plant.spread],plant.yaw+side*2.4,plant.color);
      }});
      meshes.push(grasses);
    }
    for(const mesh of meshes){
      mesh.castShadow=mesh.receiveShadow=true;mesh.userData.aoExclude=true;
      group.add(...spatialInstanceBatches(mesh));mesh.dispose();
    }
    // Fine arching flower heads rise only from the fountain grass.
    const stemMaterial=new THREE.MeshStandardMaterial({color:'#79864c',roughness:0.92});
    const plumeMaterial=new THREE.MeshStandardMaterial({color:'#c5bb91',roughness:1,side:THREE.DoubleSide});
    if(grassRecords.length)for(let slot=0;slot<7;slot++) {
      const angle=slot*2.39996,lean=0.16+(slot%3)*0.035,top=0.75+(slot%4)*0.045;
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(Math.cos(angle)*lean*0.3,top*0.7,Math.sin(angle)*lean*0.3),new THREE.Vector3(Math.cos(angle)*lean,top,Math.sin(angle)*lean)]);
      const stem=new THREE.InstancedMesh(new THREE.TubeGeometry(curve,10,0.0035,3,false),stemMaterial,grassRecords.length);
      const tip=curve.getPoint(1),tangent=curve.getTangent(1);
      const plumeGeometry=new THREE.SphereGeometry(1,6,8);plumeGeometry.scale(0.018,0.10,0.018);
      plumeGeometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tangent));plumeGeometry.translate(tip.x,tip.y,tip.z);
      const plume=new THREE.InstancedMesh(plumeGeometry,plumeMaterial,grassRecords.length);
      grassRecords.forEach((record,i)=>{const s=record.plant.size/0.82;for(const mesh of [stem,plume])place(mesh,i,record,[s,s,s],slot*0.3+record.plant.yaw);});
      for(const mesh of [stem,plume]){mesh.castShadow=false;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
    }
    const host=document.querySelector('#canvas-host');if(host)host.dataset.plantedBeds=String(planters.length);
  }).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  return group;
}

// Reuses the shipped CC0 boxwood model and authored procedural ground cover;
// no new asset acquisition. Each instance follows the same ground support as
// feet, rather than flattening the DEM.
export function buildReferenceBedPlanting(bed, world) {
  const group=new THREE.Group();group.name='Harry Winston reference planting';let disposed=false;
  group.userData.cancelLandscapeLoad=()=>{disposed=true;};
  // Foxtail fern, mounded fern and coleus from the photograph, seeded per bed.
  group.add(...buildProceduralPlants(winstonBedPlants(bed).map(({position:[x,n],plant})=>({plant,origin:[x,groundSurfaceHeight(world,x,-n)+.03,-n],yaw:0}))));
  // Dense low foliage volume beneath the scanned leaf-and-twig detail.
  const fillGeometry=new THREE.IcosahedronGeometry(1,2),fillMaterial=new THREE.MeshStandardMaterial({color:'#344a28',roughness:1});
  const fills=new THREE.InstancedMesh(fillGeometry,fillMaterial,bed.shrubs.length),volume=new THREE.Object3D();
  bed.shrubs.forEach(({position:[x,n],scale},i)=>{
    volume.position.set(x,groundSurfaceHeight(world,x,-n)+.28,-n);volume.scale.set(scale[0]*.48,.27,scale[2]*.48);volume.updateMatrix();fills.setMatrixAt(i,volume.matrix);
  });fills.castShadow=fills.receiveShadow=true;group.add(fills);
  group.userData.ready=template('boxwood-source').then(shrub=>{
    if(disposed)return;
    const source=normalizedParts(shrub,0);
    const records=bed.shrubs.flatMap(record =>
      Array.from({length:5},(_,i)=>({...record,position:[record.position[0]+Math.cos(i*2.4)*.13,record.position[1]+Math.sin(i*2.4)*.13]})));
    const mesh=new THREE.InstancedMesh(source.geometry,source.material,records.length),dummy=new THREE.Object3D();
    records.forEach(({position:[x,n],scale},i)=>{
      dummy.position.set(x,groundSurfaceHeight(world,x,-n)+.055,-n);dummy.rotation.set(0,i*2.399963,0);dummy.scale.fromArray(scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
  }).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  return group;
}
