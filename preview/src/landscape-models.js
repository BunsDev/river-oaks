import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { terrainHeight } from './geometry.js';

const loader = new GLTFLoader(), templates = new Map();
function template(name) {
  if (!templates.has(name)) templates.set(name,loader.loadAsync(`/assets/landscape/${name}.glb`).then(gltf=>{
    gltf.scene.updateMatrixWorld(true);
    return gltf.scene;
  }).catch(error=>{templates.delete(name);throw error;}));
  return templates.get(name);
}
function materialFrom(source, foliage = false) {
  const material=source.clone();
  material.transparent=false;material.depthWrite=true;material.alphaTest=foliage?0.45:0;
  material.side=foliage?THREE.DoubleSide:THREE.FrontSide;
  material.roughness=foliage?0.86:1;material.metalness=0;
  material.envMapIntensity=0.55;
  if(foliage) {material.color.set('#f4ffea');material.emissive.set('#29421a');material.emissiveIntensity=0.16;}
  return material;
}
export function matureTreePlacements(world) {
  const supports=world.vegetation?.branch_supports;
  return (supports?.length?supports:(world.trees ?? []).map(tree=>({position:tree.position,height_m:tree.height_m,radius_m:tree.crown_radius_m}))).map((tree,index)=>({
    position:[tree.position[0],terrainHeight(world.terrain,...tree.position),-tree.position[1]],
    height:Math.max(7.5,Math.min(16,tree.height_m)),
    radius:Math.max(3.1,Math.min(5.2,tree.radius_m*1.3)),
    yaw:index*2.399963,
  }));
}

// Dense authored tree models replace only the visual crowns at existing stems.
// Terrain, navigation, source vegetation records and all street fixtures stay put.
export function buildMatureTrees(world) {
  const group=new THREE.Group();group.name='Mature urban shade trees';
  const placements=matureTreePlacements(world),levels=[];
  let disposed=false;
  group.userData.observedVoxels=world.vegetation?.voxels.length ?? 0;
  group.userData.treeCount=placements.length;
  group.userData.cancelLandscapeLoad=()=>{disposed=true;};
  group.userData.ready=Promise.all(['shade-tree-high','shade-tree-mid','shade-tree-low'].map(template)).then(sources=>{
    if(disposed) return;
    const bounds=new THREE.Box3().setFromObject(sources[0]),size=bounds.getSize(new THREE.Vector3());
    // The source origin is the stem. Keep it, rather than moving it to the crown's center.
    const materials=new Map();
    const parts=sources.map(source=>{
      const out=[];source.traverse(item=>{if(item.isMesh){
        const geometry=item.geometry.clone().applyMatrix4(item.matrixWorld);
        const leafy=/leav/i.test(item.material.name);
        if(!materials.has(item.material.name)) materials.set(item.material.name,materialFrom(item.material,leafy));
        out.push({geometry,material:materials.get(item.material.name),leafy});
      }});return out;
    });
    // Spatial batches keep draw calls bounded and retain ordinary frustum culling.
    const tiles=new Map();
    placements.forEach(tree=>{const key=`${Math.floor(tree.position[0]/24)}:${Math.floor(tree.position[2]/24)}`;if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(tree);});
    const dummy=new THREE.Object3D();
    for(const trees of tiles.values()) {
      const center=new THREE.Vector3();trees.forEach(tree=>center.add(new THREE.Vector3(...tree.position)));center.divideScalar(trees.length);
      const batches=parts.map((level,index)=>level.map(part=>{
        const copies=part.leafy?3:1;
        const mesh=new THREE.InstancedMesh(part.geometry,part.material,trees.length*copies);
        trees.forEach((tree,i)=>{for(let layer=0;layer<copies;layer++){
          dummy.position.fromArray(tree.position);dummy.position.y-=bounds.min.y*tree.height/size.y;
          dummy.scale.set(tree.radius*2/Math.max(size.x,size.z),tree.height/size.y,tree.radius*2/Math.max(size.x,size.z));
          if(layer)dummy.scale.multiply(new THREE.Vector3(0.94,0.94,0.94));
          dummy.rotation.set(0,tree.yaw+layer*1.618,0);dummy.updateMatrix();mesh.setMatrixAt(i*copies+layer,dummy.matrix);
          mesh.setColorAt(i*copies+layer,new THREE.Color().setHSL(0.22+(i%5)*0.003,0.07,0.86+(i%4)*0.025));
        }});
        mesh.castShadow=index===0;mesh.receiveShadow=true;mesh.visible=index===0;
        if(part.leafy)mesh.userData.aoExclude=true;
        mesh.computeBoundingSphere();group.add(mesh);return mesh;
      }));
      levels.push({center,batches});
    }
    const host=document.querySelector('#canvas-host');if(host)host.dataset.matureTrees=String(placements.length);
  }).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  group.userData.update=position=>{for(const tile of levels){const distance=position.distanceTo(tile.center);const selected=distance<28?0:distance<75?1:2;tile.batches.forEach((meshes,index)=>meshes.forEach(mesh=>{mesh.visible=index===selected;}));}};
  return group;
}

