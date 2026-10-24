#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildNeighborhood, canonical } from '../shared/neighborhood/preserve.js';
import { compileRegionPackage } from '../server/region-package.js';
import { parseRegion } from '../preview/src/studio/document.js';
import { previewSvg } from '../shared/neighborhood/preview.js';
import {compileNeighborhoodArchitecture} from '../shared/neighborhood/architecture.js';
export { previewSvg } from '../shared/neighborhood/preview.js';

const usage = 'Usage: node scripts/neighborhood.mjs build --recipe recipe.json --out NEW_DIRECTORY [--previous authoring.json] [--edited region.json] [--approve object-id]';
const read = (path, limit = 2 * 1024 * 1024) => {
  if (statSync(path).size > limit) throw new Error(`Input exceeds ${limit} bytes: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

export function main(argv) {
  try {
    if (argv[0] !== 'build') throw new Error(usage);
    const args = {approve: []};
    for (let i = 1; i < argv.length; i += 2) {
      const name = argv[i]?.slice(2), value = argv[i + 1];
      if (!argv[i]?.startsWith('--') || !['recipe', 'out', 'previous', 'edited', 'approve'].includes(name)
        || !value || value.startsWith('--') || name !== 'approve' && args[name] !== undefined) throw new Error(usage);
      if (name === 'approve') args.approve.push(value); else args[name] = value;
    }
    if (!args.recipe || !args.out) throw new Error(usage);
    const out = resolve(args.out);
    if (existsSync(out)) throw new Error('Output already exists. Choose a new candidate directory; existing authored output is never overwritten.');
    const artifact = buildNeighborhood(read(args.recipe), {previous: args.previous ? read(args.previous) : undefined,
      edited: args.edited ? read(args.edited, 128 * 1024) : undefined, approve: args.approve});
    parseRegion(canonical(artifact.region));
    const world = compileRegionPackage(artifact.region, artifact.recipe.title);
    const architecture=artifact.recipe.architecture||artifact.placements.some(p=>p.architecture)?compileNeighborhoodArchitecture(artifact):null;
    const diagnostics = {status: 'candidate', sha256: artifact.sha256, counts: {roads: artifact.region.roads.length, blocks: artifact.blocks.length,
      parcels: artifact.region.parcels.length, buildings: artifact.region.buildings.length,...(architecture?{architecture:architecture.counts}:{})}, findings: artifact.diagnostics,
    scope: 'Validated geometry and Studio/server region contracts. Synthetic massing; rendered art, geographic accuracy and runtime journeys are not accepted.'};
    const files = {'region.json': canonical(artifact.region) + '\n', 'world.json': canonical(world) + '\n',...(architecture?{'architecture.json':canonical(architecture)+'\n'}:{}),
      'diagnostics.json': canonical(diagnostics) + '\n', 'preview.svg': previewSvg(artifact, world), 'authoring.json': canonical(artifact) + '\n'};
    // Validate and serialize everything before claiming the destination. mkdir is exclusive,
    // including concurrent invocations; a completed authoring.json is written last.
    mkdirSync(dirname(out), {recursive: true});mkdirSync(out);
    for (const [name, content] of Object.entries(files)) writeFileSync(resolve(out, name), content, {flag: 'wx'});
    process.stdout.write(canonical({out, sha256: artifact.sha256, counts: diagnostics.counts}) + '\n');
    return 0;
  } catch (error) {
    process.stderr.write(canonical({error: error.message, ...(error.diagnostics ? {diagnostics: error.diagnostics} : {})}) + '\n');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
