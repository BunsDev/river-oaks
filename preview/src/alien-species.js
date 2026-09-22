// Invaders only: residents are the peoples of Oz (oz-folk.js). Restored for the invasion scenario.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ALIEN_SPECIES = [
  {name:'Nacre',skin:'#88aca9',scale:[0.145,0.215,0.132],eyes:[0.052,0.068,0.022],glow:'#a7eadc',ears:'fins'},
  {name:'Basalt',skin:'#786b78',scale:[0.157,0.184,0.145],eyes:[0.046,0.046,0.025],glow:'#efbd73',ears:'horns'},
  {name:'Verdant',skin:'#81956c',scale:[0.145,0.21,0.13],eyes:[0.068,0.081,0.022],glow:'#c6dda1',ears:'crown'},
  {name:'Vesper',skin:'#9b83ad',scale:[0.14,0.185,0.14],eyes:[0.053,0.058,0.024],glow:'#c3b8ed',ears:'swept'},
];
export function alienSpeciesFor(id) {let hash=0;for(const character of String(id))hash=(Math.imul(hash,31)+character.charCodeAt(0))>>>0;return ALIEN_SPECIES[hash%ALIEN_SPECIES.length];}
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
  ellipsoid(skin,[0,0.055,-0.008],species.scale);
  // Brow ridges, cheek planes, fine nostrils and a small oral opening preserve
  // facial anatomy instead of reading as an unlit mask or a giant toy head.
  for(const side of [-1,1]) {
    ellipsoid(eyes,[side*0.074,0.072,0.113],species.eyes,-side*0.2);
    ellipsoid(skin,[side*0.082,0.132,0.098],[0.075,0.017,0.04],-side*0.2);
    ellipsoid(skin,[side*0.089,-0.005,0.096],[0.055,0.045,0.036]);
    ellipsoid(eyes,[side*0.022,-0.031,0.123],[0.009,0.007,0.007]);
    ellipsoid(lights,[side*0.071,0.07,0.134],[0.009,0.023,0.004]);
    if(species.ears==='fins' || species.ears==='swept') {
      ellipsoid(skin,[side*0.164,0.065,-0.025],[0.072,species.ears==='fins'?0.105:0.066,0.018],side*0.5);
      for(let i=0;i<4;i++)ellipsoid(lights,[side*(0.13+i*0.014),0.02+i*0.025,0],[0.004,0.016,0.003],side*0.5);
    } else {
      const horn=new THREE.ConeGeometry(species.ears==='horns'?0.034:0.022,species.ears==='horns'?0.2:0.13,12);horn.rotateZ(-side*0.4);horn.translate(side*0.125,0.23,-0.05);skin.push(horn);
    }
  }
  ellipsoid(eyes,[0,-0.082,0.114],[0.042,0.004,0.006]);
  const result=[
    {geometry:mergeGeometries(skin),material:new THREE.MeshPhysicalMaterial({color:species.skin,normalMap:dermalNormal(),normalScale:new THREE.Vector2(0.24,0.24),roughness:0.5,metalness:0.025,clearcoat:0.12,sheen:0.25,sheenColor:new THREE.Color(species.skin)})},
    {geometry:mergeGeometries(eyes),material:new THREE.MeshPhysicalMaterial({color:'#080e12',roughness:0.12,clearcoat:1})},
    {geometry:mergeGeometries(lights),material:new THREE.MeshStandardMaterial({color:species.glow,emissive:species.glow,emissiveIntensity:0.25,roughness:0.4})},
  ];
  [...skin,...eyes,...lights].forEach(geometry=>geometry.dispose());templates.set(species.name,result);return result;
}
export function applyAlienSpecies(avatar,id) {
  const species=alienSpeciesFor(id),model=avatar.model,head=model.getObjectByName('head');
  for(const [original,material] of avatar.materials)if(/^(young|middleage|old)_/.test(original.name)){material.color.set(species.skin);material.roughness=0.56;}
  model.traverse(item=>{if(item.isMesh && /^(bob|short|ponytail|long|afro|curly)/.test(item.material?.name ?? ''))item.visible=false;});
  model.updateMatrixWorld(true);
  const group=new THREE.Group();group.name=`${species.name} anatomy`;
  group.position.copy(head.getWorldPosition(new THREE.Vector3()));group.updateMatrixWorld(true);
  for(const part of template(species)) {const mesh=new THREE.Mesh(part.geometry,part.material);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.localId=id;mesh.userData.alienSpecies=species.name;group.add(mesh);}
  // Attach in a world-aligned rest frame; the skeleton supplies all subsequent
  // head motion, so no per-person follow loop or duplicate animation is needed.
  head.attach(group);model.userData.alienSpecies=species.name;
  return species;
}
