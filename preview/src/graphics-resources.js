// Three replaces its GPU caches on restore, but their dispose listeners remain
// on retained CPU resources. Release them while the old caches still own them.
// BufferGeometry/Material/Texture.dispose keep CPU arrays/images for re-upload.
export function releaseSceneGraphics(scene) {
  const resources = new Set(), instances = new Set();
  const add = resource => { if (resource?.dispose) resources.add(resource); };
  const texture = value => {
    if (value?.isTexture) add(value);
    else if (Array.isArray(value)) value.forEach(texture);
  };
  texture(scene.background); texture(scene.environment);
  scene.traverse(object => {
    add(object.geometry);
    if (object.isInstancedMesh) instances.add(object);
    texture(object.morphTexture); texture(object.skeleton?.boneTexture);
    add(object.shadow?.map); add(object.shadow?.mapPass);
    for (const material of [].concat(object.material ?? [])) {
      add(material);
      Object.values(material).forEach(texture);
      for (const uniform of Object.values(material.uniforms ?? {})) texture(uniform.value);
    }
  });
  // InstancedMesh.dispose also clears morphTexture, which is CPU state to keep.
  for (const instance of instances) instance.dispatchEvent({ type: 'dispose' });
  for (const resource of resources) {
    if (!resource.isTexture) { resource.dispose(); continue; }
    // Deferred canvas painters use this same flag when reallocating their GPU
    // storage, so releasing a context must not cancel pending CPU painting.
    const previous = resource.userData.resizing;
    resource.userData.resizing = true;
    try { resource.dispose(); }
    finally {
      if (previous === undefined) delete resource.userData.resizing;
      else resource.userData.resizing = previous;
    }
  }
}
