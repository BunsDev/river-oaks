import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createReferenceStyle } from './reference-archetypes.js';
import { createSableFace } from './sable-face.js';

// Sable owns her geometry. The shared Jevica template, skeleton and other looks
// remain untouched. Coordinates below are metres in each bone's rest frame.
export function createSableLook(avatar, root, appearance) {
  const textures = new Set(), geometries = new Set(), materials = new Set(), attachments = [], replacements = [], hidden = [];
  const model = avatar.model;
  const material = (color, options = {}) => {
    const m = new THREE.MeshPhysicalMaterial({color, roughness:.65, ...options});
    materials.add(m); return m;
  };
  const add = (parent, geometry, surface, position = [0,0,0], scale = [1,1,1], name = '') => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface); mesh.name = name;
    mesh.position.fromArray(position); mesh.scale.fromArray(scale);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const ball = (parent, surface, position, scale, name) => add(parent,new THREE.SphereGeometry(1,32,24),surface,position,scale,name);
  const tube = (parent, surface, points, radius, name) => add(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),40,radius,8,false),surface,[0,0,0],[1,1,1],name);
  const aligned = (boneName, name) => {
    const bone = model.getObjectByName(boneName), group = new THREE.Group(); group.name = name;
    model.updateMatrixWorld(true);
    group.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(model.getWorldQuaternion(new THREE.Quaternion())));
    bone.add(group); attachments.push(group); return group;
  };
  const head = aligned('head','fox face');
  const texels=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const value=128+28*Math.sin(x*1.8+Math.sin(y*.12))+14*Math.sin(x*3.5+y*.4),n=(y*128+x)*4;
    texels[n]=texels[n+1]=texels[n+2]=value;texels[n+3]=255;
  }
  const furMap=new THREE.DataTexture(texels,128,128);furMap.wrapS=furMap.wrapT=THREE.RepeatWrapping;furMap.needsUpdate=true;textures.add(furMap);

  // Remove the original human face and neckline from this instance's indexed
  // mesh. Hiding triangles, rather than moving vertices, preserves body weights.
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const name = mesh.material?.name;
    if (['long01','brown','jevica_brows','eyelashes01'].includes(name)) {
      hidden.push([mesh,mesh.visible]); mesh.visible=false;
    }
    if (name !== 'young_asian_female' && name !== 'jevica_silk') return;
    const original = mesh.geometry, geometry = original.clone(), keep = [];
    mesh.skeleton.update(); const p = new THREE.Vector3();
    const ys = Array.from({length:geometry.attributes.position.count},(_,i)=>{
      p.fromBufferAttribute(geometry.attributes.position,i); mesh.applyBoneTransform(i,p).applyMatrix4(mesh.matrixWorld);
      return model.worldToLocal(p).y;
    });
    const headY=model.worldToLocal(model.getObjectByName('head').getWorldPosition(new THREE.Vector3())).y;
    const cutoff=name==='young_asian_female'?headY-.068:headY-.209;
    const index=geometry.index;
    for(let i=0;i<index.count;i+=3){
      const triangle=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      if(triangle.some(j=>ys[j]<=cutoff)){
        keep.push(...triangle);
        for(const j of triangle)if(ys[j]>cutoff)geometry.attributes.position.setY(j,original.attributes.position.getY(j)-(ys[j]-cutoff));
      }
    }
    geometry.setIndex(keep);geometry.computeVertexNormals(); mesh.geometry=geometry; geometries.add(geometry); replacements.push([mesh,original]);
    mesh.material.map=null; mesh.material.normalMap=null;
    mesh.material.color.set(name==='young_asian_female'?'#b87948':'#f2e7dc');
    mesh.material.roughness=name==='young_asian_female'?.88:.58;
    mesh.material.needsUpdate=true;
  });

  const eyes=createSableFace(head,{add,ball,tube,material,textures});
  for(const side of [-1,1]){
    // A closed, cupped pinna has a rounded rim, a warm back and a recessed
    // cream interior. Unlike a two-sided card it retains volume in profile.
    const ear=new THREE.Group();ear.position.set(side*.076,.104,-.030);ear.rotation.set(-.08,side*.18,-side*.19);head.add(ear);
    const points=[],colors=[],faces=[],rows=40,cols=48;
    const amber=new THREE.Color('#b77c51'),cream=new THREE.Color('#f2e3d4'),tip=new THREE.Color('#71503b');
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
      const t=row/rows,a=col/cols*Math.PI*2,profile=Math.sin(Math.PI*t)**.72;
      const u=Math.cos(a),front=Math.sin(a),width=.055*(1-t)**.7*THREE.MathUtils.smoothstep(t,0,.20);
      points.push(u*width,t*.145,profile*(.017*u*u+.015*front));
      const inner=THREE.MathUtils.smoothstep(front,.35,.75)*(1-THREE.MathUtils.smoothstep(t,.70,.94));
      const color=amber.clone().lerp(cream,inner).lerp(tip,THREE.MathUtils.smoothstep(t,.81,1)*.65);
      colors.push(color.r,color.g,color.b);
      if(row<rows&&col<cols){const n=row*(cols+1)+col;faces.push(n,n+cols+1,n+1,n+1,n+cols+1,n+cols+2);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(faces);geometry.computeVertexNormals();
    add(ear,geometry,material('#ffffff',{vertexColors:true,roughness:.94}),[0,0,0],[1,1,1],'Sable ear');
  }

  // Wide tapered locks with a curved cross-section form a continuous crown and
  // layered waves. Fine longitudinal grooves catch light without rope geometry.
  const hairPixels=new Uint8Array(128*256*4);
  for(let y=0;y<256;y++)for(let x=0;x<128;x++){
    const value=128+38*Math.sin(x*2.3+Math.sin(y*.023)) +18*Math.sin(x*5.7+y*.017),i=(y*128+x)*4;
    hairPixels[i]=hairPixels[i+1]=hairPixels[i+2]=value;hairPixels[i+3]=255;
  }
  const hairMap=new THREE.DataTexture(hairPixels,128,256);hairMap.wrapS=hairMap.wrapT=THREE.RepeatWrapping;hairMap.needsUpdate=true;textures.add(hairMap);
  const hair=material('#9b7353',{roughness:.6,sheen:.75,sheenColor:new THREE.Color('#d9b797'),bumpMap:hairMap,bumpScale:.00065,side:THREE.DoubleSide});
  const crownPositions=[],crownUV=[],crownIndices=[],crownRows=32,crownCols=256;
  for(let row=0;row<=crownRows;row++)for(let col=0;col<=crownCols;col++){
    const a=col/crownCols*Math.PI*2,front=Math.max(0,Math.cos(a));
    const polar=row/crownRows*(.70+1.35*(1-front)**.8);
    const groove=.0008*Math.sin(a*48+polar*3),r=Math.sin(polar);
    crownUV.push(col/crownCols*4,row/crownRows);
    crownPositions.push((.100+groove)*r*Math.sin(a),.058+.110*Math.cos(polar),-.022+(.100+groove)*r*Math.cos(a));
    if(row<crownRows&&col<crownCols){const n=row*(crownCols+1)+col;crownIndices.push(n,n+crownCols+1,n+1,n+1,n+crownCols+1,n+crownCols+2);}
  }
  const crown=new THREE.BufferGeometry();crown.setAttribute('position',new THREE.Float32BufferAttribute(crownPositions,3));crown.setAttribute('uv',new THREE.Float32BufferAttribute(crownUV,2));crown.setIndex(crownIndices);crown.computeVertexNormals();
  add(head,crown,hair,[0,0,0],[1,1,1],'Sable hair crown');
  const locks=[];
  function lock(points,width,phase=0,wrap=0){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),verts=[],uv=[],idx=[],norm=new THREE.Vector3(),tangent=new THREE.Vector3();
    const rows=48,cols=16,axis=new THREE.Vector3(0,1,0);
    for(let row=0;row<=rows;row++){
      const t=row/rows,p=curve.getPoint(t);curve.getTangent(t,tangent);
      norm.set(tangent.y,-tangent.x,0).normalize().applyAxisAngle(axis,wrap);
      // Re-project the width axis after wrapping so the cross-section stays
      // perpendicular to the strand even through a deep S-shaped wave.
      norm.addScaledVector(tangent,-norm.dot(tangent)).normalize();
      const depth=new THREE.Vector3().crossVectors(tangent,norm).normalize();
      const taper=Math.min(1,.015+t*9,(1-t)*9+.015),w=width*taper;
      for(let col=0;col<=cols;col++){
        const a=col/cols*Math.PI*2,u=Math.cos(a),v=Math.sin(a);
        const q=p.clone().addScaledVector(norm,u*w).addScaledVector(depth,v*(.0035*taper+.00018*Math.cos(u*31+phase)));
        verts.push(...q);uv.push(col/cols,row/rows*2);
        if(row<rows&&col<cols){const n=row*(cols+1)+col;idx.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();locks.push(g);
  }
  // Roots follow the same ellipsoid as the cap before falling into waves;
  // this removes the flat shelf and disconnected ribbon ends at the crown.
  for(let i=0;i<23;i++){
    const a=Math.PI*.38+i/22*Math.PI*1.24,phase=i*.13;
    const scalp=t=>[.101*Math.sin(t)*Math.sin(a),.058+.110*Math.cos(t)-.005+.008*THREE.MathUtils.smoothstep(t,.2,1.1),-.022+.101*Math.sin(t)*Math.cos(a)];
    const drape=(y,r,wave)=>[Math.sin(a)*(r+Math.sin(phase+wave)*.018),y,-.022+Math.cos(a)*(r+Math.cos(phase+wave)*.014)];
    lock([scalp(.18),scalp(.62),scalp(1.12),drape(.006,.116,0),drape(-.13,.137,1.5),drape(-.27,.131,3.1),drape(-.41,.149,4.7),drape(-.54+(i%4)*.009,.123,6)],.019,phase,a-Math.PI);
  }
  for(const side of [-1,1])for(let i=0;i<7;i++){
    const shift=i*.005,rootZ=.026-i*.012,rootY=.058+.110*Math.sqrt(1-((rootZ+.022)/.1)**2)-.007;
    lock([[.009*side,rootY,rootZ],[side*.043,.147,.023-i*.006],[side*(.082+shift*.4),.093,.041+shift],[side*(.106+shift),.002,.035+shift*.5],[side*(.121+shift),-.11,.068],[side*(.098+shift),-.23,.103],[side*(.123+shift),-.36,.112],[side*(.103+shift),-.48+i*.009,.103]],.014,i);
  }
  const hairGeometry=mergeGeometries(locks);locks.forEach(g=>g.dispose());add(head,hairGeometry,hair,[0,0,0],[1,1,1],'Sable ash blonde waves');

  // A low sweeping, full fox tail attached to the pelvis, following turns and
  // gait without leaving its root behind when the body bobs or sits.
  const tail=aligned('pelvis','fox tail');tail.position.set(0,.035,-.114).applyQuaternion(tail.quaternion);
  const curve=new THREE.CatmullRomCurve3([[0,0,0],[.12,-.12,-.15],[.22,-.32,-.24],[.26,-.55,-.28],[.22,-.74,-.30]].map(p=>new THREE.Vector3(...p)));
  const frames=curve.computeFrenetFrames(48,false),tailPositions=[],tailColors=[],tailIndices=[];
  const base=new THREE.Color('#af6d3e'),tip=new THREE.Color('#f5e8da');
  for(let row=0;row<=48;row++){
    const t=row/48,p=curve.getPointAt(t),r=(.060+.125*Math.sin(Math.PI*t)**.85)*Math.min(1,(1-t)*12);
    for(let col=0;col<=32;col++){
      const a=col/32*Math.PI*2,rr=r*(1+.018*Math.sin(a*23+row*.8));
      const q=p.clone().addScaledVector(frames.normals[row],Math.cos(a)*rr).addScaledVector(frames.binormals[row],Math.sin(a)*rr);
      const c=base.clone().lerp(tip,THREE.MathUtils.smoothstep(t,.60+.018*Math.sin(a*9),.76));
      tailPositions.push(...q);tailColors.push(c.r,c.g,c.b);
      if(row<48&&col<32){const n=row*33+col;tailIndices.push(n,n+1,n+33,n+1,n+34,n+33);}
    }
  }
  const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.Float32BufferAttribute(tailPositions,3));tg.setAttribute('color',new THREE.Float32BufferAttribute(tailColors,3));tg.setAttribute('uv',new THREE.Float32BufferAttribute(Array.from({length:49*33},(_,i)=>[i%33/32,Math.floor(i/33)/48]).flat(),2));tg.setIndex(tailIndices);tg.computeVertexNormals();
  add(tail,tg,material('#ffffff',{vertexColors:true,roughness:1,bumpMap:furMap,bumpScale:.003}),[0,0,0],[1,1,1],'Sable cream tipped tail');

  const fibres=[],fibreColors=[];
  for(let i=0;i<2600;i++){
    const t=.035+((i*1597)%2609)/2609*.925,a=i*2.399963,p=curve.getPointAt(t),j=Math.min(48,Math.round(t*48));
    const radial=frames.normals[j].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[j],Math.sin(a));
    const cross=frames.normals[j].clone().multiplyScalar(-Math.sin(a)).addScaledVector(frames.binormals[j],Math.cos(a));
    const r=(.060+.125*Math.sin(Math.PI*t)**.85)*Math.min(1,(1-t)*12);
    p.addScaledVector(radial,r*.993);
    const length=.022+(i%11)*.002,width=.0014+(i%3)*.0004;
    const end=p.clone().addScaledVector(frames.tangents[j],length).addScaledVector(radial,length*.32);
    fibres.push(...p.clone().addScaledVector(cross,width),...p.clone().addScaledVector(cross,-width),...end);
    const c=base.clone().lerp(tip,THREE.MathUtils.smoothstep(t,.60+.018*Math.sin(a*9),.76)).multiplyScalar(.90+(i%9)*.021);
    for(let k=0;k<3;k++)fibreColors.push(c.r,c.g,c.b);
  }
  const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(fibres,3));fg.setAttribute('color',new THREE.Float32BufferAttribute(fibreColors,3));fg.computeVertexNormals();
  add(tail,fg,material('#ffffff',{vertexColors:true,roughness:1,side:THREE.DoubleSide}),[0,0,0],[1,1,1],'Sable tail fibres');
  const reference=createReferenceStyle(avatar,appearance);
  const tailRest=tail.quaternion.clone();
  return {
    update(now,{reducedMotion=false,blink={left:0,right:0},gaze=[]}={}){
      tail.quaternion.copy(tailRest);
      if(!reducedMotion)tail.rotateY(Math.sin(now*.0015)*.085);
      eyes.forEach((eye,i)=>{
        eye.scale.y=Math.max(.04,1-(reducedMotion?0:i?blink.left:blink.right));
        const pose=gaze[i],iris=eye.getObjectByName('Sable iris gaze');
        iris.position.x=THREE.MathUtils.clamp(pose?.yaw??0,-.3,.3)*.010;
        iris.position.y=-THREE.MathUtils.clamp(pose?.pitch??0,-.2,.2)*.010;
        eye.userData.irisMap.offset.set(-iris.position.x/.058,-iris.position.y/.058);
      });
    },
    dispose(){
      reference.dispose();attachments.forEach(g=>g.removeFromParent());
      replacements.forEach(([mesh,geometry])=>{mesh.geometry=geometry;});hidden.forEach(([mesh,visible])=>{mesh.visible=visible;});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    },
  };
}
