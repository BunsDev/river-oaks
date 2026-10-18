// Screen-space nameplates only: suppress overlaps without moving/hiding avatars.
// A one-metre preference for a visible label prevents tiny movement swapping names.
export function layoutPeerLabels(candidates,{width,height,gap=4}={}){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=2*gap||height<=2*gap)return [];
 const ranked=candidates.filter(p=>typeof p.id==='string'&&[p.x,p.y,p.width,p.height,p.distance].every(Number.isFinite)&&p.width>0&&p.height>0&&p.distance>=0&&p.width<=width-2*gap&&p.height<=height-2*gap)
  .sort((a,b)=>Number(Boolean(b.speaking))-Number(Boolean(a.speaking))
   ||(a.distance-(a.wasVisible?1:0))-(b.distance-(b.wasVisible?1:0))||(a.id<b.id?-1:a.id>b.id?1:0));
 const placed=[],ids=new Set();
 for(const p of ranked){
  if(ids.has(p.id))continue;ids.add(p.id);
  const x=Math.max(gap+p.width/2,Math.min(width-gap-p.width/2,p.x)),y=Math.max(gap+p.height,Math.min(height-gap,p.y));
  const box={id:p.id,x,y,left:x-p.width/2,right:x+p.width/2,top:y-p.height,bottom:y};
  if(placed.some(q=>box.left<q.right+gap&&box.right+gap>q.left&&box.top<q.bottom+gap&&box.bottom+gap>q.top))continue;
  placed.push(box);
 }
 return placed;
}
