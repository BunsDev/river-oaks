import * as THREE from 'three';

// Mapped tree positions; branch, crown and leaf forms are explicitly interpreted.
export function buildFoliage(trees) {
  const group = new THREE.Group();
  if (!trees.length) return group;
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(8,64,53,64); gradient.addColorStop(0,'#45602d'); gradient.addColorStop(0.5,'#7c8f4a'); gradient.addColorStop(1,'#536d32');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(32,4); ctx.bezierCurveTo(68,32,62,95,32,124); ctx.bezierCurveTo(0,94,-2,30,32,4); ctx.fill();
  ctx.strokeStyle = '#a6ae7188'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(32,8); ctx.lineTo(32,120); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const leavesMaterial = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.88 });
  const bark = new THREE.MeshStandardMaterial({ color:'#6b6354', roughness:1 });
  const leafGeometry = new THREE.PlaneGeometry(0.14,0.26), branchGeometry = new THREE.CylinderGeometry(0.55,1,1,7);
  const leafCount = 5500, leaves = new THREE.InstancedMesh(leafGeometry, leavesMaterial, leafCount*trees.length);
  const branches = new THREE.InstancedMesh(branchGeometry,bark,trees.length*13);
  const dummy = new THREE.Object3D(), direction = new THREE.Vector3(), up = new THREE.Vector3(0,1,0), color = new THREE.Color();
  let seed = 48273;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  trees.forEach((tree,index) => {
    const [x,north,y]=tree.position, z=-north, radius=tree.crown_radius_m, h=tree.height_m;
    const centers=[];
    const branch=(start,end,width,slot)=>{
      direction.subVectors(end,start); dummy.position.addVectors(start,end).multiplyScalar(0.5); dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize()); dummy.scale.set(width,direction.length(),width);dummy.updateMatrix();branches.setMatrixAt(index*13+slot,dummy.matrix);
    };
    branch(new THREE.Vector3(x,y,z),new THREE.Vector3(x+0.15,y+h*0.64,z),radius*0.08,0);
    for(let i=0;i<12;i++){
      const angle=i*2.39996, spread=radius*(0.5+random()*0.45), end=new THREE.Vector3(x+Math.cos(angle)*spread,y+h*(0.59+random()*0.36),z+Math.sin(angle)*spread);
      branch(new THREE.Vector3(x,y+h*(0.36+i*0.014),z),end,radius*0.025, i+1);centers.push(end);
    }
    for(let i=0;i<leafCount;i++){
      const center=centers[i%centers.length], angle=random()*Math.PI*2, vertical=random()*2-1, r=Math.cbrt(random()), spread=Math.sqrt(1-vertical*vertical)*r;
      dummy.position.set(center.x+Math.cos(angle)*spread*radius*0.52,center.y+vertical*r*h*0.17,center.z+Math.sin(angle)*spread*radius*0.52);
      dummy.rotation.set(random()*Math.PI,random()*Math.PI*2,random()*Math.PI); dummy.scale.setScalar(0.85+random()*0.7);dummy.updateMatrix();leaves.setMatrixAt(index*leafCount+i,dummy.matrix);
      leaves.setColorAt(index*leafCount+i,color.setHSL(0.23+random()*0.035,0.16+random()*0.17,0.48+random()*0.4));
    }
  });
  for(const mesh of [branches,leaves]){mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
  group.userData.texture=texture;
  return group;
}
