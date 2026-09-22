import * as THREE from 'three';
import { terrainHeight } from './geometry.js';
import { createPedestrianNetwork } from './pedestrian-network.js';

export function buildDesignatedSidewalks(world,isFree) {
  const network=createPedestrianNetwork(world),group=new THREE.Group();group.name='Designated sidewalks and crossings';
  const positions=[],colors=[];
  const add=(center,along,across,length,width,color,height)=>{
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>[center[0]+along[0]*u*length/2+across[0]*v*width/2,center[1]+along[1]*u*length/2+across[1]*v*width/2]);
    for(const index of [0,2,1,0,3,2]){const [x,y]=corners[index];positions.push(x,terrainHeight(world.terrain,x,y)+height,-y);colors.push(...color);}
  };
  for(const segment of network.segments) {
    if(segment.width<5)continue;
    const length=Math.hypot(segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]),along=[(segment.b[0]-segment.a[0])/length,(segment.b[1]-segment.a[1])/length],across=[-along[1],along[0]],steps=Math.ceil(length/1.4);
    for(let i=0;i<steps;i++)for(const side of [-1,1]) {
      const t=(i+0.5)/steps,center=[segment.a[0]+along[0]*length*t+across[0]*side*(segment.width/2+1.65),segment.a[1]+along[1]*length*t+across[1]*side*(segment.width/2+1.65)];
      if(!isFree(center[0],-center[1]) || network.classify(center)==='road')continue;
      // A pale stone walking band between the existing kerb and storefront.
      add(center,along,across,length/steps-0.025,2.4,[0.59,0.58,0.54],0.258);
      for(const edge of [-1,1])add([center[0]+across[0]*edge*1.17,center[1]+across[1]*edge*1.17],along,across,length/steps,0.055,[0.79,0.74,0.61],0.262);
    }
  }
  for(const crossing of network.crossings) {
    const along=crossing.direction,across=[-along[1],along[0]];
    for(let stripe=-2;stripe<=2;stripe++)add([crossing.center[0]+along[0]*stripe*0.82,crossing.center[1]+along[1]*stripe*0.82],along,across,0.44,crossing.width,[0.84,0.84,0.75],0.263);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.94,side:THREE.DoubleSide}));mesh.receiveShadow=true;group.add(mesh);group.userData.crossings=network.crossings.length;return group;
}
