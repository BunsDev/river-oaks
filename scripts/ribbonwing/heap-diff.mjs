// Attribute heap growth between V8 heap snapshots (#777): aggregate live objects by type and
// constructor name, then list what grew most from each snapshot to the next.
//   node scripts/ribbonwing/heap-diff.mjs <a.heapsnapshot> <b.heapsnapshot> [<c.heapsnapshot> ...]
import { readFileSync } from 'node:fs';

function summarize(path) {
  const snapshot = JSON.parse(readFileSync(path, 'utf8')), meta = snapshot.snapshot.meta;
  const fields = meta.node_fields, width = fields.length, types = meta.node_types[0];
  const at = name => fields.indexOf(name), typeAt = at('type'), nameAt = at('name'), sizeAt = at('self_size');
  const groups = new Map();let total = 0;
  for (let i = 0; i < snapshot.nodes.length; i += width) {
    const type = types[snapshot.nodes[i + typeAt]], size = snapshot.nodes[i + sizeAt];
    // Name objects by constructor; strings, code and arrays by their type alone.
    const key = ['object', 'closure', 'native', 'regexp'].includes(type) ? `${type}:${snapshot.strings[snapshot.nodes[i + nameAt]]}` : type;
    const group = groups.get(key) ?? { count: 0, bytes: 0 };group.count++;group.bytes += size;groups.set(key, group);total += size;
  }
  return { path, total, groups };
}

const snapshots = process.argv.slice(2).map(summarize), steps = [];
for (let n = 1; n < snapshots.length; n++) {
  const a = snapshots[n - 1], b = snapshots[n], rows = [];
  for (const key of new Set([...a.groups.keys(), ...b.groups.keys()])) {
    const before = a.groups.get(key) ?? { count: 0, bytes: 0 }, after = b.groups.get(key) ?? { count: 0, bytes: 0 };
    if (after.bytes !== before.bytes || after.count !== before.count) rows.push({ key, bytes: after.bytes - before.bytes, count: after.count - before.count });
  }
  rows.sort((x, y) => y.bytes - x.bytes);
  steps.push({ from: a.path.split('/').pop(), to: b.path.split('/').pop(), totalBytes: b.total - a.total, grew: rows.slice(0, 15), shrank: rows.slice(-5).reverse() });
}
console.log(JSON.stringify(steps, null, 1));
