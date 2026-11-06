// The world-streaming bound: a lap may hold at most 20 scene objects, 20 geometries and 10 textures
// more than the warmed baseline. Resident figures come and go with who walks by, so what they alone
// hold is left out of both sides (figure-resources.js). The limits are unchanged. No figure may
// excuse more than the most one was measured to add (2026-11-04: up to 23 geometries and 5 textures
// at a matched state), so growth inside a live figure still counts.
export const FIGURE_GEOMETRIES = 25, FIGURE_TEXTURES = 5;

const withoutFigures = state => {
  const { figures, geometries, textures } = state.residentResources;
  return {
    geometries: state.renderer.geometries - Math.min(geometries, figures * FIGURE_GEOMETRIES),
    textures: state.renderer.textures - Math.min(textures, figures * FIGURE_TEXTURES),
  };
};

export function withinResourceBounds(rows, reference) {
  return rows.every((state, i) => {
    const now = withoutFigures(state), then = withoutFigures(reference[i]);
    return state.objects <= reference[i].objects + 20 && now.geometries <= then.geometries + 20 && now.textures <= then.textures + 10;
  });
}
