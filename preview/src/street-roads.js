import * as THREE from 'three';
import { terrainHeight } from './geometry.js';
import { physicalSurface, paverSurface } from './materials.js';
import { createPedestrianNetwork } from './pedestrian-network.js';
import { STREET, isWalkway, streetOffset, streetSection, streetStations, streetPoint, crossingDistance } from './street-profile.js';

export function buildRoads(world) {
  const network = createPedestrianNetwork(world);
  const group = new THREE.Group(); group.name = 'Roads and walkways';
  const asphalt = physicalSurface('asphalt', { tileSize: 7, normalScale: new THREE.Vector2(0.22, 0.22), color: '#62696b', roughness: 0.9, side: THREE.DoubleSide, variation: 0.3 });
  for (const walkway of [false, true]) {
    const positions = [], uvs = [];
    for (const segment of network.segments.filter(s => s.walkway === walkway)) {
      const road={id:segment.road,width_m:segment.width};
      const half = road.width_m / 2, inner = streetSection(road).asphaltHalf;
      const offsets = walkway ? [-half, half] : [-half, -inner, 0, inner, half];
      const cuts=streetStations(segment,network.crossings);
      for(let step=1;step<cuts.length;step++)for(let band=1;band<offsets.length;band++) {
        const vertices=[[cuts[step-1],offsets[band-1]],[cuts[step],offsets[band-1]],[cuts[step],offsets[band]],[cuts[step-1],offsets[band]]];
        for(const index of [0,2,1,0,3,2]) {
          const [t,d]=vertices[index],[x,y]=streetPoint(segment,t,d);
          positions.push(x,terrainHeight(world.terrain,x,y)+(walkway ? STREET.plazaOffset + 0.004 : streetOffset(road.width_m,d,crossingDistance(network,road.id,[x,y]))),-y);uvs.push(x,-y);
        }
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,walkway?paverSurface({side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}):asphalt);
    mesh.receiveShadow=true;group.add(mesh);if(!walkway)group.userData.asphalt=mesh;
  }
  // Dashed centre markings make the two independent travel lanes legible.
  const paint=[];
  for(const road of world.roads.filter(r=>!isWalkway(r)&&r.width_m>=8.4))for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;
    const ux=(b[0]-a[0])/length,uy=(b[1]-a[1])/length;
    for(let s=3;s+2<length-3;s+=5){
      const center=[a[0]+ux*(s+1),a[1]+uy*(s+1)];
      if(crossingDistance(network,road.id,center)<4||!network.clearOfOtherRoads(center,road.id,1))continue;
      const corners=[[s,-.055],[s+2,-.055],[s+2,.055],[s,.055]];
      for(const k of [0,2,1,0,3,2]){const [along,across]=corners[k],x=a[0]+ux*along-uy*across,y=a[1]+uy*along+ux*across;paint.push(x,terrainHeight(world.terrain,x,y)+streetOffset(road.width_m,across)+.008,-y);}
    }
  }
  const paintGeometry=new THREE.BufferGeometry();paintGeometry.setAttribute('position',new THREE.Float32BufferAttribute(paint,3));paintGeometry.computeVertexNormals();
  const markings=new THREE.Mesh(paintGeometry,new THREE.MeshStandardMaterial({color:'#e2c976',roughness:.95,side:THREE.DoubleSide}));markings.name='Two-way lane centre markings';markings.receiveShadow=true;group.add(markings);
  return group;
}