function normalizedParts(source, variant=0) {
  const meshes=[];source.traverse(item=>{if(item.isMesh)meshes.push(item);});
  const mesh=meshes[variant%meshes.length],geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();const box=geometry.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x,-box.min.y,-center.z);geometry.scale(1/size.x,1/size.y,1/size.z);
  return {geometry,material:materialFrom(mesh.material,true)};
}

export function buildPlanterPlanting(planters) {
  const group=new THREE.Group();group.name='Clipped boxwood and fountain grasses';let disposed=false;
  group.userData.cancelLandscapeLoad=()=>{disposed=true;};
  group.userData.ready=Promise.all([template('boxwood-source'),template('fountain-grass-source')]).then(([shrub,grass])=>{
    if(disposed)return;
    const boxwood=normalizedParts(shrub),tuft=normalizedParts(grass,2);
    // Shape a dense leaf-and-twig model into a trimmed hedge with softened corners.
    const position=boxwood.geometry.attributes.position;
    for(let i=0;i<position.count;i++) {
      position.setXYZ(i,Math.max(-0.43,Math.min(0.43,position.getX(i)*1.12)),Math.min(0.88,position.getY(i)),Math.max(-0.43,Math.min(0.43,position.getZ(i)*1.12)));
    }
    position.needsUpdate=true;boxwood.geometry.computeVertexNormals();boxwood.geometry.computeBoundingSphere();
    const hedges=new THREE.InstancedMesh(boxwood.geometry,boxwood.material,planters.length*3);
    const grasses=new THREE.InstancedMesh(tuft.geometry,tuft.material,planters.length*4);
    const dummy=new THREE.Object3D();
    const place=(mesh,index,planter,a,d,height,scale,yaw=0)=>{
      const [x,y,z,angle]=planter;dummy.position.set(x+Math.cos(angle)*a+Math.sin(angle)*d,y+0.62+height,z-Math.sin(angle)*a+Math.cos(angle)*d);
      dummy.rotation.set(0,angle+yaw,0);dummy.scale.fromArray(scale);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
    };
    planters.forEach((planter,index)=>{
      for(let i=0;i<3;i++)place(hedges,index*3+i,planter,(i-1)*0.29,0,0,[0.48,0.48+(index%3)*0.025,0.57],i*Math.PI);
      for(let i=0;i<4;i++)place(grasses,index*4+i,planter,(i<2?-1:1)*0.57,(i%2?1:-1)*0.08,0,[0.56,0.73+(i%2)*0.16,0.56],i*2.4);
    });
    for(const mesh of [hedges,grasses]){mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();mesh.userData.aoExclude=true;group.add(mesh);}
    // Fine arching flower heads soften the clipped hedge silhouette.
    const curves=[];
    for(let i=0;i<7;i++) {
      const angle=i*2.39996,lean=0.16+(i%3)*0.035,top=0.75+(i%4)*0.045;
      const points=[new THREE.Vector3(0,0,0),new THREE.Vector3(Math.cos(angle)*lean*0.3,top*0.7,Math.sin(angle)*lean*0.3),new THREE.Vector3(Math.cos(angle)*lean,top,Math.sin(angle)*lean)];
      curves.push(new THREE.CatmullRomCurve3(points));
    }
    const stemMaterial=new THREE.MeshStandardMaterial({color:'#79864c',roughness:0.92});
    const plumeMaterial=new THREE.MeshStandardMaterial({color:'#c5bb91',roughness:1,side:THREE.DoubleSide});
    curves.forEach((curve,slot)=>{
      const stem=new THREE.InstancedMesh(new THREE.TubeGeometry(curve,10,0.0035,3,false),stemMaterial,planters.length*2);
      const tip=curve.getPoint(1),tangent=curve.getTangent(1);
      const plumeGeometry=new THREE.SphereGeometry(1,6,8);plumeGeometry.scale(0.018,0.10,0.018);
      plumeGeometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tangent));plumeGeometry.translate(tip.x,tip.y,tip.z);
      const plume=new THREE.InstancedMesh(plumeGeometry,plumeMaterial,planters.length*2);
      for(let index=0;index<planters.length;index++)for(let side=0;side<2;side++)for(const mesh of [stem,plume])place(mesh,index*2+side,planters[index],side?0.57:-0.57,0,0,[1,1,1],slot*0.3);
      for(const mesh of [stem,plume]){mesh.castShadow=false;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
    });
    const host=document.querySelector('#canvas-host');if(host)host.dataset.plantedBeds=String(planters.length);
  }).catch(()=>{if(!disposed)document.dispatchEvent(new CustomEvent('visualasseterror',{detail:{count:1}}));});
  return group;
}
