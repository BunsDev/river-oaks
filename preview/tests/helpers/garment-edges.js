import * as THREE from 'three';

// Actual posed garment edges against the rig's upper-thigh surface. Unlike the
// vertical seated probe, this detects surface crossings on vertical/rear cloth.
// It is not a closed-volume containment or exhaustive triangle-overlap test.
export function garmentEdgeFixture(model,body,garments){
  model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
  const pelvis=model.getObjectByName('pelvis'),frame=new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3())),inverse=frame.clone().invert();
  const rest=Array.from({length:body.geometry.attributes.position.count},(_,i)=>body.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(body.matrixWorld).applyMatrix4(inverse));
  const leg=i=>{let weight=0;for(let c=0;c<4;c++)if(/^(pelvis|thigh_[lr]|calf_[lr])$/.test(body.skeleton.bones[body.geometry.attributes.skinIndex.getComponent(i,c)].name))weight+=body.geometry.attributes.skinWeight.getComponent(i,c);return weight>.5;};
  const indices=[];
  for(let n=0;n<body.geometry.index.count;n+=3){const ids=[0,1,2].map(c=>body.geometry.index.getX(n+c));if(ids.every(i=>rest[i].y<.03&&rest[i].y>-.45&&leg(i)))indices.push(...ids);}
  if(!indices.length)throw new Error('Garment edge fixture requires actual thigh triangles');
  const collider=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));collider.geometry.setIndex(indices);collider.updateMatrixWorld(true);
  const entries=garments.map(mesh=>{
    const edges=new Map();for(let n=0;n<mesh.geometry.index.count;n+=3){const ids=[0,1,2].map(c=>mesh.geometry.index.getX(n+c));for(let c=0;c<3;c++){const a=ids[c],b=ids[(c+1)%3];edges.set([Math.min(a,b),Math.max(a,b)].join(':'),[a,b]);}}
    return {mesh,edges:[...edges.values()]};
  });
  return {
    sample(){
      model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
      collider.geometry.setAttribute('position',new THREE.Float32BufferAttribute(rest.flatMap((_,i)=>body.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(body.matrixWorld).toArray()),3));collider.geometry.computeBoundingSphere();
      const ray=new THREE.Raycaster(),direction=new THREE.Vector3(),epsilon=.001*model.getWorldScale(new THREE.Vector3()).y;
      return entries.map(({mesh,edges})=>{
        const points=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));let crossings=0,testedEdges=0,skippedEdges=0;const examples=[];
        for(const [a,b]of edges){direction.subVectors(points[b],points[a]);const length=direction.length();if(length<=2*epsilon){skippedEdges++;continue;}testedEdges++;ray.set(points[a],direction.divideScalar(length));ray.near=epsilon;ray.far=length-epsilon;const hit=ray.intersectObject(collider,false)[0];if(hit){crossings++;if(examples.length<3)examples.push({a,b,point:hit.point.toArray()});}}
        return {name:mesh.name,testedEdges,skippedEdges,crossings,examples};
      });
    },
    dispose(){collider.geometry.dispose();collider.material.dispose();},
  };
}
