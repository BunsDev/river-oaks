import * as THREE from 'three';
import { createSableLook } from './sable-look.js';
import { createReferenceStyle } from './reference-archetypes.js';
import { measureHead } from './head-fit.js';

// The imported rigs provide facial proportions, skin detail and tailored clothes.
// These additions belong to each avatar instance, never to the cached GLB.
const WARDROBE = {
  'woman-casual': {cloth:'#f2e7dc',trim:'#d2a86b'},
  'man-casual': {cloth:'#453b39',trim:'#9c7956'},
  'woman-tailored': {cloth:'#541a30',trim:'#d6ad6d'},
  'man-tailored': {cloth:'#343045',trim:'#d2ae89'},
  'midnight-host-hybrid': {cloth:'#211c20',trim:'#b69a73'},
  'midnight-host-wolf': {cloth:'#211c20',trim:'#b69a73'},
  'woman-daywear': {cloth:'#657f72',trim:'#d9b874'},
  'man-workwear': {cloth:'#ded0bb',trim:'#c9a760'},
  'kai-explorer': {cloth:'#292e39',trim:'#c9a760'},
  'kai-noir': {cloth:'#201c22',trim:'#c9a760'},
  'forest-aristocrat': {cloth:'#eae0cb',trim:'#c9a35c'},
  'forest-aristocrat-feminine': {cloth:'#eae0cb',trim:'#c9a35c'},
};
const ANIMALS = {
  fox:{fur:'#bc8055',light:'#f1e5d4',dark:'#483330',iris:'#ad7850',tail:1.02,tip:'#f6e9d4'},
  wolf:{fur:'#827f7c',light:'#ddd8d0',dark:'#383333',iris:'#d99b3e',tail:.98,tip:'#e4ddd4'},
  lynx:{fur:'#ba9367',light:'#eed8b1',dark:'#4d3b35',iris:'#b5a065',tail:0.25,tip:'#3a312f'},
};
const HOST_WOLF={fur:'#383332',light:'#b9aaa0',dark:'#201b1b',iris:'#bb883e',tail:1.02,tip:'#d8cdc4'};

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

