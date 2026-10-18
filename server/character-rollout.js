// Pausing creation never destroys an accepted operation's recovery identity.
// The ordinary authenticated selection path still reconciles a known receipt.
// If a bounded receipt is evicted after this read, its expected version is already
// older than the applied account version, so it cannot admit another CAS write.
const terminal=new Set(['invalid_character_operation','invalid_character_selection','invalid_character_owner',
  'character_request_reused','character_account_deleted','character_selection_conflict']);
export async function characterSelectionGate({enabled,store,userId,command,selection}){
 if(enabled===true||command.type!=='character')return null;
 try{
  if(await store?.getSelectionResult(userId,command,selection))return null;
  return {ok:false,error:'character_studio_disabled'};
 }catch(error){return {ok:false,error:terminal.has(error?.code)?error.code:'character_unavailable'};}
}
