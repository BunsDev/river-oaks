// Identify local runtime/harness changes without reading environment/private state.
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
export function neighborhoodSource(){
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
  const dirty=[...git(['diff','--name-only','-z','HEAD']).split('\0'),...git(['ls-files','--others','--exclude-standard','-z']).split('\0')]
    .filter(path=>/^(?:shared|preview\/(?:src|e2e|tests)|scripts|config\/neighborhoods)\/.*\.(?:js|mjs|json)$/.test(path));
  const files=[...new Set([...dirty,'package.json','pnpm-lock.yaml','preview/src/walking.js','preview/src/world-surface.js',
    'preview/src/geometry.js','preview/src/street-profile.js','preview/public/data/starter-districts/market-street.json','preview/public/data/starter-districts/garden-neighborhood.json'])].sort();
  const manifest=Object.fromEntries(files.map(path=>[path,existsSync(join(root,path))?createHash('sha256').update(readFileSync(join(root,path))).digest('hex'):null]));
  return {head:git(['rev-parse','HEAD']).trim(),manifest,sha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
    scope:'Base commit plus changed/untracked JS and JSON runtime/test/harness files, lockfile and named movement/manual-reference inputs. Environment and private runtime state excluded.'};
}
