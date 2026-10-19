import * as THREE from 'three';

// Coverage from fixed exterior views of actual body triangle centroids.
// Compare first hits with actual material sidedness; report body-occluded
// samples separately. This is sampled visibility, not collision containment.
export function bodyCoverageFixture(model,body,garments,{bottom,top}={}){
  model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
  const pelvis=model.getObjectByName('pelvis'),frame=new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3())),inverse=frame.invert();
  const rest=Array.from({length:body.geometry.attributes.position.count},(_,i)=>body.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(body.matrixWorld).applyMatrix4(inverse));
  const leg=i=>{let sum=0;for(let c=0;c<4;c++)if(/^(pelvis|thigh_[lr]|calf_[lr])$/.test(body.skeleton.bones[body.geometry.attributes.skinIndex.getComponent(i,c)].name))sum+=body.geometry.attributes.skinWeight.getComponent(i,c);return sum>.5;};
  const triangles=[];for(let n=0;n<body.geometry.index.count;n+=3){const ids=[0,1,2].map(c=>body.geometry.index.getX(n+c));if(ids.every(i=>rest[i].y>bottom&&rest[i].y<top&&leg(i)))triangles.push(ids);}
  if(!triangles.length)throw new Error('Coverage fixture requires actual body triangles');
  return {
    sample({chunked=true}={}){
      model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
      const scale=model.getWorldScale(new THREE.Vector3()).y,rotation=model.getWorldQuaternion(new THREE.Quaternion());
      const points=rest.map((_,i)=>body.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(body.matrixWorld));
      const centers=triangles.map(ids=>new THREE.Triangle(...ids.map(i=>points[i])).getMidpoint(new THREE.Vector3()));
      const center=centers.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(centers.length);
      const visible=mesh=>{for(let node=mesh;node;node=node.parent)if(!node.visible)return false;return mesh.material.visible!==false&&mesh.material.opacity>0;};
      if(!visible(body))throw new Error('Coverage fixture requires a visible body');
      const targets=[body,...garments.filter(visible)].map(mesh=>{
        const positions=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
        const groups=new Map(),position=mesh.geometry.attributes.position,index=mesh.geometry.index;
        for(let n=0;n<(index?.count??position.count);n+=3){
          const ids=[0,1,2].map(c=>index?index.getX(n+c):n+c),p=ids.reduce((v,i)=>v.add(new THREE.Vector3().fromBufferAttribute(position,i)),new THREE.Vector3()).divideScalar(3);
          const key=chunked?p.toArray().map(v=>Math.floor(v/.15)).join(':'):'all';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...ids);
        }
        const attribute=new THREE.Float32BufferAttribute(positions.flatMap(p=>p.toArray()),3),material=new THREE.MeshBasicMaterial({side:mesh.material.side});
        return [...groups.values()].map(ids=>{
          const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',attribute);geometry.setIndex(ids);
          geometry.boundingBox=new THREE.Box3().setFromPoints(ids.map(i=>new THREE.Vector3().fromBufferAttribute(attribute,i)));geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
          const collider=new THREE.Mesh(geometry,material);collider.updateMatrixWorld(true);return collider;
        });
      });
      const views=[],ray=new THREE.Raycaster(),skin=targets[0],cloth=targets.slice(1).flat();
      try{
        for(const [view,offset]of [[0,[0,.4,1]],[1,[1,.4,1]],[2,[1,.4,0]],[3,[1,.4,-1]],[4,[0,.4,-1]],[5,[-1,.4,-1]],[6,[-1,.4,0]],[7,[-1,.4,1]],[8,[0,-.2,1]],[9,[0,-.2,-1]]]){
          const origin=new THREE.Vector3(...offset).normalize().multiplyScalar(1.5*scale).applyQuaternion(rotation).add(center);
          let tested=0,occluded=0,uncovered=0;const examples=[];
          for(const [i,point]of centers.entries()){
            const direction=point.clone().sub(origin),distance=direction.length();ray.set(origin,direction.divideScalar(distance));ray.far=distance+.001*scale;
            const hit=ray.intersectObjects(skin,false)[0];
            if(!hit||hit.distance<distance-.0005*scale){occluded++;continue;}
            tested++;const cover=ray.intersectObjects(cloth,false)[0];
            if(!cover||cover.distance>hit.distance-.0001*scale){uncovered++;if(examples.length<3)examples.push({ids:triangles[i],point:point.toArray(),clearance:cover?(hit.distance-cover.distance)/scale:null});}
          }
          views.push({view,tested,occluded,uncovered,examples});
        }
        return {tested:views.reduce((sum,v)=>sum+v.tested,0),uncovered:views.reduce((sum,v)=>sum+v.uncovered,0),views};
      }finally{for(const parts of targets){for(const mesh of parts)mesh.geometry.dispose();parts[0]?.material.dispose();}}
    },
  };
}
