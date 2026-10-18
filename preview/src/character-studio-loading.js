// At most one avatar load is active. A stale success is disposed; a stale
// failure cannot prevent the latest selection from loading.
export async function loadLatestCharacter({getWanted,isDisposed,load,discard,accept,onError}){
  while(!isDisposed()){
    const requested=getWanted();let resource;
    try{resource=await load(requested);}
    catch(error){if(isDisposed())return;if(getWanted().appearanceId!==requested.appearanceId)continue;onError(error);return;}
    if(isDisposed()||getWanted().appearanceId!==requested.appearanceId){discard(resource);continue;}
    try{accept(resource,getWanted());}catch(error){discard(resource);onError(error);}return;
  }
}
