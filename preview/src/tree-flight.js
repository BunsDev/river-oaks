// Companion/bird clearance for solid stems only. Crowns remain permeable foliage.
// Keep this local to NPC flight: changing player collision would require matching
// authoritative multiplayer movement rules and existing checkpoint validation.
const sources = world => world?.vegetation?.branch_supports?.length ? world.vegetation.branch_supports : world?.trees ?? [];
export function treeFlightEnvironment(environment, world) {
  const stems = sources(world).map(tree => {
    const x=tree.position[0],z=-tree.position[1],height=Number.isFinite(tree.height_m)?tree.height_m:20;
    return {x,z,top:environment.groundAt(x,z)+Math.max(7.5,Math.min(16,height)),radius:.4+Math.max(.065,height*.014)};
  });
  return {...environment,canFly(x,y,z) {
    return environment.canFly(x,y,z) && !stems.some(stem => Math.abs(x-stem.x)<stem.radius && Math.abs(z-stem.z)<stem.radius && y<stem.top && Math.hypot(x-stem.x,z-stem.z)<stem.radius);
  }};
}
