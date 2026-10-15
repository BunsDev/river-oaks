// District data as it stood before later reviewed revisions, rebuilt from today's
// files for migration fixtures. Values are the recorded historical ones and stay
// independent of the migrations' own implementation.

// Before the penthouse raise (#363 follow-up): the Equinox tower at its photographed 28 m.
export const TOWER_ID = 'osm-way-625330785';
export function beforeTowerRaise(worldData) {
  const previous = structuredClone(worldData);
  const tower = previous.buildings.find(building => building.id === TOWER_ID);
  tower.size[2] = 28;
  tower.height_source = 'street-level reference photographs (2024-2025), estimated';
  return previous;
}
