// GTAO's geometry pass draws every object through one MeshNormalMaterial
// (scene.overrideMaterial), but three still sorts that pass by each object's own
// material. Skinned, rigid, morphed and instanced meshes then interleave, and
// every change of kind makes three re-derive the override's program. Sorting the
// pass by kind first keeps the override on one program per kind. Under a single
// depth-tested override, draw order only decides which fragment wins an exact
// depth tie; the depth buffer keeps the nearest fragment in any order.

// A number for the object properties draw-census.js programSignature reads.
export function occlusionKind(object, geometry) {
  const morphs = geometry.morphAttributes ?? {};
  return (object.isSkinnedMesh ? 1 : 0) | (object.isInstancedMesh ? 2 : 0) | (object.isBatchedMesh ? 4 : 0) | (object.instanceColor ? 8 : 0)
    | (morphs.normal ? 16 : 0) | (morphs.color ? 32 : 0) | ((morphs.position?.length ?? 0) << 6);
}

// Reading the kind flags of many object classes in every comparison made the
// sort cost more than the program switches it saves. three reuses its render
// items across frames, so each item keeps its kind with the object and geometry
// it was read from. A stale kind (instance colors added later) could only group
// a draw with the wrong kind; it never changes what is drawn.
function itemKind(item) {
  if (item.occlusionObject !== item.object || item.occlusionGeometry !== item.geometry) {
    item.occlusionObject = item.object; item.occlusionGeometry = item.geometry;
    item.occlusionKind = occlusionKind(item.object, item.geometry);
  }
  return item.occlusionKind;
}

// three's painter orders with kind in place of material: explicit group and
// render order first, then kind, then opaque front to back.
export function occlusionOpaqueSort(a, b) {
  return a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || itemKind(a) - itemKind(b) || a.z - b.z || a.id - b.id;
}

// Transparent and transmissive lists keep back to front within a kind.
export function occlusionTransparentSort(a, b) {
  return a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || itemKind(a) - itemKind(b) || b.z - a.z || a.id - b.id;
}

// Draws with the occlusion order, then restores three's default order. The game
// sets no other custom sort, so null is the order every other pass expects.
export function withOcclusionSort(renderer, enabled, draw) {
  if (!enabled) return draw();
  renderer.setOpaqueSort(occlusionOpaqueSort); renderer.setTransparentSort(occlusionTransparentSort);
  try { return draw(); } finally { renderer.setOpaqueSort(null); renderer.setTransparentSort(null); }
}
