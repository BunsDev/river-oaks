import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Clothing and accessories authored against the rest pose of the shipped rigs.
// Each piece follows a bone, so walking, gestures, and remote animation still work.
export function createReferenceStyle(avatar,appearance){
  if(!['woman-casual','man-casual','woman-tailored'].includes(appearance?.id)&&!['midnight-host','starlight-maker'].includes(appearance?.identity))return {dispose(){}};
  const resources=new Set(),materials=new Set(),attachments=new Set(),model=avatar.model;
  const material=(color,options={})=>{const value=new THREE.MeshPhysicalMaterial({color,roughness:.6,...options});materials.add(value);return value;};
  const mesh=(parent,geometry,surface,position=[0,0,0],scale=[1,1,1])=>{
    resources.add(geometry);const item=new THREE.Mesh(geometry,surface);item.position.set(...position);item.scale.set(...scale);
    item.castShadow=item.receiveShadow=true;parent.add(item);return item;
  };
  const ball=(parent,surface,position,scale)=>mesh(parent,new THREE.SphereGeometry(1,18,12),surface,position,scale);
  const box=(parent,surface,position,size,bevel=.012)=>mesh(parent,new RoundedBoxGeometry(...size,2,bevel),surface,position);
  const tube=(parent,surface,points,radius=.008)=>mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point))),Math.max(12,points.length*8),radius,7,false),surface);
  const aligned=name=>{
    const bone=model.getObjectByName(name);if(!bone)return null;
    model.updateMatrixWorld(true);
    const group=new THREE.Group();
    group.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(model.getWorldQuaternion(new THREE.Quaternion())));
    bone.add(group);attachments.add(group);return group;
  };
  const gold=material('#d4ad70',{metalness:.83,roughness:.23}),darkGold=material('#9d794b',{metalness:.68,roughness:.34});
  const leather=material(appearance.id==='man-casual'?'#574237':appearance.id==='woman-tailored'?'#48232c':appearance.identity==='midnight-host'?'#211d20':appearance.variant==='explorer'?'#513e32':'#ede1d1',{roughness:.62});
  const face=aligned('head'),torso=aligned('spine_03'),pelvis=aligned('pelvis');
  function wavyHair(color,number){
    const hair=material(color,{roughness:.78,sheen:1,sheenColor:new THREE.Color(color)});
    for(let i=0;i<number;i++){
      const side=i%2?1:-1,layer=Math.floor(i/2),x=side*(.081+layer*.008),front=layer%3===0;
      const z=front?.07:-.055-(layer%3)*.022;
      tube(face,hair,[[x*.8,.20,z],[x,.08,z+.015],[x+side*.015,-.04,z-.012],[x-side*.012,-.18,z+.015],[x+side*.021,-.35,z-.012],[x,-.53,z]],.011+(i%3)*.002);
    }
  }
  function pendant(){
    tube(face,gold,[[0,-.015,.088],[0,-.078,.102]],.0028);
    ball(face,gold,[0,-.08,.105],[.014,.017,.007]);
  }
  function shoulderBag({color,side=1,large=false}){
    const bag=material(color,{roughness:.64}),holder=torso;
    const x=side*(large?.30:.28),y=large?-.20:-.22,z=.12;
    box(holder,bag,[x,y,z],large?[.22,.19,.095]:[.17,.16,.075],.018);
    box(holder,bag,[x,y+.047,z+.05],large?[.20,.084,.015]:[.16,.07,.014],.01);
    box(holder,gold,[x,y+.018,z+.061],[.028,.024,.009],.004);
    tube(holder,gold,[[side*.10,.28,-.025],[side*.15,.17,.025],[side*.21,.04,.07],[x,y+.075,z]],.004);
    tube(holder,leather,[[side*.10,.28,-.04],[side*.15,.17,.015],[side*.21,.04,.055]],.009);
  }
  function dressSkirt(color,{wrap=false,slit=false}={}){
    const surface=material(color,wrap?{roughness:.9,sheen:1,sheenColor:new THREE.Color('#a94d68'),side:THREE.DoubleSide}:{roughness:.46,sheen:.32,side:THREE.DoubleSide});
    const levels=[[-.17,.218,.145],[-.07,.216,.145],[.025,.202,.135],[.105,.161,.11]],segments=40,vertices=[],uv=[],indices=[];
    for(let layer=0;layer<levels.length;layer++){
      const [y,rx,rz]=levels[layer];
      for(let i=0;i<=segments;i++){
        const a=i/segments*Math.PI*2;vertices.push(Math.sin(a)*rx,y,Math.cos(a)*rz);uv.push(i/segments,layer/(levels.length-1));
        if(layer<levels.length-1&&i<segments){
          if(slit&&layer===0&&i>=3&&i<=5)continue;
          const n=layer*(segments+1)+i;indices.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);
        }
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const skirt=mesh(pelvis,geometry,surface);skirt.name=wrap?'Vesper velvet wrap skirt':'Sable ivory mini dress';
    if(wrap){
      tube(pelvis,material('#8d3b52',{roughness:.82}),[[-.18,.015,.085],[-.10,-.035,.14],[.02,-.10,.151],[.16,-.16,.10]],.009);
    }else{
      const belt=material('#eee1d4',{roughness:.46});
      const around=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;around.push([Math.sin(a)*.171,.091,Math.cos(a)*.117]);}
      tube(pelvis,belt,around,.016);
      for(const x of [-.023,.023]){const loop=mesh(pelvis,new THREE.TorusGeometry(.023,.005,7,20),gold,[x,.091,.12]);loop.scale.x=.85;}
    }
    const strap=material(color,{roughness:wrap?.86:.48});
    for(const side of [-1,1])tube(torso,strap,[[side*.105,.17,.074],[side*.12,.28,.02]],wrap?.005:.009);
  }
  function sandals(){
    const ivory=material('#eee1d5',{roughness:.48}),skin=material('#bb895f',{roughness:.9});
    model.traverse(item=>{if(item.isMesh&&/shoes01/i.test(item.name))item.visible=false;});
    for(const side of ['l','r']){
      const foot=aligned(`foot_${side}`);if(!foot)continue;
      box(foot,ivory,[0,-.053,.055],[.115,.019,.26],.012);
      ball(foot,skin,[0,-.014,.067],[.054,.031,.118]);
      box(foot,ivory,[0,.018,.14],[.112,.015,.031],.005);
      box(foot,ivory,[0,-.038,-.055],[.048,.09,.053],.007);
      const ankle=mesh(foot,new THREE.TorusGeometry(.053,.008,7,20),ivory,[0,.085,-.012]);ankle.rotation.x=Math.PI/2;
      ball(foot,gold,[side==='l'?.054:-.054,.085,-.012],[.009,.009,.007]);
    }
  }
  function boots(color,{rugged=false}={}){
    const upper=material(color,{roughness:.74}),sole=material(['midnight-host','starlight-maker'].includes(appearance.identity)?'#171618':rugged?'#332f2b':'#3b2028',{roughness:.86});
    for(const side of ['l','r']){
      const foot=aligned(`foot_${side}`);if(!foot)continue;
      box(foot,sole,[0,-.056,.06],rugged?[.142,.04,.30]:[.107,.024,.27],.012);
      ball(foot,upper,[0,.005,.09],rugged?[.077,.075,.15]:[.062,.06,.145]);
      const shaft=mesh(foot,new THREE.CylinderGeometry(rugged?.078:.067,rugged?.085:.073,rugged?.23:.17,16),upper,[0,rugged?.12:.10,-.014]);
      shaft.scale.z=.84;
      if(rugged){
        for(let i=0;i<3;i++)tube(foot,gold,[[-.04,.09+i*.05,.07],[.04,.09+i*.05,.07]],.0035);
        box(foot,gold,[.077,.13,-.005],[.014,.018,.032],.003);
      }else box(foot,gold,[.065,.16,-.012],[.013,.019,.031],.003);
    }
  }
  function relaxedSleeves(color){
    const velvet=material(color,{roughness:.9,sheen:1,sheenColor:new THREE.Color('#8e4a60')});
    for(const side of ['l','r']){
      const upper=model.getObjectByName(`upperarm_${side}`),lower=model.getObjectByName(`lowerarm_${side}`);
      if(!upper||!lower)continue;
      model.updateMatrixWorld(true);
      const direction=upper.worldToLocal(lower.getWorldPosition(new THREE.Vector3())).normalize();
      const piece=new THREE.Group();piece.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);upper.add(piece);attachments.add(piece);
      const sleeve=mesh(piece,new THREE.CylinderGeometry(.079,.094,.17,16),velvet,[0,.15,0]);sleeve.scale.z=.9;
      ball(piece,velvet,[0,.08,0],[.086,.033,.076]);
      ball(piece,velvet,[0,.22,0],[.076,.031,.07]);
      ball(piece,gold,[.08,.09,0],[.009,.009,.006]);
    }
  }
  if(appearance.id==='woman-casual'){
    dressSkirt('#f1e7dd',{slit:true});wavyHair('#c6a381',12);pendant();shoulderBag({color:'#f0e4d9'});sandals();
    const lens=material('#242326',{metalness:.35,roughness:.18}),frame=material('#bb945e',{metalness:.75,roughness:.2});
    for(const side of [-1,1]){
      const glass=ball(face,lens,[side*.052,.293,.048],[.047,.023,.009]);glass.rotation.z=side*.15;
      const rim=mesh(face,new THREE.TorusGeometry(.038,.004,7,20),frame,[side*.052,.293,.058]);rim.scale.y=.58;rim.rotation.z=side*.15;
    }
    tube(face,frame,[[-.012,.295,.06],[.012,.295,.06]],.003);
    for(const side of [-1,1])ball(face,gold,[side*.093,-.035,.012],[.007,.011,.006]);
  }else if(appearance.id==='woman-tailored'){
    dressSkirt('#541a30',{wrap:true});wavyHair('#4a3030',12);pendant();shoulderBag({color:'#4b2931'});boots('#4a1f2e');relaxedSleeves('#521a30');
    for(const side of [-1,1]){
      const hoop=mesh(face,new THREE.TorusGeometry(.013,.0025,7,20),gold,[side*.091,-.045,.02]);hoop.rotation.y=side*.25;
    }
  }else if(appearance.id==='man-casual'){
    const jacket=material('#453b39',{roughness:.91}),shirt=material('#ece6dc',{roughness:.86}),fur=material('#a9a49f',{roughness:.98});
    box(torso,shirt,[0,.115,.132],[.25,.32,.027],.014);
    for(const side of [-1,1]){
      const lapel=box(torso,jacket,[side*.135,.16,.146],[.08,.3,.035],.012);lapel.rotation.z=side*.17;
      const collar=box(torso,jacket,[side*.14,.35,.075],[.15,.12,.065],.018);collar.rotation.z=-side*.22;
      box(torso,jacket,[side*.20,-.055,.143],[.11,.10,.033],.011);
    }
    for(let i=0;i<3;i++)ball(torso,darkGold,[0,.21-i*.07,.152],[.006,.006,.004]);
    shoulderBag({color:'#533e32',side:-1,large:true});boots('#49362d',{rugged:true});pendant();
    for(let i=0;i<17;i++){
      const a=i*2.4,x=Math.sin(a)*(.09+(i%3)*.013),z=Math.cos(a)*.065-.02;
      const tuft=mesh(face,new THREE.ConeGeometry(.019+(i%3)*.004,.075+(i%4)*.016,10),fur,[x,.205+(i%4)*.022,z]);tuft.rotation.z=-x*2;
    }
    for(const side of [-1,1])for(let i=0;i<4;i++){
      const tuft=mesh(face,new THREE.ConeGeometry(.021,.095,10),fur,[side*(.085+i*.012),.015-i*.018,-.02]);tuft.rotation.z=side*1.15;
    }
  }else if(appearance.identity==='starlight-maker'){
    const formal=appearance.variant==='formal',explorer=appearance.variant==='explorer',base=formal?'#dfd1bd':explorer?'#282e38':'#1e1b20';
    const cloth=material(base,{roughness:formal?.67:.86,sheen:.42,sheenColor:new THREE.Color(formal?'#fff1d7':'#6c5b5d')}),
      secondary=material(formal?'#302c35':explorer?'#817766':'#302b31',{roughness:.8}),
      starlight=material('#c9a760',{metalness:.81,roughness:.26});
    box(torso,secondary,[0,.07,.13],[.26,.35,.031],.013);
    if(!explorer){
      for(const side of [-1,1]){
        const lapel=box(torso,cloth,[side*.139,.15,.151],[.085,.38,.036],.013);lapel.rotation.z=side*.13;
        const skirt=box(pelvis,cloth,[side*.167,-.34,-.045],[.226,.80,.12],.02);skirt.rotation.z=side*.08;
        box(torso,secondary,[side*.071,-.045,.176],[.11,.26,.021],.009);
      }
      boots(formal?'#b4a998':'#1c1a1d',{rugged:!formal});
    }else{
      box(torso,cloth,[0,.12,.157],[.27,.42,.035],.012);
      for(const side of ['l','r']){
        const calf=aligned(`calf_${side}`);if(calf)box(calf,secondary,[side==='l'?.09:-.09,.10,.027],[.13,.14,.06],.01);
      }
      shoulderBag({color:'#4d3c32',side:-1,large:true});boots('#252328',{rugged:true});
    }
    // Embroidered points and narrow orbit lines match the supplied celestial motifs.
    const parent=torso;
    for(let i=0;i<(explorer?8:14);i++){
      const x=((i*7)%13-6)*.033,y=.30-((i*11)%17)*.026,z=.181;
      ball(parent,starlight,[x,y,z],[i%4===0?.006:.003,.0018,.0017]);
      if(i%4===0){tube(parent,starlight,[[x-.014,y,z],[x+.014,y,z]],.0016);tube(parent,starlight,[[x,y-.017,z],[x,y+.017,z]],.0016);}
    }
    const sun=mesh(face,new THREE.TorusGeometry(.016,.002,7,20),starlight,[0,-.074,.102]);
    for(let i=0;i<8;i++){const angle=i*Math.PI/4;const ray=box(face,starlight,[Math.cos(angle)*.026,-.074+Math.sin(angle)*.026,.104],[.011,.002,.002],.001);ray.rotation.z=angle;}
    tube(face,starlight,[[0,-.015,.089],[0,-.058,.101]],.002);
    const hair=material(explorer?'#81654d':'#6d533f',{roughness:.9});
    for(let i=0;i<22;i++){
      const a=i*2.4,x=Math.sin(a)*(.08+(i%4)*.01),z=Math.cos(a)*.065-.01;
      const tuft=mesh(face,new THREE.ConeGeometry(.022,.08+(i%5)*.013,9),hair,[x,.196+(i%4)*.017,z]);tuft.rotation.z=-x*2.2;
    }
    if(!explorer){
      for(const side of [-1,1])for(let i=0;i<3;i++)ball(torso,starlight,[side*(.14+i*.015),.26-i*.09,.176],[.003,.004,.002]);
    }
  }else{
    const coat=material('#211d20',{roughness:.86,sheen:.52,sheenColor:new THREE.Color('#6b5154')}),
      vest=material('#382b30',{roughness:.77,sheen:.65,sheenColor:new THREE.Color('#937873')}),
      shirt=material('#201b1d',{roughness:.89}),silver=material('#b6aaa0',{metalness:.83,roughness:.23});
    box(torso,shirt,[0,.16,.128],[.225,.29,.026],.013);
    for(const side of [-1,1]){
      const lapel=box(torso,coat,[side*.14,.16,.149],[.091,.39,.04],.014);lapel.rotation.z=side*.14;
      const vestPanel=box(torso,vest,[side*.069,.02,.161],[.108,.27,.024],.012);vestPanel.rotation.z=-side*.09;
      const collar=box(torso,coat,[side*.13,.36,.081],[.16,.11,.07],.014);collar.rotation.z=-side*.19;
      const skirt=box(pelvis,coat,[side*.17,-.36,-.039],[.24,.82,.13],.02);skirt.rotation.z=side*.09;
      // A few restrained brocade lines read at conversation distance.
      for(let i=0;i<3;i++)tube(torso,darkGold,[[side*(.12+i*.012),.28,.172],[side*(.16+i*.009),.15,.175],[side*(.14+i*.013),.02,.17]],.0018);
    }
    for(let i=0;i<4;i++)ball(torso,darkGold,[0,.12-i*.075,.179],[.006,.006,.004]);
    tube(torso,silver,[[.015,-.08,.18],[.09,-.13,.17],[.16,-.095,.12]],.003);
    box(pelvis,leather,[0,.09,.137],[.31,.029,.016],.005);
    box(pelvis,silver,[0,.09,.149],[.037,.036,.009],.005);
    boots('#1c1a1d',{rugged:true});
    // Dark, loosely swept locks remain legible when the source short hair is hidden.
    const hair=material('#282326',{roughness:.88});
    for(let i=0;i<24;i++){
      const a=i*2.4,x=Math.sin(a)*(.08+(i%4)*.009),z=Math.cos(a)*.066-.02;
      const tuft=mesh(face,new THREE.ConeGeometry(.019+(i%3)*.003,.074+(i%5)*.012,9),hair,[x,.197+(i%4)*.016,z]);tuft.rotation.z=-x*2.5;
    }
    for(const side of [-1,1])tube(face,hair,[[side*.08,.18,-.035],[side*.11,.05,-.025],[side*.095,-.035,-.03]],.014);
    tube(face,silver,[[0,-.025,.087],[0,-.078,.1]],.0025);
    ball(face,silver,[0,-.082,.103],[.013,.018,.007]);
  }
  return {dispose(){for(const item of attachments)item.removeFromParent();for(const geometry of resources)geometry.dispose();for(const surface of materials)surface.dispose();}};
}
