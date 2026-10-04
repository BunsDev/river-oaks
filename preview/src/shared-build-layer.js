import * as THREE from 'three';
import { buildFinish, buildKind } from './shared-build.js';

// Small authored models share their materials and geometry across placements.
// Their world transforms, ownership, and lifetime come only from snapshots.
export function createSharedBuildLayer(scene) {
  const object=new THREE.Group();object.name='Player creations';scene.add(object);
  const entries=new Map(),geometries=new Set(),materials=new Set(),templates=new Map();
  const material=(color,options={})=>{const result=new THREE.MeshStandardMaterial({color,roughness:.65,...options});materials.add(result);return result;};
  const box=(x,y,z)=>{const result=new THREE.BoxGeometry(x,y,z);geometries.add(result);return result;};
  const cylinder=(top,bottom,height,segments=16)=>{const result=new THREE.CylinderGeometry(top,bottom,height,segments);geometries.add(result);return result;};
  const sphere=(segments=16,rings=10)=>{const result=new THREE.SphereGeometry(1,segments,rings);geometries.add(result);return result;};
  const place=(group,geometry,surface,position,scale=[1,1,1],rotation=[0,0,0])=>{
    const mesh=new THREE.Mesh(geometry,surface);mesh.position.set(...position);mesh.scale.set(...scale);mesh.rotation.set(...rotation);
    mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const template=(kind,finishId)=>{
    const key=`${kind}:${finishId}`;if(templates.has(key))return templates.get(key);
    const finish=buildFinish(finishId),group=new THREE.Group();
    const body=material(finish.color,{metalness:finishId==='brass'?.6:.12,roughness:finishId==='slate'?.82:.52});
    const trim=material(finish.accent,{metalness:.55,roughness:.34});
    const dark=material('#3c403e',{roughness:.78}),soil=material('#4e392e',{roughness:1});
    if(kind==='seat'){
      const rail=box(1.48,.09,.13),plank=box(1.42,.07,.16),leg=box(.09,.62,.09);
      for(const x of [-.62,.62]){
        place(group,leg,body,[x,.34,-.22]);place(group,leg,body,[x,.34,.22]);
        place(group,box(.08,.25,.44),trim,[x,.7,-.03]);
      }
      for(let i=0;i<3;i++)place(group,plank,body,[0,.67,-.2+i*.18]);
      for(let i=0;i<3;i++)place(group,rail,body,[0,.84+i*.14,-.33],[1,1,1],[-.12,0,0]);
    }else if(kind==='planter'){
      place(group,box(1.02,.52,.72),body,[0,.28,0]);place(group,box(1.09,.07,.79),trim,[0,.54,0]);
      place(group,box(.92,.025,.62),soil,[0,.575,0]);
      const stem=cylinder(.009,.013,.32,8),leaf=sphere(10,6),petal=sphere(12,8);
      const foliage=material('#547554',{roughness:.93}),bloom=material(finish.accent,{roughness:.62});
      for(let i=0;i<7;i++){
        const x=((i*37)%7-3)*.125,z=((i*19)%5-2)*.11,h=.15+(i%3)*.06;
        place(group,stem,foliage,[x,.58+h/2,z],[1,h/.32,1]);
        place(group,leaf,foliage,[x-.035,.61+h*.53,z],[.065,.018,.035],[0,0,-.4]);
        place(group,petal,bloom,[x,.58+h,z],[.055,.039,.055]);
      }
    }else if(kind==='lamp'){
      place(group,cylinder(.26,.29,.11),body,[0,.055,0]);
      place(group,cylinder(.052,.067,2.12),body,[0,1.15,0]);
      place(group,cylinder(.35,.35,.075),trim,[0,2.26,0]);
      place(group,sphere(24,16),material('#fae9c4',{emissive:'#f6d8a7',emissiveIntensity:1.4,roughness:.26}),[0,2.47,0],[.23,.2,.23]);
      const ring=new THREE.TorusGeometry(.28,.019,8,32);ring.rotateX(Math.PI/2);geometries.add(ring);
      place(group,ring,trim,[0,2.47,0]);place(group,cylinder(.17,.28,.065),body,[0,2.7,0]);
    }else if(kind==='sculpture'){
      place(group,cylinder(.44,.5,.25),dark,[0,.125,0]);place(group,cylinder(.37,.37,.08),trim,[0,.29,0]);
      const points=[];for(let i=0;i<=42;i++){const t=i/42,a=t*Math.PI*3.3;points.push(new THREE.Vector3(Math.sin(a)*(.25+.08*t),.36+t*1.46,Math.cos(a)*(.25+.08*t)));}
      const curve=new THREE.CatmullRomCurve3(points),ribbon=new THREE.TubeGeometry(curve,72,.064,10,false);geometries.add(ribbon);
      place(group,ribbon,body,[0,0,0]);place(group,sphere(20,12),trim,[points.at(-1).x,points.at(-1).y,points.at(-1).z],[.12,.12,.12]);
    }else if(kind==='armchair'){
      const upholstery=material(finish.color,{roughness:.94,metalness:0}),piping=material(finish.accent,{roughness:.8,metalness:0});
      const wood=material('#5b4032',{roughness:.7});
      for(const x of [-.52,.52])for(const z of [-.43,.43])place(group,box(.1,.18,.1),wood,[x,.12,z]);
      place(group,box(1.28,.24,1.02),upholstery,[0,.37,0]);
      place(group,box(1.16,.13,.85),piping,[0,.53,.07]);
      place(group,box(1.25,.66,.2),upholstery,[0,.76,-.49], [1,1,1],[-.12,0,0]);
      for(const x of [-.58,.58])place(group,box(.14,.42,.98),upholstery,[x,.63,0]);
    }else if(kind==='side-table'){
      const wood=material(finish.color,{roughness:.54,metalness:0});
      const edge=material(finish.accent,{roughness:.4,metalness:.32});
      for(const x of [-.35,.35])for(const z of [-.3,.3])place(group,box(.075,.55,.075),wood,[x,.29,z]);
      place(group,box(.9,.08,.8),wood,[0,.6,0]);
      place(group,box(.94,.025,.84),edge,[0,.65,0]);
    }
    templates.set(key,group);return group;
  };
  // Builder mode's preview: a translucent copy of the item and a footprint ring
  // the size the town checks, green where it can go and red where it cannot.
  let ghost=null;
  const ghostOk=material('#5fd38a',{transparent:true,opacity:.42,depthWrite:false,emissive:'#2f8f58',emissiveIntensity:.5}),ghostBad=material('#e5534b',{transparent:true,opacity:.42,depthWrite:false,emissive:'#a3332c',emissiveIntensity:.5});
  const ringOk=material('#5fd38a',{transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide,emissive:'#5fd38a',emissiveIntensity:.6}),ringBad=material('#e5534b',{transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide,emissive:'#e5534b',emissiveIntensity:.6});
  const fillOk=material('#5fd38a',{transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide}),fillBad=material('#e5534b',{transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide});
  const ring=new THREE.RingGeometry(.94,1,48),fill=new THREE.CircleGeometry(.94,48);ring.rotateX(-Math.PI/2);fill.rotateX(-Math.PI/2);geometries.add(ring);geometries.add(fill);
  const arrow=new THREE.ConeGeometry(.09,.22,3);arrow.rotateX(Math.PI/2);geometries.add(arrow);
  const makeGhost=(kind,finish)=>{
    const group=new THREE.Group();group.name='Builder preview';group.userData.key=`${kind}:${finish}`;
    const model=template(kind,finish).clone();model.traverse(item=>{if(item.isMesh){item.castShadow=false;item.receiveShadow=false;item.renderOrder=2;}});
    const radius=buildKind(kind).radius,footprint=new THREE.Group();footprint.scale.setScalar(radius);
    const edge=new THREE.Mesh(ring,ringOk),floor=new THREE.Mesh(fill,fillOk),front=new THREE.Mesh(arrow,ringOk);
    edge.position.y=floor.position.y=.03;front.position.set(0,.05,1.18);front.scale.setScalar(1/radius);
    for(const mesh of [edge,floor,front]){mesh.renderOrder=3;footprint.add(mesh);}
    group.add(model,footprint);group.userData.parts={model,edge,floor,front};object.add(group);return group;
  };
  return {
    object,
    setGhost(spec){
      if(!spec){if(ghost){ghost.removeFromParent();ghost=null;}return;}
      const key=`${spec.kind}:${spec.finish}`;
      if(ghost?.userData.key!==key){ghost?.removeFromParent();ghost=makeGhost(spec.kind,spec.finish);}
      ghost.position.set(spec.position[0],spec.ground,-spec.position[1]);ghost.rotation.y=spec.yaw;ghost.visible=true;
      const {model,edge,floor,front}=ghost.userData.parts;
      model.traverse(item=>{if(item.isMesh)item.material=spec.valid?ghostOk:ghostBad;});
      edge.material=front.material=spec.valid?ringOk:ringBad;floor.material=spec.valid?fillOk:fillBad;
    },
    get ghost(){return ghost;},
    sync(items){
      const visible=new Set(items.map(item=>item.id));
      for(const [id,entry] of entries)if(!visible.has(id)){entry.removeFromParent();entries.delete(id);}
      for(const item of items){
        let entry=entries.get(item.id);
        if(!entry){entry=template(item.kind,item.finish).clone();entry.name=`${item.ownerName}'s ${item.kind}`;object.add(entry);entries.set(item.id,entry);}
        entry.position.set(item.position[0],item.ground,-item.position[1]);entry.rotation.y=item.yaw;
        entry.userData.build={id:item.id,ownerId:item.ownerId,ownerName:item.ownerName,kind:item.kind};
      }
    },
    update(cameraPosition){for(const entry of entries.values())entry.visible=entry.position.distanceToSquared(cameraPosition)<110*110;},
    stats(){return {count:entries.size,visible:[...entries.values()].filter(item=>item.visible).length};},
    dispose(){ghost=null;object.removeFromParent();object.clear();entries.clear();for(const geometry of geometries)geometry.dispose();for(const surface of materials)surface.dispose();},
  };
}
