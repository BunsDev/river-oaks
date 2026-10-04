// Keep existing per-world landmark lists intact while presenting one private
// account directory. Each stored coordinate always travels with its world ID.
export function createWorldLandmarks({ catalog, storeFor, worldId, worldTitle = worldId }) {
  const current = { id: worldId, title: worldTitle };
  const worlds = async () => {
    const entries = await catalog.list();
    return entries.some(world => world.id === worldId) ? entries : [...entries, current];
  };
  return {
    async list(userId, allWorlds = false) {
      // Existing open tabs only understand coordinates in their current world.
      const entries = allWorlds ? await worlds() : [current];
      const lists = await Promise.all(entries.map(async world =>
        (await storeFor(world.id).list(userId)).map(item => ({ ...item, worldId: world.id, worldTitle: world.title }))));
      return lists.flat().sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    },
    async add(userId, input) {
      const result = await storeFor(worldId).add(userId, input);
      if (!result.ok) return result;
      return { ...result, landmark: { ...result.landmark, worldId, worldTitle } };
    },
    async remove(userId, id, targetWorldId = worldId) {
      const entries = await worlds();
      if (!entries.some(world => world.id === targetWorldId)) return false;
      return storeFor(targetWorldId).remove(userId, id);
    },
  };
}
