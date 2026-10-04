const globalId = id => typeof id === 'string' && id.startsWith('design-global-');
const fields = (command, allowed) => Object.keys(command).every(key => allowed.includes(key));
const reject = (error, message = error) => ({ ok: false, error, message });

function combined(global, local, worldId) {
  const copied = new Set(global.filter(item => item.source?.worldId === worldId).map(item => item.source.designId));
  return [...global.map(item => ({ ...item, scope: 'account' })),
    ...local.filter(item => !copied.has(item.id)).map(item => ({ ...item, scope: 'world' }))];
}

/** Resolve account designs at the authenticated WebSocket edge. Room designs
 * remain readable for existing checkpoints and can be copied deliberately. */
export async function accountDesignCommand({ command, userId, connectionId, worldId, room, library, security, isAdmin }) {
  if (!library) return { command };
  if (command.type === 'build' && command.action === 'place' && globalId(command.templateId)) {
    if (!isAdmin(userId)) return { result: reject('admin_only') };
    if (!fields(command, ['type', 'action', 'templateId', 'position', 'yaw'])) return { result: reject('invalid_build') };
    const item = await library.get(userId, command.templateId);
    if (!item) return { result: reject('unknown_design') };
    return { command: { type: 'build', action: 'place', kind: item.kind, finish: item.finish, position: command.position, yaw: command.yaw } };
  }
  if (command.type !== 'inventory') return { command };
  if (!isAdmin(userId)) return { result: reject('admin_only', 'Only Jevica can use building designs in the shared town.') };
  const action = command.action;
  if (!(action === 'list' && fields(command, ['type', 'action'])
    || action === 'save' && fields(command, ['type', 'action', 'buildId']) && typeof command.buildId === 'string'
    || action === 'copy' && fields(command, ['type', 'action', 'id']) && typeof command.id === 'string' && !globalId(command.id)
    || action === 'remove' && fields(command, ['type', 'action', 'id']) && typeof command.id === 'string')) return { result: reject('invalid_inventory') };
  // The room checks session, waitlist, ban, and connection replacement before
  // any account-wide read or write. A stale socket cannot access the library.
  const active = await room.request({ type: 'heartbeat', userId, connectionId });
  if (!active.ok) return { result: active };
  const localResult = await room.request({ type: 'command', userId, connectionId, message: { type: 'inventory', action: 'list' } });
  if (!localResult.ok) return { result: localResult };
  const local = localResult.items;
  if (action === 'list') return { result: { ok: true, library: true, items: combined(await library.list(userId), local, worldId) } };
  if (!await security.allow('inventory', userId, 12, 60_000)) return { result: reject('rate_limited') };
  if (action === 'save') {
    const view = await room.read(), build = view?.snapshot?.builds?.find(item => item.id === command.buildId);
    if (!build) return { result: reject('unknown_build') };
    if (build.ownerId !== userId) return { result: reject('not_build_owner') };
    const saved = await library.save(userId, { kind: build.kind, finish: build.finish });
    if (!saved.ok) return { result: saved };
    return { result: { ok: true, library: true, item: { ...saved.item, scope: 'account' }, items: combined(saved.items, local, worldId) } };
  }
  if (action === 'copy') {
    const original = local.find(item => item.id === command.id);
    if (!original) return { result: reject('unknown_design') };
    const saved = await library.save(userId, { kind: original.kind, finish: original.finish, source: { worldId, designId: original.id } });
    if (!saved.ok) return { result: saved };
    return { result: { ok: true, library: true, item: { ...saved.item, scope: 'account' }, items: combined(saved.items, local, worldId) } };
  }
  if (globalId(command.id)) {
    const removed = await library.remove(userId, command.id);
    return { result: removed.ok ? { ok: true, library: true, items: combined(removed.items, local, worldId) } : removed };
  }
  const removed = await room.request({ type: 'command', userId, connectionId, message: command });
  return { result: removed.ok ? { ok: true, library: true, items: combined(await library.list(userId), removed.items, worldId) } : removed };
}
