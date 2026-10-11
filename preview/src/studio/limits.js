// Authoring limits bound geometry and ground-surface indexing per edit.
// Server publication limits remain independent and authoritative.
export function assertStudioBudget(region) {
  let segments=0,length=0;
  for(const road of region.roads)for(let i=1;i<road.points.length;i++){
    segments++;
    length+=Math.hypot(road.points[i][0]-road.points[i-1][0],road.points[i][1]-road.points[i-1][1]);
  }
  if(segments>256)throw new Error('World Studio supports at most 256 road segments per region. Simplify the roads before importing.');
  if(length>8192)throw new Error('World Studio supports at most 8192 metres of road per region. Simplify the roads before importing.');
}
