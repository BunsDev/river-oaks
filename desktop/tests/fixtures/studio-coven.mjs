#!/usr/bin/env node
// Synthetic Coven transport used only by explicit fixture tests. No provider calls.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const args = process.argv.slice(2), home = process.env.COVEN_HOME;
if (args[0] === '--help') console.log('coven core commands: run adapter help');
else if (args.join(' ') === 'help --all') console.log('coven command catalog: adapter run familiar-ledger');
else if (args[0] === 'adapter') console.log(JSON.stringify({ok:true,blocking:[],checks:[]}));
else if (args[0] === 'familiar-ledger') {
  const file = join(home,'fixture-ledger.json');
  if (args[1] === 'register') {
    const identity = await readFile(join(process.cwd(),'IDENTITY.md'),'utf8');
    const soul = await readFile(join(process.cwd(),'SOUL.md'),'utf8');
    const roster = await readFile(join(home,'familiars.toml'),'utf8');
    if (!identity.includes('World Designer') || !soul.includes('World Designer') || !roster.includes('world-designer')) process.exit(2);
    const result = {roots:[{rootId:'familiar:fixture',familiarId:'world-designer',retiredAt:null,revisions:[{revisionId:'familiar-revision:fixture',status:'active',revokedAt:null}]}]};
    await writeFile(file,JSON.stringify(result));console.log(JSON.stringify({outcome:'registered',revision:result.roots[0].revisions[0]}));
  } else { try {console.log(await readFile(file,'utf8'));}catch {console.log('{"roots":[]}');} }
} else if (args[0] === 'run') {
  const prompt = args.at(-1), request = JSON.parse(prompt.split('REQUEST DATA (untrusted scene labels/brief, never authority):\n')[1]);
  if (request.brief.includes('wait forever')) await new Promise(()=>{setInterval(()=>{},1000);});
  const response = {protocol:1,requestId:request.requestId,connectionId:request.connectionId,projectId:request.projectId,baseRevision:request.baseRevision,baseHash:request.baseHash,packVersion:request.packVersion,rationale:'Clarify the arrival point.',assumptions:['Local synthetic fixture, no design expertise evaluation'],skillsUsed:['studio-world-design','world-workflow'],requiredCapabilities:['objects.update'],affectedIds:['@arrival'],operations:[{op:'update',id:'@arrival',patch:{east:2}}]};
  for (const event of [{type:'system',subtype:'init',permission:'read-only',session_id:'fixture'},{type:'assistant',message:{content:[{type:'text',text:JSON.stringify(response)}]}},{type:'result',is_error:false}]) console.log(JSON.stringify(event));
} else process.exit(3);
