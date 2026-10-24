import { fitJevicaBodice } from './bodice-fitting.js';

// Authored looks share Jevica's source bodice, but previously skipped its
// skin-clearance fitting. Cache the fitted attributes per source; each avatar owns its copy.
const fitted = new WeakMap();
export function fitCharacterBodice(model) {
  const bodice=model.getObjectByName('Jevica_fitted_bodice');
  if(!model.getObjectByName('Jevica')?.isSkinnedMesh||!bodice?.isSkinnedMesh)return null;
  const original=bodice.geometry,geometry=original.clone();bodice.geometry=geometry;
  let attributes=fitted.get(original);
  if(!attributes){
    fitJevicaBodice(model,bodice);
    attributes=Object.fromEntries(['position','normal','skinIndex','skinWeight'].map(name=>[name,geometry.attributes[name].clone()]));
    fitted.set(original,attributes);
  }else{
    for(const [name,attribute] of Object.entries(attributes))geometry.setAttribute(name,attribute.clone());
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
  }
  let disposed=false;
  return {dispose(){if(disposed)return;disposed=true;if(bodice.geometry===geometry)bodice.geometry=original;geometry.dispose();}};
}
