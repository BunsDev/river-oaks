import * as THREE from 'three';

// Directional clearance against the actual rig's upper-thigh triangles. This
// deliberately excludes the torso, lower legs and unrelated outfit surfaces.
// Rendered views and the broader wardrobe matrix remain separate acceptance.
export function skirtContactFixture(model, body, skirt) {
  model.updateWorldMatrix(true, true);
  model.updateMatrixWorld(true);
  const pelvis = model.getObjectByName('pelvis');
  const frame = new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()), model.getWorldQuaternion(new THREE.Quaternion()), model.getWorldScale(new THREE.Vector3()));
  const inverse = frame.clone().invert();
  const rest = mesh => Array.from({length: mesh.geometry.attributes.position.count}, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
  const bodyRest = rest(body), skirtRest = rest(skirt), indices = [];
  const {skinIndex, skinWeight} = body.geometry.attributes;
  const thighSkin = i => {
    let weight = 0;
    for (let c = 0; c < 4; c++) if (/^(pelvis|thigh_[lr]|calf_[lr])$/.test(body.skeleton.bones[skinIndex.getComponent(i, c)].name)) weight += skinWeight.getComponent(i, c);
    return weight > .5;
  };
  for (let n = 0; n < body.geometry.index.count; n += 3) {
    const triangle = [0, 1, 2].map(c => body.geometry.index.getX(n + c));
    if (triangle.every(i => bodyRest[i].y < .02 && bodyRest[i].y > -.45 && thighSkin(i))) indices.push(...triangle);
  }
  const geometry = new THREE.BufferGeometry(), material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  geometry.setIndex(indices);
  const collider = new THREE.Mesh(geometry, material), ray = new THREE.Raycaster();
  return {
    sample() {
      model.updateWorldMatrix(true, true);
      // Match the renderer traversal: SkinnedMesh.updateMatrixWorld refreshes
      // attached bind inverses after a parent translation/rotation/scale.
      model.updateMatrixWorld(true);
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bodyRest.flatMap((_, i) => body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld).toArray()), 3));
      geometry.computeBoundingSphere(); collider.updateMatrixWorld(true);
      const vertices = skirtRest.map((_, i) => skirt.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(skirt.matrixWorld));
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())), down = up.clone().negate();
      const scale = model.getWorldScale(new THREE.Vector3()).y;
      let tested = 0, penetrating = 0, minimumClearance = Infinity;
      for (let n = 0; n < skirt.geometry.index.count; n += 3) {
        const ids = [0, 1, 2].map(c => skirt.geometry.index.getX(n + c));
        if (!ids.every(i => skirtRest[i].z > .03)) continue;
        for (const bary of [[1/3, 1/3, 1/3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5]]) {
          const point = new THREE.Vector3();
          for (let j = 0; j < 3; j++) point.addScaledVector(vertices[ids[j]], bary[j]);
          ray.set(point.clone().addScaledVector(up, .5 * scale), down); ray.far = scale;
          const hit = ray.intersectObject(collider, false)[0];
          if (!hit) continue;
          const clearance = point.clone().sub(hit.point).dot(up) / scale;
          tested++; minimumClearance = Math.min(minimumClearance, clearance);
          if (clearance < -.001) penetrating++;
        }
      }
      return {tested, penetrating, minimumClearance};
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
