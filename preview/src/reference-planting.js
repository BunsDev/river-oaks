import { plantingRandom, plantRecord, referenceBedKind, seedFromPosition } from './planting-palette.js';

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
    // Middle row: foxtail fern plumes; curb row: mounded fern and coleus colour.
    groundcover:(()=>{const rand=plantingRandom(seedFromPosition(x,n));return Array.from({length:22},(_,i)=>({position:at(3.7+(i%11)*.47,2.85+Math.floor(i/11)*.43),scale:[.55,.22,.50],kind:referenceBedKind(i%11,Math.floor(i/11),rand)}));})(),
  };
}

// Distance from a point to the bed outline (local east/north metres).
function edgeDistance(ring,[x,n]) {
  let best=Infinity;
  for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dn=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(n-a[1])*dn)/(dx*dx+dn*dn||1)));
    best=Math.min(best,Math.hypot(a[0]+dx*t-x,a[1]+dn*t-n));
  }
  return best;
}
// Seeded ground-cover plants, each confined to the bed plus a 0.1 m spill
// over its stone edging (the edging itself is 0.1 m wide).
export function winstonBedPlants(bed) {
  if(!bed)return [];
  const rand=plantingRandom(seedFromPosition(...bed.ring[0])),plants=[];
  const add=(position,kind)=>plants.push({position,plant:plantRecord(kind,[0,0],rand,edgeDistance(bed.ring,position)+.1)});
  for(const {position:[x,n],kind} of bed.groundcover) {
    add([x,n],kind);
    // A companion between the photo-estimated clumps keeps the bed dense.
    const companion=[x+(rand()-.5)*.36,n+(rand()-.5)*.3],other=rand()<.5?'mound-fern':kind;
    if(insideReferenceBed(bed,...companion))add(companion,other);
  }
  return plants;
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
