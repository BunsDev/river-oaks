import * as THREE from 'three';
import { seeThroughNearCamera } from './near-camera-fade.js';
import { batchCostumeAttachments } from './costume-batching.js';
import { fitTuftedButtons } from './tufted-upholstery.js';

// Authored from the supplied pink-and-gold carriage reference. Metres; front is -X.
export function createJevicaCarriage() {
  const object=new THREE.Group();object.name='Jevica rose carriage';
  const owned=new Set(),groups=[object],wheels=[],spinners=[];
  // The camera can end up inside the carriage's arches (Jevica rising beside it): they dissolve near the lens.
  const surface=(name,color,options={})=>{const m=seeThroughNearCamera(new THREE.MeshPhysicalMaterial({color,roughness:.42,...options}));m.name=name;owned.add(m);return m;};
  const gold=surface('Polished champagne gold','#b59448',{metalness:.96,roughness:.24,clearcoat:.45});
  const darkGold=surface('Antique gold in recesses','#7c592c',{metalness:.84,roughness:.38});
  const cream=surface('Ivory enamel','#f1dfbd',{roughness:.29,clearcoat:.9});
  const pink=surface('Blush rose lacquer','#bd8598',{roughness:.34,clearcoat:.75});
  const velvet=surface('Dusty rose velvet','#9d7783',{roughness:.93,sheen:1,sheenColor:'#e8bac7',sheenRoughness:.7});
  const rose=surface('Porcelain pink roses','#deb3bb',{roughness:.32,clearcoat:.4});
  const pearl=surface('Ivory seed pearls','#fff1d4',{metalness:.15,roughness:.22,clearcoat:1});
  const jewel=surface('Rose-cut crystals','#ecd9e7',{metalness:.38,roughness:.10,clearcoat:1});
  const rubber=surface('Dark leather wheel treads','#302522',{roughness:.82});
  const glass=surface('Clear curved windows','#e6e0d2',{transparent:true,opacity:.13,roughness:.07,metalness:.12,depthWrite:false,side:THREE.DoubleSide});
  const lampGlass=surface('Cut crystal lantern glass','#fff0d4',{transparent:true,opacity:.48,roughness:.10,metalness:.16,emissive:'#ffc879',emissiveIntensity:.25,depthWrite:false});
  const inner=surface('Warm interior lining','#bea1a3',{roughness:.86,sheen:.8});
  // Fine woven cloth and hammered metal catch light without external textures.
  const grain=(woven)=>{
    const size=256,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const noise=Math.sin(x*127.1+y*311.7)*43758.5453;
      const value=woven?128+Math.sin(x*Math.PI/2)*35+Math.cos(y*Math.PI/2)*35:128+(noise-Math.floor(noise)-.5)*70;
      const i=(y*size+x)*4;data.set([value,value,value,255],i);
    }
    const map=new THREE.DataTexture(data,size,size);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(woven?7:4,woven?7:4);
    map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;owned.add(map);return map;
  };
  velvet.bumpMap=grain(true);velvet.bumpScale=.007;inner.bumpMap=velvet.bumpMap;inner.bumpScale=.003;
  gold.bumpMap=grain(false);gold.bumpScale=.0018;darkGold.bumpMap=gold.bumpMap;darkGold.bumpScale=.0025;
  const mesh=(group,geometry,material,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0])=>{
    owned.add(geometry);const m=new THREE.Mesh(geometry,material);m.position.fromArray(position);m.scale.fromArray(scale);m.rotation.set(...rotation);m.castShadow=!material.transparent;m.receiveShadow=true;group.add(m);return m;
  };
  const ball=(g,p,r,m=gold,scale=[1,1,1])=>mesh(g,new THREE.SphereGeometry(r,r<.015?8:10,r<.015?5:6),m,p,scale);
  const tube=(g,points,r=.014,m=gold,closed=false,segments=32)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed,'centripetal');
    return mesh(g,new THREE.TubeGeometry(curve,segments,r,6,closed),m);
  };
  const line=(g,a,b,r=.014,m=gold)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.sub(start);
    const item=mesh(g,new THREE.CylinderGeometry(r,r,delta.length(),10),m,start.addScaledVector(delta,.5).toArray());
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return item;
  };
  const torus=(g,p,r,t=.015,m=gold)=>mesh(g,new THREE.TorusGeometry(r,t,6,72),m,p);
  const panel=(g,points,z,m,depth=.025)=>{
    const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    return mesh(g,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.012,bevelThickness:.01,curveSegments:16}),m,[0,0,z-depth/2]);
  };
  const scroll=(g,c,sx,sy,flip=1,z=c[2],m=gold)=>{
    const p=Array.from({length:25},(_,i)=>{const t=i/24,a=t*Math.PI*3.1,r=1-t*.91;return [c[0]+flip*sx*r*Math.cos(a),c[1]+sy*r*Math.sin(a),z];});
    tube(g,p,.010,m,false,32);
    ball(g,p.at(-1),.016,pearl);
  };
  const flower=(g,x,y,z,r=.045)=>{
    for(let i=0;i<6;i++){const a=i*Math.PI/3;const petal=ball(g,[x+Math.cos(a)*r*.48,y+Math.sin(a)*r*.48,z+.006],r*.5,rose,[1,.68,.40]);petal.rotation.z=a;}
    ball(g,[x,y,z+.018],r*.30,pearl,[1,1,.7]);
    for(const sign of [-1,1]){const leaf=ball(g,[x+sign*r*.95,y-r*.26,z],r*.52,gold,[1.15,.4,.12]);leaf.rotation.z=sign*.5;}
  };
  const beadLine=(g,points,count=20)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    for(let i=0;i<=count;i++)ball(g,curve.getPoint(i/count).toArray(),.010,pearl);
  };
  const leaf=(g,a,b,width=.035,m=gold)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),axis=end.clone().sub(start),side=new THREE.Vector3(-axis.y,axis.x,0).normalize().multiplyScalar(width);
    const vertices=[],indices=[];
    for(let i=0;i<=8;i++)for(let j=0;j<3;j++){
      const t=i/8,p=start.clone().addScaledVector(axis,t).addScaledVector(side,(j-1)*Math.sin(t*Math.PI));
      p.z+=Math.sin(t*Math.PI)*(j===1?.012:0);vertices.push(...p.toArray());
    }
    for(let i=0;i<8;i++)for(let j=0;j<2;j++){const a=i*3+j;indices.push(a,a+3,a+1,a+1,a+3,a+4);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(g,geometry,m);
    line(g,a,b,.005,darkGold);
  };
  const bodyZ=(x,y)=>{
    const t=THREE.MathUtils.clamp((y-.93)/.87,0,1),rx=.88+.64*Math.sin(t*Math.PI/2),rz=.49+.40*Math.sin(t*Math.PI/2);
    return rz*Math.pow(Math.max(.01,1-(x/rx)**4),.25)+.025;
  };
  const floralPanel=(g,mirror)=>{
    const point=(x,y)=>[mirror*x,y,bodyZ(x,y)];
    for(const flip of [-1,1]) {
      const stem=Array.from({length:41},(_,i)=>{const t=i/40,a=t*Math.PI*3.3,r=.23*(1-t*.86);return point(.93+flip*r*Math.cos(a),1.46+r*.83*Math.sin(a));});
      tube(g,stem,.011,gold,false,48);
      for(let i=4;i<34;i+=5){const [x,y,z]=stem[i];for(const side of [-1,1]){const tip=point(Math.abs(x)+side*.068,y+.06);leaf(g,[x,y,z],tip,.027);}}
    }
    tube(g,[point(.51,1.74),point(.70,1.68),point(.91,1.73),point(1.15,1.68),point(1.34,1.75)],.008,gold);
    for(const [x,y] of [[.61,1.70],[1.03,1.68],[1.20,1.46],[.86,1.23]])flower(g,mirror*x,y,bodyZ(x,y)+.012,.042);
    for(let i=0;i<16;i++){const x=.54+i*.047,y=1.10+.17*((x-.88)/.45)**2;ball(g,point(x,y),.011,pearl);}
  };
  const buttons=(g,seat,points)=>{
    for(const {position,normal} of fitTuftedButtons(seat,points)) {
      // A thin button is partly embedded; its underside cannot hover above fabric.
      const button=ball(g,g.worldToLocal(position.addScaledVector(normal,-.002)).toArray(),.019,darkGold,[1,1,.36]);
      button.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
    }
  };
  const cushion=(g,position,size)=>{
    const [x,y,z]=position,[w,h,d]=size;
    const seat=mesh(g,new THREE.SphereGeometry(1,96,64),velvet,[x,y,z],[w/2,h/2,d/2]),points=[];
    for(let i=-2;i<=2;i++)for(let j=-1;j<=1;j++) {
      const px=i*.28,pz=j*.46;points.push([px,Math.sqrt(1-px*px-pz*pz),pz]);
    }
    buttons(g,seat,points);
  };

  mesh(object,new THREE.BoxGeometry(.42,.055,.74),darkGold,[-2.64,1.10,0]);
  for(const z of [-.32,.32])line(object,[-2.64,1.08,z],[-2.13,.68,z],.025,gold);
  // Underframe, elliptical leaf springs and axles.
  for(const z of [-.68,.68]) {
    tube(object,[[-2.65,.48,z],[-1.75,.47,z],[-.8,.63,z],[.7,.63,z],[1.75,.45,z],[2.45,.57,z]],.047,darkGold);
    for(const x of [-1.78,1.65])for(let layer=0;layer<3;layer++)tube(object,[[x-.52,.69+layer*.028,z],[x-.28,.49+layer*.028,z],[x+.20,.49+layer*.028,z],[x+.51,.69+layer*.028,z]],.015,gold);
  }
  for(const [x,r] of [[-1.78,.70],[1.66,.82]]) {
    line(object,[x,r,-1.16],[x,r,1.16],.053,darkGold);
    for(const sign of [-1,1]) {
      const wheel=new THREE.Group();wheel.name=`${x<0?'Front':'Rear'} ${sign<0?'left':'right'} jeweled wheel`;
      wheel.position.set(x,r,sign*1.16);wheel.scale.z=sign;object.add(wheel);groups.push(wheel);wheels.push(wheel);
      torus(wheel,[0,0,0],r-.018,.018,rubber);
      torus(wheel,[0,0,.014],r-.031,.025,gold);
      for(const z of [-.036,.036])for(const radius of [r-.053,r-.10])torus(wheel,[0,0,z],radius,.016,gold);
      torus(wheel,[0,0,.062],r-.077,.008,darkGold);
      const spinner=new THREE.Group();spinner.name="Free-spinning jeweled wheel center";wheel.add(spinner);spinners.push(spinner);groups.push(spinner);
      for(let i=0;i<12;i++) {
        const a=i*Math.PI/6,cs=Math.cos(a),sn=Math.sin(a),point=(radius,tangent,z)=>[cs*radius-sn*tangent,sn*radius+cs*tangent,z];
        for(const side of [-1,1])tube(wheel,[point(.105,0,0),point(r*.34,side*.050,0),point(r*.68,side*.044,0),point(r-.065,0,0)],.013,gold,false,16);
        // Acanthus leaves, curling tendrils and tiny rivets fill each spoke bay.
        for(const side of [-1,1]) {
          tube(spinner,[point(r*.22,0,.025),point(r*.40,side*.038,.032),point(r*.60,side*.019,.032),point(r*.83,side*.030,.024)],.006,darkGold,false,24);
          for(let j=0;j<3;j++) {
            const radius=r*(.31+j*.14),tangent=side*r*(.062+j*.012);
            leaf(spinner,point(radius,0,.026),point(radius+r*.12,tangent,.030),r*.025);
            tube(spinner,Array.from({length:19},(_,k)=>{const t=k/18,angle=t*Math.PI*2.8,size=r*.07*(1-.88*t);return point(radius+r*.12+size*Math.cos(angle),tangent+side*size*Math.sin(angle),.037);}),.0045,gold,false,20);
          }
        }
        for(let j=0;j<7;j++)ball(spinner,point(r*(.23+j*.075),0,.046),.009,pearl,[1,1,.62]);
        const gem=mesh(spinner,new THREE.OctahedronGeometry(.023),jewel,point(r-.074,0,.067));gem.rotation.z=a;
        for(let j=1;j<=7;j++) {
          const angle=a+j*Math.PI/48,outer=r-.067;
          ball(spinner,[outer*Math.cos(angle),outer*Math.sin(angle),.064],.0085,pearl);
        }
      }
      const hub=mesh(spinner,new THREE.CylinderGeometry(.115,.115,.15,32),gold);hub.rotation.x=Math.PI/2;
      torus(spinner,[0,0,.082],.093,.013,gold);
      mesh(spinner,new THREE.IcosahedronGeometry(.073,1),jewel,[0,0,.112],[1,1,.48]);
      for(let i=0;i<16;i++){const a=i*Math.PI/8;ball(spinner,[Math.cos(a)*.094,Math.sin(a)*.094,.104],.012,pearl);}
      for(let i=0;i<8;i++){const a=i*Math.PI/4;flower(spinner,Math.cos(a)*.14,Math.sin(a)*.14,.058,.022);}
    }
  }

  // Sculpted lower body: rounded rectangular sections, not a spherical pumpkin.
  const vertices=[],uv=[],indices=[],rows=20,columns=96;
  for(let j=0;j<=rows;j++) {
    const t=j/rows,y=.93+t*.87,rx=.88+.64*Math.sin(t*Math.PI/2),rz=.49+.40*Math.sin(t*Math.PI/2);
    for(let i=0;i<=columns;i++){const a=i/columns*Math.PI*2,c=Math.cos(a),s=Math.sin(a);vertices.push(rx*Math.sign(c)*Math.sqrt(Math.abs(c)),y,rz*Math.sign(s)*Math.sqrt(Math.abs(s)));uv.push(i/columns,t);}
  }
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const a=j*(columns+1)+i,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const body=new THREE.BufferGeometry();body.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));body.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));body.setIndex(indices);body.computeVertexNormals();mesh(object,body,pink);
  const perimeter=(rx,rz,y)=>Array.from({length:65},(_,i)=>{const a=i/64*Math.PI*2,c=Math.cos(a),s=Math.sin(a);return [rx*Math.sign(c)*Math.sqrt(Math.abs(c)),y,rz*Math.sign(s)*Math.sqrt(Math.abs(s))];});
  for(const [rx,rz,y,r] of [[.9,.51,.96,.022],[1.51,.88,1.73,.022],[1.53,.9,1.80,.026],[1.48,.87,2.78,.03]])tube(object,perimeter(rx,rz,y),r,gold,true,96);
  // Cabin floor and opposing upholstered seats, visible through the windows.
  mesh(object,new THREE.BoxGeometry(1.85,.085,1.04),inner,[0,1.13,0]);
  for(const x of [-.99,.99]) {
    cushion(object,[x,1.46,0],[.55,.20,1.45]);
    const back=mesh(object,new THREE.SphereGeometry(1,96,64),velvet,[x*1.22,1.82,0],[.13,.45,.71]);
    back.rotation.z=x<0?.10:-.10;
    const points=[];for(let i=-3;i<=3;i++)for(let j=-1;j<=1;j++){const py=j*.4,pz=i*.24;points.push([-Math.sign(x)*Math.sqrt(1-py*py-pz*pz),py,pz]);}
    buttons(object,back,points);
  }
  // Curved end windows and gilded end frames.
  for(const sign of [-1,1]) {
    const end=new THREE.Group();end.rotation.y=sign*Math.PI/2;end.position.x=sign*1.45;object.add(end);groups.push(end);
    const outline=[[-.72,1.84],[-.74,2.54],[-.57,2.76],[.57,2.76],[.74,2.54],[.72,1.84],[.40,1.75],[-.40,1.75]];
    panel(end,outline,0,glass,.008);tube(end,outline.map(([x,y])=>[x,y,.012]),.026,gold,true,64);
    for(const side of [-1,1])tube(end,[[side*.61,2.69,.035],[side*.49,2.23,.06],[side*.69,1.92,.025]],.05,velvet);
  }
  for(const sign of [-1,1]) {
    const side=new THREE.Group();side.scale.z=sign;object.add(side);groups.push(side);
    // Sidelights bow out at the waist; the cream centre door stands proud.
    for(const mirror of [-1,1]) {
      const outline=[[-1.44,2.68],[-1.26,2.79],[-.47,2.77],[-.45,1.83],[-.80,1.79],[-1.20,1.85],[-1.39,2.06]].map(([x,y])=>[x*mirror,y]);
      panel(side,outline,.884,glass,.008);
      tube(side,outline.map(([x,y])=>[x,y,.91]),.032,gold,true,72);
      tube(side,outline.map(([x,y])=>[x*.983,y*.997,.94]),.008,cream,true,72);
      // Draped velvet with pearl tieback.
      tube(side,[[mirror*1.32,2.66,.81],[mirror*1.23,2.40,.80],[mirror*1.30,2.08,.81]],.040,velvet);
      beadLine(side,[[mirror*1.32,2.64,.95],[mirror*.90,2.52,.96],[mirror*.49,2.68,.95]],22);
      floralPanel(side,mirror);
    }
    const door=[[-.405,2.78],[.405,2.78],[.41,1.32],[.31,1.11],[.10,1.00],[-.10,1.00],[-.31,1.11],[-.41,1.32]];
    panel(side,[[-.39,1.81],[.39,1.81],[.40,1.32],[.28,1.10],[0,1.00],[-.28,1.10],[-.40,1.32]],.92,cream,.035);
    const window=[[-.31,2.68],[.31,2.68],[.31,1.91],[-.31,1.91]];
    panel(side,window,.932,glass,.008);tube(side,window.map(([x,y])=>[x,y,.963]),.022,gold,true,32);
    tube(side,door.map(([x,y])=>[x,y,.95]),.029,gold,true,64);
    tube(side,[[-.44,1.83,.95],[0,1.81,.96],[.44,1.83,.95]],.018,gold);
    line(side,[.24,1.74,.975],[.34,1.74,.975],.015,gold);ball(side,[.245,1.74,.992],.024,jewel);
    for(const x of [-.43,.43])for(const y of [1.4,2.36])mesh(side,new THREE.CylinderGeometry(.027,.027,.095,12),gold,[x,y,.952]);
    // Raised heraldic shield, a tiny crown and symmetrical acanthus supporters.
    panel(side,[[-.12,1.54],[.12,1.54],[.10,1.34],[0,1.25],[-.10,1.34]],.966,pink,.02);
    tube(side,[[-.12,1.54,.99],[.12,1.54,.99],[.10,1.34,.99],[0,1.25,.99],[-.10,1.34,.99]],.012,gold,true);
    for(const sx of [-1,1]){scroll(side,[sx*.20,1.45,.978],.095,.15,sx);scroll(side,[sx*.19,1.24,.96],.15,.07,-sx);}
    for(let i=0;i<5;i++){const x=(i-2)*.035;line(side,[x,1.58,.98],[x*1.1,1.64+(i===2?.035:0),.98],.009,gold);ball(side,[x*1.1,1.64+(i===2?.035:0),.98],.014,pearl);}
    for(let i=0;i<3;i++)flower(side,(i-1)*.069,1.41,.998,.025);
    // Entry step, border and suspension brackets.
    mesh(side,new THREE.BoxGeometry(.75,.065,.31),darkGold,[0,.54,1.08]);
    tube(side,[[-.38,.57,.94],[-.38,.57,1.23],[.38,.57,1.23],[.38,.57,.94]],.021,gold);
    for(const x of [-.28,.28])tube(side,[[x,.60,1.07],[x,.79,1.04],[x,1.00,.82]],.024,gold);
    for(let i=-5;i<=5;i++)line(side,[i*.056,.577,1],[i*.056,.577,1.20],.009,gold);
  }

  // Shallow elliptical domed roof and its rococo crest.
  const roof=new THREE.SphereGeometry(1,64,24,0,Math.PI*2,0,Math.PI/2);
  mesh(object,roof,pink,[0,2.77,0],[1.66,.39,1.06]);
  for(const [rx,rz,y] of [[1.65,1.06,2.79],[1.62,1.04,2.85]])tube(object,Array.from({length:97},(_,i)=>{const a=i/96*Math.PI*2;return [rx*Math.cos(a),y,rz*Math.sin(a)];}),.025,gold,true,96);
  for(const sign of [-1,1]) {
    for(let i=-3;i<=3;i++) {
      const x=i*.44,z=sign*1.01*Math.sqrt(Math.max(.05,1-(x/1.65)**2));
      flower(object,x,2.86,z,.060);
      if(i>-3){const mx=x-.22,mz=sign*1.04*Math.sqrt(Math.max(.05,1-(mx/1.65)**2));beadLine(object,[[x-.44,2.86,sign*1.01*Math.sqrt(Math.max(.05,1-((x-.44)/1.65)**2))],[mx,2.74,mz],[x,2.86,z]],16);}
    }
    for(const flip of [-1,1]) {
      tube(object,[[flip*1.61,2.83,sign*.20],[flip*1.25,2.92,sign*.44],[flip*.71,3.06,sign*.40],[flip*.33,3.20,sign*.15],[flip*.20,3.43,sign*.04],[flip*.43,3.41,sign*.04],[flip*.39,3.25,sign*.09],[flip*.24,3.27,sign*.12]],.023,gold,false,64);
      for(let i=0;i<3;i++) {
        const points=Array.from({length:33},(_,j)=>{const t=j/32,a=t*Math.PI*3,r=.19*(1-t*.9),x=flip*(.35+i*.38+r*Math.cos(a)),z=sign*(.55+r*.55*Math.sin(a));return [x,2.785+.39*Math.sqrt(Math.max(0,1-(x/1.66)**2-(z/1.06)**2)),z];});
        tube(object,points,.009,gold,false,36);
        for(let j=4;j<25;j+=6){const p=points[j],q=points[j+3];ball(object,[p[0],p[1]+.01,p[2]],.018,pearl);line(object,p,q,.007,darkGold);}
      }
    }
  }
  for(let i=0;i<8;i++){const a=i*Math.PI/4;tube(object,[[Math.cos(a)*.22,3.05,Math.sin(a)*.22],[Math.cos(a)*.19,3.23,Math.sin(a)*.19],[0,3.46,0]],.014,gold);}
  ball(object,[0,3.45,0],.072,gold);mesh(object,new THREE.OctahedronGeometry(.10),jewel,[0,3.56,0],[.7,1,.7]);

  // Driver's upholstered perch, sweeping footboard and wrought-gold scroll ends.
  mesh(object,new THREE.BoxGeometry(.58,.075,1.34),gold,[-2.13,1.43,0]);
  cushion(object,[-2.13,1.54,0],[.64,.20,1.38]);
  mesh(object,new THREE.SphereGeometry(1,28,16),velvet,[-1.84,1.76,0],[.11,.28,.66]);
  for(const sign of [-1,1]) {
    tube(object,[[-2.50,1.49,sign*.65],[-2.47,1.76,sign*.65],[-2.05,1.79,sign*.65],[-1.86,1.98,sign*.63]],.024,gold);
    tube(object,[[-2.52,.83,sign*.65],[-2.75,.97,sign*.65],[-2.95,1.37,sign*.64],[-2.80,1.50,sign*.63],[-2.59,1.29,sign*.64],[-2.19,1.19,sign*.64],[-1.91,1.38,sign*.68]],.030,gold,false,64);
    panel(object,[[-2.63,.92],[-2.90,1.26],[-2.82,1.39],[-2.58,1.16],[-2.24,1.12],[-2.13,.93]],sign*.66,pink,.035);
    for(const [x,y,sx,sy] of [[-2.59,1.16,.19,.19],[-2.08,1.25,.17,.16],[2.07,1.17,.36,.42],[2.29,.82,.18,.14]])scroll(object,[x,y,sign*.91],sx,sy,1);
    tube(object,[[1.42,.89,sign*.73],[2.21,.98,sign*.75],[2.57,1.52,sign*.77],[2.28,1.68,sign*.76],[2.02,1.40,sign*.79]],.029,gold,false,64);
    for(const x of [-1.39,1.40]) {
      // Hanging six-sided lantern, including metal mullions and crystal facets.
      const z=sign*1.10;
      tube(object,[[x,2.62,sign*.90],[x,2.86,z],[x,2.89,sign*1.17],[x,2.72,sign*1.21]],.017,gold);
      mesh(object,new THREE.CylinderGeometry(.082,.071,.23,6),lampGlass,[x,2.48,z]);
      mesh(object,new THREE.ConeGeometry(.115,.13,6),gold,[x,2.665,z]);
      for(const y of [2.35,2.60]){const rim=mesh(object,new THREE.CylinderGeometry(.095,.095,.026,6),gold,[x,y,z]);rim.rotation.y=Math.PI/6;}
      for(let i=0;i<6;i++){const a=i*Math.PI/3;line(object,[x+Math.cos(a)*.081,2.36,z+Math.sin(a)*.081],[x+Math.cos(a)*.081,2.59,z+Math.sin(a)*.081],.006,gold);}
      ball(object,[x,2.29,z],.033,jewel,[.75,1.4,.75]);
    }
  }
  mesh(object,new THREE.BoxGeometry(.49,.055,1.27),darkGold,[-2.63,.92,0]);
  for(let i=-6;i<=6;i++)line(object,[-2.85,.951,i*.09],[-2.40,.951,i*.09],.008,gold);

  // Bake static ornaments without merging across wheel groups or transparency.
  batchCostumeAttachments(groups.map(group=>({group})),owned);
  // Retain the real tread surface for suspension contact at every wheel angle.
  object.updateMatrixWorld(true);
  const wheelTreads=wheels.map(wheel=>{
    const points=[];
    wheel.traverse(part=>{
      if(!part.isMesh||part.material!==rubber)return;
      const toWheel=wheel.matrixWorld.clone().invert().multiply(part.matrixWorld);
      const vertices=part.geometry.attributes.position;
      for(let i=0;i<vertices.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(toWheel));
    });
    return points;
  });
  let disposed=false;
  return {object,wheels,spinners,wheelTreads,dispose(){if(disposed)return;disposed=true;object.removeFromParent();owned.forEach(resource=>resource.dispose());owned.clear();object.clear();}};
}
