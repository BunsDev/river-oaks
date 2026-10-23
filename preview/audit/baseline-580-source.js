import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export const captureBaselineSource = async root => {
  const head = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const patch = execFileSync('git', ['diff','--binary','HEAD','--','preview','server','shared','package.json','pnpm-lock.yaml'], {cwd:root,maxBuffer:32*1024*1024});
  const names = execFileSync('git', ['ls-files','--others','--exclude-standard','-z','--','preview','server','shared'], {cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).sort();
  const untracked = Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(join(root,name))])));
  const hash=createHash('sha256').update(head).update('\0').update(patch);
  for(const [name,bytes] of Object.entries(untracked))hash.update(name).update(bytes);
  return {head,patch,untracked,sha256:hash.digest('hex')};
};
