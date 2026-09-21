import * as THREE from 'three';

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
  const silk = surface({color:'#c78699', roughness:0.42, sheen:0.8, sheenColor:new THREE.Color('#fbe1d9'), sheenRoughness:0.48, bumpMap:weave, bumpScale:0.0007, side:THREE.DoubleSide});
  const organza = surface({color:'#e0b0b9', roughness:0.57, sheen:0.9, sheenColor:new THREE.Color('#fff0df'), sheenRoughness:0.65, side:THREE.DoubleSide});
  const platinum = surface({color:'#e5e2eb', metalness:0.92, roughness:0.22});
  const crystal = surface({color:'#fff5ee', roughness:0.08, metalness:0.08, clearcoat:1, ior:1.8, transmission:0.35, thickness:0.012});
  const embroiderySize=512, embroideryData=new Uint8Array(embroiderySize*embroiderySize*4);
  for(let y=0;y<embroiderySize;y++)for(let x=0;x<embroiderySize;x++) {
    const u=x/embroiderySize,v=y/embroiderySize;
    const curve=Math.abs(Math.sin((u+0.08*Math.sin(v*Math.PI*8))*Math.PI*24));
    const stitch=curve<0.10;
    embroideryData.set(stitch?[218,211,222,255]:[199,134,153,255],(y*embroiderySize+x)*4);
  }
  const embroidery=new THREE.DataTexture(embroideryData,embroiderySize,embroiderySize);
  embroidery.colorSpace=THREE.SRGBColorSpace;embroidery.generateMipmaps=true;
  embroidery.magFilter=THREE.LinearFilter;embroidery.minFilter=THREE.LinearMipmapLinearFilter;embroidery.needsUpdate=true;owned.add(embroidery);
  const bodice=silk.clone();bodice.color.set('#ffffff');bodice.map=embroidery;bodice.metalness=0.12;owned.add(bodice);
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
          diffuseColor.rgb = mix(vec3(0.12, 0.055, 0.018), vec3(0.78, 0.59, 0.30), pow(strand, 0.65));
        `);
      };
      material.customProgramCacheKey = () => 'jevica-champagne-hair-v1';
    }
    if (original.name === 'jevica_silk') {
      model.traverse(item => {if (item.isMesh && item.material === material) item.material = bodice;});
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
    return new THREE.Vector2(0.155 + 0.44 * Math.pow(t, 0.72), 0.085 - t * 0.985);
  });
  const skirt = new THREE.LatheGeometry(rings, 128);
  const vertices = skirt.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const angle = Math.atan2(z, x), t = THREE.MathUtils.clamp((0.085 - y) / 0.985, 0, 1);
    const fold = 1 + (0.018 + t * 0.045) * Math.sin(angle * 18 + t * 0.8) + 0.012 * Math.sin(angle * 36 - t);
    vertices.setXYZ(i, x * fold, y + Math.pow(t, 8) * 0.012 * Math.cos(angle * 18), z * fold * 0.93);
  }
  skirt.computeVertexNormals();
  const gown = mesh(waist, skirt, silk, [0,0,0]); gown.name = 'Jevica draped silk gown';
  // Two continuous organza swags sit over the silk, with thin scalloped hems.
  for (let tier = 0; tier < 2; tier++) {
    const geometry = skirt.clone(), positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const t = THREE.MathUtils.clamp((0.085 - vertices.getY(i)) / 0.985, 0, 1);
      const angle = Math.atan2(vertices.getZ(i), vertices.getX(i));
      const hem = 0.49 + tier * 0.29 + 0.055 * Math.cos(angle * 5);
      const progress = t * hem;
      const radius = 0.163 + tier * 0.004 + 0.445 * Math.pow(progress, 0.72);
      const fold = 1 + progress * 0.048 * Math.sin(angle * 18 + progress * 0.8);
      positions.setXYZ(i, Math.cos(angle) * radius * fold, 0.086 - progress * 0.985, Math.sin(angle) * radius * fold * 0.93);
    }
    geometry.computeVertexNormals(); mesh(waist, geometry, organza, [0,0,0]);
  }
  const head = attach('head');
  const tulle=surface({color:'#f7c9df',roughness:0.62,sheen:0.9,sheenColor:new THREE.Color('#fff2fc'),transparent:true,opacity:0.43,depthWrite:false,side:THREE.DoubleSide});
  for(const side of [-1,1]) {
    const shoulder=attach(side<0?'clavicle_r':'clavicle_l');
    for(let petal=0;petal<3;petal++) {
      const geometry=new THREE.PlaneGeometry(1,1,16,20),position=geometry.attributes.position;
      for(let i=0;i<position.count;i++) {
        const u=position.getX(i)*2,v=position.getY(i)+0.5;
        const width=Math.sin(v*Math.PI)*0.11;
        position.setXYZ(i,side*(0.065+v*(0.17-petal*0.025)+u*width*0.35),v*(0.15+petal*0.035),-0.018+u*width+Math.sin(v*Math.PI)*0.035-petal*0.028);
      }
      geometry.computeVertexNormals();
      const bow=mesh(shoulder,geometry,tulle,[side*0.06,-0.075,0.025]);bow.castShadow=false;
    }
    const earring=mesh(head,new THREE.TorusGeometry(0.014,0.0016,6,24),platinum,[side*0.086,0.013,0.029]);earring.scale.y=1.3;
  }
  const band = mesh(head, new THREE.TorusGeometry(0.098,0.002,8,64), platinum, [0,0.115,0.005]);
  band.rotation.x = Math.PI / 2;
  // A low, tapered tiara follows the forehead instead of extending the skull.
  for (let i = 0; i < 9; i++) {
    const angle = -Math.PI * 0.43 + i / 8 * Math.PI * 0.86;
    const height = 0.018 + 0.038 * Math.pow(Math.cos(angle), 3);
    const x = Math.sin(angle) * 0.098, z = Math.cos(angle) * 0.098;
    const points = Array.from({length:17}, (_, j) => {
      const a = j / 16 * Math.PI * 2;
      return new THREE.Vector3(x + Math.sin(a) * 0.012, 0.115 + (1-Math.cos(a))*height/2, z);
    });
    mesh(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,0.0013,5,false), platinum, [0,0,0]);
    mesh(head, new THREE.OctahedronGeometry(0.007), crystal, [x,0.115+height,z], [0.7,1.35,0.6]);
  }
  for (const side of [-1,1]) {
    mesh(head, new THREE.OctahedronGeometry(0.01), crystal, [side*0.083,0.018,0.025], [0.65,1.6,0.7]);
  }
  const belt = mesh(waist, new THREE.TorusGeometry(0.16,0.004,8,80), platinum, [0,0.065,0]);
  belt.rotation.x = Math.PI / 2; belt.scale.y = 0.78;
  const hand = attach('hand_r');
  mesh(hand, new THREE.CylinderGeometry(0.003,0.004,0.56,12), platinum, [0,0.2,0.03]);
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI/2 + i*Math.PI/5, r = i%2 ? 0.024 : 0.06;
    if (i) star.lineTo(Math.cos(angle)*r, Math.sin(angle)*r);
    else star.moveTo(Math.cos(angle)*r, Math.sin(angle)*r);
  }
  star.closePath();
  mesh(hand, new THREE.ExtrudeGeometry(star,{depth:0.007,bevelEnabled:true,bevelThickness:0.002,bevelSize:0.002,bevelSegments:2,steps:1}), crystal, [0,0.51,0.026]);
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  return {
    update() {
      avatar.object.updateWorldMatrix(true, true);
      inverse.copy(avatar.object.getWorldQuaternion(orientation)).invert();
      for (const item of attachments) {
        item.bone.getWorldPosition(position); item.group.position.copy(avatar.object.worldToLocal(position));
        item.bone.getWorldQuaternion(orientation); item.group.quaternion.copy(inverse).multiply(orientation).multiply(item.rest);
      }
    },
    dispose() { attachments.forEach(({group}) => group.removeFromParent()); owned.forEach(item => item.dispose()); },
  };
}
