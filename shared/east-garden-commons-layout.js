// Approved East Garden Commons blockout. Metres east/north/up; original authored
// geometry, not a survey. Renderer and movement consume these same primitives.
export const COMMONS_ID = 'east-garden-commons';
export const COMMONS_REVISION = 'east-garden-commons-blockout-1';
const north = -1335, width = 70, depth = 80, promenadeWidth = 6;
const rect = (x, y, w, d) => [x-w/2,y-d/2,x+w/2,y+d/2];
export const insideRect = (r, x, y, margin = 0) => x >= r[0]+margin && x <= r[2]-margin && y >= r[1]+margin && y <= r[3]-margin;

export function createCommonsLayout({ districtBounds, edgeHeights }) {
  if (!Array.isArray(districtBounds) || districtBounds.length !== 4 || !districtBounds.every(Number.isFinite)
    || districtBounds[0] >= districtBounds[2] || districtBounds[1] >= districtBounds[3]) throw new Error('Invalid commons District bounds');
  if (!Array.isArray(edgeHeights) || edgeHeights.length !== 13 || !edgeHeights.every(Number.isFinite)) throw new Error('Commons needs thirteen measured edge heights');
  const edge = districtBounds[2], centre = edge+80, ground = edgeHeights[6];
  const plaza = rect(centre,north,width,depth);
  if (plaza[1] <= districtBounds[1] || plaza[3] >= districtBounds[3]) throw new Error('Commons does not fit the approved north/south envelope');
  const pavilion = { id:`${COMMONS_ID}/pavilion`, rect:rect(centre+13,north+20,12,8), clearHeight:3.2, roofThickness:0.35 };
  const solids = [];
  for (const x of [pavilion.rect[0]+.25,pavilion.rect[2]-.25]) for (const y of [pavilion.rect[1]+.25,pavilion.rect[3]-.25]) {
    solids.push({id:`${pavilion.id}/post-${solids.length}`,kind:'column',rect:rect(x,y,.5,.5),height:pavilion.clearHeight});
  }
  for (const [i, y] of [north-20,north+20].entries()) {
    solids.push({id:`${COMMONS_ID}/bench-${i}`,kind:'bench',rect:rect(centre-18,y,2.4,.65),height:.85});
  }
  // Rain garden and activity zone sit off the six-metre through-route.
  solids.push({id:`${COMMONS_ID}/rain-garden`,kind:'planter',rect:rect(centre+15,north-21,18,12),height:.45});
  return {id:COMMONS_ID,revision:COMMONS_REVISION,districtBounds:[...districtBounds],edge,edgeHeights:[...edgeHeights],ground,
    bounds:[districtBounds[0],districtBounds[1],plaza[2]+2,districtBounds[3]],
    surfaces:[{id:`${COMMONS_ID}/promenade`,rect:[edge-3,north-promenadeWidth/2,centre+2,north+promenadeWidth/2]},
      {id:`${COMMONS_ID}/plaza`,rect:plaza}],pavilion,solids,
    routes:[{id:`${COMMONS_ID}/arrival-loop`,width:promenadeWidth,points:[[edge-1,north],[centre,north],[centre+25,north],[centre,north],[edge-1,north]]}],
    activity:{id:`${COMMONS_ID}/table-zone`,tableId:'chess-commons',rect:rect(centre+13,north+20,6,4),capacity:2},
  };
}

// The new surface starts exactly at the District edge, then meets the level plaza
// over ten metres. Sampled edge elevation varies across the promenade width.
export function commonsGroundAt(layout, east, northing) {
  if (!layout || east <= layout.edge || !layout.surfaces.some(surface => insideRect(surface.rect,east,northing))) return null;
  const row = Math.max(0,Math.min(12,(northing-(north-promenadeWidth/2))*2));
  const a = Math.floor(row), b = Math.min(12,a+1), edgeHeight = layout.edgeHeights[a]*(1-(row-a))+layout.edgeHeights[b]*(row-a);
  const t = Math.min(1,(east-layout.edge)/10);
  return edgeHeight+(layout.ground-edgeHeight)*t;
}

export function commonsAllows(layout, east, northing, radius=.35) {
  if (!layout) return true;
  // Three metres of overlap covers the 2.6 m flight diameter as well as walking.
  // Rectangles overlap at joins, so eroding each footprint by the player's radius
  // leaves a continuous corridor without granting the surrounding empty reserve.
  return insideRect(layout.districtBounds,east,northing,radius)
    || layout.surfaces.some(surface=>insideRect(surface.rect,east,northing,radius));
}

export function commonsCollisionRings(layout) {
  return layout.solids.map(({rect:[w,s,e,n]})=>[[w,s],[e,s],[e,n],[w,n],[w,s]]);
}
