import {validateCharacterDefinition} from './character-definition.js';
import {canUseAppearance,sharedAppearance,MOVEMENTS} from './shared-appearances.js';

const clone=value=>structuredClone(value);
const version=value=>Number.isSafeInteger(value)&&value>=0;
const failure=code=>Object.assign(new Error(code),{code});
const conflicts=new Set(['character_conflict','character_selection_conflict','character_request_reused']);
const retryable=new Set(['character_unavailable','character_selection_pending','appearance_cooldown','rate_limited','character_rate_limited','request_timeout','character_response_invalid']);
// An unreadable acknowledgement cannot prove whether the mutation committed.
// Retain its identity and recover the receipt instead of starting a fresh write.
const acknowledgement=parse=>{try{return parse();}catch(error){if(error.code==='character_account_deleted')throw error;throw failure('character_response_invalid');}};

// A workflow retains each operation's identity until its result is known. Draft
// versions and equipped-selection versions are independent server authorities.
export function createCharacterAccount({ownerId,read,write,select,operationId=()=>crypto.randomUUID(),onChange=()=>{}}){
 let state={phase:'idle',character:null,selection:null,error:null,canRetry:false};
 let journal=null,busy=false,disposed=false,generation=0;
 const emit=patch=>{if(disposed)return;state={...state,...patch};onChange(clone(state));};
 const canonical=(value,revision)=>{
  const result=validateCharacterDefinition(value,{ownerId});
  if(!result.ok||revision!==undefined&&result.definition.revision!==revision)throw failure('invalid_character_definition');
  return result.definition;
 };
 const draft=value=>({...canonical(value),revision:0});
 const same=(a,b)=>Boolean(a&&b)&&JSON.stringify(draft(a))===JSON.stringify(draft(b));
 const character=value=>{
  if(!value||!version(value.version)||typeof value.deleted!=='boolean')throw failure('invalid_character_response');
  if(value.deleted)throw failure('character_account_deleted');
  const result={version:value.version,deleted:false,draft:value.draft===null?null:canonical(value.draft,0),
   published:value.published===null?null:canonical(value.published)};
  if(result.published&&(result.published.revision<1||result.published.revision>result.version))throw failure('invalid_character_response');
  return result;
 };
 const selection=value=>{
  if(value===null)return null;
  if(!value||!version(value.version)||value.version<1||sharedAppearance(value.appearance)?.id!==value.appearance
   ||!canUseAppearance(ownerId,value.appearance)||!MOVEMENTS.includes(value.movement))throw failure('invalid_character_response');
  const result={version:value.version,appearance:value.appearance,movement:value.movement};
  if(value.character!==undefined){
   result.character=canonical(value.character);
   if(result.character.revision<1||result.character.appearanceId!==result.appearance)throw failure('invalid_character_response');
  }
  return result;
 };
 const snapshot=value=>({character:character(value?.character),selection:selection(value?.selection)});
 const saved=(value,published=false)=>acknowledgement(()=>{
  const next=character(value?.state);
  if(!version(value.appliedVersion)||value.appliedVersion<1||value.appliedVersion>next.version
   ||published&&(!version(value.revision)||value.revision<1||value.revision>value.appliedVersion))throw failure('invalid_character_response');
  return next;
 });
 const metadata=expectedVersion=>{
  const requestId=operationId();
  if(typeof requestId!=='string'||!(/^[A-Za-z0-9_-]{1,64}$/).test(requestId))throw failure('invalid_character_operation');
  return {expectedVersion,requestId};
 };
 const check=()=>{if(disposed)throw failure('character_disposed');if(busy)throw failure('character_busy');};
 const report=error=>{
  const domainCode=typeof error.code==='string'?error.code:null,code=domainCode??error.message;
  const conflict=conflicts.has(code);
  // Known validation/auth failures require deliberate recovery. Transport errors
  // have no domain code and can replay the original operation safely.
  const canRetry=Boolean(journal)&&!conflict&&(retryable.has(code)||!domainCode&&!error.status||error.status>=500);
  emit({phase:conflict?'conflict':'error',error:code,canRetry});
  if(!canRetry)journal=null;
 };
 async function execute(){
  check();busy=true;const token=generation,job=journal;
  const current=()=>!disposed&&token===generation;
  try{
   while(current()){
    if(job.step==='draft'){
     emit({phase:'saving',error:null,canRetry:false});
     job.body??={definition:clone(job.definition),...metadata(state.character.version)};
     const result=await write('draft',clone(job.body));if(!current())return;
     const next=saved(result);emit({character:next});
     if(!same(next.draft,job.definition))throw failure('character_conflict');
     if(job.kind==='save'){journal=null;emit({phase:'ready'});return;}
     job.step='publish';job.body=null;
    }else if(job.step==='publish'){
     const published=state.character.published;
     if(!job.body&&same(published,job.definition))job.revision=published.revision;
     else{
      emit({phase:'publishing',error:null,canRetry:false});
      job.body??=metadata(state.character.version);
      const result=await write('publish',clone(job.body));if(!current())return;
      const next=saved(result,true);emit({character:next});
      if(!same(next.draft,job.definition)||!same(next.published,job.definition)||next.published.revision!==result.revision)throw failure('character_conflict');
      job.revision=result.revision;
     }
     job.step='equip';job.body=null;
    }else{
     emit({phase:'equipping',error:null,canRetry:false});
     job.body??={command:{type:'character',revision:job.revision},selection:metadata(job.selectionVersion)};
     const result=await select(clone(job.body.command),clone(job.body.selection));if(!current())return;
     if(!result?.ok)throw failure(result?.error??'character_unavailable');
     if(!version(result.appliedVersion)||result.appliedVersion<1||!version(result.selectionVersion))throw failure('character_response_invalid');
     const received=await read();if(!current())return;
     const next=acknowledgement(()=>snapshot(received));
     emit(next);
     if(result.appliedVersion!==result.selectionVersion||next.selection?.version!==result.appliedVersion
      ||next.selection.character?.revision!==job.revision||!same(next.selection.character,job.definition))throw failure('character_selection_conflict');
     journal=null;emit({phase:'ready'});return;
    }
   }
  }catch(error){if(current())report(error);throw error;}
  finally{busy=false;}
 }
 async function start(kind,value){
  check();if(journal)throw failure('character_retry_required');
  if(!state.character)throw failure('character_not_loaded');
  const definition=draft(value);
  if(kind==='wear'&&!state.selection)throw failure('character_selection_missing');
  journal={kind,definition,selectionVersion:state.selection?.version,step:same(state.character.draft,definition)?'publish':'draft',body:null};
  if(kind==='save'&&journal.step==='publish'){journal=null;emit({phase:'ready',error:null,canRetry:false});return;}
  return execute();
 }
 return {
  get state(){return clone(state);},
  async load(){
   check();if(journal)throw failure('character_retry_required');busy=true;const token=++generation;journal=null;emit({phase:'loading',error:null,canRetry:false});
   try{const next=snapshot(await read());if(!disposed&&token===generation)emit({...next,phase:'ready'});}
   catch(error){if(!disposed&&token===generation)report(error);throw error;}
   finally{busy=false;}
  },
  save:value=>start('save',value),wear:value=>start('wear',value),
  retry(){check();if(!journal||!state.canRetry)return Promise.reject(failure('character_retry_missing'));return execute();},
  dispose(){disposed=true;generation++;journal=null;},
 };
}
