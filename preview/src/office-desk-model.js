import { emptyDesk, validDeskTask, DESK_LIMITS } from './office-desk-contract.js';
/** Scoped editor state; all persistence and authority stay behind request(). */
export function createDeskModel({request,account,scope=()=> 'private',id=()=>crypto.randomUUID(),operationId=()=>crypto.randomUUID(),onChange=()=>{}}){
 const context=()=>JSON.stringify([account(),scope()]);
 let desk=emptyDesk(),task=null,dirty=false,status='idle',error=null,epoch=0,edits=0,pending=null,outstanding=null,owner=context();
 const emit=()=>onChange();
 const current=(token,user)=>token===epoch&&user===context()&&owner===user;
 function reset(){epoch++;owner=context();desk=emptyDesk();task=null;dirty=false;error=null;status='idle';pending=null;outstanding=null;edits=0;emit();}
 const ensure=()=>{if(owner!==context())reset();};
 const state=()=>{ensure();return {desk:structuredClone(desk),task:task&&structuredClone(task),dirty,status,error,busy:Boolean(pending),retrying:Boolean(outstanding)};};
 async function load({discard=false,preserveDraft=false}={}){
  ensure();if(pending)return false;if(dirty&&!discard&&!preserveDraft)return false;
  const token=epoch,user=owner,version=edits,priorVersion=desk.version,keep=preserveDraft&&dirty;status='loading';error=null;const marker={};pending=marker;emit();
  try{
   const r=await request('read',{});if(!current(token,user))return false;desk=r.desk;
   if(keep||edits!==version){dirty=true;error=desk.version!==priorVersion?'desk_conflict':null;status=error?'error':'dirty';}
   else{outstanding=null;task=structuredClone(desk.tasks.find(t=>t.id===desk.activeId)??desk.tasks[0]??null);dirty=false;status='saved';}return true;
  }catch(e){if(current(token,user)){error=e.message;status='error';}return false;}
  finally{if(current(token,user)&&pending===marker){pending=null;emit();}}
 }
 async function perform(operation){
  const token=epoch,user=owner,marker={};pending=marker;outstanding=operation;status=operation.action==='remove'?'removing':'saving';error=null;emit();
  try{
   const r=await request(operation.action,structuredClone(operation.data));if(!current(token,user))return false;
   desk=r.desk;outstanding=null;
   if(operation.action==='remove'){task=structuredClone(desk.tasks.find(t=>t.id===desk.activeId)??null);dirty=false;}
   else if(operation.edits===edits){dirty=false;task=structuredClone(desk.tasks.find(t=>t.id===operation.data.task.id)??null);}
   status=dirty?'dirty':'saved';return !dirty;
  }catch(e){if(current(token,user)){error=e.message;status='error';}return false;}
  finally{if(current(token,user)&&pending===marker){pending=null;emit();}}
 }
 async function save(){
  ensure();if(pending)return false;
  if(['desk_conflict','desk_operation_conflict','office_operation_conflict'].includes(error))return false;
  if(outstanding)return perform(outstanding);
  if(!dirty)return true;
  if(!validDeskTask(task)){error='invalid_desk';status='error';emit();return false;}
  return perform({action:'save',edits,data:{expectedVersion:desk.version,operationId:operationId(),task:structuredClone(task)}});
 }
 async function select(taskId){ensure();if(pending||(dirty||outstanding)&&!await save())return false;const next=desk.tasks.find(t=>t.id===taskId);if(!next)return false;task=structuredClone(next);error=null;status='saved';emit();return true;}
 async function create(){ensure();if(pending||(dirty||outstanding)&&!await save())return false;if(desk.tasks.length>=DESK_LIMITS.tasks){error='desk_limit';emit();return false;}task={id:id(),title:'',notes:'',links:[],result:'',status:'open'};dirty=false;error=null;status='new';emit();return true;}
 function edit(values){ensure();if(status==='removing'||outstanding?.action==='remove'||!task)return;task={...task,...values};edits++;dirty=true;if(!outstanding&&error!=='desk_conflict')error=null;if(!pending)status='dirty';emit();}
 async function finish(){ensure();if(pending||outstanding||!task)return false;edit({status:task.status==='done'?'open':'done'});return save();}
 async function remove(){
  ensure();if(pending||!task)return false;if(outstanding)return perform(outstanding);
  if(!desk.tasks.some(t=>t.id===task.id)){task=null;dirty=false;error=null;emit();return true;}
  return perform({action:'remove',edits,data:{expectedVersion:desk.version,operationId:operationId(),id:task.id}});
 }
 async function retry(){ensure();if(pending)return false;return outstanding?perform(outstanding):dirty?save():load();}
 return {get state(){return state();},load,save,select,create,edit,finish,remove,retry,reset};
}
