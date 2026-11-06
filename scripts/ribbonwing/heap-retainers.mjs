// Why is an object still alive? For every object in a V8 heap snapshot whose `name` property is
// the given string (a three.js Object3D name), print its shortest retainer path to a GC root.
//   node --max-old-space-size=12000 scripts/ribbonwing/heap-retainers.mjs <file.heapsnapshot> <object name>
import { readFileSync } from 'node:fs';

const [path, wanted] = process.argv.slice(2);
const snapshot = JSON.parse(readFileSync(path, 'utf8')), meta = snapshot.snapshot.meta, { nodes, edges, strings } = snapshot;
const nodeWidth = meta.node_fields.length, edgeWidth = meta.edge_fields.length, nodeTypes = meta.node_types[0], edgeTypes = meta.edge_types[0];
const nf = name => meta.node_fields.indexOf(name), ef = name => meta.edge_fields.indexOf(name);
const N_TYPE = nf('type'), N_NAME = nf('name'), N_EDGES = nf('edge_count'), E_TYPE = ef('type'), E_NAME = ef('name_or_index'), E_TO = ef('to_node');
const count = nodes.length / nodeWidth, firstEdge = new Uint32Array(count + 1);
for (let n = 0; n < count; n++) firstEdge[n + 1] = firstEdge[n] + nodes[n * nodeWidth + N_EDGES];
const label = n => `${nodeTypes[nodes[n * nodeWidth + N_TYPE]]}:${strings[nodes[n * nodeWidth + N_NAME]]}`.slice(0, 80);
const edgeLabel = e => { const type = edgeTypes[edges[e + E_TYPE]], name = edges[e + E_NAME];return ['element', 'hidden'].includes(type) ? `[${name}]` : String(strings[name]); };
// Reverse edges, skipping weak ones (they do not keep anything alive).
const retainers = Array.from({ length: count }, () => []);
for (let n = 0; n < count; n++) for (let e = firstEdge[n]; e < firstEdge[n + 1]; e++) {
  const at = e * edgeWidth;if (edgeTypes[edges[at + E_TYPE]] === 'weak') continue;
  retainers[edges[at + E_TO] / nodeWidth].push([n, at]);
}
// Targets: objects with a `name` property whose value is the wanted string.
const targets = [];
for (let n = 0; n < count; n++) for (let e = firstEdge[n]; e < firstEdge[n + 1]; e++) {
  const at = e * edgeWidth;
  if (edgeTypes[edges[at + E_TYPE]] === 'property' && strings[edges[at + E_NAME]] === 'name') {
    const to = edges[at + E_TO] / nodeWidth;if (nodeTypes[nodes[to * nodeWidth + N_TYPE]].includes('string') && strings[nodes[to * nodeWidth + N_NAME]] === wanted) targets.push(n);
  }
}
console.log(`${targets.length} live object(s) named ${JSON.stringify(wanted)}`);
for (const target of targets) {
  // Breadth-first toward the synthetic root (node 0).
  const previous = new Map([[target, null]]), queue = [target];let found = null;
  while (queue.length && found === null) {
    const n = queue.shift();
    if (n === 0) { found = n;break; }
    for (const [from, at] of retainers[n]) if (!previous.has(from)) { previous.set(from, [n, at]);queue.push(from); }
  }
  if (found === null) { console.log('\n(no path to a root)');continue; }
  const chain = [];for (let n = found;n !== target;) { const [next, at] = previous.get(n);chain.push(`${label(n)} --${edgeLabel(at)}-->`);n = next; }
  console.log(`\n${chain.slice(-14).join('\n')}\n${label(target)}`);
}
