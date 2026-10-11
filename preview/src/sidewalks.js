import * as THREE from 'three';
import { terrainHeight } from './geometry.js';
import { createPedestrianNetwork } from './pedestrian-network.js';
import { paverSurface } from './materials.js';
import { STREET, streetSection, streetOffset, sidewalkOffset, crossingDistance, streetStations, streetPoint } from './street-profile.js';
import { streetCorners, cornerCurbDistance, cornerArc, cornerMouth } from './street-corners.js';

// Batched herringbone brick, stone curb, paint and warning surfaces. The same triangles support feet
// and carriage wheels through registerGroundSurfaces; there is no visual-only curb.
export function buildDesignatedSidewalks(world,isFree=()=>true) {
  const network=createPedestrianNetwork(world),group=new THREE.Group();group.name='Palo Alto street surfaces';
  const surfaces={positions:[],colors:[],uvs:[]},pavers={positions:[],colors:[],uvs:[]},paint={positions:[],colors:[],uvs:[]},warnings={positions:[],colors:[],uvs:[]};
  const color=hex=>new THREE.Color(hex).toArray();
  const concrete=color('#ccc9bf'),gutter=color('#aaa9a0'),curb=color('#dfdacd'),white=color('#f2eee0');
  const corners=streetCorners(network.segments,network.crossings),trims=new Map();
  for(const corner of corners)for(const arm of corner.arms)for(const trim of arm.trims) {
    if(!trims.has(trim.segment))trims.set(trim.segment,[]);
    trims.get(trim.segment).push(trim);
  }
  const stats={profile:'palo-alto',warningPanels:0,crossingEndpoints:network.crossings.length*2,constrainedPanels:0,corners:corners.length,sidewalkWidth:STREET.sidewalkWidth,clearWidth:STREET.clearWidth};
  const add=(batch,vertices,tint,uvs=[[0,0],[1,0],[1,1],[0,1]])=>{
    for(const i of [0,2,1,0,3,2]) {batch.positions.push(vertices[i][0],vertices[i][2],-vertices[i][1]);batch.colors.push(...tint);batch.uvs.push(...uvs[i]);}
  };
  // One curb return per corner: a gutter apron in the mouth, a curved curb
  // face and top, and one paving field graded like the sidewalks it joins.
  // Its courses continue the through street's, as on the reference corners.
  function addCorner(corner) {
    const [first,second]=corner.arms,ground=(p,h)=>[p[0],p[1],terrainHeight(world.terrain,p[0],p[1])+h];
    const nearest=p=>corner.arms.reduce((best,arm)=>{const d=(p[0]-corner.node[0])*arm.normal[0]+(p[1]-corner.node[1])*arm.normal[1]-arm.half;return d<best.d?{arm,d}:best;},{arm:first,d:Infinity}).arm;
    const walk=(p,out)=>{const arm=nearest(p);return sidewalkOffset(arm.segment.width,Math.min(STREET.sidewalkWidth,Math.max(0,out)),crossingDistance(network,arm.segment.road,p));};
    const road=(p,lateral)=>{const arm=nearest(p);return streetOffset(arm.segment.width,arm.half-lateral,crossingDistance(network,arm.segment.road,p));};
    const {gutter:gutterWidth,edge}=cornerMouth(corner),arc=cornerArc(corner),inner=cornerArc(corner,STREET.curbWidth);
    for(let i=1;i<arc.length;i++) {
      // Explicit order: asphalt edge start/end, flowline end/start.
      const a=ground(arc[i-1],road(arc[i-1],0)),b=ground(arc[i],road(arc[i],0));
      add(surfaces,[ground(edge[i-1],road(edge[i-1],gutterWidth)),ground(edge[i],road(edge[i],gutterWidth)),b,a],gutter);
      add(surfaces,[a,b,ground(arc[i],walk(arc[i],0)),ground(arc[i-1],walk(arc[i-1],0))],curb);
      add(surfaces,[ground(arc[i-1],walk(arc[i-1],0)),ground(arc[i],walk(arc[i],0)),ground(inner[i],walk(inner[i],STREET.curbWidth)),ground(inner[i-1],walk(inner[i-1],STREET.curbWidth))],curb);
    }
    // Along each arm, positions come from the same streetPoint the strips use,
    // so the shared seam and straight curb edges are identical even where the
    // far end of a segment is mitred.
    const strip=(arm,station,lateral)=>{
      const trim=arm.trims.find(item=>station-(arm.seam-item.seam)<=item.length+1e-7)??arm.trims.at(-1),local=station-(arm.seam-trim.seam);
      return streetPoint(trim.segment,trim.end?trim.length-local:local,trim.side*lateral);
    };
    const through=corner.arms.find(arm=>network.segments.some(s=>s!==arm.segment&&s.road===arm.segment.road&&!s.walkway&&[s.a,s.b].some(p=>p[0]===corner.node[0]&&p[1]===corner.node[1])))??first;
    const direction=[through.segment.b[0]-through.segment.a[0],through.segment.b[1]-through.segment.a[1]],span=Math.hypot(...direction);
    const planar=p=>[((p[0]-through.segment.a[0])*direction[0]+(p[1]-through.segment.a[1])*direction[1])/span,(p[0]-corner.node[0])*through.normal[0]+(p[1]-corner.node[1])*through.normal[1]-through.half];
    // On the through street's seam the UVs are the strip's own [station, out].
    const seamUv=(arm,lateral)=>arm!==through?null:(()=>{const trim=arm.trims.find(item=>item.seam<=item.length+1e-7)??arm.trims.at(-1);return [trim.end?trim.length-trim.seam:trim.seam,lateral];})();
    // Paving boundary, anticlockwise from the first seam at the curb: inset
    // straight curb, inset return, second arm, second seam, back of walk, first seam.
    const outline=[],cw=STREET.curbWidth,sw=STREET.sidewalkWidth,mark=(p,out,uv=null)=>outline.push({p,out,uv});
    const run=(arm,from,to,lateral)=>{const steps=Math.max(1,Math.ceil(Math.abs(to-from)/0.5));for(let k=0;k<steps;k++)mark(strip(arm,from+(to-from)*k/steps,arm.half+lateral),lateral);};
    // Seam vertices sit on the strips' own band edges, so both sides
    // interpolate the ramp and walk grades between the same points.
    const seam=(arm,from,to)=>{
      const lats=bandEdges(arm.segment.width).filter(l=>l>=Math.min(from,to)-1e-9&&l<Math.max(from,to)+1e-9);
      for(const l of (from<to?lats:lats.reverse()).filter(l=>Math.abs(l-to)>1e-9))mark(strip(arm,arm.seam,arm.half+l),l,seamUv(arm,l));
    };
    run(first,first.seam,first.tangent,cw);
    for(const p of inner)mark(p,cw);
    run(second,second.tangent,second.seam,cw);
    seam(second,cw,sw);
    mark(strip(second,second.seam,second.half+sw),sw);
    mark(corner.back,sw);
    seam(first,sw,cw);
    const boundary=[];
    outline.forEach((item,i)=>{
      const next=outline[(i+1)%outline.length],steps=Math.max(1,Math.ceil(Math.hypot(next.p[0]-item.p[0],next.p[1]-item.p[1])/0.5));
      for(let k=0;k<steps;k++){const f=k/steps;boundary.push(k?{p:[item.p[0]+(next.p[0]-item.p[0])*f,item.p[1]+(next.p[1]-item.p[1])*f],out:item.out+(next.out-item.out)*f,uv:null}:item);}
    });
    // Fan of rings about the return's centre; interior heights follow the
    // distance to the curb, boundary heights the strips' own lateral grade.
    const rings=[0,.3,.55,.75,.9,1],c=corner.center;
    const vertex=(item,f)=>{
      const p=[c[0]+(item.p[0]-c[0])*f,c[1]+(item.p[1]-c[1])*f];
      const uv=f===1&&item.uv?item.uv:planar(p);
      return {p,uv,ground:ground(p,walk(p,f===1?item.out:cornerCurbDistance(corner,p)))};
    };
    for(let i=0;i<boundary.length;i++)for(let r=1;r<rings.length;r++) {
      const a=boundary[i],b=boundary[(i+1)%boundary.length];
      const cell=[vertex(a,rings[r-1]),vertex(b,rings[r-1]),vertex(b,rings[r]),vertex(a,rings[r])];
      if(!cell.every(v=>isFree(v.p[0],-v.p[1]))){stats.constrainedPanels++;continue;}
      add(pavers,cell.map(v=>v.ground),[1,1,1],cell.map(v=>v.uv));
    }
  }
  // Lateral band edges from the curb face: curb, warning strip, furniture
  // zone, ramp run and back of walk.
  function bandEdges(width) {
    const section=streetSection({width_m:width});
    return [0,STREET.curbWidth,STREET.warningSetback,STREET.warningSetback+STREET.warningDepth,section.furnitureWidth,STREET.rampRun,section.sidewalkWidth].sort((a,b)=>a-b);
  }
    const point=(segment,t,out,side,height)=>{
    const d=side*(segment.width/2+out),[x,y]=streetPoint(segment,t,d);
    return [x,y,terrainHeight(world.terrain,x,y)+height(x,y)];
  };
  for(const segment of network.segments) {
    if(segment.walkway)continue;
    const section=streetSection({width_m:segment.width});
    const length=Math.hypot(segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]),segmentTrims=trims.get(segment)??[];
    const cuts=[...new Set([...streetStations(segment,network.crossings),...segmentTrims.flatMap(trim=>[trim.tangent,trim.seam].filter(s=>s>0&&s<length).map(s=>trim.end?length-s:s))])].sort((a,b)=>a-b);
    const edges=bandEdges(segment.width);
    for(let i=1;i<cuts.length;i++)for(const side of [-1,1]) {
      const start=cuts[i-1],end=cuts[i];if(end-start<1e-5)continue;
      // Inside a corner this side yields to the curb return before its tangent,
      // keeps only gutter and curb up to the seam, and leaves the walk to the
      // corner paving.
      const trim=segmentTrims.find(item=>item.side===side&&(item.end?length-start:end)<=item.seam+1e-7);
      const reach=trim&&(trim.end?length-start:end);
      const at=(t,out)=>point(segment,t,out,side,(x,y)=>out<0?streetOffset(segment.width,segment.width/2+out,crossingDistance(network,segment.road,[x,y])):sidewalkOffset(segment.width,out,crossingDistance(network,segment.road,[x,y])));
      if(trim&&reach<=trim.tangent+1e-7)continue;
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
        if(trim&&hi>STREET.curbWidth+1e-8)break;
        if(!vertices.every(v=>isFree(v[0],-v[1])&&network.clearOfOtherRoads(v,segment.road))) {stats.constrainedPanels++;continue;}
        // The curb band stays pale stone; the walking surface is brick laid in
        // courses that follow the street, with UVs measured in metres.
        if(hi<=STREET.curbWidth)add(surfaces,vertices,curb);
        else add(pavers,vertices,[1,1,1],[[start,lo],[end,lo],[end,hi],[start,hi]]);
        const atCrossing=crossingDistance(network,segment.road,middle)<=STREET.crossingWidth/2+1e-7;
        if(atCrossing&&lo>=STREET.warningSetback-1e-8&&hi<=STREET.warningSetback+STREET.warningDepth+1e-8) {
          add(warnings,vertices,[1,1,1],[[start/.06,lo/.06],[end/.06,lo/.06],[end/.06,hi/.06],[start/.06,hi/.06]]);
          stats.warningPanels++;
        }
      }
    }
  }
  for(const corner of corners)addCorner(corner);
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
  for(const [name,batch]of Object.entries({concrete:surfaces,pavers,markings:paint,warnings})) {
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uvs,2));geometry.computeVertexNormals();
    const material=name==='pavers'?paverSurface({side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:name==='concrete'?-1:-2,polygonOffsetUnits:name==='concrete'?-1:-2,...(name==='warnings'?{map:tactile,bumpMap:tactile,bumpScale:.003}:{})});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`Street ${name}`;mesh.receiveShadow=true;group.add(mesh);
    if(name==='warnings')mesh.userData.texture=tactile;
  }
  // Endpoints are authored candidates; clipped panels are not completed ramps.
  group.userData.crossings=network.crossings.length;group.userData.streetProfile=stats;return group;
}
