const OUTCOMES=new Set(['success','rejected','conflict','paused','unavailable','aborted']);
const classify=status=>status>=200&&status<300?'success':status===409?'conflict':status>=400&&status<500?'rejected':'unavailable';
// Observe only a matched character route. Never read request/response payloads.
export function observeCharacterResponse(res,operation,metrics,{now=()=>performance.now()}={}){
 const started=now();let done=false,override=null;
 const complete=outcome=>{
  if(done)return;done=true;res.off('finish',finish);res.off('close',close);
  try{metrics?.record(operation,outcome,Math.max(0,now()-started));}catch{/* Observability cannot reject a response. */}
 };
 const finish=()=>complete(override??classify(res.statusCode)),close=()=>complete('aborted');
 res.once('finish',finish);res.once('close',close);
 return {outcome(value){if(!done&&OUTCOMES.has(value))override=value;}};
}
