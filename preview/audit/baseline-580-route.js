// Fixture journey planning only. Physically walk the arrival's existing roadway
// exit before asking the default pedestrian planner for the rest of the route.
export function arrivalPedestrianRoute(nav,start,end) {
  const exit=nav.sidewalkPoint(start);
  if(!nav.canTravel(start,exit))return null;
  const route=nav.route(exit,end);
  return route?[exit,...route]:null;
}
