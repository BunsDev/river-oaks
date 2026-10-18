import * as THREE from 'three';

// Authored rest surface shared by the outfit and the offline corrective bake.
export function createDressSkirtGeometry({slit=false}={}){
    const levels=[[-.17,.218,.145],[-.07,.216,.145],[.025,.202,.135],[.105,.161,.11]],segments=40,vertices=[],uv=[],indices=[];
    for(let layer=0;layer<levels.length;layer++){
      const [y,rx,rz]=levels[layer];
      for(let i=0;i<=segments;i++){
        const a=i/segments*Math.PI*2;
        const hem=slit&&layer===0?Math.max(0,1-Math.abs(i-4)/2)*.085:0;
        vertices.push(Math.sin(a)*rx,y+hem,Math.cos(a)*rz);uv.push(i/segments,layer/(levels.length-1));
        if(layer<levels.length-1&&i<segments){
          const n=layer*(segments+1)+i;indices.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);
        }
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

// Subdivide in place so the outfit remains the sole geometry owner. Midpoints
// retain the original triangles, UV seam and joint-weight interpolation.
export function subdivideSkirtGeometry(geometry){
  const old=geometry.attributes,arrays={},midpoints=new Map(),triangles=[];
  for(const name of ['position','normal','uv','skinIndex','skinWeight'])arrays[name]=Array.from(old[name].array);
  const midpoint=(a,b)=>{
    const key=a<b?`${a}:${b}`:`${b}:${a}`;if(midpoints.has(key))return midpoints.get(key);
    const index=arrays.position.length/3;
    for(const name of Object.keys(arrays))for(let c=0;c<old[name].itemSize;c++){
      const size=old[name].itemSize,x=arrays[name][a*size+c],y=arrays[name][b*size+c];
      if(name==='skinIndex'&&x!==y)throw new TypeError('Skirt joint ordering differs');
      arrays[name].push(name==='skinIndex'?x:(x+y)/2);
    }
    midpoints.set(key,index);return index;
  };
  for(let n=0;n<geometry.index.count;n+=3){
    const a=geometry.index.getX(n),b=geometry.index.getX(n+1),c=geometry.index.getX(n+2),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    triangles.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);
  }
  for(const name of Object.keys(arrays))geometry.setAttribute(name,name==='skinIndex'?new THREE.Uint16BufferAttribute(arrays[name],4):new THREE.Float32BufferAttribute(arrays[name],old[name].itemSize));
  geometry.setIndex(triangles);
}
