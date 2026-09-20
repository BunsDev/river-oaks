// Measured canopy and interpreted branch supports have separate contracts.
export function validateVegetation(world, vegetation) {
  if (vegetation?.schema_version!==1 || vegetation.crs!==world.crs || JSON.stringify(vegetation.origin)!==JSON.stringify(world.origin) || JSON.stringify(vegetation.bounds_m)!==JSON.stringify(world.bounds_m) || vegetation.world_source_sha256!==world.provenance.source_sha256) throw new Error('LiDAR canopy does not match the district coordinate/source frame');
  const [west,south,east,north]=world.bounds_m;
  const inBounds=(x,y)=>x>=west-0.001 && x<=east+0.001 && y>=south-0.001 && y<=north+0.001;
  if(!Array.isArray(vegetation.voxels) || vegetation.voxels.length>40000 || vegetation.voxels.some(row=>row.length!==4 || !row.every(Number.isFinite) || !inBounds(row[0],row[1]) || row[2]<2.5 || row[2]>45 || !Number.isInteger(row[3]) || row[3]<1)) throw new Error('Invalid or excessive observed canopy data');
  if(!Array.isArray(vegetation.branch_supports) || vegetation.branch_supports.length>256 || vegetation.branch_supports.some(branch=>!inBounds(...branch.position) || !Number.isFinite(branch.height_m) || branch.height_m<2.5 || branch.height_m>45 || !Number.isFinite(branch.radius_m) || branch.radius_m<=0 || branch.radius_m>8 || !Array.isArray(branch.endpoints) || branch.endpoints.length>8 || branch.endpoints.some(p=>p.length!==3 || !p.every(Number.isFinite) || !inBounds(...p) || p[2]<2.5 || p[2]>45))) throw new Error('Invalid interpreted canopy branches');
  if(vegetation.voxels.reduce((sum,row)=>sum+row[3],0)!==vegetation.supported_returns) throw new Error('Canopy return accounting mismatch');
  if(!vegetation.independent_comparison || !['pass','fail'].includes(vegetation.independent_comparison.status) || !Number.isFinite(vegetation.independent_comparison.iou)) throw new Error('Missing canopy comparison evidence');
  return vegetation;
}

export function canopyTiles(voxels) {
  const tiles=new Map();
  for(const voxel of voxels) {
    const x=Math.floor(voxel[0]/64),y=Math.floor(voxel[1]/64),key=`${x}:${y}`;
    if(!tiles.has(key)) tiles.set(key,{center:[x*64+32,y*64+32],voxels:[]});
    tiles.get(key).voxels.push(voxel);
  }
  return [...tiles.values()];
}
