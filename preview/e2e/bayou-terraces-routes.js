// The Bayou Terraces journey's walk back from the gardens chess table to the greenway, in the
// journey's terrace coordinates (east of the commons edge, north of -1335). Each player starts
// where the town stands them up: 1.65 m in front of their chair. The owner's straight line from
// there to [101,128] runs into the table, so a hosted run wedged on the chair ("owner greenway:
// stalled" 1.2 m from the stand spot). [90,142] steps round the table's north side first;
// bayou-terraces-routes.test.js checks every leg against the town's own stand spots.
export const greenwayReturn = {
  alice: [[96, 124], [100, 110], [156.5, 110]],
  owner: [[90, 142], [101, 128], [101, 112], [156.5, 112]],
};
