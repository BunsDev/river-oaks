import * as THREE from 'three';

export const LYRA_DRAPES = Object.freeze([
  {from: -.45, to: Math.PI * 2 - .45, top: .11, length: .67, rx: .19, rz: .14, flare: .045, jag: .12, lobes: 2, rows: 24, name: 'Lyra velvet wrap'},
  {from: .22, to: Math.PI * 2 - .22, top: .09, length: .80, rx: .19, rz: .14, flare: .1, jag: .26, lobes: 3, rows: 24, name: 'Lyra spotted sheer train'},
]);

// Original handkerchief surface, shared with the offline seated bake.
export function createDrapeGeometry({from,to,top=.09,length=.8,rx=.19,rz=.14,flare=.08,jag=.16,lobes=5,columns=36,rows=8}) {
  const vertices=[],uv=[],indices=[];
  for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++){
    const u=c/columns,a=from+(to-from)*u,depth=r/rows,hem=1-jag*Math.abs(Math.sin(u*Math.PI*lobes));
    const y=top-length*depth*hem,spread=1+flare*depth/.19;
    vertices.push(Math.sin(a)*rx*spread,y,Math.cos(a)*rz*spread);uv.push(u,depth);
    if(r<rows&&c<columns){const n=r*(columns+1)+c;indices.push(n,n+columns+1,n+1,n+1,n+columns+1,n+columns+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}
