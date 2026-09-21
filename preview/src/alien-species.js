import { measureHead } from './head-fit.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ALIEN_SPECIES = [
  {name:'Nacre',skin:'#88aca9',scale:[0.145,0.215,0.132],eyes:[0.052,0.068,0.022],glow:'#a7eadc',ears:'fins'},
  {name:'Basalt',skin:'#786b78',scale:[0.157,0.184,0.145],eyes:[0.046,0.046,0.025],glow:'#efbd73',ears:'horns'},
  {name:'Verdant',skin:'#81956c',scale:[0.145,0.21,0.13],eyes:[0.068,0.081,0.022],glow:'#c6dda1',ears:'crown'},
  {name:'Vesper',skin:'#9b83ad',scale:[0.14,0.185,0.14],eyes:[0.053,0.058,0.024],glow:'#c3b8ed',ears:'swept'},
];
export function alienSpeciesFor(id) {let hash=0;for(const character of String(id))hash=(Math.imul(hash,31)+character.charCodeAt(0))>>>0;return ALIEN_SPECIES[hash%ALIEN_SPECIES.length];}
export const GREY_SPECIES={name:'Grey',skin:'#717e73',scale:[0.155,0.205,0.147],eyes:[0.050,0.043,0.026],glow:'#c1c8bd',ears:'none'};
const templates=new Map();
let pores;
function dermalNormal() {
  if(pores)return pores;
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const index=(y*size+x)*4,grain=Math.sin(x*17.13+y*93.7)*43758.54,noise=grain-Math.floor(grain);
    data[index]=128+Math.round((noise-0.5)*34);data[index+1]=128+Math.round(Math.sin(x*0.71+y*1.13)*12);data[index+2]=253;data[index+3]=255;
  }
  pores=new THREE.DataTexture(data,size,size);pores.wrapS=pores.wrapT=THREE.RepeatWrapping;pores.repeat.set(3,3);pores.needsUpdate=true;return pores;
}
function template(species) {
  if(templates.has(species.name))return templates.get(species.name);
  const skin=[],eyes=[],lights=[];
  const ellipsoid=(parts,position,scale,rotation=0)=>{const geometry=new THREE.SphereGeometry(1,28,20);geometry.scale(...scale);geometry.rotateZ(rotation);geometry.translate(...position);parts.push(geometry);};
  // One continuous surface forms the cranium, tapering jaw, brow and cheeks.
  // Facial relief is sculpted into it so close-ups never reveal stacked spheres.
  const skull=new THREE.SphereGeometry(1,64,48),vertices=skull.attributes.position;
  const gaussian=(x,y,cx,cy,sx,sy)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
  for(let i=0;i<vertices.count;i++) {
    const sy=vertices.getY(i),front=Math.max(0,vertices.getZ(i));
    const jaw=sy<0?0.48+0.52*(sy+1):1;
    const x=vertices.getX(i)*species.scale[0]*jaw,y=0.045+sy*species.scale[1];
    let z=vertices.getZ(i)*species.scale[2]*(sy<0?0.77:1)-0.012;
    if(front>0) {
      let relief=0.019*gaussian(x,y,0,-0.018,0.019,0.035);
      relief-=0.006*gaussian(x,y,0,-0.077,0.039,0.006);
      for(const side of [-1,1]) {
        relief-=0.034*gaussian(x,y,side*0.064,0.065,0.052,0.043);
        relief+=0.013*gaussian(x,y,side*0.064,0.116,0.062,0.017);
        relief+=0.008*gaussian(x,y,side*0.074,-0.005,0.038,0.04);
      }
      if(species.name==='Grey')relief+=Math.sin(y*360+x*x*120)*0.0014*gaussian(x,y,0,0.166,0.1,0.044);
      z+=relief*Math.min(1,front*3);
    }
    vertices.setXYZ(i,x,y,z);
  }
  skull.computeVertexNormals();skin.push(skull);
  for(const side of [-1,1]) {
    const cx=side*0.064,cy=0.065,rx=species.eyes[0],ry=species.eyes[1]*0.76;
    // Almond eyes sit inside the socket; a thin lid follows their edge.
    const eye=new THREE.SphereGeometry(1,40,28),p=eye.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),tilt=-side*0.16;
      const ex=x*rx,ey=y*ry*(0.72+0.28*(1-Math.abs(x)));
      p.setXYZ(i,cx+ex*Math.cos(tilt)-ey*Math.sin(tilt),cy+ex*Math.sin(tilt)+ey*Math.cos(tilt),0.113+z*0.023);
    }
    eye.computeVertexNormals();eyes.push(eye);
    const lid=Array.from({length:49},(_,i)=>{const a=i/48*Math.PI*2,x=Math.cos(a)*rx,y=Math.sin(a)*ry*(0.72+0.28*(1-Math.abs(Math.cos(a)))),tilt=-side*0.16;return new THREE.Vector3(cx+x*Math.cos(tilt)-y*Math.sin(tilt),cy+x*Math.sin(tilt)+y*Math.cos(tilt),0.113);});
    skin.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lid,true),48,0.003,6,true));
    ellipsoid(eyes,[side*0.009,-0.032,0.116],[0.0035,0.002,0.002]);
    if(species.name!=='Grey')ellipsoid(lights,[side*0.064,0.064,0.125],[0.004,0.013,0.002]);
    if(species.ears==='fins' || species.ears==='swept') {
      ellipsoid(skin,[side*0.145,0.065,-0.025],[0.07,species.ears==='fins'?0.105:0.066,0.018],side*0.5);
      for(let i=0;i<4;i++)ellipsoid(lights,[side*(0.13+i*0.014),0.02+i*0.025,0],[0.003,0.016,0.003],side*0.5);
    } else if(species.ears!=='none') {
      const horn=new THREE.ConeGeometry(species.ears==='horns'?0.034:0.022,species.ears==='horns'?0.2:0.13,16);horn.rotateZ(-side*0.4);horn.translate(side*0.125,0.23,-0.05);skin.push(horn);
    }
  }
  const mouth=Array.from({length:17},(_,i)=>{const x=(i/16-0.5)*0.055;return new THREE.Vector3(x,-0.077+0.004*(x/0.028)**2,0.078-0.004*(x/0.028)**2);});
  eyes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouth),20,0.0013,5,false));
  const result=[
    {geometry:mergeGeometries(skin),material:new THREE.MeshPhysicalMaterial({color:species.skin,normalMap:dermalNormal(),normalScale:new THREE.Vector2(0.09,0.09),roughness:0.67,metalness:0,clearcoat:0.025,sheen:0.15,sheenColor:new THREE.Color(species.skin)})},
    {geometry:mergeGeometries(eyes),material:new THREE.MeshPhysicalMaterial({color:'#080e12',roughness:0.23,clearcoat:0.65})},
    ...(lights.length?[{geometry:mergeGeometries(lights),material:new THREE.MeshStandardMaterial({color:species.glow,emissive:species.glow,emissiveIntensity:0.25,roughness:0.4})}]:[]),
  ];
  [...skin,...eyes,...lights].forEach(geometry=>geometry.dispose());templates.set(species.name,result);return result;
}
const neckGeometry=new WeakMap();
function concealHumanHead(model) {
  const head=model.getObjectByName('head');
  model.traverse(item=>{
    if(!item.isMesh)return;
    const name=item.material?.name ?? '';
    if(/^(brown|eyebrow|eyelash)/.test(name)){item.visible=false;return;}
    if(!item.isSkinnedMesh || !/^(young|middleage|old)_/.test(name))return;
    const original=item.geometry;
    if(neckGeometry.has(original)){item.geometry=neckGeometry.get(original);return;}
    const joint=item.skeleton.bones.indexOf(head),{skinIndex,skinWeight}=original.attributes;
    if(joint<0 || !skinIndex || !skinWeight)return;
    const headWeight=i=>{let sum=0;for(let k=0;k<4;k++)if(skinIndex.getComponent(i,k)===joint)sum+=skinWeight.getComponent(i,k);return sum;};
    const source=original.index?.array ?? Array.from({length:original.attributes.position.count},(_,i)=>i),indices=[];
    for(let i=0;i<source.length;i+=3)if(Math.max(...[source[i],source[i+1],source[i+2]].map(headWeight))<0.45)indices.push(source[i],source[i+1],source[i+2]);
    const geometry=original.clone();geometry.setIndex(indices);neckGeometry.set(original,geometry);item.geometry=geometry;
  });
}
export function applyAlienSpecies(avatar,id,override) {
  const species=override ?? alienSpeciesFor(id),model=avatar.model,head=model.getObjectByName('head'),fit=measureHead(avatar);
  for(const [original,material] of avatar.materials)if(/^(young|middleage|old)_/.test(original.name)){material.color.set(species.skin);material.map=null;material.normalMap=dermalNormal();material.normalScale.set(0.16,0.16);material.roughness=0.56;material.needsUpdate=true;}
  model.traverse(item=>{if(item.isMesh && /^(bob|short|ponytail|long|afro|curly)/.test(item.material?.name ?? ''))item.visible=false;});
  concealHumanHead(model);
  model.updateMatrixWorld(true);
  const group=new THREE.Group();group.name=`${species.name} anatomy`;
  group.position.copy(head.getWorldPosition(new THREE.Vector3()));group.updateMatrixWorld(true);
  for(const part of template(species)) {const mesh=new THREE.Mesh(part.geometry,part.material);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.localId=id;mesh.userData.alienSpecies=species.name;mesh.position.set(fit.skull.centre[0],fit.skull.top-0.24,fit.skull.centre[1]);group.add(mesh);}
  // Attach in a world-aligned rest frame; the skeleton supplies all subsequent
  // head motion, so no per-person follow loop or duplicate animation is needed.
  head.attach(group);model.userData.alienSpecies=species.name;
  return species;
}
