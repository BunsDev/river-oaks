// SkeletonUtils clones a Skeleton for every mesh, even when all parts use the
// same cloned bones. Share only exact matches within one owned avatar clone.
// Mesh bind matrices and geometry remain independent and are never rewritten.
export function shareAvatarSkeletons(model) {
 const retained=new Set(),retired=new Set(),byRoot=new Map();
 model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const skeleton=mesh.skeleton,root=skeleton.bones[0],candidates=byRoot.get(root)??[];
  const matching=candidates.find(candidate=>candidate.bones.length===skeleton.bones.length&&candidate.boneInverses.length===skeleton.boneInverses.length&&candidate.bones.every((bone,i)=>bone===skeleton.bones[i])&&candidate.boneInverses.every((inverse,i)=>inverse.equals(skeleton.boneInverses[i])));
  if(matching){if(matching!==skeleton){mesh.skeleton=matching;retired.add(skeleton);}}
  else{candidates.push(skeleton);byRoot.set(root,candidates);retained.add(skeleton);}
 });
 for(const skeleton of retired)skeleton.dispose();
 return retained;
}
