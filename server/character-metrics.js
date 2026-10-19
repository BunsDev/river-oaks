const OPERATIONS=['read','save','publish','rollback','equip'];
const OUTCOMES=['success','rejected','conflict','paused','unavailable','aborted'];
const LATENCIES=['le100ms','le500ms','le2000ms','gt2000ms'];
const LIMIT=2147483647;
// Attempt totals only: fixed dimensions, no per-account state or raw event log.
// intervalMs=0 permits explicit flushing in short-lived tools and tests.
export function createCharacterMetrics({enabled=false,emit=value=>console.info(JSON.stringify(value)),intervalMs=60000}={}){
 if(typeof emit!=='function'||!Number.isInteger(intervalMs)||intervalMs!==0&&(intervalMs<1000||intervalMs>3600000))throw new TypeError('Invalid character metrics configuration');
 const counts=new Uint32Array(OPERATIONS.length*OUTCOMES.length*LATENCIES.length);
 let closed=false;
 function record(operation,outcome,elapsed){
  if(enabled!==true||closed||typeof operation!=='string'||typeof outcome!=='string'||!Number.isFinite(elapsed)||elapsed<0)return false;
  const op=OPERATIONS.indexOf(operation),result=OUTCOMES.indexOf(outcome);if(op<0||result<0)return false;
  const bucket=elapsed<=100?0:elapsed<=500?1:elapsed<=2000?2:3,index=(op*OUTCOMES.length+result)*LATENCIES.length+bucket;
  counts[index]=Math.min(LIMIT,counts[index]+1);return true;
 }
 function flush(){
  if(enabled!==true||closed)return;
  const values=[];
  for(let op=0;op<OPERATIONS.length;op++)for(let result=0;result<OUTCOMES.length;result++)for(let bucket=0;bucket<LATENCIES.length;bucket++){
   const index=(op*OUTCOMES.length+result)*LATENCIES.length+bucket,count=counts[index];
   if(count)values.push({operation:OPERATIONS[op],outcome:OUTCOMES[result],latency:LATENCIES[bucket],count});
  }
  counts.fill(0);
  if(values.length)try{Promise.resolve(emit({event:'character_studio_metrics',schemaVersion:1,counts:values})).catch(()=>{});}catch{/* Best-effort metrics never affect gameplay. */}
 }
 const timer=enabled===true&&intervalMs?setInterval(flush,intervalMs):null;timer?.unref();
 return {record,flush,close(){if(closed)return;clearInterval(timer);flush();closed=true;}};
}
