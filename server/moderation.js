import { mkdir,readFile,writeFile,rename,appendFile,stat } from 'node:fs/promises';
import { dirname } from 'node:path';

// One authoritative process owns this durable file on a mounted private volume.
export async function createModeration(path) {
  let banned=new Set(),queue=Promise.resolve();
  try {const data=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(data.banned)||!data.banned.every(id=>typeof id==='string'))throw new Error('Invalid moderation store');banned=new Set(data.banned);}
  catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const serialize=task=>{const next=queue.then(task);queue=next.catch(()=>{});return next;};
  const audit=async event=>{
    const log=path+'.audit.jsonl';
    const size=await stat(log).then(info=>info.size,error=>{if(error.code==='ENOENT')return 0;throw error;});
    if(size>5*1024*1024)await rename(log,log+'.previous');
    await appendFile(log,JSON.stringify({at:new Date().toISOString(),...event})+'\n',{mode:0o600});
  };
  return {
    isBanned:id=>banned.has(id),
    setBanned(userId,value,moderatorId){return serialize(async()=>{
      const next=new Set(banned);if(value)next.add(userId);else next.delete(userId);
      if(next.size>10000)throw new Error('Moderation capacity reached');
      await writeFile(path+'.tmp',JSON.stringify({banned:[...next]})+'\n',{mode:0o600});
      await rename(path+'.tmp',path);banned=next;
      await audit({type:value?'ban':'unban',userId,moderatorId});
    });},
    report(reporterId,userId,reason){return serialize(()=>audit({type:'report',reporterId,userId,reason}));},
  };
}
