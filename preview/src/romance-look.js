import * as THREE from 'three';
import { createSableLook } from './sable-look.js';
import { createReferenceStyle } from './reference-archetypes.js';
import { measureHead } from './head-fit.js';
import { createAnimalFace, trimHumanHead } from './animal-face.js';
import { createTailMotion } from './tail-motion.js';

// The imported rigs provide facial proportions, skin detail and tailored clothes.
// These additions belong to each avatar instance, never to the cached GLB.
// A character's clothes are the same in both forms; only the beast form swaps
// the head, furs the skin and grows a tail.
const WARDROBE = {
  jevica: {cloth:'#f3e3e8',trim:'#c49b4b',jewelry:false},
  sable: {cloth:'#f2e7dc',trim:'#d2a86b',jewelry:false},
  rowan: {cloth:'#453b39',trim:'#9c7956',jewelry:false},
  vesper: {cloth:'#541a30',trim:'#d6ad6d',gem:'#a38ab4'},
  aurel: {cloth:'#343045',trim:'#d2ae89',gem:'#d5b47b'},
  lyra: {cloth:'#657f72',trim:'#d9b874',jewelry:false},
  'kai:formal': {cloth:'#ded0bb',trim:'#c9a760'},
  'kai:explorer': {cloth:'#292e39',trim:'#c9a760'},
  'kai:noir': {cloth:'#201c22',trim:'#c9a760'},
  silvan: {cloth:'#eae0cb',trim:'#c9a35c'},
};
// Coat, tail and skin for each beast, keyed by the appearance's palette or kind.
// `skin.lerp` tints the rig's own skin; otherwise fur replaces it.
const BEASTS = {
  wolf:{fur:'#827f7c',dark:'#383333',tail:{style:'wolf',length:.98,tip:'#e4ddd4'},skin:{color:'#8c8782',bump:.003,roughness:.95}},
  'host-wolf':{fur:'#383332',dark:'#201b1b',tail:{style:'wolf',length:1.02,tip:'#d8cdc4'},skin:{color:'#4c4542',bump:.003,roughness:.96}},
  lynx:{fur:'#ba9367',dark:'#4d3b35',tail:{style:'lynx',length:.25,tip:'#3a312f'},skin:{lerp:.45,roughness:.9}},
  'rose-fox':{fur:'#f2ebe6',dark:'#b98a96',tail:{style:'fox',length:1.02,tip:'#e6a2b7'},skin:{color:'#efe6e1',bump:.002,roughness:.93}},
  panther:{fur:'#221d22',dark:'#0f0d10',tail:{style:'cat',length:.94,tip:'#141114'},skin:{color:'#262027',bump:.002,roughness:.86}},
  'snow-leopard':{fur:'#bdb5a9',dark:'#3b3632',tail:{style:'plush-cat',length:1,tip:'#36312d',rings:true},skin:{color:'#bfb7ab',bump:.003,roughness:.95}},
  deer:{fur:'#8f6546',dark:'#4f3a2a',tail:{style:'deer',length:.17,tip:'#f4ede3'},skin:{color:'#8d6446',bump:.003,roughness:.95}},
};
const SKIN=/^(young|middleage|old)_.*(male|female)$/i;

