import * as THREE from 'three';

// Cambered feathers with asymmetric vanes, tapered tips and fine barb edges.
function featherGeometry() {
  const positions=[],colors=[],indices=[],rows=24,columns=6;
  const blush=new THREE.Color('#ecd4cd'),pearl=new THREE.Color('#fff9e9');
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++) {
    const t=row/rows,u=column/columns*2-1;
    const width=.11*Math.pow(Math.sin(Math.PI*t),.62)*(1-.28*t)*(1-.025*Math.sin(t*155));
    const x=u*width*(u<0?.82:1.12)+.028*t*t;
    const z=.065*Math.sin(Math.PI*t)+.035*t*t-.022*u*u*Math.sin(Math.PI*t);
    positions.push(x,-t,z);
    const shade=blush.clone().lerp(pearl,Math.min(1,t*3+.2)).multiplyScalar(1-.035*Math.abs(u));colors.push(shade.r,shade.g,shade.b);
    if(row<rows&&column<columns){const a=row*(columns+1)+column,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

// Feathers are instanced per articulated section. Wingbeats never rebuild geometry.
export function createAngelWings({reducedMotion=globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false}={}) {
  const object=new THREE.Group();object.name='Jev’s magical angel wings';object.visible=false;object.position.set(0,1.32,-.17);
  const feather=featherGeometry();
  const ivory=new THREE.MeshPhysicalMaterial({color:'#ffffff',vertexColors:true,roughness:.52,metalness:.04,sheen:.8,sheenColor:'#ffeadf',sheenRoughness:.6,clearcoat:.12,side:THREE.DoubleSide,emissive:'#eabf8c',emissiveIntensity:.025});
  const gold=new THREE.MeshStandardMaterial({color:'#d8b775',metalness:.7,roughness:.38,emissive:'#d7a646',emissiveIntensity:.08});
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,.006),new THREE.Vector3(.007,-.35,.065),new THREE.Vector3(.018,-.7,.071),new THREE.Vector3(.028,-1,.04)]);
  const quill=new THREE.TubeGeometry(curve,12,.003,4,false),matrix=new THREE.Object3D(),hinges=[];
  const addFeathers=(parent,side,descriptors)=>{
    const plumes=new THREE.InstancedMesh(feather,ivory,descriptors.length),shafts=new THREE.InstancedMesh(quill,gold,descriptors.length);
    plumes.castShadow=true;plumes.receiveShadow=true;
    for(const [i,f]of descriptors.entries()) {
      matrix.position.set(side*f.x,f.y,f.z);matrix.rotation.set(f.curl??0,side*(f.twist??0),side*f.angle);matrix.scale.set(f.width,f.length,1);
      matrix.updateMatrix();plumes.setMatrixAt(i,matrix.matrix);shafts.setMatrixAt(i,matrix.matrix);
    }
    plumes.computeBoundingSphere();shafts.computeBoundingSphere();parent.add(plumes,shafts);
  };
  for(const side of [-1,1]) {
    const hinge=new THREE.Group(),tip=new THREE.Group();hinge.position.x=side*.14;tip.position.set(side*1.12,.50,-.02);hinge.add(tip);object.add(hinge);hinges.push({hinge,tip,side});
    const inner=[],outer=[];
    // Broad inner secondaries, two rows of overlapping shoulder coverts.
    for(let row=0;row<3;row++)for(let i=0;i<16;i++){
      const t=i/15;
      inner.push({x:.06+t*1.16,y:Math.sin(t*Math.PI*.62)*.54+row*.085,z:.02+row*.038,angle:.08+t*.35,width:row===0?1.04:.85,length:(row===0?.82:row===1?.48:.29)*(1+t*.10),curl:-.12+t*.14,twist:.10*Math.sin(t*Math.PI)});
    }
    // Long fingered primaries fan out from the elbow, individually twisted.
    for(let i=0;i<14;i++){
      const t=i/13;
      outer.push({x:t*1.18,y:.10*Math.sin(t*Math.PI)-t*.28,z:-t*.04,angle:.3+t*1.02,width:1.10,length:1.05+t*.4,curl:.02+t*.12,twist:.08+t*.12});
    }
    for(let row=0;row<2;row++)for(let i=0;i<18;i++){
      const t=i/17;
      outer.push({x:t*1.19,y:.1*Math.sin(t*Math.PI)-t*.28+row*.07,z:.05+row*.038,angle:.25+t*.95,width:.90,length:(row===0?.64:.33)+t*.15,curl:.04,twist:t*.1});
    }
    addFeathers(hinge,side,inner);addFeathers(tip,side,outer);
  }
  const points=new Float32Array(40*3);
  for(let i=0;i<40;i++){const side=i%2?1:-1,t=Math.floor(i/2)/19;points.set([side*(.3+t*3),Math.sin(t*Math.PI)*.6-.35,-.08+(i%3)*.06],i*3);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
  const magic=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},amount:{value:0}},vertexShader:`uniform float time;uniform float amount;varying float glow;void main(){vec3 p=position;float seed=position.x*13.+position.y*19.;glow=(.15+.85*pow(max(0.,sin(time*1.1+seed)),10.))*amount;p.y+=sin(time*.6+seed)*.05;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(45./max(1.,-mv.z),1.,7.);}`,fragmentShader:`varying float glow;void main(){vec2 p=abs(gl_PointCoord-.5);float a=max(exp(-40.*length(p)),max(exp(-100.*p.x-12.*p.y),exp(-100.*p.y-12.*p.x)));gl_FragColor=vec4(1.,.80,.52,a*glow);}`});
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
        // The elbow follows the shoulder with a slight delay, relaxing on recovery.
        hinge.rotation.y=side*((1-extension)*1.4+.12+flap+side*bank*.35);
        hinge.rotation.z=side*(.08+(reducedMotion?0:Math.cos(phase)*.035*extension));
        tip.rotation.y=side*((1-extension)*.7+(reducedMotion?0:Math.sin(phase-.48)*amplitude*.55));
        tip.rotation.z=side*(.035+(reducedMotion?0:Math.sin(phase-.65)*amplitude*.12));
      }
      object.scale.setScalar(.25+.75*extension);magic.uniforms.time.value=reducedMotion?0:now/1000;magic.uniforms.amount.value=extension;
    },
    dispose(){object.removeFromParent();feather.dispose();quill.dispose();ivory.dispose();gold.dispose();geometry.dispose();magic.dispose();},
  };
}
