import { mkdir,readFile,writeFile,rename,appendFile,stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { REPORT_LIST_LIMIT, closedRecord, normalizeReport } from './moderation-reports.js';

// One authoritative process owns this durable file on a mounted private volume. It holds
// the ban list and the reports moderators have closed (#292); reports themselves are
// lines in the adjacent audit log.
const MAX_CLOSED=10000;
const closedEntry=value=>value&&typeof value==='object'&&typeof value.at==='string'&&typeof value.by==='string';
export async function createModeration(path) {
  let banned=new Set(),closed=new Map(),queue=Promise.resolve();
  try {
    const data=JSON.parse(await readFile(path,'utf8'));
    if(!Array.isArray(data.banned)||!data.banned.every(id=>typeof id==='string'))throw new Error('Invalid moderation store');banned=new Set(data.banned);
    const closedReports=data.closedReports??{};
    if(!closedReports||typeof closedReports!=='object'||Array.isArray(closedReports)||!Object.values(closedReports).every(closedEntry))throw new Error('Invalid moderation store');
    closed=new Map(Object.entries(closedReports));
  }
  catch(error){if(error.code!=='ENOENT')throw error;}
  const write=async()=>{
    await writeFile(path+'.tmp',JSON.stringify({banned:[...banned],closedReports:Object.fromEntries(closed)})+'\n',{mode:0o600});
    await rename(path+'.tmp',path);
  };
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
      const previous=banned;banned=next;
      try{await write();}catch(error){banned=previous;throw error;}
      await audit({type:value?'ban':'unban',userId,moderatorId});
    });},
    // A report (#292): its id, the content it carries ({quoted, chat}, already bounded by
    // moderation-reports.js) and the time it should be answered by are saved with it.
    // `at` is the intake's time, so the audit line and the inbox notice agree.
    report(reporterId,userId,reason,{id=randomUUID(),content=null,respondBy=null,at=null}={}){return serialize(()=>audit({...(at?{at}:{}),type:'report',id,reporterId,userId,reason,...(content?{content}:{}),...(respondBy?{respondBy}:{})}));},
    // Closes a saved report. Answers false when no report has that id.
    closeReport(id,moderatorId){return serialize(async()=>{
      if(closed.has(id))return true;
      if(!(await read(Infinity,null)).some(entry=>entry.id===id))return false;
      const previous=closed;closed=new Map(closed);
      closed.set(id,closedRecord(new Date().toISOString(),moderatorId));
      while(closed.size>MAX_CLOSED)closed.delete(closed.keys().next().value);
      try{await write();}catch(error){closed=previous;throw error;}
      await audit({type:'report_closed',id,moderatorId});
      return true;
    });},
    // Saved reports, newest first (moderation-reports.js): the current log, then the one
    // rotated at 5 MB. Reading never changes either. Reports about `except` don't count.
    reports(limit=REPORT_LIST_LIMIT,except=null){return serialize(()=>read(limit,except));},
  };
  async function read(limit,except){
    const found=[];
    for(const log of [path+'.audit.jsonl',path+'.audit.jsonl.previous']){
      const text=await readFile(log,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
      const lines=text.split('\n').filter(Boolean).reverse();
      for(const line of lines){let entry=null;try{entry=normalizeReport(JSON.parse(line));}catch{}if(entry&&entry.reportedId!==except)found.push({...entry,closed:closed.get(entry.id)??null});if(found.length>=limit)return found;}
    }
    return found;
  }
}