let furBump;
const hairMaps=new Map();
function hairTexture(name){
  if(hairMaps.has(name))return hairMaps.get(name);
  const base=name==='sable'?[194,160,133]:name==='forest'?[122,88,58]:[77,48,44],size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const glint=12*Math.sin(x*.35+y*.025)+7*Math.sin(x*1.7-y*.04)+5*Math.sin(x*.08+y*.12);
    const index=(y*size+x)*4;
    for(let channel=0;channel<3;channel++)data[index+channel]=Math.max(0,Math.min(255,base[channel]+glint));
    data[index+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;hairMaps.set(name,texture);return texture;
}
function furTexture() {
  if (furBump) return furBump;
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    // Fine vertical strands, with repeatable broken highlights and no canvas.
    const noise=(Math.imul(x+17,73856093)^Math.imul(y+37,19349663))>>>0;
    const strand=Math.sin(x*1.7+y*.18)*19+Math.sin(x*.48-y*.09)*13;
    const value=Math.max(0,Math.min(255,127+strand+(noise%37)-18));
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  furBump=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  furBump.wrapS=furBump.wrapT=THREE.RepeatWrapping;
  furBump.needsUpdate=true;
  return furBump;
}

// Tail silhouettes in metres along -z from the pelvis. Canid brushes droop and
// swell, a cat's tail dips and curls up at the tip, a deer's is a short flag.
const TAILS = {
  fox:{curve:'brush',radius:t=>.061+.13*Math.sin(Math.PI*t)**.85,tip:[.69,.98],fibres:.73},
  wolf:{curve:'brush',radius:t=>.058+.095*Math.sin(Math.PI*t)**.8,tip:[.69,.98],fibres:.68},
  lynx:{curve:'bob',radius:t=>.035-.013*t,tip:[.72,.89]},
  cat:{curve:'curl',radius:t=>.031-.012*t,tip:[.86,.99]},
  'plush-cat':{curve:'curl',radius:t=>.06+.012*Math.sin(Math.PI*t)-.01*t,tip:[.88,.99],fibres:.88},
  deer:{curve:'flag',radius:t=>.046*(1-.45*t)+.01*Math.sin(Math.PI*t),tip:[.35,.8]},
};
const tailCurve=(length,style)=>new THREE.CatmullRomCurve3(({
  brush:[[0,0,0],[0,-.10,-length*.24],[0,-.26,-length*.62],[0,-.33,-length]],
  bob:[[0,0,0],[0,-.025,-length*.25],[0,.015,-length*.65],[0,.10,-length]],
  curl:[[0,0,0],[0,-.15,-length*.2],[0,-.34,-length*.52],[0,-.3,-length*.84],[0,-.13,-length]],
  flag:[[0,0,0],[0,.035,-length*.45],[0,.085,-length]],
})[TAILS[style].curve].map(point=>new THREE.Vector3(...point)));
function tailColor(t,a,shape,colors,base,tip,dark){
  const color=base.clone().lerp(tip,THREE.MathUtils.smoothstep(t,...shape.tip));
  // Snow leopard rings: soft dark bands that close toward the tip.
  if(colors.rings&&t>.12&&t<.9)color.lerp(dark,.6*THREE.MathUtils.smoothstep(Math.cos(t*Math.PI*11+Math.sin(a*2)*.25),.55,.95));
  return color;
}
function tailGeometry(length,style,colors) {
  const shape=TAILS[style],curve=tailCurve(length,style);
  const vertices=[],uv=[],indices=[],vertexColors=[];
  const base=new THREE.Color(colors.fur),tip=new THREE.Color(colors.tip),dark=new THREE.Color(colors.dark);
  const up=new THREE.Vector3(0,1,0),side=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<=24;i++){
    const t=i/24,point=curve.getPoint(t),tangent=curve.getTangent(t);
    side.crossVectors(tangent,up).normalize();normal.crossVectors(tangent,side).normalize();
    const radius=shape.radius(t);
    const taper=Math.min(1,(1-t)*11);
    for(let j=0;j<=12;j++){
      const a=j/12*Math.PI*2,position=point.clone().addScaledVector(side,Math.cos(a)*radius*taper).addScaledVector(normal,Math.sin(a)*radius*taper);
      const color=tailColor(t,a,shape,colors,base,tip,dark);
      vertices.push(...position);uv.push(j/12,t*3);vertexColors.push(color.r,color.g,color.b);
      if(i<24&&j<12){const n=i*13+j;indices.push(n,n+1,n+13,n+1,n+14,n+13);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function tailFurGeometry(length,style,colors){
  const shape=TAILS[style],curve=tailCurve(length,style),base=new THREE.Color(colors.fur),tip=new THREE.Color(colors.tip),dark=new THREE.Color(colors.dark),positions=[],vertexColors=[];
  const side=new THREE.Vector3(),normal=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  for(let i=0;i<520;i++){
    const t=.06+((i*227)%521)/521*.87,a=i*2.399963,tangent=curve.getTangent(t);
    side.crossVectors(tangent,up).normalize();normal.crossVectors(tangent,side).normalize();
    const radial=side.clone().multiplyScalar(Math.cos(a)).addScaledVector(normal,Math.sin(a));
    const circumferential=side.clone().multiplyScalar(-Math.sin(a)).addScaledVector(normal,Math.cos(a));
    const center=curve.getPoint(t).addScaledVector(radial,shape.radius(t)*.96);
    const strand=.035+(i%7)*.007,width=.004+(i%5)*.001;
    const end=center.clone().addScaledVector(tangent,strand*.7).addScaledVector(radial,strand*.55);
    positions.push(...center.clone().addScaledVector(circumferential,width),...center.clone().addScaledVector(circumferential,-width),...end);
    const color=colors.rings?tailColor(t,a,shape,colors,base,tip,dark):base.clone().lerp(tip,THREE.MathUtils.smoothstep(t,shape.fibres,.96));
    for(let j=0;j<3;j++)vertexColors.push(color.r,color.g,color.b);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));geometry.computeVertexNormals();return geometry;
}

const NONE={beast:false,update(){},dispose(){}};

export function createRomanceLook(avatar,root,appearance) {
  if(!appearance)return NONE;
  const {character,form}=appearance;
  if(character==='sable'&&form==='beast')return createSableLook(avatar,root,appearance);
  const style=WARDROBE[`${character}:${appearance.variant}`]??WARDROBE[character];
  if(!style)return NONE;
  const beast=form==='beast'?BEASTS[appearance.palette??appearance.kind]??null:null;
  const resources=new Set(),materials=new Set(),group=new THREE.Group();
  group.name=`${appearance.name} details`;root.add(group);
  const cloth=new THREE.Color(style.cloth);
  for(const [original,material] of avatar.materials){
    const name=original.name??'';
    if(beast&&SKIN.test(name)){
      const skin=beast.skin;
      if(skin.lerp)material.color.lerp(new THREE.Color(beast.fur),skin.lerp);
      else{material.map=null;material.color.set(skin.color);material.bumpMap=furTexture();material.bumpScale=skin.bump;}
      material.roughness=skin.roughness;material.needsUpdate=true;
    }
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
      // Silver-grey: the wolf's coat, worn as hair.
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
    if(character==='lyra'&&/^ponytail/.test(name)){material.color.set('#e2b98a');material.roughness=.8;material.needsUpdate=true;}
    if(/suit|dress|shirt|jacket|jeans|trouser|pants|skirt|vest|blouse|workwear/i.test(name)&&!['jevica','sable','vesper','rowan','aurel','kai','silvan'].includes(character)){
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
  const reference=createReferenceStyle(avatar,appearance);
  if(beast){
    // Hair from the human source rig would cut through the new ears and skull.
    avatar.model.traverse(item=>{if(item.isMesh&&/bob|ponytail|short|long\d/i.test(item.name))item.visible=false;});
    // A sculpted head replaces the human one on this instance only: the skin's
    // head triangles are trimmed, and the rig's own eyes, brows and lashes hidden.
    const hiddenParts=[],replacements=[],textures=new Set();
    avatar.model.traverse(item=>{if(item.isMesh&&/^brown|brow|lash/i.test(item.material?.name??'')){hiddenParts.push([item,item.visible]);item.visible=false;}});
    trimHumanHead(avatar.model,{geometries:resources,replacements});
    const face=new THREE.Group();face.name=`${appearance.kind} face`;
    avatar.model.updateMatrixWorld(true);
    face.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(avatar.model.getWorldQuaternion(new THREE.Quaternion())));
    head.add(face);
    const physical=(color,options={})=>{const material=new THREE.MeshPhysicalMaterial({color,roughness:.8,...options});materials.add(material);return material;};
    const named=(parent,geometry,material,position=[0,0,0],scale=[1,1,1],name)=>{const mesh=add(parent,geometry,material,position,scale);if(name)mesh.name=name;return mesh;};
    const sphere=(parent,material,position,scale,name)=>named(parent,new THREE.SphereGeometry(1,32,24),material,position,scale,name);
    const tube=(parent,material,points,radius,name)=>named(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),40,radius,8,false),material,[0,0,0],[1,1,1],name);
    createAnimalFace(face,appearance.palette??appearance.kind,{add:named,ball:sphere,tube,material:physical,textures,fit:measureHead(avatar)});
    const restoreHead=()=>{for(const [item,visible] of hiddenParts)item.visible=visible;for(const [mesh,original] of replacements)mesh.geometry=original;for(const texture of textures)texture.dispose();};
    const tail=new THREE.Group();tail.name=`${appearance.kind} tail`;tail.position.set(0,avatar.hipHeight+.025,-.105);group.add(tail);
    const colors={fur:beast.fur,dark:beast.dark,tip:beast.tail.tip,rings:beast.tail.rings};
    add(tail,tailGeometry(beast.tail.length,beast.tail.style,colors),mat('#ffffff',{vertexColors:true,bumpMap:furTexture(),bumpScale:.004,roughness:.97}),[0,0,0]);
    if(TAILS[beast.tail.style].fibres)add(tail,tailFurGeometry(beast.tail.length,beast.tail.style,colors),mat('#ffffff',{vertexColors:true,side:THREE.DoubleSide,roughness:.98}),[0,0,0]);
    const carriage=createTailMotion();
    return {
      beast:true,
      update(now,{reducedMotion=false,motion=null}={}){const pose=carriage.pose(now,{reducedMotion,motion});if(!reducedMotion){tail.rotation.y=pose.yaw;tail.rotation.x=pose.pitch;}},
      dispose(){reference.dispose();restoreHead();face.removeFromParent();group.removeFromParent();for(const geometry of resources)geometry.dispose();for(const material of materials)material.dispose();},
    };
  }
  // Small, physically shaded accessories keep the human archetypes recognizable
  // at conversational distance without replacing their detailed source faces.
  let pendant=null;
  if(style.jewelry!==false){
    pendant=new THREE.Group();head.add(pendant);
    const trim=mat(style.trim,{metalness:.65,roughness:.28}),gemstone=mat(style.gem??'#7ab5ac',{metalness:.2,roughness:.16});
    ball(pendant,trim,[0,-.058,.072],[.012,.017,.007]);ball(pendant,gemstone,[0,-.059,.079],[.007,.011,.004]);
    for(const side of [-1,1])ball(pendant,trim,[side*.087,.035,.018],[.005,.012,.005]);
  }
  return {beast:false,update(){},dispose(){reference.dispose();pendant?.removeFromParent();group.removeFromParent();for(const geometry of resources)geometry.dispose();for(const material of materials)material.dispose();}};
}
