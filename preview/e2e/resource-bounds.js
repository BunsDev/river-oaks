// The world-streaming bound: a lap may hold at most 20 scene objects, 20 geometries and 10 textures
// more than the warmed baseline. Resident figures come and go with who walks by, so what they alone
// hold is left out of both sides (figure-resources.js). The limits are unchanged.
const withoutFigures = state => ({
  geometries: state.renderer.geometries - state.residentResources.geometries,
  textures: state.renderer.textures - state.residentResources.textures,
});

export function withinResourceBounds(rows, reference) {
  return rows.every((state, i) => {
    const now = withoutFigures(state), then = withoutFigures(reference[i]);
    return state.objects <= reference[i].objects + 20 && now.geometries <= then.geometries + 20 && now.textures <= then.textures + 10;
  });
}
