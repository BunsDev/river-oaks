import { emptyDesk, validDeskTask, DESK_LIMITS } from './office-desk-contract.js';
/** Private editor state; all persistence and authority stay behind request(). */
export function createDeskModel({request,account,id=()=>crypto.randomUUID(),onChange=()=>{}}){
 let desk=emptyDesk(),task=null,dirty=false,status='idle',error=null,epoch=0,edits=0,pending=null,owner=account();
 const emit=()=>onChange();
 const current=(token,user)=>token===epoch&&user===account()&&owner===user;
 const state=()=>({desk:structuredClone(desk),task:task&&structuredClone(task),dirty,status,error,busy:Boolean(pending)});
 function reset(){epoch++;owner=account();desk=emptyDesk();task=null;dirty=false;error=null;status='idle';pending=null;edits=0;emit();}
 async function load({discard=false}={}){
  if(owner!==account())reset();if(pending)return false;
  if(dirty&&!discard)return false;
  const token=epoch,user=owner,version=edits,priorVersion=desk.version;status='loading';error=null;const marker={};pending=marker;emit();
  try{const r=await request('read',{});if(!current(token,user))return false;desk=r.desk;if(edits!==version){dirty=true;error=desk.version!==priorVersion?'desk_conflict':null;status=error?'error':'dirty';}else{task=structuredClone(desk.tasks.find(t=>t.id===desk.activeId)??desk.tasks[0]??null);dirty=false;status='saved';}return true;}
  catch(e){if(current(token,user)){error=e.message;status='error';}return false;}
  finally{if(current(token,user)&&pending===marker){pending=null;emit();}}
 }
 async function save(){
  if(pending)return false;if(!dirty)return true;
  if(error==='desk_conflict')return false;
  if(!validDeskTask(task)){error='invalid_desk';status='error';emit();return false;}
  const token=epoch,user=owner,version=edits,snapshot=structuredClone(task),marker={};pending=marker;status='saving';error=null;emit();
  try{const r=await request('save',{expectedVersion:desk.version,task:snapshot});if(!current(token,user))return false;desk=r.desk;if(version===edits){dirty=false;task=structuredClone(desk.tasks.find(t=>t.id===snapshot.id));}status=dirty?'dirty':'saved';return !dirty;}
  catch(e){if(current(token,user)){error=e.message;status='error';}return false;}
  finally{if(current(token,user)&&pending===marker){pending=null;emit();}}
 }
 async function select(taskId){if(pending||dirty&&!await save())return false;const next=desk.tasks.find(t=>t.id===taskId);if(!next)return false;task=structuredClone(next);error=null;status='saved';emit();return true;}
 async function create(){if(pending||dirty&&!await save())return false;if(desk.tasks.length>=DESK_LIMITS.tasks){error='desk_limit';emit();return false;}task={id:id(),title:'',notes:'',links:[],result:'',status:'open'};dirty=false;error=null;status='new';emit();return true;}
 function edit(values){if(status==='removing')return;if(owner!==account()){reset();return;}if(!task)return;task={...task,...values};edits++;dirty=true;if(error!=='desk_conflict')error=null;if(!pending)status='dirty';emit();}
 async function finish(){if(pending||!task)return false;edit({status:task.status==='done'?'open':'done'});return save();}
 async function remove(){
  if(pending||!task)return false;if(!desk.tasks.some(t=>t.id===task.id)){task=null;dirty=false;error=null;emit();return true;}
  const token=epoch,user=owner,marker={};pending=marker;status='removing';error=null;emit();
  try{const r=await request('remove',{expectedVersion:desk.version,id:task.id});if(!current(token,user))return false;desk=r.desk;task=structuredClone(desk.tasks.find(t=>t.id===desk.activeId)??null);dirty=false;status='saved';return true;}
  catch(e){if(current(token,user)){error=e.message;status='error';}return false;}
  finally{if(current(token,user)&&pending===marker){pending=null;emit();}}
 }
 return {get state(){return state();},load,save,select,create,edit,finish,remove,reset};
}
