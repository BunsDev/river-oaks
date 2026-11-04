// Development probe for resource journeys: what a set of figures alone holds on the GPU. A resident
// figure comes and goes as residents walk (resident-figures.js), so raw renderer counts swing with
// who is near. Counts only resources nothing else in the scene uses, so the rest can be compared.
const texturesOf = material => Object.values(material).filter(value => value?.isTexture);

function collect(object, geometries, textures, skip) {
  if (skip?.has(object) || !object.visible) return;
  if (object.geometry) geometries.add(object.geometry);
  for (const material of [object.material].flat()) if (material) for (const texture of texturesOf(material)) textures.add(texture);
  for (const child of object.children) collect(child, geometries, textures, skip);
}

export function exclusiveResources(scene, figures) {
  const skip = new Set(figures), own = { geometries: new Set(), textures: new Set() }, rest = { geometries: new Set(), textures: new Set() };
  for (const figure of figures) {
    const shown = figure.visible;
    figure.visible = true;
    collect(figure, own.geometries, own.textures);
    figure.visible = shown;
  }
  collect(scene, rest.geometries, rest.textures, skip);
  const count = (mine, others) => [...mine].filter(item => !others.has(item)).length;
  return { geometries: count(own.geometries, rest.geometries), textures: count(own.textures, rest.textures) };
}
