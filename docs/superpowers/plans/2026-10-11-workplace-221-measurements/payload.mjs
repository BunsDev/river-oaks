// Compares two client builds (workplace panel off vs on): total, gzip, and which files differ.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
const [off, on] = process.argv.slice(2);
async function files(dir) { const out = new Map(); async function walk(d) { for (const e of await readdir(d, {withFileTypes: true})) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else if (/\.(js|css|html)$/.test(e.name)) { const b = await readFile(p); out.set(relative(dir, p).replace(/-[A-Za-z0-9_-]{8}\.(js|css)$/, '.$1'), {raw: b.length, gz: gzipSync(b).length}); } } } await walk(dir); return out; }
const a = await files(off), b = await files(on);
const sum = m => [...m.values()].reduce((s, v) => ({raw: s.raw + v.raw, gz: s.gz + v.gz}), {raw: 0, gz: 0});
const diff = [];
for (const k of new Set([...a.keys(), ...b.keys()])) { const x = a.get(k) ?? {raw: 0, gz: 0}, y = b.get(k) ?? {raw: 0, gz: 0}; if (x.raw !== y.raw) diff.push({file: k, rawDelta: y.raw - x.raw, gzDelta: y.gz - x.gz}); }
console.log(JSON.stringify({off: sum(a), on: sum(b), delta: {raw: sum(b).raw - sum(a).raw, gz: sum(b).gz - sum(a).gz}, changedFiles: diff.sort((p, q) => q.gzDelta - p.gzDelta).slice(0, 12)}, null, 2));
