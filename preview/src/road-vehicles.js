import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchCostumeAttachments } from './costume-batching.js';
import { VEHICLES } from './vehicle-config.js';
import { createVehicleGlints } from './vehicle-glints.js';

// Authored real-scale meshes, front -X. Shared materials are batched per moving
// assembly; the high-detail wheels and steering remain independent transforms.
export function createRoadVehicle(kind='rolls') {
 const spec=VEHICLES[kind];if(!spec)throw new Error('Unknown road vehicle');
 const object=new THREE.Group();object.name=spec.label;
 const owned=new Set(),groups=[object],wheels=[],hubs=[],spinners=[];
 const material=(name,color,options={})=>{const m=new THREE.MeshPhysicalMaterial({color,roughness:.4,...options});m.name=name;owned.add(m);return m;};
 const pink=material('Pearlescent rose paint','#f386a1',{metalness:.38,roughness:.23,clearcoat:1,clearcoatRoughness:.08});
 const chrome=material('Polished royal gold','#d6ac55',{metalness:1,roughness:.16});
 const alloy=material('Brushed champagne gold','#b99b59',{metalness:.93,roughness:.31});
 const black=material('Recessed black trim','#101216',{roughness:.48});
 const rubber=material('Road tyre rubber','#151719',{roughness:.88});
 const leather=material('Ivory stitched leather','#e5dcd0',{roughness:.82,sheen:.3,sheenColor:'#f4ede3'});
 const darkLeather=material('Oxblood saddle leather','#39242c',{roughness:.78});
 const glass=material('Automotive tinted glass','#b9d1d9',{transparent:true,opacity:.28,roughness:.05,metalness:.15,depthWrite:false,side:THREE.DoubleSide});
 const light=material('LED optical elements','#fff2d7',{emissive:'#ffd995',emissiveIntensity:.8,roughness:.13});
 const red=material('Ruby rear lenses','#8e071d',{emissive:'#e92335',emissiveIntensity:.5,roughness:.2,clearcoat:1});
 const brake=material('Brake calipers','#ab3451',{metalness:.6,roughness:.38});
 const add=(g,mat,pos=[0,0,0],scale=[1,1,1],parent=object)=>{owned.add(g);const mesh=new THREE.Mesh(g,mat);mesh.position.fromArray(pos);mesh.scale.fromArray(scale);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 const box=(pos,size,mat,r=.025,parent=object)=>add(r<.005?new THREE.BoxGeometry(...size):new RoundedBoxGeometry(...size,Math.max(...size)>.3?2:1,r),mat,pos,[1,1,1],parent);
 const ball=(pos,size,mat,parent=object)=>add(new THREE.SphereGeometry(1,24,16),mat,pos,size,parent);
 const tube=(points,r,mat,parent=object)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(8,points.length*5),r,8,false),mat,[0,0,0],[1,1,1],parent);
 const quad=(points,mat,parent=object)=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,2,1,0,3,2].flatMap(i=>points[i]),3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,1,1,0,0,0,0,1,1,1],2));g.computeVertexNormals();return add(g,mat,[0,0,0],[1,1,1],parent);
 };
 const ring=(pos,r,thick,mat,parent=object)=>add(new THREE.TorusGeometry(r,thick,10,64),mat,pos,[1,1,1],parent);
 for(const [index,[x,r,z]] of spec.wheels.entries()) {
  const wheel=new THREE.Group();wheel.position.set(x,r,z);object.add(wheel);groups.push(wheel);wheels.push(wheel);
  const wide=kind==='rolls'?.125:.085,major=r-.067;
  const tyre=ring([0,0,0],major,.067,rubber,wheel);tyre.scale.z=wide/.067;
  for(const side of [-1,1]) {
   ring([0,0,side*wide*.84],r-.037,.004,rubber,wheel);
   ring([0,0,side*wide*.78],r*.71,.012,chrome,wheel);
   const disc=add(new THREE.CylinderGeometry(r*.59,r*.59,.012,48),alloy,[0,0,side*wide*.60],[1,1,1],wheel);disc.rotation.x=Math.PI/2;
   for(let n=0;n<12;n++) {
    const a=n/12*Math.PI*2;
    const spoke=box([Math.cos(a)*r*.43,Math.sin(a)*r*.43,side*wide*.86],[r*.55,.022,.025],chrome,.003,wheel);spoke.rotation.z=a;
    const hole=add(new THREE.CylinderGeometry(.007,.007,.013,8),black,[Math.cos(a+.12)*r*.51,Math.sin(a+.12)*r*.51,side*wide*.69],[1,1,1],wheel);hole.rotation.x=Math.PI/2;
   }
   box([r*.42,0,side*wide*.45],[.055,.12,.038],brake,.012,wheel);
  }
  const hub=ring([0,0,z<0?-wide:wide],.055,.018,chrome,wheel);hubs.push(hub);
  // Independently bearing-mounted gold rotors remain in motion after braking.
  for(const side of kind==='rolls'?[Math.sign(z)]:[-1,1]) {
   const spinner=new THREE.Group();spinner.name='Royal gold wheel spinner';spinner.position.z=side*(wide+.009);wheel.add(spinner);groups.push(spinner);spinners.push({object:spinner,wheel,phase:0,velocity:0});
   ring([0,0,0],r*.69,.009,chrome,spinner);
   for(let blade=0;blade<3;blade++){
    const start=blade*Math.PI*2/3,shape=new THREE.Shape();shape.moveTo(Math.cos(start)*.035,Math.sin(start)*.035);
    for(let i=0;i<=16;i++){const a=start+.12+i/16*1.70;shape.lineTo(Math.cos(a)*r*.68,Math.sin(a)*r*.68);}
    shape.lineTo(Math.cos(start+1.8)*.035,Math.sin(start+1.8)*.035);shape.closePath();
    const cover=add(new THREE.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:false}),chrome,[0,0,side*.018],[1,1,1],spinner);if(side<0)cover.rotation.y=Math.PI;
   }
   for(let blade=0;blade<3;blade++){const a=blade*Math.PI*2/3;const vane=box([Math.cos(a)*r*.28,Math.sin(a)*r*.28,0],[r*.55,.036,.016],chrome,.003,spinner);vane.rotation.z=a+.15;}
   ball([0,0,side*.012],[.043,.043,.018],chrome,spinner);
  }
  for(let n=0;n<64;n++) {
   const a=n/64*Math.PI*2;
   for(const side of [-1,1]) {
    const tread=box([Math.cos(a)*(r-.005),Math.sin(a)*(r-.005),side*wide*.35],[.022,.003,wide*.58],rubber,.001,wheel);tread.rotation.z=a+Math.PI/2;tread.rotation.y=side*.22;
   }
  }
 }
 let steering;
 if(kind==='rolls') {
  // Compact four-wheel limousine shell with the original royal finish.
  // Every deck edge meets a side skin or bulkhead; the cabin stays genuinely open.
  const surface=(nu,nv,sample,mat)=>{
   const positions=[],uv=[],indices=[];
   for(let u=0;u<=nu;u++)for(let v=0;v<=nv;v++){positions.push(...sample(u/nu,v/nv));uv.push(u/nu,v/nv);}
   for(let u=0;u<nu;u++)for(let v=0;v<nv;v++){const a=u*(nv+1)+v,b=a+nv+1;indices.push(a,a+1,b,b,a+1,b+1);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return add(g,mat);
  };
  for(const side of [-1,1]) {
   const shape=new THREE.Shape();shape.moveTo(-3.27,.35);shape.lineTo(-3.27,.91);shape.quadraticCurveTo(-3.08,1.04,-2.85,1.04);shape.lineTo(2.67,1.04);shape.quadraticCurveTo(3.23,1.01,3.27,.73);shape.lineTo(3.27,.35);
   for(const cx of [2,-2.25]){shape.lineTo(cx+.63,.35);for(let i=0;i<=32;i++){const a=i/32*Math.PI;shape.lineTo(cx+.63*Math.cos(a),.35+.44*Math.sin(a));}}
   shape.lineTo(-3.27,.35);
   add(new THREE.ExtrudeGeometry(shape,{depth:.085,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:20}),pink,[0,0,side<0?-1.045:.96]);
   tube([[-3.19,.90,side*1.067],[-2.82,.94,side*1.067],[2.65,.94,side*1.067],[3.18,.79,side*1.05]],.012,chrome);
   tube([[-.82,.34,side*1.067],[1.54,.34,side*1.067]],.018,chrome);
   for(const x of [-.79,.68,1.59])tube([[x,.40,side*1.066],[x,.72,side*1.067],[x,1.04,side*1.066]],.003,black);
   for(const x of [.42,.97])box([x,.97,side*1.075],[.18,.028,.018],chrome,.008);
   box([.49,.86,side*.937],[2.30,.26,.085],leather,.035);
   tube([[-.70,1.045,side*.965],[1.91,1.045,side*.965]],.016,chrome);
   box([-.61,1.10,side*1.025],[.20,.07,.10],chrome,.03);
  }
  box([0,.28,0],[6.35,.13,1.91],black,.06);
  // Sealed bonnet, rear deck and full-width front/rear fascias.
  surface(30,24,(u,v)=>{const x=-3.26+u*2.50,z=(v*2-1)*1.015;return [x,1.045+.10*(1-(z/1.015)**2)*(1-u*.55)-.10*(1-u)**8,z];},pink);
  surface(24,24,(u,v)=>{const x=1.98+u*1.27,z=(v*2-1)*1.015;return [x,1.045+.09*(1-(z/1.015)**2)-.27*u**4,z];},pink);
  box([-3.23,.69,0],[.13,.65,2.04],pink,.06);box([3.20,.55,0],[.14,.43,2.02],pink,.08);
  for(const x of [-3.24,3.22]){box([x,.35,0],[.18,.15,2.12],chrome,.065);box([x*1.014,.39,0],[.018,.028,1.98],black,.006);}
  box([-3.312,.67,0],[.055,.34,.95],chrome,.01);box([-3.346,.67,0],[.015,.29,.875],black,.006);
  for(let i=-9;i<=9;i++)box([-3.36,.67,i*.044],[.016,.27,.008],chrome,.003);
  for(const side of [-1,1]) {
   box([-3.307,.91,side*.75],[.035,.09,.47],black,.018);
   tube([[-3.331,.923,side*.53],[-3.332,.923,side*.84],[-3.31,.895,side*.985]],.011,light);
   tube([[-3.328,.887,side*.56],[-3.330,.887,side*.82]],.004,chrome);
   box([3.282,.61,side*.86],[.028,.17,.095],red,.025);
   tube([[2.80,1.04,side*.84],[3.12,.91,side*.87]],.016,chrome);
  }
  add(new THREE.CylinderGeometry(.022,.03,.025,16),chrome,[-3.05,1.13,0]);
  tube([[-3.05,1.14,0],[-3.07,1.20,0],[-3.10,1.21,0]],.010,chrome);
  for(const side of [-1,1])tube([[-3.06,1.18,0],[-3.00,1.22,side*.045],[-2.96,1.23,side*.06]],.008,chrome);
  // Flush luminous belt and gold prow crest give the classic a future-royal finish.
  for(const side of [-1,1])tube([[-3.10,.975,side*1.071],[-2.80,1.002,side*1.071],[2.62,1.002,side*1.071],[3.10,.86,side*1.048]],.006,light);
  // Arched glass canopy, with swept ends and continuous polished perimeter.
  const canopy=(u,v)=>{const a=v*Math.PI,h=Math.sin(a),z=-Math.cos(a)*.965;return [-.78+u*2.82+(.38*(1-u)-.33*u)*h,1.055+.91*h,z];};
  surface(32,48,canopy,glass);
  for(const u of [0,.49,1])tube(Array.from({length:49},(_,i)=>canopy(u,i/48)),u===.49?.016:.023,chrome);
  for(const side of [0,1])tube(Array.from({length:33},(_,i)=>canopy(i/32,side)),.018,chrome);
  // Close the curved front and rear ends down to the deck (no roof slab).
  for(const u of [0,1])surface(12,48,(t,v)=>{const p=canopy(u,v);return [p[0],1.055+(p[1]-1.055)*t,p[2]];},glass);
  for(const x of [spec.driverSeat[0]/.7,spec.passengerSeat[0]/.7])for(const z of [-.43,.43]) {
   box([x,.61,z],[.60,.12,.71],leather,.055);
   const back=box([x+.27,.96,z],[.13,.65,.68],leather,.055);back.rotation.z=-.12;
   box([x+.29,1.29,z],[.12,.20,.32],leather,.045);
   for(let i=-3;i<=3;i++)tube([[x-.23,.674,z+i*.08],[x+.18,.674,z+i*.08]],.002,darkLeather);
  }
  box([-.65,.97,0],[.19,.19,1.85],darkLeather,.05);
  box([-.545,1.0,.43],[.016,.10,.28],black,.01);
  steering=new THREE.Group();steering.position.set(-.48,1.03,.43);steering.rotation.y=Math.PI/2;object.add(steering);groups.push(steering);
  ring([0,0,0],.17,.018,darkLeather,steering);
  for(const a of [0,2.1,4.2])tube([[0,0,0],[Math.sin(a)*.15,Math.cos(a)*.15,0]],.012,chrome,steering);
  box([0,0,0],[.065,.065,.03],black,.015,steering);
 } else {
  // Twin-cylinder cruiser with exposed mechanical assemblies and fitted pillion.
  for(const side of [-1,1]) {
   tube([[-.76,1.05,side*.12],[-.61,.43,side*.21],[.55,.38,side*.22],[.66,.75,side*.18],[-.76,1.05,side*.12]],.032,black);
   tube([[.58,.70,side*.21],[.77,.34,side*.10]],.032,chrome);
   tube([[-.79,1.18,side*.12],[-1.02,.33,side*.12]],.031,chrome);
   tube([[-.77,1.05,side*.12],[-.99,.38,side*.12]],.044,alloy);
   tube([[-.25,.54,side*.20],[.05,.31,side*.28],[.83,.29,side*.29]],.042,chrome);
   box([.44,.285,side*.29],[.65,.11,.11],chrome,.045);
   tube([[-.36,.32,side*.14],[-.36,.32,side*.37]],.022,chrome);
   box([.17,.38,side*.31],[.13,.028,.10],rubber,.012);
   tube([[.40,.91,side*.22],[.67,1.04,side*.23]],.017,chrome);
   const shock=add(new THREE.CylinderGeometry(.04,.04,.28,16),alloy,[.62,.55,side*.22]);shock.rotation.z=-.3;
   for(let i=0;i<8;i++){const spring=ring([.62,.43+i*.034,side*.22],.05,.006,chrome);spring.rotation.x=Math.PI/2;}
  }
  ball([-.48,.96,0],[.29,.18,.235],pink);
  for(const side of [-1,1]){tube([[-.70,.99,side*.15],[-.48,1.10,side*.16],[-.25,1.0,side*.14]],.008,chrome);tube([[-.68,.99,side*.18],[-.48,1.04,side*.22],[-.27,.99,side*.18]],.004,light);}
  const cap=add(new THREE.CylinderGeometry(.035,.035,.012,24),chrome,[-.48,1.14,0]);
  box([-.1,.767,0],[.42,.09,.40],darkLeather,.044);box([.43,.872,0],[.43,.075,.36],darkLeather,.035);
  for(const x of [-.15,-.04,.3,.4,.5])tube([[x,.815+(x>0?.095:0),-.15],[x,.825+(x>0?.095:0),0],[x,.815+(x>0?.095:0),.15]],.002,alloy);
  ball([0,.52,0],[.24,.22,.24],alloy);
  for(const side of [-1,1]){
   ball([.02,.54,side*.225],[.40,.22,.055],pink);
   tube([[-.30,.52,side*.269],[.03,.40,side*.278],[.35,.51,side*.260]],.009,chrome);
   tube([[-.27,.54,side*.278],[.03,.47,side*.285],[.30,.55,side*.272]],.005,light);
  }
  for(const x of [-.19,.15]) {
   const cylinder=add(new THREE.CylinderGeometry(.125,.13,.30,24),black,[x,.64,0]);cylinder.rotation.z=x<0?-.45:.45;
   for(let i=0;i<9;i++){const fin=add(new THREE.CylinderGeometry(.137,.137,.015,24),alloy,[x,.51+i*.028,0]);fin.rotation.z=x<0?-.45:.45;}
  }
  for(const [x,r] of spec.wheels) {
   const shape=new THREE.Shape();for(let i=0;i<=40;i++){const a=.15+i/40*(Math.PI-.30),px=x+Math.cos(a)*(r+.065),y=r+Math.sin(a)*(r+.065);if(!i)shape.moveTo(px,y);else shape.lineTo(px,y);}for(let i=40;i>=0;i--){const a=.15+i/40*(Math.PI-.30);shape.lineTo(x+Math.cos(a)*(r+.045),r+Math.sin(a)*(r+.045));}
   add(new THREE.ExtrudeGeometry(shape,{depth:.19,bevelEnabled:false}),pink,[0,0,-.095]);
  }
  steering=new THREE.Group();object.add(steering);groups.push(steering);
  tube([[-.75,1.08,0],[-.62,1.13,-.26],[-.65,1.15,-.36]],.021,chrome,steering);
  tube([[-.75,1.08,0],[-.62,1.13,.26],[-.65,1.15,.36]],.021,chrome,steering);
  for(const side of [-1,1]) {
   const grip=add(new THREE.CylinderGeometry(.024,.024,.12,20),rubber,[-.65,1.15,side*.34],[1,1,1],steering);grip.rotation.x=Math.PI/2;
   tube([[-.65,1.15,side*.28],[-.69,1.29,side*.36]],.009,chrome,steering);
   ball([-.69,1.29,side*.36],[.026,.047,.073],chrome,steering);
   tube([[-.73,1.13,side*.21],[-.72,.77,side*.10],[-.51,.56,side*.12]],.007,black);
  }
  const pivot=new THREE.Vector3(-.75,1.08,0);for(const child of steering.children)child.position.sub(pivot);steering.position.copy(pivot);
  box([-.86,1.04,0],[.13,.19,.38],pink,.055);
  box([-.932,1.045,0],[.02,.115,.30],black,.03);
  tube([[-.949,1.08,-.13],[-.953,1.01,0],[-.949,1.08,.13]],.011,light);
  quad([[-.86,1.14,-.22],[-.70,1.43,-.16],[-.70,1.43,.16],[-.86,1.14,.22]],glass);
  for(const side of [-1,1])tube([[-.86,1.14,side*.22],[-.70,1.43,side*.16]],.009,chrome);
  tube([[-.70,1.43,-.16],[-.70,1.45,0],[-.70,1.43,.16]],.007,chrome);
  box([1.09,.66,0],[.048,.052,.16],red,.019);
  box([1.10,.51,0],[.025,.14,.17],black,.01);
 }
 batchCostumeAttachments(groups.map(group=>({group})),owned);
 if(kind==='rolls') {
  // Keep full-size occupants and round wheels while shortening and narrowing
  // the coach by 30%. The chassis and cabin scale in plan; wheels stay round.
  const coach=new THREE.Group();coach.name='Compact royal coach';
  for(const child of [...object.children])if(!wheels.includes(child))coach.add(child);
  coach.scale.set(.7,1,.7);object.add(coach);
 }
 object.updateMatrixWorld(true);
 const wheelTreads=wheels.map(wheel=>{const samples=[],seen=new Set();wheel.traverse(mesh=>{if(!mesh.isMesh||mesh.material!==rubber)return;const matrix=wheel.matrixWorld.clone().invert().multiply(mesh.matrixWorld);const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix),key=point.toArray().map(v=>v.toFixed(6)).join(',');if(!seen.has(key)){seen.add(key);samples.push(point);}}});return samples;});
 const glints=createVehicleGlints(spec);object.add(glints.object);
 let disposed=false,lastTime=null;
 return {object,wheels,wheelTreads,steering,spec,spinners:spinners.map(s=>s.object),
  animate(now,speed=0,reducedMotion=false){const dt=lastTime===null?0:Math.max(0,Math.min(.08,(now-lastTime)/1000));lastTime=now;for(const s of spinners){s.velocity+=(Math.abs(speed)*2.8-s.velocity)*(1-Math.exp(-(speed?.9:.35)*dt));s.phase+=reducedMotion?0:s.velocity*dt;s.object.rotation.z=s.phase-s.wheel.rotation.z;}glints.update(now,reducedMotion);},
  updateSteering(angle){object.userData.driveSteeringAngle=angle;if(kind==='rolls')steering.rotation.z=-angle*2.2;else steering.rotation.y=angle*.6;},dispose(){if(disposed)return;disposed=true;glints.dispose();object.removeFromParent();owned.forEach(r=>r.dispose());object.clear();}};
}
