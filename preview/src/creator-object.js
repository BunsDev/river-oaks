// Creator geometry is data, never executable code or a remote asset URL.
export const MAX_OBJECT_PARTS=16,MAX_ASSEMBLY_BYTES=6144;
export const OBJECT_SHAPES=['box','sphere','cylinder'];
export const OBJECT_MATERIALS=['matte','metal','gloss','glass'];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const vector=(value,check)=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&check(n));

export function objectBounds(assembly){
  let radius=0,height=0,bottom=Infinity;
  for(const part of assembly.parts){
    const [x,y,z]=part.rotation,a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z);
    // XYZ Euler matrix, matching the renderer. All corners bound every shape.
    for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
      const px=sx*part.size[0]/2,py=sy*part.size[1]/2,pz=sz*part.size[2]/2;
      const east=c*e*px-c*f*py+d*pz+part.position[0];
      const up=(a*f+b*e*d)*px+(a*e-b*f*d)*py-b*c*pz+part.position[1];
      const south=(b*f-a*e*d)*px+(b*e+a*f*d)*py+a*c*pz+part.position[2];
      radius=Math.max(radius,Math.hypot(east,south));height=Math.max(height,up);bottom=Math.min(bottom,up);
    }
  }
  return {radius,height,bottom};
}

export function validAssembly(value){
  if(!fields(value,['name','parts'])||typeof value.name!=='string'||!value.name.trim()||value.name.length>48
    || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value.name)
    || !Array.isArray(value.parts)||value.parts.length<1||value.parts.length>MAX_OBJECT_PARTS)return false;
  if(!value.parts.every(part=>fields(part,['shape','size','position','rotation','color','material'])
    && OBJECT_SHAPES.includes(part.shape)&&OBJECT_MATERIALS.includes(part.material)
    && vector(part.size,n=>n>=.05&&n<=4)&&vector(part.position,n=>Math.abs(n)<=4)
    && vector(part.rotation,n=>Math.abs(n)<=Math.PI)
    && typeof part.color==='string'&&/^#[0-9a-f]{6}$/i.test(part.color)))return false;
  if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_ASSEMBLY_BYTES)return false;
  const bounds=objectBounds(value);
  return bounds.bottom>=-1e-6&&bounds.height<=4&&bounds.radius<=2.6;
}

export const newObjectPart=()=>({shape:'box',size:[1,1,1],position:[0,.5,0],rotation:[0,0,0],color:'#b97986',material:'matte'});
export const newAssembly=()=>({name:'My creation',parts:[newObjectPart()]});

// Conservative per-part oriented boxes. Empty space between parts stays open;
// curved primitives use their bounding boxes rather than triangle physics.
export function objectCollider(item){
  if(item.kind!=='object'||!validAssembly(item.assembly))return null;
  const bounds=objectBounds(item.assembly),cy=Math.cos(item.yaw),sy=Math.sin(item.yaw);
  const parts=item.assembly.parts.map(part=>{
    const [x,y,z]=part.rotation,a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z);
    const matrix=[c*e,-c*f,d,a*f+b*e*d,a*e-b*f*d,-b*c,b*f-a*e*d,b*e+a*f*d,a*c];
    return {matrix,position:part.position,half:part.size.map(n=>n/2)};
  });
  return {bounds:[item.position[0]-bounds.radius,-item.position[1]-bounds.radius,item.position[0]+bounds.radius,-item.position[1]+bounds.radius],
    contains(x,y,z,radius,halfHeight=radius){
    const dx=x-item.position[0],dz=z+item.position[1],dy=y-item.ground;
    if(Math.hypot(dx,dz)>bounds.radius+radius||dy+halfHeight<bounds.bottom||dy-halfHeight>bounds.height)return false;
    const east=cy*dx-sy*dz,south=sy*dx+cy*dz;
    // Rotate the query volume into root space before each part's inverse.
    const horizontal=radius*(Math.abs(cy)+Math.abs(sy));
    return parts.some(({matrix:m,position:p,half:h})=>{
      const q=[east-p[0],dy-p[1],south-p[2]];
      for(let axis=0;axis<3;axis++){
        const local=m[axis]*q[0]+m[3+axis]*q[1]+m[6+axis]*q[2];
        const expansion=horizontal*(Math.abs(m[axis])+Math.abs(m[6+axis]))+halfHeight*Math.abs(m[3+axis]);
        if(Math.abs(local)>h[axis]+expansion)return false;
      }
      return true;
    });
  }};
}

// Match the walking controller's standing capsule and flight bubble.
export function blocksPlayer(collider,player){
  if(!collider)return false;
  const [east,north,ground=0]=player.position,altitude=player.altitude??0;
  return altitude>.1?collider.contains(east,ground+altitude,-north,1.3)
    :collider.contains(east,ground+.9,-north,.35,.9);
}
