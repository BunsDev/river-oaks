import * as THREE from 'three';
import { terrainHeight } from './geometry.js';
import { createPedestrianNetwork } from './pedestrian-network.js';
import { STREET, streetSection, streetOffset, sidewalkOffset, crossingDistance, streetStations } from './street-profile.js';

// Batched concrete, paint and warning surfaces. The same triangles support feet
// and carriage wheels through registerGroundSurfaces; there is no visual-only curb.
export function buildDesignatedSidewalks(world,isFree=()=>true) {
  const network=createPedestrianNetwork(world),group=new THREE.Group();group.name='Palo Alto street surfaces';
  const surfaces={positions:[],colors:[],uvs:[]},paint={positions:[],colors:[],uvs:[]},warnings={positions:[],colors:[],uvs:[]};
  const color=hex=>new THREE.Color(hex).toArray();
  const concrete=color('#ccc9bf'),gutter=color('#aaa9a0'),curb=color('#dfdacd'),white=color('#f2eee0');
  const stats={profile:'palo-alto',warningPanels:0,crossingEndpoints:network.crossings.length*2,constrainedPanels:0,sidewalkWidth:STREET.sidewalkWidth,clearWidth:STREET.clearWidth};
  const add=(batch,vertices,tint,uvs=[[0,0],[1,0],[1,1],[0,1]])=>{
    for(const i of [0,2,1,0,3,2]) {batch.positions.push(vertices[i][0],vertices[i][2],-vertices[i][1]);batch.colors.push(...tint);batch.uvs.push(...uvs[i]);}
  };
  const point=(segment,along,across,t,out,side,height)=>{
    const d=side*(segment.width/2+out),x=segment.a[0]+along[0]*t+across[0]*d,y=segment.a[1]+along[1]*t+across[1]*d;
    return [x,y,terrainHeight(world.terrain,x,y)+height(x,y)];
  };
  for(const segment of network.segments) {
    if(segment.walkway)continue;
    const section=streetSection({width_m:segment.width});
    const length=Math.hypot(segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]);
    const along=[(segment.b[0]-segment.a[0])/length,(segment.b[1]-segment.a[1])/length],across=[-along[1],along[0]];
    const cuts=streetStations(segment,network.crossings);
    const edges=[0,STREET.curbWidth,STREET.warningSetback,STREET.warningSetback+STREET.warningDepth,section.furnitureWidth,STREET.rampRun,section.sidewalkWidth].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++)for(const side of [-1,1]) {
      const start=cuts[i-1],end=cuts[i];if(end-start<1e-5)continue;
      const at=(t,out)=>point(segment,along,across,t,out,side,(x,y)=>out<0?streetOffset(segment.width,segment.width/2+out,crossingDistance(network,segment.road,[x,y])):sidewalkOffset(segment.width,out,crossingDistance(network,segment.road,[x,y])));
      const middle=at((start+end)/2,0);
      if(!network.clearOfOtherRoads(middle,segment.road,.15))continue;
      // Gutter lies inside the retained curb-to-curb envelope.
      const gutterQuad=[at(start,-section.gutterWidth),at(end,-section.gutterWidth),at(end,0),at(start,0)];
      // At the gutter, out=0 is the flowline, not the top of the vertical curb.
      for(const v of gutterQuad.slice(2))v[2]=terrainHeight(world.terrain,v[0],v[1])+streetOffset(segment.width,segment.width/2,crossingDistance(network,segment.road,v));
      add(surfaces,gutterQuad,gutter);
      // Explicit order: flowline start/end, curb top end/start.
      add(surfaces,[gutterQuad[3],gutterQuad[2],at(end,0),at(start,0)],curb);
      for(let band=1;band<edges.length;band++) {
        const lo=edges[band-1],hi=edges[band],vertices=[at(start,lo),at(end,lo),at(end,hi),at(start,hi)];
        if(!vertices.every(v=>isFree(v[0],-v[1])&&network.clearOfOtherRoads(v,segment.road))) {stats.constrainedPanels++;continue;}
        add(surfaces,vertices,hi<=STREET.curbWidth?curb:concrete);
        const atCrossing=crossingDistance(network,segment.road,middle)<=STREET.crossingWidth/2+1e-7;
        if(atCrossing&&lo>=STREET.warningSetback-1e-8&&hi<=STREET.warningSetback+STREET.warningDepth+1e-8) {
          add(warnings,vertices,[1,1,1],[[start/.06,lo/.06],[end/.06,lo/.06],[end/.06,hi/.06],[start/.06,hi/.06]]);
          stats.warningPanels++;
        }
      }
    }
  }
  // Zebra bars run along the road, repeated across the walking direction.
  for(const crossing of network.crossings) {
    const along=crossing.direction,across=[-along[1],along[0]],half=streetSection({width_m:crossing.width}).asphaltHalf;
    for(let d=-half+.3;d<half;d+=.9) {
      const lo=Math.max(-half,d-.22),hi=Math.min(half,d+.22),splits=[lo,...(lo<0&&hi>0?[0]:[]),hi];
      for(let i=1;i<splits.length;i++) {
        const vertices=[[-1,splits[i-1]],[1,splits[i-1]],[1,splits[i]],[-1,splits[i]]].map(([u,v])=>{
          const x=crossing.center[0]+along[0]*u*STREET.crossingWidth/2+across[0]*v,y=crossing.center[1]+along[1]*u*STREET.crossingWidth/2+across[1]*v;
          return [x,y,terrainHeight(world.terrain,x,y)+streetOffset(crossing.width,v)];
        });
        add(paint,vertices,white);
      }
    }
  }
  const textureData=new Uint8Array(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
    const r=Math.hypot(x-15.5,y-15.5),light=r<8?.62+(15.5-y)*.025:1,offset=(y*32+x)*4;
    textureData.set([212*light,167*light,44*light,255],offset);
  }
  const tactile=new THREE.DataTexture(textureData,32,32);tactile.wrapS=tactile.wrapT=THREE.RepeatWrapping;tactile.colorSpace=THREE.SRGBColorSpace;tactile.needsUpdate=true;
  for(const [name,batch]of Object.entries({concrete:surfaces,markings:paint,warnings})) {
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uvs,2));geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:name==='concrete'?-1:-2,polygonOffsetUnits:name==='concrete'?-1:-2,...(name==='warnings'?{map:tactile,bumpMap:tactile,bumpScale:.003}:{})});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`Street ${name}`;mesh.receiveShadow=true;group.add(mesh);
    if(name==='warnings')mesh.userData.texture=tactile;
  }
  // Endpoints are authored candidates; clipped panels are not completed ramps.
  group.userData.crossings=network.crossings.length;group.userData.streetProfile=stats;return group;
}
