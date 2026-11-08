// Test-only, installed before navigation through Playwright addInitScript.
// Observe the real Three scene and dispose events; do not alter model disposal.
// The Ribbonwing factory owns the geometries and texture attached to its root.
export function installRibbonwingResourceAudit() {
  const host = globalThis, name = '__riverRibbonwingResources';
  if (host[name]) throw new Error('Ribbonwing resource audit is already installed');
  const previous = host.__THREE_DEVTOOLS__, target = previous ?? new EventTarget();
  if (!target.addEventListener || !target.removeEventListener) throw new Error('Unsupported Three observation target');
  const scenes = new Set(), records = new Map();
  let stopped = false, next = 0;
  const requireActive = () => { if (stopped) throw new Error('Ribbonwing resource audit is stopped'); };
  const observe = event => {
    if (!event.detail?.isScene) return;
    for (const ref of scenes) if (!ref.deref()) scenes.delete(ref);
    if (scenes.size >= 64) throw new Error('Ribbonwing resource audit scene limit exceeded');
    scenes.add(new WeakRef(event.detail));
  };
  const listenerFor = (record, key, kind) => function disposed(event) {
    event.target.removeEventListener('dispose', disposed);
    if (record.pending.delete(key)) record.disposed[kind]++;
  };
  const api = {
    capture(label = 'Ribbonwing') {
      requireActive();
      if (records.size >= 16) throw new Error('Ribbonwing resource audit capture limit exceeded');
      const roots = [...scenes].flatMap(ref => (ref.deref()?.children ?? []).filter(root => root.name === label));
      if (roots.length !== 1) throw new Error(`Expected one ${label} root, found ${roots.length}`);
      const root = roots[0], geometries = new Set(), textures = new Set();
      root.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of [object.material].flat().filter(Boolean)) {
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      if (!geometries.size || geometries.size + textures.size > 512) throw new Error('Unsupported Ribbonwing resource count');
      const token = ++next, record = { label, root: new WeakRef(root), pending: new Map(),
        tracked: { geometries: geometries.size, textures: textures.size }, disposed: { geometries: 0, textures: 0 } };
      for (const [kind, resources] of [['geometries', geometries], ['textures', textures]]) {
        for (const resource of resources) {
          const key = `${kind}:${resource.id}`, listener = listenerFor(record, key, kind);
          record.pending.set(key, { ref: new WeakRef(resource), listener, kind, id: resource.id });
          resource.addEventListener('dispose', listener);
        }
      }
      records.set(token, record);
      return { token, label, geometries: geometries.size, textures: textures.size };
    },
    read(token) {
      requireActive();
      const record = records.get(token);
      if (!record) throw new Error('Unknown Ribbonwing resource capture');
      const pending = { geometries: [], textures: [] };
      for (const value of record.pending.values()) pending[value.kind].push(value.id);
      const root = record.root.deref(), rootDetached = !root?.parent;
      return { token, label: record.label, rootDetached, rootCollected: !root, tracked: { ...record.tracked }, disposed: { ...record.disposed }, pending,
        complete: rootDetached && record.pending.size === 0 };
    },
    stop() {
      if (stopped) return;
      stopped = true;
      target.removeEventListener('observe', observe);
      for (const record of records.values()) for (const value of record.pending.values()) value.ref.deref()?.removeEventListener('dispose', value.listener);
      records.clear(); scenes.clear();
      if (host[name] === api) delete host[name];
      if (!previous && host.__THREE_DEVTOOLS__ === target) delete host.__THREE_DEVTOOLS__;
    },
  };
  target.addEventListener('observe', observe);
  if (!previous) host.__THREE_DEVTOOLS__ = target;
  host[name] = api;
  return api;
}
