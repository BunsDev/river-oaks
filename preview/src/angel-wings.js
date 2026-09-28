import * as THREE from 'three';

// A feather: a curved vane on each side of the shaft. Primaries are long and
// narrow with a notched (emarginated) outer vane near the tip; secondaries and
// coverts are broad with a rounded trailing edge.
function featherGeometry({narrow=false}={}) {
  const positions=[],colors=[],uvs=[],indices=[],rows=24,columns=6;
  const base=new THREE.Color('#f3ece2'),tip=new THREE.Color(narrow?'#d9d4cc':'#e7e1d8');
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++) {
    const t=row/rows,u=column/columns*2-1;
    const outer=u>0;
    // Rounded tips; primaries taper sharply and step in on the outer vane.
    // Full width soon after the base, then a rounded (not square) tip.
    let width=(narrow?.075:.11)*Math.pow(Math.max(0,Math.sin(Math.PI*(.06+.94*t))),narrow?.6:.42)*(narrow?1-.25*t:1);
    if(narrow&&outer&&t>.58)width*=.55;
    width*=1-.018*Math.sin(t*140+u*3);
    const x=u*width*(outer?1.08:.84)+.024*t*t;
    // Camber and a slight twist toward the tip.
    const z=.05*Math.sin(Math.PI*t)+.03*t*t-.02*u*u*Math.sin(Math.PI*t)+.012*u*t;
    positions.push(x,-t,z);uvs.push((u+1)/2,t);
    const shade=base.clone().lerp(tip,Math.pow(t,1.6)).multiplyScalar(1-.05*Math.abs(u)-.03*(1-t));
    colors.push(shade.r,shade.g,shade.b);
    if(row<rows&&column<columns){const a=row*(columns+1)+column,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

// Deterministic jitter so no two feathers in a row are identical.
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296-.5;};

// Fine barbs angled off the shaft, a darker rachis line and soft, slightly
// split edges. Drawn once on a canvas; without a DOM (tests) feathers stay plain.
function vaneTexture() {
  const document=globalThis.document;if(!document?.createElement)return null;
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=256;
  const g=canvas.getContext?.('2d');if(!g)return null;
  const image=g.createImageData(64,256),seed=random(7);
  const splits=Array.from({length:7},()=>({v:.2+(seed()+.5)*.7,side:seed()>0?1:-1}));
  for(let y=0;y<256;y++)for(let x=0;x<64;x++) {
    const u=x/63*2-1,v=y/255,edge=Math.abs(u);
    // Barbs sweep toward the tip; brightness ripples across them.
    const barb=.96+.04*Math.sin((v*60+edge*12)*Math.PI);
    const rachis=Math.exp(-Math.pow(u/.03,2))*.12;
    let alpha=THREE.MathUtils.smoothstep(1-edge,0,.16);
    for(const split of splits)if(Math.sign(u)===split.side&&Math.abs(v-split.v)<.006+.01*edge)alpha*=.2+.8*(1-edge);
    const shade=Math.round(255*Math.max(0,barb-rachis)),i=(y*64+x)*4;
    image.data[i]=image.data[i+1]=image.data[i+2]=shade;image.data[i+3]=Math.round(255*alpha);
  }
  g.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}


// About 5.8 m tip to tip, 23% smaller than the first 7.6 m version, and shaped
// like a bird's wing rather than a fan.
export const WING_SCALE=.8;

// Feathers are instanced per articulated section. Wingbeats never rebuild geometry.
export function createAngelWings({reducedMotion=globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false}={}) {
  const object=new THREE.Group();object.name='Jev’s angel wings';object.visible=false;object.position.set(0,1.32,-.17);
  const broad=featherGeometry(),narrow=featherGeometry({narrow:true});
  const vane=vaneTexture();
  const plumage=new THREE.MeshPhysicalMaterial({color:'#ffffff',vertexColors:true,map:vane,alphaTest:vane?.35:0,roughness:.62,metalness:0,sheen:.55,sheenColor:'#fff4ea',sheenRoughness:.7,side:THREE.DoubleSide,emissive:'#f4e2c8',emissiveIntensity:.006});
  const shaft=new THREE.MeshStandardMaterial({color:'#efe7d8',roughness:.5,metalness:0});
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,.006),new THREE.Vector3(.007,-.35,.05),new THREE.Vector3(.018,-.7,.055),new THREE.Vector3(.026,-1,.03)]);
  const quill=new THREE.TubeGeometry(curve,12,.0025,4,false),matrix=new THREE.Object3D(),hinges=[],tint=new THREE.Color();
  const addFeathers=(parent,side,descriptors,geometry,seed)=>{
    const plumes=new THREE.InstancedMesh(geometry,plumage,descriptors.length),shafts=new THREE.InstancedMesh(quill,shaft,descriptors.length),jitter=random(seed);
    plumes.castShadow=true;plumes.receiveShadow=true;
    for(const [i,f]of descriptors.entries()) {
      const angle=f.angle+jitter()*.05,length=f.length*(1+jitter()*.08);
      matrix.position.set(side*f.x,f.y,f.z);matrix.rotation.set((f.curl??0)+jitter()*.04,side*((f.twist??0)+jitter()*.04),side*angle);matrix.scale.set(f.width,length,1);
      matrix.updateMatrix();plumes.setMatrixAt(i,matrix.matrix);shafts.setMatrixAt(i,matrix.matrix);
      plumes.setColorAt(i,tint.setScalar(1+jitter()*.06));
    }
    plumes.computeBoundingSphere();shafts.computeBoundingSphere();parent.add(plumes,shafts);
  };
  for(const side of [-1,1]) {
    const hinge=new THREE.Group(),tip=new THREE.Group();hinge.position.x=side*.14;tip.position.set(side*1.1,.24,-.02);hinge.add(tip);object.add(hinge);hinges.push({hinge,tip,side});
    const secondaries=[],coverts=[],primaries=[],handCoverts=[];
    // Arm: a row of broad secondaries (longest near the body as tertials), then
    // greater and median coverts overlapping their bases.
    for(let i=0;i<15;i++){const t=i/14;secondaries.push({x:.08+t*1.06,y:Math.sin(t*Math.PI*.6)*.26,z:.02,angle:.06+t*.3,width:1.4,length:.78+(1-t)*.12,curl:-.1+t*.12,twist:.08*Math.sin(t*Math.PI)});}
    for(let row=0;row<2;row++)for(let i=0;i<16;i++){const t=i/15;coverts.push({x:.06+t*1.1,y:Math.sin(t*Math.PI*.6)*.26+.07+row*.075,z:.055+row*.035,angle:.08+t*.3,width:row?1.15:1.3,length:(row?.26:.44)*(1+t*.08),curl:-.1+t*.1,twist:.06*t});}
    // Hand: ten primaries fanning from the wrist, longest near the tip.
    for(let i=0;i<10;i++){const t=i/9;primaries.push({x:t*1.05,y:.06*Math.sin(t*Math.PI)-t*.22,z:-t*.035,angle:.28+t*1.0,width:1.45,length:1.0+t*.46,curl:.02+t*.1,twist:.06+t*.14});}
    for(let i=0;i<12;i++){const t=i/11;handCoverts.push({x:t*1.08,y:.06*Math.sin(t*Math.PI)-t*.22+.07,z:.05,angle:.24+t*.95,width:1.4,length:.52+t*.14,curl:.04,twist:t*.1});}
    // The alula: a small tuft at the wrist.
    for(let i=0;i<3;i++)handCoverts.push({x:-.04+i*.03,y:.1+i*.02,z:.09,angle:-.1+i*.12,width:.6,length:.22-i*.03,curl:.1,twist:.1});
    // One instanced plume mesh and one shaft mesh per section keeps the draw count
    // at four per wing. Hand coverts share the primaries' tapered shape.
    addFeathers(hinge,side,[...secondaries,...coverts],broad,side>0?11:23);
    addFeathers(tip,side,[...primaries,...handCoverts],narrow,side>0?53:67);
  }
  const points=new Float32Array(24*3);
  for(let i=0;i<24;i++){const side=i%2?1:-1,t=Math.floor(i/2)/11;points.set([side*(.3+t*2.4),Math.sin(t*Math.PI)*.35-.3,-.08+(i%3)*.06],i*3);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
  const magic=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},amount:{value:0}},vertexShader:`uniform float time;uniform float amount;varying float glow;void main(){vec3 p=position;float seed=position.x*13.+position.y*19.;glow=(.15+.85*pow(max(0.,sin(time*1.1+seed)),12.))*amount;p.y+=sin(time*.6+seed)*.05;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(36./max(1.,-mv.z),1.,5.);}`,fragmentShader:`varying float glow;void main(){vec2 p=abs(gl_PointCoord-.5);float a=max(exp(-40.*length(p)),max(exp(-100.*p.x-12.*p.y),exp(-100.*p.y-12.*p.x)));gl_FragColor=vec4(1.,.86,.66,a*glow*.45);}`});
  const glints=new THREE.Points(geometry,magic);glints.frustumCulled=false;object.add(glints);
  let extension=0,phase=0,amplitude=0,frequency=1.5;
  return {object,
    update(now,delta,{amount=0,speed=0,climbing=0,bank=0}={}) {
      const dt=Math.min(.08,Math.max(0,delta)),ease=1-Math.exp(-5*dt);
      extension+=(amount-extension)*ease;object.visible=extension>.005;
      const lifting=THREE.MathUtils.clamp(climbing/2,0,1),gliding=THREE.MathUtils.clamp(speed/5,0,1);
      frequency+=((1.65+lifting*1.7)-frequency)*ease;
      amplitude+=((.22+lifting*.27-gliding*.15)-amplitude)*ease;
      phase+=frequency*dt;
      const flap=reducedMotion?0:Math.sin(phase)*amplitude;
      for(const {hinge,tip,side}of hinges) {
        // The hand follows the arm with a slight delay, relaxing on the recovery stroke.
        hinge.rotation.y=side*((1-extension)*1.4+.12+flap+side*bank*.35);
        hinge.rotation.z=side*(.05+(reducedMotion?0:Math.cos(phase)*.035*extension));
        tip.rotation.y=side*((1-extension)*.7+(reducedMotion?0:Math.sin(phase-.48)*amplitude*.55));
        tip.rotation.z=side*(.02+(reducedMotion?0:Math.sin(phase-.65)*amplitude*.12));
      }
      object.scale.setScalar((.25+.75*extension)*WING_SCALE);magic.uniforms.time.value=reducedMotion?0:now/1000;magic.uniforms.amount.value=extension;
    },
    dispose(){object.removeFromParent();vane?.dispose();broad.dispose();narrow.dispose();quill.dispose();plumage.dispose();shaft.dispose();geometry.dispose();magic.dispose();},
  };
}
