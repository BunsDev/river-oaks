import {randomUUID} from 'node:crypto';
import {characterSelectionOperation} from './character-store.js';
import {defaultAppearanceFor} from '../preview/src/shared-appearances.js';

export const isCharacterSelection=command=>['character','appearance','movement'].includes(command?.type);
const terminal=new Set(['character_selection_conflict','character_request_reused','character_account_deleted','character_revision_missing',
  'character_selection_missing','character_version_capacity','character_record_capacity','character_account_capacity',
  'invalid_character_selection','invalid_character_operation','invalid_character_owner','invalid_character_record']);
const rejected=error=>({ok:false,error});
const failure=error=>rejected(terminal.has(error?.code)?error.code:'character_unavailable');

// The memory transport shares account CAS with Redis, but owns no durable room.
// Keep uncertain writes fenced until a receipt or definitive rejection resolves
// them. A replacement server restores confirmed account state on its next join.
export function createMemoryCharacterSelection({world,store,legacy=null,authorized}){
 const pending=new Map(),versions=new Map();
 const project=(userId,preference,appearanceChanged=false,allowAbsent=false)=>{
  const current=world();
  if(!preference||!allowAbsent&&!current.players.has(userId))return;
  if(preference.version<(versions.get(userId)??0))return current.applyAccountAppearance(userId,current.accountAppearance(userId));
  const player=current.commitAccountSelection(userId,preference,{appearanceChanged});if(current.players.has(userId))versions.set(userId,preference.version);return player;
 };
 const account=async userId=>{
  const current=await store.getSelection(userId);if(current)return current;
  const local=world().accountAppearance(userId);
  const prior=legacy?(await legacy.get(userId)??await legacy.initialize(userId,local)):local;
  return store.initializeSelection(userId,prior);
 };
 const reply=(userId,result,appearanceChanged=false)=>{
  const player=project(userId,result.selection,appearanceChanged);
  return {ok:true,appliedVersion:result.appliedVersion,selectionVersion:Math.max(result.selection.version,versions.get(userId)??0),...(player?{player}:{})};
 };
 async function settle(intent){
  if(intent.running)return intent.running;
  const execute=async()=>{
   const {userId,operation,context}=intent,options={expectedVersion:operation.expectedVersion,requestId:operation.requestId};
   try{
    let result=await store.getSelectionResult(userId,operation.command,options);
    if(!result){
     if(!await authorized(userId,context)){pending.delete(userId);return rejected('session_invalid');}
     result=await store.changeSelection(userId,operation.command,options);
    }
    const value=reply(userId,result,intent.appearanceChanged);pending.delete(userId);return value;
   }catch(error){
    if(terminal.has(error.code)){
     pending.delete(userId);
     if(error.code==='character_account_deleted'){
      if(world().players.has(userId))world().applyAccountAppearance(userId,{appearance:defaultAppearanceFor(userId),movement:'upright'});
      versions.delete(userId);
     }else try{project(userId,await store.getSelection(userId));}catch{ /* Later sync retries. */ }
    }
    return failure(error);
   }
  };
  intent.running=execute().finally(()=>{intent.running=null;});return intent.running;
 }
 return {
  hasPending:userId=>pending.has(userId),
  forget:userId=>versions.delete(userId),
  clear:()=>versions.clear(),
  async initialize(userId,isCurrent=()=>true){
   const origin=world();
   const intent=pending.get(userId);if(intent?.prepared)await settle(intent);
   if(pending.has(userId))throw new Error('character_selection_pending');
   const preference=await account(userId);
   if(world()!==origin||!isCurrent())throw new Error('stale_connection');
   return project(userId,preference,false,true);
  },
  async sync(userId,isCurrent=()=>true){
   if(pending.has(userId))return;const origin=world(),preference=await account(userId);
   if(world()===origin&&isCurrent()&&!pending.has(userId))project(userId,preference);
  },
  async recover(){await Promise.all([...pending.values()].filter(intent=>intent.prepared).map(settle));},
  async command(userId,message,options,context={}){
   if(pending.has(userId))return rejected('character_selection_pending');
   if(pending.size>=64)return rejected('character_selection_pending');
   const intent={userId,context:structuredClone(context),prepared:false,running:null};pending.set(userId,intent);
   try{
    const current=await account(userId);
    const metadata=options===undefined&&message.type!=='character'?{expectedVersion:current.version,requestId:randomUUID()}:options;
    const operation=characterSelectionOperation(userId,message,metadata);intent.operation=operation;
    const prior=await store.getSelectionResult(userId,operation.command,metadata);
    if(prior){pending.delete(userId);return reply(userId,prior);}
    if(current.version!==operation.expectedVersion||current.version<(versions.get(userId)??0)){
     pending.delete(userId);return rejected('character_selection_conflict');
    }
    project(userId,current);
    const definition=operation.command.type==='character'?await store.getRevision(userId,operation.command.revision):null;
    if(operation.command.type==='character'&&!definition){pending.delete(userId);return rejected('character_revision_missing');}
    if(!await authorized(userId,intent.context)){pending.delete(userId);return rejected('session_invalid');}
    const prepared=world().prepareAccountSelection(userId,operation.command,{characterDefinition:definition});
    if(!prepared.ok){pending.delete(userId);return prepared;}
    intent.appearanceChanged=operation.command.type==='character'?current.character?.revision!==operation.command.revision
     :operation.command.type==='appearance'&&(current.appearance!==operation.command.appearance||Boolean(current.character));
    intent.prepared=true;return await settle(intent);
   }catch(error){if(!intent.prepared)pending.delete(userId);return failure(error);}
  },
 };
}
