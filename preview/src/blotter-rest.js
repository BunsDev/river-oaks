import * as THREE from 'three';

// An open-ended spring clip holds the distal paper, leaving its short end free
// for the fingertip grip. The worker slides it out before raising it to inspect.
export function createBlotterRest(position,quaternion) {
  const group=new THREE.Group();group.name='Blotter stand';
  const brass=new THREE.MeshStandardMaterial({color:'#bca371',metalness:.75,roughness:.28});
  const frame=new THREE.Group();frame.name='Blotter rest frame';frame.position.copy(position);frame.quaternion.copy(quaternion);group.add(frame);
  const normal=new THREE.Vector3(0,1,0).applyQuaternion(quaternion),face=normal.y>=0?1:-1;
  for(const side of [-1,1]) {
    const jaw=new THREE.Mesh(new THREE.BoxGeometry(.016,.003,.012),brass);
    jaw.name=side===face?'Blotter upper jaw':'Blotter lower jaw';jaw.position.set(0,side*.0018,.094);frame.add(jaw);
  }
  for(const side of [-1,1]) {
    const bridge=new THREE.Mesh(new THREE.BoxGeometry(.002,.0066,.012),brass);
    bridge.position.set(side*.009,0,.094);frame.add(bridge);
  }
  const tip=new THREE.Vector3(.010,0,.094).applyQuaternion(quaternion).add(position);
  const base=new THREE.Vector3(.14,.021,.105);
  const foot=new THREE.Mesh(new THREE.BoxGeometry(.034,.006,.034),brass);foot.name='Blotter stand base';foot.position.copy(base);group.add(foot);
  // Route the support behind the fingertip approach and return path.
  const elbow=new THREE.Vector3(base.x,tip.y,.105);
  for(const [index,[from,to]] of [[base,elbow],[elbow,tip]].entries()) {
    const delta=to.clone().sub(from),stem=new THREE.Mesh(new THREE.BoxGeometry(.006,delta.length(),.006),brass);
    stem.name=index?'Blotter stand bracket':'Blotter stand post';
    stem.position.copy(from).lerp(to,.5);stem.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(stem);
  }
  return {model:group,dispose(){group.traverse(item=>item.geometry?.dispose());brass.dispose();group.removeFromParent();}};
}
