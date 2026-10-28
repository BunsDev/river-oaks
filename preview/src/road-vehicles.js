import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchCostumeAttachments } from './costume-batching.js';
import { VEHICLES } from './vehicle-config.js';
import { BICYCLE_CRANK, BICYCLE_SEATPOST, bicyclePedal, bicyclePedalPitch } from './bicycle-crank.js';
import { createVehicleGlints } from './vehicle-glints.js';

// Authored real-scale meshes, front -X. Shared materials are batched per moving
// assembly; the high-detail wheels and steering remain independent transforms.
// A pedalling bicycle (one being ridden) also turns its crank and pedals;
// parked bikes keep them in the frame batch.
export function createRoadVehicle(kind='rolls',{pedalling=false}={}) {
 const spec=VEHICLES[kind];if(!spec)throw new Error('Unknown road vehicle');
 const object=new THREE.Group();object.name=spec.label;
 const owned=new Set(),groups=[object],wheels=[],hubs=[],spinners=[],pedals=[];let crank=null,saddle=null;
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
  if(spec.hover) {
   // A hover coach has no wheels to see. Each lift pod stands on an unseen
   // tyre of road rubber, so ground fitting, tyre clearances and the parking
   // envelope treat it exactly like the car; the pods themselves float above.
   const contact=add(new THREE.CylinderGeometry(r,r,.14,32),rubber,[0,0,0],[1,1,1],wheel);contact.rotation.x=Math.PI/2;
   contact.visible=false;contact.castShadow=contact.receiveShadow=false;contact.name='Hover ground contact';
   continue;
  }
  if(kind==='bicycle') {
   // A real bicycle wheel: slim rubber tyre (still rubber, so tread sampling and
   // tyre clearances work), thin chrome rim, 20 radial spokes laced alternately
   // to either hub flange. No disc hub, caliper, spinners or tread blocks.
   ring([0,0,0],r-.028,.028,rubber,wheel);
   ring([0,0,0],r-.062,.009,chrome,wheel);
   const hub=add(new THREE.CylinderGeometry(.025,.025,.07,16),chrome,[0,0,0],[1,1,1],wheel);hub.rotation.x=Math.PI/2;hubs.push(hub);
   for(let n=0;n<20;n++) {
    const a=n/20*Math.PI*2,inner=.025,outer=r-.062,mid=(inner+outer)/2,flange=(n%2?1:-1)*.012;
    const spoke=add(new THREE.CylinderGeometry(.0025,.0025,outer-inner,6),chrome,[Math.cos(a)*mid,Math.sin(a)*mid,flange],[1,1,1],wheel);spoke.rotation.z=a-Math.PI/2;
   }
   continue;
  }
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
 let steering,hoverMotion=null;
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
 } else if(kind==='motorcycle') {
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
 } else if(kind==='bicycle') {
  // A step-through city bike in rose and bronze: tubes for the frame, a
  // leather saddle at the spec seat, bronze fork and bars that steer.
  const frame=pink,bronze=alloy;
  tube([[-.42,.62,0],[.05,.30,0]],.022,frame);           // down tube: head to bottom bracket
  tube([[.05,.30,0],[.14,.88,0]],.022,frame);            // seat tube
  tube([[.14,.88,0],[.52,.34,0]],.016,frame);            // seat stays
  tube([[.05,.30,0],[.52,.34,0]],.016,frame);            // chain stays
  tube([[-.42,.62,0],[-.46,.98,0]],.024,bronze);         // head tube
  // The crank on the bottom bracket: a chainring on the right, two arms and
  // free pedals (bicycle-crank.js). A ridden bike turns it with setCrank.
  const {center,length}=BICYCLE_CRANK,hub=pedalling?[0,0]:center;
  if(pedalling){crank=new THREE.Group();crank.position.set(...center,0);object.add(crank);groups.push(crank);}
  const ring=add(new THREE.CylinderGeometry(.09,.09,.012,24),black,[hub[0],hub[1],-.045],[1,1,1],crank??object);ring.rotation.x=Math.PI/2;
  for(const side of [-1,1])box([hub[0]-side*length/2,hub[1],side*.07],[length+.02,.022,.012],black,.003,crank??object); // arms
  for(const side of ['r','l']){
   const pedal=pedalling?new THREE.Group():null,at=bicyclePedal(side,0);
   if(pedal){pedal.position.fromArray(at);object.add(pedal);groups.push(pedal);pedals.push({side,pedal});}
   box(pedal?[0,0,0]:at,[.09,.02,.09],black,.003,pedal??object);
  }
  // The saddle on its seat post. A ridden bike raises it up the seat tube to fit
  // its rider (setSaddle); the post's foot stays hidden in the tube.
  if(pedalling){saddle=new THREE.Group();object.add(saddle);groups.push(saddle);}
  const [postX,postY]=BICYCLE_SEATPOST.axis,post=pedalling?BICYCLE_SEATPOST.reach+.02:0;
  box([.12,.92,0],[.27,.06,.15],darkLeather,.03,saddle??object);        // saddle
  tube([[.14-postX*post,.88-postY*post,0],[.14,.88,0],[.12,.90,0]],.014,bronze,saddle??object); // seat post
  for(const [x,r] of spec.wheels) {
   const shape=new THREE.Shape();
   for(let i=0;i<=40;i++){const a=.35+i/40*(Math.PI-.7),px=x+Math.cos(a)*(r+.045),y=r+Math.sin(a)*(r+.045);if(!i)shape.moveTo(px,y);else shape.lineTo(px,y);}
   for(let i=40;i>=0;i--){const a=.35+i/40*(Math.PI-.7);shape.lineTo(x+Math.cos(a)*(r+.02),r+Math.sin(a)*(r+.02));}
   add(new THREE.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:false}),pink,[0,0,-.03]);  // mudguard
  }
  steering=new THREE.Group();object.add(steering);groups.push(steering);
  tube([[-.46,.98,0],[-.52,.62,0],[-.525,.34,0]],.014,bronze,steering);     // fork
  tube([[-.42,1.02,-.22],[-.46,1.0,0],[-.42,1.02,.22]],.012,bronze,steering); // bars
  for(const side of [-1,1]){const grip=add(new THREE.CylinderGeometry(.016,.016,.09,12),rubber,[-.42,1.02,side*.22],[1,1,1],steering);grip.rotation.x=Math.PI/2;}
  const pivot=new THREE.Vector3(-.46,.98,0);for(const child of steering.children)child.position.sub(pivot);steering.position.copy(pivot);
  tube([[-.49,.92,0],[-.52,.86,0]],.010,light);          // headlamp stalk
  ball([-.52,.86,0],[.03,.03,.02],light);
 } else if(kind==='hover') {
  // The landowner hover coach after the 2026-10-28 reference: a teardrop streamliner
  // hull (a blunt nose, a long tapering tail) in seafoam pearl with chrome trim, a
  // wrap-around canopy under a tinted roof band, an open left door with a fold-out
  // stair onto a cream lounge, four portholes a side, an idling rotor, a ducted tail
  // fan and torpedo lift pods tucked under the belly on their own light. The hull is
  // two half-ellipsoids of sphere patches meeting at the widest section, so the
  // doorway is a real opening. The shell is drawn at the reference's proportions and
  // scaled 30% smaller in plan (S); the seats, stair and portholes stay full size in
  // an unscaled cabin group so the riders fit.
  const S=.7;
  const seafoam=material('Seafoam pearl paint','#a9cfdd',{metalness:.3,roughness:.22,clearcoat:1,clearcoatRoughness:.08});
  const silver=material('Polished chrome','#e4ebef',{metalness:1,roughness:.12});
  const cream=material('Cream lounge leather','#efe5d4',{roughness:.8,sheen:.3,sheenColor:'#fbf5ea'});
  const carpet=material('Cabin carpet','#cfc2ad',{roughness:.95});
  const canopy=material('Hover coach canopy glass','#bfdbe6',{transparent:true,opacity:.26,roughness:.05,metalness:.15,depthWrite:false,side:THREE.DoubleSide});
  const tint=material('Hover coach tinted roof','#1d2a33',{transparent:true,opacity:.78,roughness:.08,metalness:.4,depthWrite:false,side:THREE.DoubleSide});
  const charcoal=material('Rotor charcoal','#2b3137',{metalness:.5,roughness:.45});
  const lift=material('Hover lift light','#9fe8ff',{transparent:true,opacity:.42,depthWrite:false,emissive:'#7fdcff',emissiveIntensity:1.4,roughness:.3,side:THREE.DoubleSide});
  const beam=material('Hover lift beam','#9fe8ff',{transparent:true,opacity:.16,depthWrite:false,emissive:'#7fdcff',emissiveIntensity:1.1,roughness:.3,side:THREE.DoubleSide});
  const blur=material('Rotor blur','#2b3137',{transparent:true,opacity:0,depthWrite:false,roughness:.6,side:THREE.DoubleSide});
  // Hull (unscaled frame): semi-axes AF (nose half) and AR (tail half) along X, B up, C across,
  // about (CX, CY, 0). Sphere azimuth 0 is the nose (-X); polar 0 is the roof. The halves meet at x = CX.
  const AF=2.05,AR=2.8,B=.8,C=1.05,CX=-.85,CY=1.31,BELT=1.52;
  const axis=phi=>Math.cos(phi)>=0?AF:AR;
  const W=([x,y,z])=>[x*S,y,z*S];
  const hull=new THREE.Group();hull.name='Hover coach hull';hull.scale.set(S,1,S);object.add(hull);groups.push(hull);
  const cabin=new THREE.Group();cabin.name='Hover coach cabin';object.add(cabin);groups.push(cabin);
  const P=(phi,theta,s=1)=>[CX-axis(phi)*s*Math.cos(phi)*Math.sin(theta),CY+B*s*Math.cos(theta),C*s*Math.sin(phi)*Math.sin(theta)];
  // A patch spanning both halves is cut at the seam azimuths (odd multiples of pi/2).
  const patch=(mat,phiStart,phiLength,thetaStart,thetaLength)=>{
   const cuts=[phiStart];
   for(let k=Math.ceil((phiStart-Math.PI/2)/Math.PI);Math.PI/2+k*Math.PI<phiStart+phiLength-1e-6;k++){const s=Math.PI/2+k*Math.PI;if(s>phiStart+1e-6)cuts.push(s);}
   cuts.push(phiStart+phiLength);
   for(let i=0;i<cuts.length-1;i++){const a=cuts[i],b=cuts[i+1];add(new THREE.SphereGeometry(1,Math.max(8,Math.round((b-a)*20)),Math.max(6,Math.round(thetaLength*12)),a,b-a,thetaStart,thetaLength),mat,[CX,CY,0],[axis((a+b)/2),B,C],hull);}
  };
  const loop=(theta,s,r,mat,from=0,to=Math.PI*2)=>tube(Array.from({length:65},(_,i)=>P(from+(to-from)*i/64,theta,s)),r,mat,hull);
  // Door on the left (+Z) behind the cockpit: azimuth 1.35..1.9, polar 1.05..2.45.
  const D0=1.35,D1=1.9,DT=1.05,DB=2.45,FRONT=1.1,ROOF=.62;
  patch(seafoam,0,Math.PI*2,0,.35);                       // roof cap under the mast
  patch(tint,-FRONT,FRONT*2,.35,ROOF-.35);                 // tinted band over the windscreen
  patch(canopy,-FRONT,FRONT*2,ROOF,BELT-ROOF);             // wrap-around canopy
  patch(seafoam,FRONT,D0-FRONT,.35,BELT-.35);              // left pillar
  patch(seafoam,D0,D1-D0,.35,DT-.35);                      // above the door
  patch(seafoam,D1,Math.PI*2-FRONT-D1,.35,BELT-.35);       // tail and right flank round to the right pillar
  patch(seafoam,D1,Math.PI*2-(D1-D0),BELT,Math.PI-BELT);   // lower hull, all but the doorway
  patch(seafoam,D0,D1-D0,DB,Math.PI-DB);                   // door sill
  // Chrome belt with a nose spear, a lower trim line and the doorway frame hugging the surface.
  loop(BELT,1.012,.03,silver);
  loop(2.55,1.01,.018,silver);
  for(const side of [-1,1])tube([P(side*1.2,BELT-.1,1.012),P(side*.7,BELT-.13,1.012),P(side*.25,BELT-.16,1.014),P(0,BELT-.2,1.02)],.02,silver,hull);
  tube([...Array.from({length:9},(_,i)=>P(D0+(D1-D0)*i/8,DT,1.012)),...Array.from({length:13},(_,i)=>P(D1,DT+(DB-DT)*i/12,1.012)),...Array.from({length:9},(_,i)=>P(D1-(D1-D0)*i/8,DB,1.012)),...Array.from({length:13},(_,i)=>P(D0,DB-(DB-DT)*i/12,1.012))],.032,silver,hull);
  // Canopy mullions, the tinted band's rail, the nose emblem and headlamps.
  for(const phi of [-FRONT,-.55,0,.55,FRONT])tube(Array.from({length:13},(_,i)=>P(phi,.35+(BELT-.35)*i/12,1.008)),.015,silver,hull);
  for(const theta of [.36,ROOF])tube(Array.from({length:21},(_,i)=>P(-FRONT+FRONT*2*i/20,theta,1.008)),.015,silver,hull);
  ball(W(P(0,Math.PI/2,1.004)),[.04,.09,.07],silver,cabin);
  ring(W(P(0,1.86,1.006)),.08,.012,silver,cabin).rotation.y=Math.PI/2;
  ball(W(P(0,1.86,1.004)),[.025,.065,.065],light,cabin);
  for(const side of [-1,1])ball(W(P(side*.3,1.7,1.004)),[.05,.07,.08],light,cabin);
  // Four portholes a side behind the door: a chrome ring and a glass disc on the skin (full size, unscaled).
  for(const side of [-1,1])for(const x of [.65,1.0,1.35,1.68]) {
   const theta=1.2,phi=Math.acos(-(x-CX)/(AR*Math.sin(theta)))*side,point=new THREE.Vector3(...W(P(phi,theta,1.006)));
   const normal=new THREE.Vector3((point.x-CX*S)/((AR*S)**2),(point.y-CY)/(B*B),point.z/((C*S)**2)).normalize();
   const porthole=ring(point.toArray(),.09,.014,silver,cabin);porthole.lookAt(point.clone().add(normal));
   const pane=add(new THREE.CircleGeometry(.08,24),canopy,point.toArray(),[1,1,1],cabin);pane.lookAt(point.clone().add(normal));
  }
  // A two-step fold-out stair on chrome stringers drops from the sill between the pods.
  const SILL=W(P((D0+D1)/2,DB,1));
  for(let i=0;i<2;i++){const y=SILL[1]-.22*(i+1),z=SILL[2]+.08+.2*(i+1);box([-.43,y,z],[.36,.03,.2],cream,.008,cabin);box([-.43,y-.012,z+.09],[.36,.012,.03],silver,.004,cabin);}
  for(const x of [-.6,-.26])tube([[x,SILL[1]+.02,SILL[2]],[x,SILL[1]-.24,SILL[2]+.3],[x,SILL[1]-.46,SILL[2]+.5]],.012,silver,cabin);
  // Cream lounge on an elliptical carpet: the pilot's seat and console, the passenger's
  // armchair opposite the door, a settee along the right flank and a chrome side table.
  const FLOOR=spec.driverFloor,fs=Math.sqrt(1-((FLOOR-CY)/B)**2)*.98;
  const floor=add(new THREE.ShapeGeometry(new THREE.Shape(Array.from({length:64},(_,i)=>{const phi=Math.PI*2*i/64;return new THREE.Vector2(CX-axis(phi)*fs*Math.cos(phi),C*fs*Math.sin(phi));}))),carpet,[0,FLOOR,0],[1,1,1],hull);floor.rotation.x=-Math.PI/2;
  const seat=(x,z,width=.52)=>{
   box([x,FLOOR+.32,z],[width,.10,.5],cream,.045,cabin);
   const back=box([x+.25,FLOOR+.65,z],[.12,.58,width-.06],cream,.045,cabin);back.rotation.z=-.1;
   box([x+.27,FLOOR+.98,z],[.11,.17,.3],cream,.04,cabin);
   for(let i=-2;i<=2;i++)tube([[x-.18,FLOOR+.372,z+i*.1],[x+.16,FLOOR+.372,z+i*.1]],.002,darkLeather,cabin);
  };
  seat(spec.driverSeat[0],spec.driverSeat[2]);seat(spec.passengerSeat[0],spec.passengerSeat[2]);
  box([.4,FLOOR+.32,-.36],[.7,.10,.34],cream,.045,cabin);
  box([.4,FLOOR+.6,-.54],[.68,.52,.1],cream,.045,cabin);
  for(const x of [.22,.58])box([x,FLOOR+.9,-.53],[.26,.15,.1],cream,.04,cabin);
  add(new THREE.CylinderGeometry(.018,.018,.4,10),silver,[.25,FLOOR+.2,.04],[1,1,1],cabin);
  add(new THREE.CylinderGeometry(.16,.16,.02,24),silver,[.25,FLOOR+.4,.04],[1,1,1],cabin);
  box([spec.driverSeat[0]-.33,FLOOR+.5,spec.driverSeat[2]],[.2,.14,.42],charcoal,.03,cabin);
  tube([[spec.driverSeat[0]-.33,FLOOR+.56,spec.driverSeat[2]],spec.steeringPivot],.02,silver,cabin);
  steering=new THREE.Group();steering.position.set(...spec.steeringPivot);steering.rotation.y=Math.PI/2;object.add(steering);groups.push(steering);
  ring([0,0,0],.15,.015,darkLeather,steering);
  for(const a of [0,2.1,4.2])tube([[0,0,0],[Math.sin(a)*.13,Math.cos(a)*.13,0]],.01,silver,steering);
  box([0,0,0],[.06,.06,.03],charcoal,.012,steering);
  // Rotor: a dorsal fairing, chrome mast and hub, four blades; the blur disc fades in with rotor speed.
  ball([CX,CY+B-.03,0],[.4,.1,.24],seafoam,hull);
  const MAST=CY+B+.07;
  add(new THREE.CylinderGeometry(.05,.07,.18,16),silver,[CX*S,MAST,0],[1,1,1],cabin);
  const rotor=new THREE.Group();rotor.name='Hover coach rotor';rotor.position.set(CX*S,MAST+.1,0);object.add(rotor);groups.push(rotor);
  add(new THREE.CylinderGeometry(.08,.08,.11,20),silver,[0,0,0],[1,1,1],rotor);
  for(let i=0;i<4;i++){const blade=box([.78,0,0],[1.5,.016,.12],charcoal,.004,rotor);blade.rotation.set(.06,i*Math.PI/2,0,'YXZ');const tip=box([1.5,0,0],[.1,.018,.12],silver,.004,rotor);tip.rotation.y=i*Math.PI/2;}
  const rotorBlur=add(new THREE.CircleGeometry(1.54,48),blur,[CX*S,MAST+.1,0],[1,1,1],cabin);rotorBlur.rotation.x=-Math.PI/2;rotorBlur.castShadow=rotorBlur.receiveShadow=false;rotorBlur.userData.aoExclude=true;
  // Tail: a tapering boom, swept dorsal and ventral fins, stabilisers and the ducted fan.
  const boom=add(new THREE.CylinderGeometry(.13,.36,1.3,20),seafoam,[CX+2.65,CY+.39,0],[1,1,1],hull);boom.rotation.z=-Math.PI/2+.14;
  tube([[CX+2.0,CY+.22,0],[CX+2.7,CY+.39,0],[CX+3.3,CY+.49,0]],.015,silver,hull);
  const fin=box([CX+3.05,CY+.74,0],[.72,.46,.05],seafoam,.015,hull);fin.rotation.z=.5;
  const keel=box([CX+3.05,CY+.06,0],[.5,.34,.04],seafoam,.012,hull);keel.rotation.z=-.5;
  for(const side of [-1,1]){const stab=box([CX+3.1,CY+.46,side*.4],[.5,.04,.5],seafoam,.012,hull);stab.rotation.y=side*.25;}
  const duct=ring([(CX+3.4)*S,CY+.49,0],.28,.05,silver,cabin);duct.rotation.y=Math.PI/2;
  const fan=new THREE.Group();fan.name='Hover coach tail fan';fan.position.set((CX+3.4)*S,CY+.49,0);object.add(fan);groups.push(fan);
  ball([0,0,0],[.05,.07,.07],silver,fan);
  for(let i=0;i<6;i++){const blade=box([0,.13,0],[.016,.2,.06],charcoal,.004,fan);blade.rotation.x=i*Math.PI/3;blade.rotation.y=.5;}
  // Torpedo lift pods tucked into the belly, each with a chrome nose cone, a chrome band and a
  // lens underneath; where the hull rides higher a short fairing joins them.
  const pods=new THREE.Group();pods.name='Hover coach lift pods';pods.scale.set(S,1,S);object.add(pods);groups.push(pods);
  for(const [wx,,wz] of spec.wheels) {
   const x=wx/S,z=wz/S,top=.87;
   ball([x,.57,z],[.95,.3,.36],seafoam,pods);
   const band=ring([x-.2,.57,z],.31,.012,silver,pods);band.rotation.y=Math.PI/2;
   ball([x-.93,.57,z],[.1,.13,.14],silver,pods);
   ball([x,.28,z],[.34,.03,.16],light,pods);
   const bottom=CY-B*Math.sqrt(Math.max(0,1-((x-CX)/axis(x<CX?0:Math.PI))**2-(z/C)**2));
   if(bottom>top+.02)ball([x,(bottom+top)/2,z*.92],[.6,(bottom-top)/2+.05,.3],seafoam,pods);
  }
  // Light pools and beams under the pods and the belly: no light sources, just emissive glass.
  const lights=new THREE.Group();lights.name='Hover coach lift light';lights.scale.set(S,1,S);object.add(lights);groups.push(lights);
  for(const [wx,,wz] of spec.wheels) {
   const x=wx/S,z=wz/S;
   const pool=add(new THREE.CircleGeometry(.5,32),lift,[x,.012,z],[1.3,1,1],lights);pool.rotation.x=-Math.PI/2;
   add(new THREE.CylinderGeometry(.14,.4,.26,24,1,true),beam,[x,.15,z],[1.3,1,1],lights);
  }
  const belly=add(new THREE.CircleGeometry(1.1,40),lift,[CX+.3,.01,0],[1.7,1,1],lights);belly.rotation.x=-Math.PI/2;
  let rotorVelocity=0,rotorPhase=0;
  hoverMotion=(now,dt,speed,reducedMotion)=>{
   rotorVelocity+=((reducedMotion?0:5+Math.min(1,Math.abs(speed)/spec.maxSpeed)*24)-rotorVelocity)*(1-Math.exp(-1.2*dt));
   rotorPhase+=rotorVelocity*dt;rotor.rotation.y=rotorPhase;fan.rotation.x=rotorPhase*2.3;
   blur.opacity=Math.max(0,(rotorVelocity-9)/20)*.14;
   const pulse=reducedMotion?0:Math.sin(now/1000*2.1);
   lift.opacity=.40+.05*pulse;beam.opacity=.15+.03*pulse;
   pods.position.y=reducedMotion?0:.012*Math.sin(now/1000*1.3);
  };
 }
 batchCostumeAttachments(groups.map(group=>({group})),owned);
 if(kind==='hover')for(const name of ['Hover coach lift light'])object.getObjectByName(name)?.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=mesh.receiveShadow=false;mesh.userData.aoExclude=true;}});
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
 return {object,wheels,wheelTreads,steering,spec,spinners:spinners.map(s=>s.object),pedals:Object.fromEntries(pedals.map(({side,pedal})=>[side,pedal])),
  animate(now,speed=0,reducedMotion=false){const dt=lastTime===null?0:Math.max(0,Math.min(.08,(now-lastTime)/1000));lastTime=now;for(const s of spinners){s.velocity+=(Math.abs(speed)*2.8-s.velocity)*(1-Math.exp(-(speed?.9:.35)*dt));s.phase+=reducedMotion?0:s.velocity*dt;s.object.rotation.z=s.phase-s.wheel.rotation.z;}hoverMotion?.(now,dt,speed,reducedMotion);glints.update(now,reducedMotion);},
  setSaddle(lift){if(!saddle)return;const [x,y]=BICYCLE_SEATPOST.axis,l=Math.max(0,Math.min(BICYCLE_SEATPOST.reach,lift||0));saddle.position.set(x*l,y*l,0);},
  setCrank(angle){if(!crank)return;crank.rotation.z=angle;for(const {side,pedal} of pedals){pedal.position.fromArray(bicyclePedal(side,angle));pedal.rotation.z=bicyclePedalPitch(side,angle);}},
  updateSteering(angle){object.userData.driveSteeringAngle=angle;if(kind==='rolls'||kind==='hover')steering.rotation.z=-angle*2.2;else steering.rotation.y=angle*.6;},dispose(){if(disposed)return;disposed=true;glints.dispose();object.removeFromParent();owned.forEach(r=>r.dispose());object.clear();}};
}
