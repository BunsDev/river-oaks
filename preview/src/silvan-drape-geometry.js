import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const SILVAN_DRAPES = Object.freeze([
  {from:.55,to:Math.PI*2-.55,top:.09,length:.84,rows:24,name:'Forest aristocrat drape'},
  {from:-.24,to:.24,top:.09,length:.7,rx:.2,rz:.152,jag:.08,lobes:1,rows:24,name:'Forest aristocrat front panel'},
  {from:Math.PI-.3,to:Math.PI+.3,top:.09,length:.8,rx:.2,rz:.152,jag:.1,lobes:2,rows:24,name:'Forest aristocrat rear panel'},
]);

// Keep the rim above the seated suit or fitted linen hip. The feminine
// layer needs 2 cm more rise to clear the continuous trousers at deep bends.
export const silvanWaist = variant => variant==='masculine'?.13:.11;
export const silvanDrapes = variant => SILVAN_DRAPES.map(recipe => ({...recipe, top:silvanWaist(variant)}));

// Original hanging gold leaves and chains, merged in the authored pelvis frame
// so their baked cloth attachment shares one owned geometry and material.
export function createSilvanDrapeDetailGeometry(variant){
  const pieces=[];
  const leaf=(position,length,tilt=0)=>{
    const geometry=new THREE.SphereGeometry(1,18,12);
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,tilt)),new THREE.Vector3(length*.42,length,length*.12)));
    pieces.push(geometry);
  };
  for(let i=0;i<6;i++){const a=i%2?.12:-.12,y=-.06-i*.1;leaf([Math.sin(a)*.2,y,Math.cos(a)*.16+.004],.018,i%2?.6:-.6);}
  for(let i=0;i<10;i++){const a=(i%2?1:-1)*(.8+(i>>1)*.14),y=-.1-(i>>1)*.13;leaf([Math.sin(a)*(.2+(i>>1)*.01),y,Math.cos(a)*(.15+(i>>1)*.008)],.017,(i%2?1:-1)*.5);}
  for(const [x,drop]of [[-.07,.26],[0,.34],[.06,.22],[.11,.3]]){
    const points=[[x,.08,.148],[x+.01,.08-drop*.5,.156],[x,.08-drop,.154]].map(p=>new THREE.Vector3(...p));
    pieces.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.0021,7,false));
    leaf([x,.065-drop,.156],.019);
  }
  const geometry=mergeGeometries(pieces);for(const piece of pieces)piece.dispose();geometry.translate(0,silvanWaist(variant)-.09,0);return geometry;
}
