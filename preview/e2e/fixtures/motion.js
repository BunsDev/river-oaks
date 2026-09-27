import * as THREE from 'three';
import { loadResidentAvatar, AVATAR_PROFILES } from '../../src/avatars.js';
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(1600,900);renderer.shadowMap.enabled=true;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e7e5df');
const camera=new THREE.PerspectiveCamera(42,1600/900,0.05,100);
scene.add(new THREE.HemisphereLight('#e9f1ff','#898574',2.8));
const sun=new THREE.DirectionalLight('#fff2da',3.5);sun.position.set(3,9,4);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10});scene.add(sun);
const params=new URLSearchParams(location.search),slope=Number(params.get('slope')??.045),hz=Number(params.get('hz')??60);
const terrain=params.get('terrain')??'plane';
const width=24,depth=12,columns=240,rows=120;
const groundGeometry=new THREE.PlaneGeometry(width,depth,columns,rows);groundGeometry.rotateX(-Math.PI/2);
const vertices=groundGeometry.attributes.position;
for(let i=0;i<vertices.count;i++) {
  const x=vertices.getX(i),z=vertices.getZ(i);
  const variation=terrain==='wave'?.07*Math.sin(z*Math.PI/1.2)+.035*Math.sin(x*Math.PI*.7):terrain==='ramp'?.35*Math.max(0,z-.7):0;
  vertices.setY(i,slope*z+variation);
}
groundGeometry.computeVertexNormals();
// Match the rendered triangles, including each cell's diagonal, rather than
// checking shoes against an analytic surface that differs from the mesh.
const ground=(x,z)=>{
  const gx=THREE.MathUtils.clamp((x+width/2)/width*columns,0,columns),gz=THREE.MathUtils.clamp((z+depth/2)/depth*rows,0,rows);
  const ix=Math.min(columns-1,Math.floor(gx)),iz=Math.min(rows-1,Math.floor(gz)),u=gx-ix,v=gz-iz;
  const a=vertices.getY(iz*(columns+1)+ix),b=vertices.getY((iz+1)*(columns+1)+ix),c=vertices.getY((iz+1)*(columns+1)+ix+1),d=vertices.getY(iz*(columns+1)+ix+1);
  return u+v<=1?a+(d-a)*u+(b-a)*v:c+(b-c)*(1-u)+(d-c)*(1-v);
};
const floor=new THREE.Mesh(groundGeometry,new THREE.MeshStandardMaterial({color:'#afaea4',roughness:0.95}));
floor.receiveShadow=true;scene.add(floor);
const avatars=await Promise.all(AVATAR_PROFILES.map((_,index)=>loadResidentAvatar(index,`fixture-${index}`)));
if(params.get('hero')==='jevica')avatars.push(await loadResidentAvatar(0,'player','jevica'));
avatars.forEach(avatar=>scene.add(avatar.object));
let frame=-1,distance=0,x=0,z=0;
const samples=[];
function step() {
  frame++;
  const phase=frame*60/hz;
  const speed=phase<45?1.1*phase/45:phase<210?1.1:phase<255?1.1*(255-phase)/45:0;
  const heading=phase<75?0:Math.min(Math.PI/2,(phase-75)/90*Math.PI/2);
  distance+=speed/hz;x+=Math.sin(heading)*speed/hz;z+=Math.cos(heading)*speed/hz;
  for(const [index,avatar] of avatars.entries()) {
    const east=x+(index-2.5)*1.6;
    avatar.object.position.set(east,ground(east,z),z);avatar.object.rotation.y=heading;
    avatar.update(frame*1000/hz,'continue',false,{speed,distance},ground);
    // Refresh attached bind inverses before reading skinned support vertices.
    avatar.rig.model.updateMatrixWorld(true);
    samples.push({frame,profile:avatar.profile,speed,feet:avatar.feet.map(leg=>{
      const source=leg.rollPose?leg.soleSources[leg.rollPose.pivotId]:null;
      return {side:leg.side,contact:leg.contact,target:(leg.ikTarget??leg.target).toArray(),actual:leg.foot.getWorldPosition(new THREE.Vector3()).toArray(),orientation:(leg.ikOrientation??leg.orientation).toArray(),plantOrientation:leg.orientation.toArray(),
        support:leg.supportPoint?.toArray(),supportActual:source?source.mesh.getVertexPosition(source.index,new THREE.Vector3()).applyMatrix4(source.mesh.matrixWorld).toArray():null,
        pivot:leg.rollPose?.pivotId,roll:leg.rollPose?.angle??0,toeFlex:leg.rollPose?.flex??0,error:leg.error};
    })});
  }
}
function render() {
  camera.position.set(x+7,4.5,z+10.5);camera.lookAt(x,0.9,z);
  renderer.render(scene,camera);
  document.querySelector('#caption').textContent=`${avatars.length} shipped rigs · frame ${frame} · acceleration / turn / slope / stop`;
}
window.motionFixture={
  avatars,ground,renderer,scene,camera,
  advance(target) {while(frame<target) step();render();return {frame,samples:samples.splice(0)};},
  dispose() {avatars.forEach(avatar=>avatar.dispose());renderer.dispose();},
};
step();render();document.body.dataset.ready='true';
