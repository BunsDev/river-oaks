// Authoring receipt only: copying a location never mutates the town.
export function placementCoordinate(environment, x, z) {
  const round = value => Math.round(value * 1000) / 1000;
  const room = environment.roomAt?.(x, z);
  return {position:[round(x),round(-z)],ground:round(environment.groundAt(x,z)),...(room?{storeId:room.storeId,local:room.toLocal(x,-z).map(round)}:{})};
}
