// Development probe for resource journeys: what the figures drawn right now alone hold on the GPU.
// A resident figure comes and goes as residents walk (resident-figures.js), so raw renderer counts
// swing with who is near. Only a figure actually shown counts, and anything else in the scene that
// uses a resource keeps it counted, even if hidden: a wrong answer here makes the bound stricter.
const texturesOf = material => Object.values(material).filter(value => value?.isTexture);
const add = (object, geometries, textures) => {
  if (object.geometry) geometries.add(object.geometry);
  for (const material of [object.material].flat()) if (material) for (const texture of texturesOf(material)) textures.add(texture);
};

function collectShown(object, geometries, textures) {
  if (!object.visible) return;
  add(object, geometries, textures);
  for (const child of object.children) collectShown(child, geometries, textures);
}

function collectRest(object, geometries, textures, figures) {
  if (figures.has(object)) return;
  add(object, geometries, textures);
  for (const child of object.children) collectRest(child, geometries, textures, figures);
}

export function exclusiveResources(scene, figures) {
  const shown = figures.filter(figure => figure.visible);
  const own = { geometries: new Set(), textures: new Set() }, rest = { geometries: new Set(), textures: new Set() };
  for (const figure of shown) collectShown(figure, own.geometries, own.textures);
  collectRest(scene, rest.geometries, rest.textures, new Set(figures));
  const count = (mine, others) => [...mine].filter(item => !others.has(item)).length;
  return { figures: shown.length, geometries: count(own.geometries, rest.geometries), textures: count(own.textures, rest.textures) };
}
