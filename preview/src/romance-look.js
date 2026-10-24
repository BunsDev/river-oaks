import { fitCharacterBodice } from './character-bodice-fit.js';
import * as THREE from 'three';
import { createReferenceStyle } from './reference-archetypes.js';

// The imported rigs provide facial proportions, skin detail and tailored clothes.
// These additions belong to each avatar instance, never to the cached GLB.
// Human anatomy and the source skin stay intact beneath authored wardrobe details.
const WARDROBE = {
  jevica: {cloth:'#f3e3e8',trim:'#c49b4b',jewelry:false},
  sable: {cloth:'#f2e7dc',trim:'#d2a86b',jewelry:false},
  rowan: {cloth:'#453b39',trim:'#9c7956',jewelry:false},
  vesper: {cloth:'#541a30',trim:'#d6ad6d',gem:'#a38ab4'},
  aurel: {cloth:'#343045',trim:'#d2ae89',gem:'#d5b47b'},
  lyra: {cloth:'#754759',trim:'#d4ad70',jewelry:false},
  'kai:formal': {cloth:'#ded0bb',trim:'#c9a760'},
  'kai:explorer': {cloth:'#292e39',trim:'#c9a760'},
  'kai:noir': {cloth:'#201c22',trim:'#c9a760'},
  silvan: {cloth:'#eae0cb',trim:'#c9a35c'},
};
const hairMaps=new Map();
function hairTexture(name){
  if(hairMaps.has(name))return hairMaps.get(name);
  const base=name==='sable'?[194,160,133]:name==='forest'?[122,88,58]:name==='lyra'?[115,68,49]:[77,48,44],size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const glint=12*Math.sin(x*.35+y*.025)+7*Math.sin(x*1.7-y*.04)+5*Math.sin(x*.08+y*.12);
    const index=(y*size+x)*4;
    for(let channel=0;channel<3;channel++)data[index+channel]=Math.max(0,Math.min(255,base[channel]+glint));
    data[index+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;hairMaps.set(name,texture);return texture;
}
const NONE={update(){},dispose(){}};

export function createRomanceLook(avatar,root,appearance) {
  if(!appearance)return NONE;
  const {character}=appearance;
  const style=WARDROBE[`${character}:${appearance.variant}`]??WARDROBE[character];
  if(!style)return NONE;
  const resources=new Set(),materials=new Set(),group=new THREE.Group();
  group.name=`${appearance.name} details`;root.add(group);
  const cloth=new THREE.Color(style.cloth);
  for(const [original,material] of avatar.materials){
    const name=original.name??'';
    if(character==='sable'&&name==='jevica_silk')material.userData.characterSlot='outfit';
    if(character==='sable'&&name==='long01')material.userData.characterSlot='hair';
    if(character==='sable'||character==='vesper'){
      if(name==='jevica_silk'){
        material.color.set(style.cloth);material.roughness=character==='vesper'?.81:.45;material.metalness=0;material.needsUpdate=true;
      }
      if(name==='long01'){
        material.map=hairTexture(character==='sable'?'sable':'vesper');material.color.set('#ffffff');material.roughness=.76;material.needsUpdate=true;
      }
      if(name==='shoes01'){
        material.map=null;material.normalMap=null;material.color.set(character==='sable'?'#eee3d8':'#4e1b2a');material.roughness=.55;material.needsUpdate=true;
      }
    }
    if(character==='rowan'){
      if(name==='male_elegantsuit01'){material.color.set('#74615a');material.roughness=.92;material.needsUpdate=true;}
      if(name==='shoes03'){material.map=null;material.color.set('#43312b');material.roughness=.75;material.needsUpdate=true;}
      // Silver-grey hair.
      if(/^short0\d/.test(name)){material.map=null;material.color.set('#9d9893');material.roughness=.86;material.needsUpdate=true;}
    }
    if(character==='aurel'){
      if(name==='male_casualsuit02'){material.map=null;material.normalMap=null;material.color.set('#393034');material.roughness=.84;material.metalness=.03;material.needsUpdate=true;}
      if(name==='short01'){material.map=null;material.color.set('#292327');material.roughness=.87;material.needsUpdate=true;}
      if(name==='shoes01'){material.map=null;material.color.set('#1c1a1b');material.roughness=.5;material.needsUpdate=true;}
    }
    if(character==='kai'){
      if(/male_(elegant|casual)suit/i.test(name)){material.map=null;material.normalMap=null;material.color.set(appearance.variant==='formal'?'#ded0ba':appearance.variant==='explorer'?'#3c4149':'#211e24');material.roughness=.79;material.needsUpdate=true;}
      if(/short0[14]/i.test(name)){material.map=null;material.color.set('#80644e');material.roughness=.88;material.needsUpdate=true;}
      if(/shoes0[13]/i.test(name)){material.map=null;material.color.set(appearance.variant==='formal'?'#a99b89':'#242226');material.roughness=.72;material.needsUpdate=true;}
    }
    if(character==='silvan'){
      // Ivory linen and a warm brown head of hair; the outfit pieces carry the forest.
      if(/male_(elegant|casual)suit|jevica_silk/i.test(name)){material.map=null;material.normalMap=null;material.color.set('#eae0cb');material.roughness=.82;material.metalness=0;material.needsUpdate=true;}
      if(name==='long01'){material.map=hairTexture('forest');material.color.set('#ffffff');material.roughness=.8;material.needsUpdate=true;}
      if(/shoes0[13]/i.test(name)){material.map=null;material.normalMap=null;material.color.set('#5b4c33');material.roughness=.6;material.needsUpdate=true;}
      if(/short0\d/i.test(name)){material.map=null;material.color.set('#7a5638');material.roughness=.8;material.needsUpdate=true;}
    }
    if(character==='lyra'){
      if(/^ponytail/.test(name)){material.map=hairTexture('lyra');material.color.set('#ffffff');material.roughness=.78;material.needsUpdate=true;}
      if(name==='long01'){material.map=hairTexture('lyra');material.color.set('#ffffff');material.roughness=.78;material.needsUpdate=true;}
      if(name==='jevica_silk'){material.map=null;material.normalMap=null;material.color.set(style.cloth);material.roughness=.78;material.metalness=0;material.needsUpdate=true;}
      if(name==='female_casualsuit02'){material.map=null;material.normalMap=null;material.color.set(style.cloth);material.roughness=.8;material.needsUpdate=true;}
      if(/^shoes01/.test(name)){material.map=null;material.color.set('#704752');material.roughness=.6;material.needsUpdate=true;}
    }
    if(/suit|dress|shirt|jacket|jeans|trouser|pants|skirt|vest|blouse|workwear/i.test(name)&&!['jevica','sable','vesper','rowan','aurel','kai','silvan','lyra'].includes(character)){
      material.color.lerp(cloth,.76);material.roughness=.61;material.metalness=.04;material.needsUpdate=true;
    }
  }
  const mat=(color,options={})=>{const material=new THREE.MeshStandardMaterial({color,roughness:.78,...options});materials.add(material);return material;};
  const add=(parent,geometry,material,position,scale)=>{
    resources.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);
    if(scale)mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const ball=(parent,material,position,scale)=>add(parent,new THREE.SphereGeometry(1,20,14),material,position,scale);
  const head=avatar.model.getObjectByName('head');
  if(!head){group.removeFromParent();return NONE;}
  const bodiceFit=character==='jevica'?null:fitCharacterBodice(avatar.model);
  const reference=createReferenceStyle(avatar,appearance);
  // Small, physically shaded accessories keep the human archetypes recognizable
  // at conversational distance without replacing their detailed source faces.
  let earrings=null;
  if(style.jewelry!==false){
    earrings=new THREE.Group();head.add(earrings);
    const trim=mat(style.trim,{metalness:.65,roughness:.28});
    for(const side of [-1,1])ball(earrings,trim,[side*.087,.035,.018],[.005,.012,.005]);
  }
  return {update(){reference.update?.();},dispose(){bodiceFit?.dispose();reference.dispose();earrings?.removeFromParent();group.removeFromParent();for(const geometry of resources)geometry.dispose();for(const material of materials)material.dispose();}};
}
