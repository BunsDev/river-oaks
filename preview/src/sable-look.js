import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createReferenceStyle } from './reference-archetypes.js';

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

  const cream = material('#f6e7d6',{roughness:.9});
  const dark = material('#33201c',{roughness:.48}), gold = material('#c39553',{metalness:.8,roughness:.25});
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

  // One continuous tapered skull and muzzle; cream markings are vertex color,
  // so there are no separate white balls or exposed human chin below the fox.
  const positions=[], colors=[], indices=[];
  const amber=new THREE.Color('#b87948'), ivory=new THREE.Color('#f5e6d5');
  const rings=[[-.083,.010,.041,.020],[-.073,.033,.057,.024],[-.055,.058,.071,.025],[-.029,.087,.079,.014],[.005,.105,.087,.004],[.042,.100,.094,-.003],[.079,.095,.087,-.008],[.113,.081,.077,-.011],[.141,.057,.059,-.015],[.154,.024,.033,-.018],[.157,.001,.001,-.018]];
  const segments=64;
  for(let j=0;j<rings.length;j++)for(let i=0;i<=segments;i++){
    const [y,rx,rz,cz]=rings[j],a=i/segments*Math.PI*2,front=Math.max(0,Math.cos(a));
    const x=Math.sin(a)*rx,z=Math.cos(a)*rz+cz;
    const marking=1-THREE.MathUtils.smoothstep(y,-.035+Math.abs(x)*.40,-.006+Math.abs(x)*.4);
    const c=amber.clone().lerp(ivory,marking*THREE.MathUtils.smoothstep(front,.05,.45));
    positions.push(x,y,z);colors.push(c.r,c.g,c.b);
    if(j<rings.length-1&&i<segments){const n=j*(segments+1)+i;indices.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);}
  }
  const skull=new THREE.BufferGeometry();skull.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));skull.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));skull.setIndex(indices);skull.computeVertexNormals();
  add(head,skull,material('#ffffff',{vertexColors:true,roughness:.88}),[0,0,0],[1,1,1],'Sable sculpted face');
  ball(head,cream,[0,-.035,.098],[.056,.026,.037],'Sable muzzle');
  const nose=ball(head,dark,[0,-.010,.125],[.018,.011,.013],'Sable nose');
  // Rounded triangular fox nose, narrowing toward the philtrum.
  const np=nose.geometry.attributes.position;
  for(let i=0;i<np.count;i++)np.setX(i,np.getX(i)*(.74+.26*(np.getY(i)+1)/2));
  nose.geometry.computeVertexNormals();
  tube(head,dark,[[0,-.018,.135],[0,-.032,.136],[.015,-.040,.133],[.031,-.034,.129]],.0015,'Sable smile');
  tube(head,dark,[[0,-.032,.136],[-.014,-.040,.133],[-.029,-.035,.129]],.0013);

  const eyes=[];
  const white=material('#ffefd9',{roughness:.3}), iris=material('#99501f',{roughness:.25}), pupil=material('#160e0b',{roughness:.19}), gleam=material('#fff8e7',{emissive:'#a99b83',roughness:.1});
  for(const side of [-1,1]){
    const socket=new THREE.Group();socket.name=`Sable eye ${side}`;socket.position.set(side*.043,.047,.074);socket.rotation.z=side*.13;head.add(socket);
    const opening=new THREE.Group();opening.name='Sable eyelid opening';socket.add(opening);eyes.push(opening);
    const almond=new THREE.Shape();almond.moveTo(-.027,0);almond.quadraticCurveTo(0,.029,.027,0);almond.quadraticCurveTo(0,-.021,-.027,0);
    const eyeShape=new THREE.ShapeGeometry(almond,24),ep=eyeShape.attributes.position;
    for(let i=0;i<ep.count;i++)ep.setZ(i,.009+.004*(1-(ep.getX(i)/.027)**2));
    eyeShape.computeVertexNormals();
    add(opening,eyeShape.clone(),dark,[0,0,-.001],[1.1,1.15,1]);
    add(opening,eyeShape,white,[0,0,.002]);
    ball(opening,iris,[-side*.003,-.001,.016],[.0135,.011,.006]);
    ball(opening,pupil,[-side*.003,-.001,.021],[.0078,.009,.003]);
    ball(opening,gleam,[-.004,.005,.024],[.003,.003,.0015]);
    tube(socket,dark,[[-side*.026,.011,.010],[0,.016,.012],[side*.025,.010,.009],[side*.034,.016,.004]],.0028,'Sable upper lashes');
    tube(head,material('#67422d'),[[side*.018,.080,.073],[side*.041,.089,.074],[side*.069,.078,.064]],.0035,'Sable brow');
    // Broad cupped ears with a softly curved outline and ivory inset.
    const ear=new THREE.Group();ear.position.set(side*.076,.120,-.024);ear.rotation.z=-side*.19;head.add(ear);
    function earSurface(inset){
      const points=[],faces=[],slices=22,width=inset?.030:.050,height=inset?.112:.148;
      for(let row=0;row<=slices;row++){
        const t=row/slices,w=width*(1-t)**.72;
        for(let col=0;col<=12;col++){
          const u=col/6-1;points.push(u*w,t*height,Math.sin(Math.PI*t)*.008+(1-u*u)*.013+(inset?.006:0));
          if(row<slices&&col<12){const n=row*13+col;faces.push(n,n+1,n+13,n+1,n+14,n+13);}
        }
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex(faces);g.computeVertexNormals();return g;
    }
    const outer=material('#b87948',{roughness:.9,side:THREE.DoubleSide});
    const inner=material('#f6e7d6',{roughness:1,side:THREE.DoubleSide});
    add(ear,earSurface(false),outer,[0,0,0],[1,1,1],'Sable ear');
    add(ear,earSurface(true),inner,[0,.014,.002]);
  }

  // Wide tapered locks with a curved cross-section form a continuous crown and
  // layered waves. Fine longitudinal grooves catch light without rope geometry.
  const hair=material('#9b7353',{roughness:.52,sheen:.75,sheenColor:new THREE.Color('#d9b797'),side:THREE.DoubleSide});
  ball(head,hair,[0,.103,-.025],[.087,.056,.080],'Sable hair crown');
  const locks=[];
  function lock(points,width,phase=0){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),verts=[],idx=[],norm=new THREE.Vector3(),tangent=new THREE.Vector3();
    const rows=44,cols=12;
    for(let row=0;row<=rows;row++){
      const t=row/rows,p=curve.getPoint(t);curve.getTangent(t,tangent);
      norm.set(tangent.y,-tangent.x,0).normalize();
      const w=width*Math.min(1,(1-t)*7+.035);
      for(let col=0;col<=cols;col++){
        const u=col/cols*2-1,q=p.clone().addScaledVector(norm,u*w);
        q.z+=Math.sqrt(Math.max(0,1-u*u))*width*.35+Math.cos(u*36+phase)*.0009;
        verts.push(...q);
        if(row<rows&&col<cols){const n=row*(cols+1)+col;idx.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();locks.push(g);
  }
  // Back curtain, from the crown to the waist, overlapping to avoid bald gaps.
  for(let i=0;i<15;i++){
    const x=(i-7)*.016,phase=i*.7;
    lock([[x*.28,.158,-.029],[x*.85,.112,-.103],[x,.01,-.130],[x+Math.sin(phase)*.025,-.13,-.165],[x+Math.cos(phase)*.030,-.26,-.180],[x+Math.sin(phase+1)*.033,-.41,-.164],[x*.88,-.55+(i%3)*.017,-.152]],.021,phase);
  }
  for(const side of [-1,1])for(let i=0;i<7;i++){
    const shift=i*.006;
    lock([[.015*side,.156+shift*.2,.002],[side*.047,.141,.064+shift*.4],[side*(.087+shift*.4),.092,.045+shift],[side*(.110+shift),.002,.025+shift*.5],[side*(.125+shift),-.11,.068],[side*(.094+shift),-.23,.115],[side*(.127+shift),-.36,.121],[side*(.102+shift),-.48+i*.009,.117]],.017,i);
  }
  const hairGeometry=mergeGeometries(locks);locks.forEach(g=>g.dispose());add(head,hairGeometry,hair,[0,0,0],[1,1,1],'Sable ash blonde waves');

  // Glasses rest on the crown between the ears, not above their tips.
  const lens=material('#302820',{metalness:.15,roughness:.2});
  for(const side of [-1,1]){
    const glass=ball(head,lens,[side*.040,.152,.051],[.033,.018,.007],'Sable sunglasses');glass.rotation.z=side*-.18;
    const rim=add(head,new THREE.TorusGeometry(.030,.0019,8,32),gold,[side*.040,.152,.058],[1,.57,1]);rim.rotation.z=side*-.18;
    tube(head,gold,[[side*.07,.154,.05],[side*.098,.139,-.036]],.0018);
  }
  tube(head,gold,[[-.011,.154,.058],[0,.158,.059],[.011,.154,.058]],.0018);

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
        const pose=gaze[i];eye.position.x=(pose?.yaw??0)*.018;eye.position.y=-(pose?.pitch??0)*.016;
      });
    },
    dispose(){
      reference.dispose();attachments.forEach(g=>g.removeFromParent());
      replacements.forEach(([mesh,geometry])=>{mesh.geometry=geometry;});hidden.forEach(([mesh,visible])=>{mesh.visible=visible;});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    },
  };
}
