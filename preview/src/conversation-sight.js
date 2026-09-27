// Ray/box intersection in room coordinates, independent of walking-body radius.
function intersects(from,to,min,max) {
  let near=0,far=1;
  for(let axis=0;axis<3;axis++) {
    const direction=to[axis]-from[axis];
    if(Math.abs(direction)<1e-9){if(from[axis]<min[axis]||from[axis]>max[axis])return false;continue;}
    let a=(min[axis]-from[axis])/direction,b=(max[axis]-from[axis])/direction;
    if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return false;
  }
  return far>0.001&&near<0.999;
}

export function roomBlocksConversation(room,from,to) {
  const local=point=>{const [a,d]=room.toLocal(point[0],point[1]);return [a,point[2]-room.floor,d];};
  const start=local(from),end=local(to);
  const box=(a,d,w,l,top,bottom=0)=>intersects(start,end,[a-w/2,bottom,d-l/2],[a+w/2,top,d+l/2]);
  for(const f of room.fixtures) {
    if(f.kind==='bar') {
      const mid=(f.d0+f.d1)/2,length=f.d1-f.d0;
      if(box(f.a-f.side*0.5,mid,0.72,length,1.14)||box(f.a,mid,0.34,length,2.6))return true;
      continue;
    }
    if(['rail','shelves','niche','eyewear','towels','station'].includes(f.kind)) {
      if(box(f.a,(f.d0+f.d1)/2,0.5,f.d1-f.d0,f.kind==='rail'?2.1:2.7))return true;
      continue;
    }
    const top={table:0.845,counter:1.025,desk:0.76,reception:f.style==='host'?1.20:1.08,dining:0.76,gelato:1.04,concession:1.04,plinth:1.05,basin:0.95,popcorn:1.2,chair:1.05,bench:0.49,stool:0.76}[f.kind];
    if(top&&box(f.a,f.d,f.w??0.5,f.l??0.5,top))return true;
  }
  return false;
}
