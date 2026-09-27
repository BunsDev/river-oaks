import { batchCostumeAttachments } from './costume-batching.js';
import * as THREE from 'three';
import { measureHead, measureCrownBand } from './head-fit.js';
import { createJevicaDrape } from './jevica-drape.js';
import { createJevicaEmbroidery } from './jevica-embroidery.js';
import { fitJevicaBodice } from './bodice-fitting.js';
import { createRidingClothes } from './riding-clothes.js';

// One hero costume. Shared resident geometry and textures are never mutated.
export function createJevicaCostume(avatar) {
  const { model, materials } = avatar.rig;
  const owned = new Set(), attachments = [];
  const surface = parameters => {
    const material = new THREE.MeshPhysicalMaterial(parameters);
    owned.add(material);
    return material;
  };
  // A small, deterministic weave gives satin a grazing highlight without glitter.
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const value = 128 + Math.round(22 * Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2));
    data.set([value, value, value, 255], (y * size + x) * 4);
  }
  const weave = new THREE.DataTexture(data, size, size);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(22, 16);
  weave.magFilter = THREE.LinearFilter; weave.minFilter = THREE.LinearMipmapLinearFilter;
  weave.generateMipmaps = true; weave.needsUpdate = true; owned.add(weave);
  const {map:embroidery,properties}=createJevicaEmbroidery();
  owned.add(embroidery);owned.add(properties);
  const silk = surface({color:'#ffffff', map:embroidery, metalness:0.85, metalnessMap:properties,
    roughness:0.48, roughnessMap:properties, sheen:0.65, sheenColor:new THREE.Color('#ffe5ed'),
    sheenRoughness:0.52, bumpMap:weave, bumpScale:0.0005, side:THREE.DoubleSide});
  const gold = surface({color:'#c49b4b', metalness:0.85, roughness:0.28});
  const crystal = surface({color:'#fff5ee', roughness:0.08, metalness:0.08, clearcoat:1, ior:1.8, transmission:0.35, thickness:0.012});
  crystal.name='Jevica crown crystals';
  const bodice=silk.clone();owned.add(bodice);
  for (const [original, material] of materials) {
    if (/^young_/.test(original.name)) {
      material.color.set('#ffffff'); material.roughness = 0.58; material.envMapIntensity = 0.65;
    }
    if (original.name === 'long01') {
      material.color.set('#ffffff'); material.roughness = 0.48; material.alphaTest = 0.35;
      // Preserve the licensed hair-card alpha and individual strand shading.
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #include <map_fragment>
          float strand = clamp(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) * 3.5, 0.0, 1.0);
          diffuseColor.rgb = mix(vec3(0.12, 0.055, 0.018), vec3(0.80, 0.55, 0.32), pow(strand, 0.65));
        `);
      };
      material.customProgramCacheKey = () => 'jevica-rose-gold-hair-v2';
    }
    if (original.name === 'jevica_brows') {
      material.alphaTest = 0.4; material.transparent = false; material.depthWrite = true;
      material.roughness = 0.8;
      // Warm, softly defined brows retain the source strand coverage and alpha.
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #include <map_fragment>
          float browStrand = clamp(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
          diffuseColor.rgb = mix(vec3(0.09, 0.039, 0.015), vec3(0.21, 0.12, 0.05), browStrand);
        `);
      };
      material.customProgramCacheKey = () => 'jevica-soft-brows-v1';
    }
    if (original.name === 'jevica_silk') {
      model.traverse(item => {
        if (!item.isMesh || item.material !== material) return;
        item.material = bodice;
        // Follow the fitted neckline in bind space; skinning then carries the
        // embroidery with the torso instead of leaving a floating rigid collar.
        item.geometry=item.geometry.clone();owned.add(item.geometry);
        fitJevicaBodice(model,item);
        const positions=item.geometry.attributes.position,uv=new Float32Array(positions.count*2);
        for(let i=0;i<positions.count;i++) {
          const x=positions.getX(i),neckline=1.235-.055*Math.max(0,1-Math.abs(x)/.13);
          uv[i*2]=(x+.195)/.39;uv[i*2+1]=Math.max(0,(neckline-positions.getY(i))/.22);
        }
        item.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
      });
    }
    material.needsUpdate = true;
  }
  model.updateMatrixWorld(true);
  const attach = name => {
    const bone = model.getObjectByName(name), group = new THREE.Group();
    const rest = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    avatar.object.add(group); attachments.push({bone, group, rest}); return group;
  };
  const mesh = (group, geometry, material, position, scale = [1,1,1]) => {
    owned.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.fromArray(position); object.scale.fromArray(scale);
    object.castShadow = object.receiveShadow = true; group.add(object); return object;
  };
  const waist = attach('spine_01');
  // Dense vertical samples make folds continuous instead of stacked rigid petals.
  const rings = Array.from({length:41}, (_, i) => {
    const t = 1 - i / 40;
    return new THREE.Vector2(0.215 + 0.38 * Math.pow(t, 1.15) - .05 * Math.exp(-t / .07), 0.085 - t * 0.985);
  });
  const skirt = new THREE.LatheGeometry(rings, 128);
  const vertices = skirt.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const angle = Math.atan2(z, x), t = THREE.MathUtils.clamp((0.085 - y) / 0.985, 0, 1);
    const fold = 1 + (0.008 + t * 0.027) * Math.sin(angle * 18 + t * 0.8) + 0.006 * Math.sin(angle * 36 - t);
    const height=y+Math.pow(t,8)*.012*Math.cos(angle*18);
    vertices.setXYZ(i, x * fold, height, z * fold * .93);
  }
  skirt.computeVertexNormals();
  const gown = mesh(waist, skirt, silk, [0,0,0], [0.88,1,0.88]); gown.name = 'Jevica draped silk gown';
  const skirts=[gown];
  const head = attach('head');
  const fit=measureHead(avatar.rig),crown=measureCrownBand(avatar.rig,fit.skull.top-.048),crownRadius=crown.rz,crownOval=crown.rx/crown.rz;
  const [crownX,crownZ]=crown.centre,crownY=crown.y;
  for(const y of [crownY,crownY+0.012]) {
    const band=mesh(head,new THREE.TorusGeometry(crownRadius,0.002,8,64),gold,[crownX,y,crownZ]);band.rotation.x=Math.PI/2;band.scale.x=crownOval;
  }
  // Open gold filigree surrounds the crown rather than a solid metal cylinder.
  for(let i=0;i<11;i++) {
    const angle=i/11*Math.PI*2, height=0.023+0.014*Math.max(0,Math.cos(angle));
    const points=Array.from({length:25},(_,j)=>{
      const a=j/24*Math.PI*2,theta=angle+Math.sin(a)*0.13,r=crownRadius+(1-Math.cos(a))*0.004;
      return new THREE.Vector3(crownX+Math.sin(theta)*r*crownOval,crownY+(1-Math.cos(a))*height/2,crownZ+Math.cos(theta)*r);
    });
    mesh(head,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),32,0.0018,6,true),gold,[0,0,0]);
    mesh(head,new THREE.OctahedronGeometry(0.005),crystal,[crownX+Math.sin(angle)*crownRadius*crownOval,crownY+height,crownZ+Math.cos(angle)*crownRadius],[0.7,1.4,0.7]);
  }
  for (const side of [-1,1]) {
    mesh(head, new THREE.OctahedronGeometry(0.01), crystal, [side*0.083,0.018,0.025], [0.65,1.6,0.7]);
  }
  const belt = mesh(waist, new THREE.TorusGeometry(0.16,0.004,8,80), gold, [0,0.065,0]);
  belt.rotation.x = Math.PI / 2; belt.scale.y = 0.78;
  const hand = attach('hand_r');
  const starlight=surface({color:'#fff3fa',emissive:'#ffabd7',emissiveIntensity:3,roughness:.2});
  mesh(hand,new THREE.CylinderGeometry(0.003,0.0025,0.69,12),gold,[0,0.24,0.03]);
  mesh(hand,new THREE.IcosahedronGeometry(0.014,2),starlight,[0,0.60,0.03]);
  for(let i=0;i<12;i++) {
    const angle=i/12*Math.PI*2,length=i%3===0?.085:.042;
    const spike=mesh(hand,new THREE.ConeGeometry(.003,length,4),starlight,[Math.sin(angle)*length/2,.60+Math.cos(angle)*length/2,.03]);spike.rotation.z=-angle;
  }
  const glowSize=64,glowPixels=new Uint8Array(glowSize*glowSize*4);
  for(let y=0;y<glowSize;y++)for(let x=0;x<glowSize;x++) {
    const r=Math.hypot((x+.5)/glowSize*2-1,(y+.5)/glowSize*2-1);
    glowPixels.set([255,155,210,Math.round(150*Math.pow(Math.max(0,1-r),3))],(y*glowSize+x)*4);
  }
  const glowMap=new THREE.DataTexture(glowPixels,glowSize,glowSize);glowMap.needsUpdate=true;owned.add(glowMap);
  const glowMaterial=new THREE.SpriteMaterial({map:glowMap,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});owned.add(glowMaterial);
  const glow=new THREE.Sprite(glowMaterial);glow.position.set(0,.60,.03);glow.scale.setScalar(.38);
  // Light has no solid surface for the district ambient-occlusion depth pass.
  glow.userData.aoExclude=true;hand.add(glow);
  for(const skirt of skirts)skirt.userData.deformableCostume=true;
  const drape=createJevicaDrape(avatar,waist,skirts);
  const ridingClothes=createRidingClothes(model);
  batchCostumeAttachments(attachments, owned);
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  const opticalPosition=new THREE.Vector3(),opticalScale=new THREE.Vector3();
  return {
    getWandTip(target) {return glow.getWorldPosition(target);},
    updateOptics(camera,viewportHeight) {
      if(!camera||!Number.isFinite(viewportHeight)||viewportHeight<=0)return;
      camera.updateWorldMatrix(true,false);
      head.getWorldPosition(opticalPosition).applyMatrix4(camera.matrixWorldInverse);
      head.getWorldScale(opticalScale);
      // The largest individual jewel is a 32 mm earring. Keep its reflection,
      // facets and clearcoat at every distance, and smoothly restore refraction
      // when it spans 8–16 CSS pixels, consistently across display densities.
      // A nonzero transmission otherwise
      // asks Three to draw the entire opaque district again for these tiny gems.
      const diameter=.032*Math.max(opticalScale.x,opticalScale.y,opticalScale.z);
      const pixels=diameter*viewportHeight*.5*camera.projectionMatrix.elements[5]/Math.max(.01,-opticalPosition.z);
      crystal.transmission=.35*THREE.MathUtils.smoothstep(pixels,8,16);
    },
    update(_flying, now, riding=false) {
      ridingClothes.update(riding);
      hand.visible=!riding;
      avatar.object.updateWorldMatrix(true, true);
      inverse.copy(avatar.object.getWorldQuaternion(orientation)).invert();
      for (const item of attachments) {
        item.bone.getWorldPosition(position); item.group.position.copy(avatar.object.worldToLocal(position));
        item.bone.getWorldQuaternion(orientation); item.group.quaternion.copy(inverse).multiply(orientation).multiply(item.rest);
      }
      avatar.object.updateWorldMatrix(true,true);
      drape.update(now,riding);
    },
    dispose() { ridingClothes.dispose(); attachments.forEach(({group}) => group.removeFromParent()); owned.forEach(item => item.dispose()); },
  };
}
