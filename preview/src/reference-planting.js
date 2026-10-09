// REF-HW-01: photo-estimated curb bed around the existing southern inferred
// stem. Local east/north metres; no source terrain or tree records are replaced.
export function winstonBed(world) {
  const store=world?.stores?.find(item=>item.name==='Harry Winston' && item.building_id==='osm-way-625330792');
  if(!store)return null;
  const [x,n]=store.facade,[nx,ny]=store.outward;
  const at=(across,depth)=>[x-ny*across+nx*depth,n+nx*across+ny*depth];
  return { id:'harry-winston-south-bed', basis:'REF-HW-01 qualitative Street View estimate',
    ring:[[3.3,2.2],[3.65,1.9],[8.65,1.9],[9,2.2],[9,3.4],[8.65,3.7],[3.65,3.7],[3.3,3.4]].map(([a,d])=>at(a,d)),
    shrubs:[3.9,5,6.1,7.2,8.3].map(a=>({position:at(a,2.15),scale:[.64,.60,.64],kind:'shrub'})),
    groundcover:Array.from({length:22},(_,i)=>({position:at(3.7+(i%11)*.47,2.85+Math.floor(i/11)*.43),scale:[.55,.22,.50],kind:i%3===0?'purple':'grass'})),
  };
}

export function insideReferenceBed(bed, x, north) {
  if(!bed)return false;
  let inside=false;
  for(let i=0,j=bed.ring.length-1;i<bed.ring.length;j=i++) {
    const a=bed.ring[i],b=bed.ring[j];
    if((a[1]>north)!==(b[1]>north) && x<(b[0]-a[0])*(north-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
