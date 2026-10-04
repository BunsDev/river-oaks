import * as THREE from 'three';

// One small point draw for restrained jewelry-like highlights. No light sources,
// shadows, particle allocation, or full-screen bloom passes.
export function createVehicleGlints(spec) {
 const points=[];
 if(spec.kind==='rolls')for(const side of [-1,1])for(let i=0;i<14;i++)points.push([(-3.05+i*.46)*.7,1.01,side*1.074*.7]);
 else for(const side of [-1,1])for(let i=0;i<9;i++)points.push([-.6+i*.16,.65+.35*Math.sin(i*.52),side*.24]);
 for(const [x,y,z] of spec.wheels)for(const side of [-1,1])points.push([x,y,z+side*(spec.kind==='rolls'?.13:.09)]);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
 geometry.setAttribute('phase',new THREE.Float32BufferAttribute(points.map((_,i)=>i*2.39996),1));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  uniforms:{time:{value:0},motion:{value:1}},
  vertexShader:`attribute float phase; uniform float time; uniform float motion; varying float glow;
   void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;
    glow=mix(.16,pow(max(0.,sin(time*.85+phase)),12.),motion);
    gl_PointSize=clamp(25./max(1.,-p.z),1.,7.);}`,
  fragmentShader:`varying float glow; void main(){vec2 p=abs(gl_PointCoord-.5)*2.;float star=exp(-18.*p.x)*exp(-2.*p.y)+exp(-18.*p.y)*exp(-2.*p.x);float a=star*glow*.65;if(a<.012)discard;gl_FragColor=vec4(1.,.85,.52,a);}`});
 const object=new THREE.Points(geometry,material);object.name='Royal gold jewel glints';object.userData.aoExclude=true;
 return {object,update(now,reducedMotion){material.uniforms.time.value=now/1000;material.uniforms.motion.value=reducedMotion?0:1;},dispose(){object.removeFromParent();geometry.dispose();material.dispose();}};
}
