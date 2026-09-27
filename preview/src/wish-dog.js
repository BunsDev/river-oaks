import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

let cached;
export function loadWishDogAsset(){return cached??=new GLTFLoader().loadAsync('/assets/dog/dog.glb').catch(error=>{cached=null;throw error;});}

// NewDLC's CC0 canine: shared immutable skin/textures, independent bones/materials.
// Animate above the planted limbs; breathing and a sneeze never bounce the paws.
export function createWishDog(localId,{loadAsset=loadWishDogAsset}={}){
  const object=new THREE.Group();object.name='Wish dog';
  const owned=new Set(),skeletons=new Set(),bones=new Map();
  let disposed=false,loaded=false;
  const ready=loadAsset().then(asset=>{
    if(disposed)return false;
    const rig=clone(asset.scene),materials=new Map();object.add(rig);
    rig.traverse(o=>{
      if(o.isBone)bones.set(o.name,{bone:o,quaternion:o.quaternion.clone(),scale:o.scale.clone()});
      if(!o.isMesh)return;
      if(!materials.has(o.material)){
        const material=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(material,o.material);
        if(material.name.includes('coat')){
          material.sheen=.3;material.sheenColor.set('#d4c9b4');material.sheenRoughness=.9;
          material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor,.68,.97);');};
          material.customProgramCacheKey=()=> 'wish-dog-coat-v1';
        }else{material.roughness=.15;material.clearcoat=1;}
        materials.set(o.material,material);owned.add(material);
      }
      o.material=materials.get(o.material);o.castShadow=o.receiveShadow=true;
      o.userData.localId=localId;
      if(o.isSkinnedMesh){skeletons.add(o.skeleton);o.frustumCulled=false;}
    });
    object.updateMatrixWorld(true);
    // Store dog-relative axes in each bone's rest frame, independent of the
    // resident's heading when the asynchronous asset happens to finish loading.
    const orientation=object.getWorldQuaternion(new THREE.Quaternion());
    for(const item of bones.values()){
      const inverse=item.bone.getWorldQuaternion(new THREE.Quaternion()).invert();
      item.pitch=new THREE.Vector3(1,0,0).applyQuaternion(orientation).applyQuaternion(inverse);
      item.yaw=new THREE.Vector3(0,1,0).applyQuaternion(orientation).applyQuaternion(inverse);
    }
    loaded=true;object.userData.assetState='ready';return true;
  }).catch(()=>{if(!disposed)object.userData.assetState='unavailable';return false;});
  object.userData.assetState='loading';
  return {
    object,ready,get loaded(){return loaded;},
    update(age,phase,reducedMotion=false){
      if(!loaded||disposed)return;
      const time=Number.isFinite(age)?age:0;
      for(const {bone,quaternion,scale}of bones.values()){bone.quaternion.copy(quaternion);bone.scale.copy(scale);}
      if(reducedMotion)return;
      const turn=(name,axis,angle)=>{const part=bones.get(name);if(part)part.bone.rotateOnAxis(part[axis],angle);};
      // An occasional gentle sneeze is confined to the neck, rather than tipping the animal.
      const sneeze=phase==='gift'?0:Math.max(0,Math.sin(time*1.7))**28*.1;
      turn('b_Neck','pitch',Math.sin(time*1.25)*.015+sneeze);
      turn('b_Head','yaw',Math.sin(time*.42)*.07);
      turn('b_Head','pitch',Math.sin(time*.8)*.025-sneeze*.5);
      for(const [i,name]of ['b_Tail01','b_Tail02','b_Tail03','b_Tail04'].entries())turn(name,'yaw',Math.sin(time*3.6-i*.5)*(.11-i*.017));
    },
    dispose(){if(disposed)return;disposed=true;loaded=false;for(const s of skeletons)s.dispose();for(const r of owned)r.dispose();object.clear();object.removeFromParent();},
  };
}