const tailCurve=(length,kind)=>new THREE.CatmullRomCurve3(kind==='lynx' ? [
  new THREE.Vector3(0,0,0),new THREE.Vector3(0,-.025,-length*.25),
  new THREE.Vector3(0,.015,-length*.65),new THREE.Vector3(0,.10,-length),
] : [
  new THREE.Vector3(0,0,0),new THREE.Vector3(0,-.10,-length*.24),
  new THREE.Vector3(0,-.26,-length*.62),new THREE.Vector3(0,-.33,-length),
]);
const tailRadius=(t,kind)=>kind==='fox'?.061+.13*Math.sin(Math.PI*t)**.85:kind==='wolf'?.058+.095*Math.sin(Math.PI*t)**.8:.035-.013*t;
function tailGeometry(length,kind,colors) {
  const curve=tailCurve(length,kind);
  const vertices=[],uv=[],indices=[],vertexColors=[];
  const base=new THREE.Color(colors.fur),tip=new THREE.Color(colors.tip);
  const up=new THREE.Vector3(0,1,0),side=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<=24;i++){
    const t=i/24,point=curve.getPoint(t),tangent=curve.getTangent(t);
    side.crossVectors(tangent,up).normalize();normal.crossVectors(tangent,side).normalize();
    const radius=tailRadius(t,kind);
    const taper=Math.min(1,(1-t)*11);const color=base.clone().lerp(tip,kind==='lynx'?THREE.MathUtils.smoothstep(t,.72,.89):THREE.MathUtils.smoothstep(t,.69,.98));
    for(let j=0;j<=12;j++){
      const a=j/12*Math.PI*2,position=point.clone().addScaledVector(side,Math.cos(a)*radius*taper).addScaledVector(normal,Math.sin(a)*radius*taper);
      vertices.push(...position);uv.push(j/12,t*3);vertexColors.push(color.r,color.g,color.b);
      if(i<24&&j<12){const n=i*13+j;indices.push(n,n+1,n+13,n+1,n+14,n+13);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function tailFurGeometry(length,kind,colors){
  const curve=tailCurve(length,kind),base=new THREE.Color(colors.fur),tip=new THREE.Color(colors.tip),positions=[],vertexColors=[];
  const side=new THREE.Vector3(),normal=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  for(let i=0;i<520;i++){
    const t=.06+((i*227)%521)/521*.87,a=i*2.399963,tangent=curve.getTangent(t);
    side.crossVectors(tangent,up).normalize();normal.crossVectors(tangent,side).normalize();
    const radial=side.clone().multiplyScalar(Math.cos(a)).addScaledVector(normal,Math.sin(a));
    const circumferential=side.clone().multiplyScalar(-Math.sin(a)).addScaledVector(normal,Math.cos(a));
    const center=curve.getPoint(t).addScaledVector(radial,tailRadius(t,kind)*.96);
    const strand=.035+(i%7)*.007,width=.004+(i%5)*.001;
    const end=center.clone().addScaledVector(tangent,strand*.7).addScaledVector(radial,strand*.55);
    positions.push(...center.clone().addScaledVector(circumferential,width),...center.clone().addScaledVector(circumferential,-width),...end);
    const blend=THREE.MathUtils.smoothstep(t,kind==='fox'?.73:.68,.96),color=base.clone().lerp(tip,blend);
    for(let j=0;j<3;j++)vertexColors.push(color.r,color.g,color.b);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));geometry.computeVertexNormals();return geometry;
}

export function createRomanceLook(avatar,root,appearance) {
  if(appearance?.id==='woman-casual')return createSableLook(avatar,root,appearance);
  const style=WARDROBE[appearance?.id];
  if(!style)return {update(){},dispose(){}};
  const animal=appearance.id==='midnight-host-wolf'?HOST_WOLF:ANIMALS[appearance.kind],resources=new Set(),materials=new Set(),group=new THREE.Group();
  group.name=`${appearance.name} details`;root.add(group);
  const cloth=new THREE.Color(style.cloth);
  for(const [original,material] of avatar.materials){
    const name=original.name??'';
    if(['woman-casual','woman-tailored'].includes(appearance.id)){
      if(name==='jevica_silk'){
        material.color.set(style.cloth);material.roughness=appearance.id==='woman-tailored'?.81:.45;material.metalness=0;material.needsUpdate=true;
      }
      if(name==='long01'){
        material.map=hairTexture(appearance.id==='woman-casual'?'sable':'vesper');material.color.set('#ffffff');material.roughness=.76;material.needsUpdate=true;
      }
      if(name==='shoes01'){
        material.map=null;material.normalMap=null;material.color.set(appearance.id==='woman-casual'?'#eee3d8':'#4e1b2a');material.roughness=.55;material.needsUpdate=true;
      }
      if(name==='young_asian_female'&&animal){material.map=null;material.color.set('#b98560');material.bumpMap=furTexture();material.bumpScale=.002;material.roughness=.93;material.needsUpdate=true;}
    }
    if(appearance.id==='man-casual'){
      if(name==='male_elegantsuit01'){material.color.set('#74615a');material.roughness=.92;material.needsUpdate=true;}
      if(name==='middleage_african_male'){material.map=null;material.color.set('#8c8782');material.bumpMap=furTexture();material.bumpScale=.003;material.roughness=.95;material.needsUpdate=true;}
      if(name==='shoes03'){material.map=null;material.color.set('#43312b');material.roughness=.75;material.needsUpdate=true;}
    }
    if(appearance.identity==='midnight-host'){
      if(name==='male_casualsuit02'){material.map=null;material.normalMap=null;material.color.set('#393034');material.roughness=.84;material.metalness=.03;material.needsUpdate=true;}
      if(name==='young_caucasian_male'&&animal){material.map=null;material.color.set('#4c4542');material.bumpMap=furTexture();material.bumpScale=.003;material.roughness=.96;material.needsUpdate=true;}
      if(name==='short01'){material.map=null;material.color.set('#292327');material.roughness=.87;material.needsUpdate=true;}
      if(name==='shoes01'){material.map=null;material.color.set('#1c1a1b');material.roughness=.5;material.needsUpdate=true;}
    }
    if(appearance.identity==='starlight-maker'){
      if(/male_(elegant|casual)suit/i.test(name)){material.map=null;material.normalMap=null;material.color.set(appearance.variant==='formal'?'#ded0ba':appearance.variant==='explorer'?'#3c4149':'#211e24');material.roughness=.79;material.needsUpdate=true;}
      if(/short0[14]/i.test(name)){material.map=null;material.color.set('#80644e');material.roughness=.88;material.needsUpdate=true;}
      if(/shoes0[13]/i.test(name)){material.map=null;material.color.set(appearance.variant==='formal'?'#a99b89':'#242226');material.roughness=.72;material.needsUpdate=true;}
    }
    if(appearance.identity==='forest-aristocrat'){
      // Ivory linen and a warm brown head of hair; the outfit pieces carry the forest.
      if(/male_(elegant|casual)suit|jevica_silk/i.test(name)){material.map=null;material.normalMap=null;material.color.set('#eae0cb');material.roughness=.82;material.metalness=0;material.needsUpdate=true;}
      if(name==='long01'){material.map=hairTexture('forest');material.color.set('#ffffff');material.roughness=.8;material.needsUpdate=true;}
      if(/shoes0[13]/i.test(name)){material.map=null;material.normalMap=null;material.color.set('#5b4c33');material.roughness=.6;material.needsUpdate=true;}
      if(/short0\d/i.test(name)){material.map=null;material.color.set('#7a5638');material.roughness=.8;material.needsUpdate=true;}
    }
    if(/suit|dress|shirt|jacket|jeans|trouser|pants|skirt|vest|blouse|workwear/i.test(name)){
      if(!['woman-casual','woman-tailored','man-casual'].includes(appearance.id)&&!['midnight-host','starlight-maker','forest-aristocrat'].includes(appearance.identity)){
        material.color.lerp(cloth,.76);material.roughness=.61;material.metalness=.04;material.needsUpdate=true;
      }
    }
    if(animal&&!['woman-casual','man-casual'].includes(appearance.id)&&appearance.identity!=='midnight-host'&&/female|male/i.test(name)&&!/suit|dress/i.test(name)){
      material.color.lerp(new THREE.Color(animal.fur),.45);material.roughness=.9;material.needsUpdate=true;
    }
  }
  const mat=(color,options={})=>{const material=new THREE.MeshStandardMaterial({color,roughness:.78,...options});materials.add(material);return material;};
  const trim=mat(style.trim,{metalness:.65,roughness:.28});
  const add=(parent,geometry,material,position,scale)=>{
    resources.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);
    if(scale)mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const ball=(parent,material,position,scale)=>add(parent,new THREE.SphereGeometry(1,20,14),material,position,scale);
  const head=avatar.model.getObjectByName('head');
  if(!head){group.removeFromParent();return {update(){},dispose(){}};}
  const reference=createReferenceStyle(avatar,appearance);
  if(animal){
    // Hair from the human source rig would cut through the new ears and skull.
    if(appearance.id!=='woman-casual')avatar.model.traverse(item=>{if(item.isMesh&&/bob|ponytail|short|long\d/i.test(item.name))item.visible=false;});
    const fur=mat(animal.fur,{bumpMap:furTexture(),bumpScale:.004,roughness:.96});
    const light=mat(animal.light,{bumpMap:furTexture(),bumpScale:.003,roughness:.94});
    const dark=mat(animal.dark,{roughness:.88});
    const iris=mat(animal.iris,{roughness:.28});
    const eye=mat('#f2e9d7',{roughness:.28});
    const black=mat('#141619',{roughness:.12});
    const shine=mat('#ffffff',{roughness:.12,emissive:'#555555'});
    const face=new THREE.Group();face.name=`${appearance.kind} face`;head.add(face);
    // Animal heads were authored for a 0.20 skull top; seat them on the measured skull.
    face.position.y=(measureHead(avatar)?.skull.top??.2)-.2;
    ball(face,fur,[0,.105,.003],[.116,.138,.11]);
    ball(face,light,[0,.026,.082],[.067,.042,.069]);
    ball(face,fur,[0,.083,.099],[.051,.054,.057]);
    for(const side of [-1,1]){
      ball(face,light,[side*.036,.052,.12],[.046,.031,.053]);
      ball(face,dark,[side*.045,.136,.102],[.026,.024,.012]);
      ball(face,eye,[side*.045,.134,.11],[.020,.018,.011]);
      ball(face,iris,[side*.045,.133,.12],[.011,.013,.007]);
      ball(face,black,[side*.045,.133,.125],[.005,.010,.004]);
      ball(face,shine,[side*.049,.139,.128],[.003,.003,.002]);
      const ear=add(face,new THREE.ConeGeometry(appearance.kind==='wolf'?.052:.048,appearance.kind==='lynx'?.11:.135,20),fur,[side*.079,.218,-.004],[1,1,.65]);
      ear.rotation.z=-side*.24;
      const inner=add(face,new THREE.ConeGeometry(.028,appearance.kind==='lynx'?.07:.09,20),light,[side*.079,.225,.028],[1,1,.4]);inner.rotation.z=-side*.24;
      const tuft=add(face,new THREE.ConeGeometry(.025,.072,12),fur,[side*.108,.051,-.01],[1,1,.58]);tuft.rotation.z=side*1.0;
      if(appearance.kind==='lynx'){
        const tip=add(face,new THREE.ConeGeometry(.009,.055,10),dark,[side*.095,.285,-.004]);tip.rotation.z=-side*.18;
        for(let i=0;i<3;i++)ball(face,dark,[side*(.066+i*.016),.079-i*.017,.103-i*.012],[.006,.004,.003]);
      }
    }
    ball(face,dark,[0,.063,.167],[.025,.017,.019]);
    ball(face,dark,[0,.026,.151],[.006,.013,.004]);
    const tail=new THREE.Group();tail.name=`${appearance.kind} tail`;tail.position.set(0,avatar.hipHeight+.025,-.105);group.add(tail);
    add(tail,tailGeometry(animal.tail,appearance.kind,animal),mat('#ffffff',{vertexColors:true,bumpMap:furTexture(),bumpScale:.004,roughness:.97}),[0,0,0]);
    if(appearance.kind!=='lynx')add(tail,tailFurGeometry(animal.tail,appearance.kind,animal),mat('#ffffff',{vertexColors:true,side:THREE.DoubleSide,roughness:.98}),[0,0,0]);
    return {update(now,{reducedMotion=false}={}){if(!reducedMotion){tail.rotation.y=Math.sin(now*.0015)*.16;tail.rotation.x=Math.sin(now*.0011+.8)*.08;}},dispose(){reference.dispose();face.removeFromParent();group.removeFromParent();for(const geometry of resources)geometry.dispose();for(const material of materials)material.dispose();}};
  }
  // Small, physically shaded accessories keep the human archetypes recognizable
  // at conversational distance without replacing their detailed source faces.
  const pendant=new THREE.Group();head.add(pendant);
  const gemstone=mat(appearance.id==='woman-tailored'?'#a38ab4':appearance.id==='man-tailored'?'#d5b47b':'#7ab5ac',{metalness:.2,roughness:.16});
  ball(pendant,trim,[0,-.058,.072],[.012,.017,.007]);ball(pendant,gemstone,[0,-.059,.079],[.007,.011,.004]);
  for(const side of [-1,1])ball(pendant,trim,[side*.087,.035,.018],[.005,.012,.005]);
  let tail=null,ears=null;
  if(appearance.id==='midnight-host-hybrid'){
    ears=new THREE.Group();ears.name='wolf ears';head.add(ears);
    const outer=mat('#332b2b',{bumpMap:furTexture(),bumpScale:.003}),inner=mat('#a79591');
    for(const side of [-1,1]){
      const ear=add(ears,new THREE.ConeGeometry(.052,.155,20),outer,[side*.079,.235,-.007],[1,1,.65]);ear.rotation.z=-side*.24;
      const center=add(ears,new THREE.ConeGeometry(.027,.105,20),inner,[side*.079,.24,.024],[1,1,.4]);center.rotation.z=-side*.24;
    }
    tail=new THREE.Group();tail.name='wolf tail';tail.position.set(0,avatar.hipHeight+.025,-.105);group.add(tail);
    add(tail,tailGeometry(HOST_WOLF.tail,'wolf',HOST_WOLF),mat('#ffffff',{vertexColors:true,bumpMap:furTexture(),bumpScale:.004,roughness:.97}),[0,0,0]);
    add(tail,tailFurGeometry(HOST_WOLF.tail,'wolf',HOST_WOLF),mat('#ffffff',{vertexColors:true,side:THREE.DoubleSide,roughness:.98}),[0,0,0]);
  }
  return {update(now,{reducedMotion=false}={}){if(tail&&!reducedMotion){tail.rotation.y=Math.sin(now*.0015)*.16;tail.rotation.x=Math.sin(now*.0011+.8)*.08;}},dispose(){reference.dispose();ears?.removeFromParent();pendant.removeFromParent();group.removeFromParent();for(const geometry of resources)geometry.dispose();for(const material of materials)material.dispose();}};
}
