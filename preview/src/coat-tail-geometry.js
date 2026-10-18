import {MathUtils} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createDrapeGeometry} from './drape-geometry.js';

export const COAT_TAIL_NAME='Tailored split coat tails';
export const COAT_WAIST=.13;

// Two thin half-wraps leave the front open and a vent at the back. A shared
// indexed surface keeps both independently bending tails in a single draw.
export function createCoatTailGeometry(character='kai'){
  const recipe={top:COAT_WAIST,length:character==='aurel'?.87:.85,rx:.205,rz:.16,flare:.12,jag:0,columns:18,rows:24};
  const panels=[
    createDrapeGeometry({...recipe,from:.35,to:Math.PI-.08}),
    createDrapeGeometry({...recipe,from:Math.PI+.08,to:Math.PI*2-.35}),
  ];
  const geometry=mergeGeometries(panels);for(const panel of panels)panel.dispose();
  // A cutaway front clears the toe during a bent-ankle stride while the back
  // retains the full coat length. Keep the waist and upper tailoring fixed.
  const positions=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<positions.count;i++){
    const front=MathUtils.smoothstep(positions.getZ(i),.04,.15);
    const rear=MathUtils.smoothstep(-positions.getZ(i),.10,.20);
    positions.setX(i,positions.getX(i)+Math.sign(positions.getX(i))*.13*rear*MathUtils.smoothstep(uv.getY(i),.3,.9));
    positions.setY(i,positions.getY(i)+.18*front*uv.getY(i)**2);
  }
  geometry.computeVertexNormals();
  return geometry;
}
