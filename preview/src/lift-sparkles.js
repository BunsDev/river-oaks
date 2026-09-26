import * as THREE from 'three';

// One reusable draw call for both emitters. Birth positions stay in world space
// so walking or lowering a target doesn't drag an existing trail sideways.
export function createLiftSparkles({reducedMotion=false}={}) {
  const capacity=256,geometry=new THREE.BufferGeometry();
  const positions=new Float32Array(capacity*3),colors=new Float32Array(capacity*3);
  const sizes=new Float32Array(capacity),opacity=new Float32Array(capacity),angles=new Float32Array(capacity);
  for(const [name,array,size] of [['position',positions,3],['color',colors,3],['size',sizes,1],['opacity',opacity,1],['angle',angles,1]]) {
    geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
  }
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{pointScale:{value:900}},
    vertexShader:`
      attribute vec3 color;
      attribute float size, opacity, angle;
      uniform float pointScale;
      varying vec3 vColor;
      varying float vOpacity, vAngle;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(size * pointScale / max(.1, -view.z), 1.0, 48.0);
        vColor = color; vOpacity = opacity; vAngle = angle;
      }`,
    fragmentShader:`
      varying vec3 vColor;
      varying float vOpacity, vAngle;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float c = cos(vAngle), s = sin(vAngle);
        p = mat2(c, -s, s, c) * p;
        float r = length(p);
        float core = exp(-r*r*32.0);
        float rays = pow(max(0.0, 1.0-abs(p.x)), 22.0)*pow(max(0.0, 1.0-abs(p.y)), 2.0)
                   + pow(max(0.0, 1.0-abs(p.y)), 22.0)*pow(max(0.0, 1.0-abs(p.x)), 2.0);
        float alpha = min(1.0, core + rays*.65 + exp(-r*r*7.0)*.16) * vOpacity;
        if (alpha < .003) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const object=new THREE.Points(geometry,material);object.name='Lift spell sparkles';
  object.frustumCulled=false;object.visible=false;object.userData.aoExclude=true;
  const palette=['#fff4dd','#ffd2e9','#ffffff'].map(color=>new THREE.Color(color));
  const pool=Array.from({length:capacity},(_,i)=>{
    palette[i%palette.length].toArray(colors,i*3);
    return {age:0,life:0,kind:0,start:new THREE.Vector3(),end:new THREE.Vector3(),phase:0};
  });
  const center=new THREE.Vector3(),tip=new THREE.Vector3(),point=new THREE.Vector3();
  let cursor=0,wandBudget=0,targetBudget=0,targetId=null;
  const reset=()=>{
    for(const p of pool)p.life=0;
    opacity.fill(0);geometry.attributes.opacity.needsUpdate=true;
    object.visible=false;wandBudget=targetBudget=0;targetId=null;
  };
  function spawn(kind,spell) {
    const i=cursor++%capacity,p=pool[i];p.kind=kind;p.age=0;p.life=kind===0?.8+Math.random()*.35:.65+Math.random()*.5;
    p.phase=Math.random()*Math.PI*2;
    if(kind===0){p.start.copy(tip);p.end.copy(center);}
    else {
      const radius=spell.radius+.06+Math.random()*.15;
      p.start.set(center.x+Math.cos(p.phase)*radius,spell.position[1]+.08+Math.random()*spell.height,center.z+Math.sin(p.phase)*radius);
      p.end.copy(p.start);p.end.y+=.3+Math.random()*.3;
    }
    sizes[i]=.09+Math.random()*.11;angles[i]=p.phase;
  }
  return {
    object,reset,
    update(delta,spell,wandTip,camera,pixelHeight) {
      const dt=Number.isFinite(delta)?THREE.MathUtils.clamp(delta,0,.08):0;
      const emitting=wandTip&&spell&&(spell.mode==='lift'||spell.mode==='lower');
      if(spell&&spell.id!==targetId){reset();targetId=spell.id;}
      if(!emitting&&!object.visible)return;
      if(camera&&pixelHeight)material.uniforms.pointScale.value=pixelHeight*.5*camera.projectionMatrix.elements[5];
      if(emitting) {
        tip.copy(wandTip);center.fromArray(spell.position);center.y+=spell.height*.55;
        if(reducedMotion) {
          // Fixed stars: no swirling, travel or flicker. They still track their source.
          for(let i=0;i<10;i++) {
            const p=pool[i],a=i*Math.PI*2/8;p.kind=i<2?0:1;p.life=1;p.age=0;
            point.copy(i<2?tip:center);
            if(i>=2){point.x+=Math.cos(a)*(spell.radius+.12);point.z+=Math.sin(a)*(spell.radius+.12);point.y+=Math.sin(a*2)*spell.height*.4;}
            point.toArray(positions,i*3);sizes[i]=i<2?.18:.12;opacity[i]=Math.min(.65,opacity[i]+dt*3);
          }
        }else {
          const strength=spell.mode==='lower'?.5:1;
          wandBudget+=dt*64*strength;targetBudget+=dt*48*strength;
          while(wandBudget>=1){spawn(0,spell);wandBudget--;}
          while(targetBudget>=1){spawn(1,spell);targetBudget--;}
        }
      }
      let count=0;
      for(let i=0;i<capacity;i++) {
        const p=pool[i];if(!p.life)continue;
        if(reducedMotion) {
          if(!emitting)opacity[i]=Math.max(0,opacity[i]-dt*2);
          if(!opacity[i]){p.life=0;continue;}
        }else {
          p.age+=dt;
          if(p.age>=p.life){p.life=0;opacity[i]=0;continue;}
          const t=p.age/p.life,envelope=Math.sin(t*Math.PI);
          point.lerpVectors(p.start,p.end,t);
          if(p.kind===0) {
            const arc=envelope*.16,phase=p.phase+t*4;
            point.x+=Math.cos(phase)*arc;point.z+=Math.sin(phase)*arc;point.y+=envelope*.18;
          }
          point.toArray(positions,i*3);
          opacity[i]=Math.min(1,t*8,(1-t)*4)*(.75+.25*Math.sin(p.phase+t*6));
          angles[i]=p.phase+t*.5;
        }
        count++;
      }
      object.visible=count>0;
      if(count||!emitting)for(const attribute of Object.values(geometry.attributes))attribute.needsUpdate=true;
    },
    inspect() {
      let wand=0,target=0;
      for(const p of pool)if(p.life){if(p.kind===0)wand++;else target++;}
      return {count:wand+target,wand,target,capacity,reducedMotion,wandTip:tip.toArray(),targetCenter:center.toArray()};
    },
    dispose(){reset();object.removeFromParent();geometry.dispose();material.dispose();},
  };
}
