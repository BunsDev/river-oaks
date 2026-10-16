const CONFLICTS=new Set(['character_conflict','character_selection_conflict','character_request_reused']);
const REJECTED=new Set(['invalid_character_selection','invalid_character_owner','invalid_character_definition','invalid_character_operation','character_revision_missing','character_selection_missing','character_account_deleted','land_before_appearance','exclusive_appearance','leave_office_first','invalid_character','invalid_appearance','rate_limited','appearance_cooldown','invalid_command']);
function classify(result){
 if(result?.ok===true)return 'success';
 if(result?.error==='character_studio_disabled')return 'paused';
 if(CONFLICTS.has(result?.error))return 'conflict';
 return REJECTED.has(result?.error)?'rejected':'unavailable';
}
// One observation per authenticated custom equip attempt; no result is retained.
export function observeCharacterEquip(metrics,{now=()=>performance.now()}={}){
 const started=now();let done=false;
 function finish(outcome){
  if(done)return;done=true;
  try{metrics?.record('equip',outcome,Math.max(0,now()-started));}catch{/* Metrics cannot affect commands. */}
 }
 return {result(value){finish(classify(value));},unavailable(){finish('unavailable');},aborted(){finish('aborted');}};
}
