// Shared mapped pavilion footprint for architecture and authored landscape
// exclusions. Mirrors the frontage frame's start/direction arithmetic exactly.
export function hermesPavilionRing(frontage) {
  const { edge, side, sideWidth, width, corner } = frontage;
  const mainFromB = corner === edge.b, sideFromB = corner === side.b;
  const at = (edge, fromB, distance) => {
    const along = (fromB ? edge.length : 0) + (fromB ? -1 : 1) * distance;
    return [edge.a[0] + edge.u[0]*along, edge.a[1] + edge.u[1]*along];
  };
  const start = at(edge, mainFromB, 0), along = at(edge, mainFromB, width), across = at(side, sideFromB, sideWidth);
  const far = [along[0]+across[0]-start[0],along[1]+across[1]-start[1]];
  return [start,along,far,across,start];
}
