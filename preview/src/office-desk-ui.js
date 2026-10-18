import { createDeskModel } from './office-desk-model.js';
import { DESK_LIMITS, safeDeskURL } from './office-desk-contract.js';
import { computerConfig } from './office-computer-protocol.js';
import { createComputerFrame } from './office-computer-frame.js';
import './office-desk.css';
const messages={desk_conflict:'This task changed in another tab. Download your draft, then reload saved work to continue.',desk_limit:'Your desk is full. Download and remove a finished task to make room.',invalid_desk:'Add a task title and check the field limits and file links.',office_visit_required:'Return to the office to save. Your unsaved work is still here.',desk_rate_limited:'You’re saving quickly. Wait a moment, then try again.'};
// Place's wording for the states Computer reports. Only Computer's status or close result can say saved.
const computerStatus={loading:'Opening TypeSafe Computer…','account-confirmation':'Confirm your TypeSafe Computer account to continue',closing:'Checking your Computer saves before you leave…',attention:'TypeSafe Computer is waiting for your decision',unconfirmed:'Saves not confirmed by TypeSafe Computer',signin:'Not signed in to TypeSafe Computer',failed:'TypeSafe Computer is not open'};
const computerSync={none:'TypeSafe Computer · your own account',pending:'Saving to your Computer account…',saved:'Saved to your Computer account',offline:'Offline · Computer is keeping changes in this browser',failed:'Not saved to your Computer account yet'};
const computerFailures={timeout:'TypeSafe Computer didn’t open here.','auth-failed':'TypeSafe Computer couldn’t confirm your sign-in.','account-load-failed':'TypeSafe Computer couldn’t load your account.',unavailable:'TypeSafe Computer is unavailable right now.'};
const computerReceipts={saved:'Computer saved your work to your account.',local:'Computer kept unsynced changes in this browser.'};
const node=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;};
export function createOfficeDeskUI({getMultiplayer,onClose=()=>{},computer:computerSettings=computerConfig(import.meta.env??{})}){
 const lifetime=new AbortController(),signal=lifetime.signal;
 const dialog=node('dialog',null,'office-desk');dialog.id='office-desk';dialog.setAttribute('aria-labelledby','desk-heading');
 // This template is static. Every user-authored value is assigned through value/textContent.
 dialog.innerHTML=`<div class="desk-topbar"><div class="desk-brand"><span class="desk-monogram" aria-hidden="true">RO</span><div><p class="desk-eyebrow">RIVER OAKS · OFFICE</p><h2 id="desk-heading">Your desk</h2></div></div><div class="desk-top-actions"><span id="desk-scope-label" class="desk-private">Private to you</span><button type="button" id="desk-close" class="desk-icon-button" aria-label="Close desk">×</button></div></div>
 <div id="desk-views" class="desk-scopes desk-views" hidden><div class="desk-tabs" role="tablist" aria-label="Desk"><button type="button" id="desk-view-tasks" role="tab" aria-selected="true" aria-controls="desk-body">Tasks</button><button type="button" id="desk-view-computer" role="tab" aria-selected="false" aria-controls="desk-computer" tabindex="-1">Computer</button></div><p id="desk-computer-receipt" class="desk-computer-receipt" role="status"></p></div>
 <div id="desk-body" class="desk-body"><aside class="desk-sidebar" aria-label="Your tasks"><div class="desk-sidebar-heading"><h3 id="desk-list-heading">My tasks</h3><span id="desk-count">0</span></div><button type="button" id="desk-new" class="desk-new"><span aria-hidden="true">＋</span> New task</button><nav id="desk-tasks" aria-label="Tasks"></nav><p class="desk-sidebar-note">A little space for<br>your next good idea.</p></aside>
 <main class="desk-work"><div id="desk-empty" class="desk-empty"><span class="desk-empty-mark" aria-hidden="true">✧</span><p class="desk-eyebrow">MAKE ROOM FOR GOOD WORK</p><h3>What’s on your mind?</h3><p>Start with a task. Keep your notes and file links together, then save something worth coming back to.</p><button type="button" id="desk-start" class="desk-primary">Start your first task <span aria-hidden="true">↗</span></button><button type="button" id="desk-scene" class="desk-text-button">Or write a three-line scene idea</button><small id="desk-scope-help">Your work stays private, even when you share an office.</small></div>
 <div id="desk-loading" class="desk-loading" role="status" hidden>Opening your desk…</div>
 <form id="desk-editor" class="desk-editor" hidden><div class="desk-document-top"><span id="desk-task-state" class="desk-task-state">IN PROGRESS</span><button type="button" id="desk-delete" class="desk-text-button">Remove task</button></div>
 <label class="desk-sr-only" for="desk-title">Task title</label><textarea id="desk-title" class="desk-title" rows="1" maxlength="120" placeholder="Give this task a name" autocomplete="off" required></textarea>
 <section class="desk-section"><div class="desk-field-heading"><label for="desk-notes">Notes</label><span id="desk-notes-count"></span></div><textarea id="desk-notes" maxlength="4000" placeholder="Ideas, a plan, the details you want to remember…"></textarea></section>
 <section class="desk-section desk-files"><div class="desk-field-heading"><h3>Files & links</h3><button type="button" id="desk-add-link" class="desk-text-button">＋ Add link</button></div><ul id="desk-links"></ul><p id="desk-links-empty" class="desk-hint">Keep your brief, document, or project one click away.</p><div id="desk-link-form" hidden><label for="desk-link-label">Link name</label><input id="desk-link-label" maxlength="80" placeholder="Project brief"><label for="desk-link-url">Web address</label><input id="desk-link-url" type="url" maxlength="2048" placeholder="https://…"><p id="desk-link-error" role="status"></p><div><button type="button" id="desk-link-save" class="desk-secondary">Add to task</button><button type="button" id="desk-link-cancel" class="desk-text-button">Cancel</button></div></div></section>
 <section class="desk-section desk-result"><div class="desk-field-heading"><label for="desk-result">The result</label><span id="desk-result-count"></span></div><p class="desk-hint">The finished thought, decision, or next step.</p><textarea id="desk-result" maxlength="8000" placeholder="Leave something useful for your future self…"></textarea></section></form>
 <div id="desk-notice" class="desk-notice" hidden><p id="desk-error" role="alert"></p><div><button type="button" id="desk-retry" class="desk-secondary">Try again</button><button type="button" id="desk-reload" class="desk-secondary">Reload saved work</button><button type="button" id="desk-rescue" class="desk-text-button">Download draft</button></div></div>
 <div id="desk-confirm" class="desk-confirm" hidden><p id="desk-confirm-message"></p><div><button type="button" id="desk-confirm-yes" class="desk-primary">Continue</button><button type="button" id="desk-confirm-no" class="desk-secondary">Keep editing</button></div></div>
 </main></div>
 <section id="desk-computer" class="desk-computer" hidden><div class="desk-computer-bar"><p id="desk-computer-status" role="status" aria-live="polite"></p><button type="button" id="desk-computer-return" class="desk-secondary">Return to office</button></div>
 <div id="desk-computer-notice" class="desk-notice desk-computer-notice" hidden><p id="desk-computer-message" role="alert"></p><div><a id="desk-computer-signin" class="desk-primary" target="_blank" rel="noopener noreferrer">Sign in to Computer <span aria-hidden="true">↗</span></a><button type="button" id="desk-computer-continue" class="desk-primary">Continue</button><button type="button" id="desk-computer-keep" class="desk-primary">Keep working</button><button type="button" id="desk-computer-try" class="desk-secondary">Try again</button><button type="button" id="desk-computer-leave" class="desk-secondary">Leave without confirmation</button><a id="desk-computer-open" class="desk-secondary" target="_blank" rel="noopener noreferrer">Open Computer separately <span aria-hidden="true">↗</span></a><button type="button" id="desk-computer-tasks" class="desk-text-button">Back to Tasks</button></div></div>
 <div id="desk-computer-mount" class="desk-computer-mount"></div></section>
 <footer id="desk-footer" class="desk-footer"><p id="desk-save-status" tabindex="-1" role="status" aria-live="polite">Ready when you are</p><div><button type="button" id="desk-export" class="desk-text-button">Download</button><button type="button" id="desk-save" class="desk-secondary">Save</button><button type="button" id="desk-finish" class="desk-primary">Mark complete <span aria-hidden="true">✓</span></button></div></footer>`;
 document.body.append(dialog);
 const $=id=>dialog.querySelector(`#desk-${id}`),listen=(id,fn)=>$(id).addEventListener('click',fn,{signal});
 let sceneTask=null;const TITLE_HINT=$('title').placeholder,NOTES_HINT=$('notes').placeholder,SCENE_HINT='Three lines: who is there, where they are, and what happens next.';
 let disposed=false,timer=null,renderedTask=null,listKey='',linkKey='',confirmAction=null,returnFocus=null,lastError=null,view='tasks',departing=false,departTarget=null,heldTarget=null,session=0;
 function fitTitle(){if($('editor').hidden)return;$('title').style.height='0px';$('title').style.height=`${$('title').scrollHeight}px`;}
 window.addEventListener('resize',fitTitle,{signal});
 const model=createDeskModel({account:()=>getMultiplayer()?.identity?.id??null,request:async(action,data)=>{
  const mp=getMultiplayer();if(!mp?.connected)throw new Error('office_visit_required');
  return mp.officeDeskRequest(action,data);
 },onChange:render});
 function schedule(){clearTimeout(timer);const s=model.state;if(dialog.open&&view==='tasks'&&s.dirty&&!s.busy&&!s.error&&s.task?.title.trim())timer=setTimeout(()=>void model.save(),1200);}
 function render(){
  if(disposed)return;const s=model.state,t=s.task,busy=s.busy;
  $('loading').hidden=s.status!=='loading';$('empty').hidden=Boolean(t)||s.status==='loading'||Boolean(s.error);$('editor').hidden=!t;$('editor').inert=s.status==='removing';$('editor').setAttribute('aria-busy',String(s.status==='removing'));
  $('new').disabled=busy;$('start').disabled=busy;$('scene').disabled=busy;$('count').textContent=s.desk.tasks.length;
  $('save').disabled=busy||!t||!s.dirty||s.error==='desk_conflict';$('finish').disabled=busy||!t||!t.title.trim()||s.error==='desk_conflict';$('delete').disabled=busy;
  $('export').disabled=!t;$('finish').textContent=t?.status==='done'?'Reopen task':'Mark complete ✓';
  $('save-status').dataset.state=s.error?'error':s.status;
  $('save-status').textContent=s.error?'Not saved · your draft is kept here':s.status==='removing'?'Removing task…':s.status==='saving'?'Saving…':s.status==='loading'?'Opening your desk…':s.dirty?'Unsaved changes':s.status==='new'?'Start with a title':s.desk.updatedAt?'All changes saved':'Ready when you are';
  $('notice').hidden=!s.error;$('error').textContent=messages[s.error]??'Your desk couldn’t connect. Your draft is kept here. Try again.';
  $('reload').hidden=s.error!=='desk_conflict';$('retry').hidden=s.error==='desk_conflict';$('rescue').hidden=!t;
  if(t){
   const switched=renderedTask!==t.id;$('notes').placeholder=t.id===sceneTask?SCENE_HINT:NOTES_HINT;$('title').placeholder=t.id===sceneTask?'Scene idea':TITLE_HINT;
   for(const field of ['title','notes','result'])if(switched||document.activeElement!==$(field))$(field).value=t[field];
   renderedTask=t.id;$('task-state').textContent=t.status==='done'?'COMPLETED':'IN PROGRESS';$('task-state').dataset.complete=String(t.status==='done');
   $('notes-count').textContent=`${t.notes.length.toLocaleString()} / 4,000`;$('result-count').textContent=`${t.result.length.toLocaleString()} / 8,000`;
   const nextLinks=JSON.stringify([t.id,t.links]);if(nextLinks!==linkKey){linkKey=nextLinks;$('links').replaceChildren();for(const [i,link]of t.links.entries()){
    const li=node('li'),a=node('a',link.label),remove=node('button','×','desk-icon-button');a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';a.title=link.url;remove.type='button';remove.setAttribute('aria-label',`Remove ${link.label}`);remove.addEventListener('click',()=>model.edit({links:model.state.task.links.filter((_,j)=>i!==j)}),{signal});li.append(node('span','↗','desk-link-mark'),a,remove);$('links').append(li);
   }}
   $('links-empty').hidden=t.links.length>0;$('add-link').disabled=t.links.length>=DESK_LIMITS.links;
  }else{renderedTask=null;for(const field of ['title','notes','result','link-label','link-url'])$(field).value='';$('links').replaceChildren();linkKey='';}
  const nextList=JSON.stringify([s.desk.tasks.map(t=>[t.id,t.title,t.status]),t?.id,t?.title,busy]);if(nextList!==listKey){listKey=nextList;$('tasks').replaceChildren();
   const items=[...s.desk.tasks];if(t&&!items.some(x=>x.id===t.id))items.unshift(t);
   for(const item of items){const b=node('button',null,'desk-task');b.type='button';b.disabled=busy;b.setAttribute('aria-current',String(item.id===t?.id));b.append(node('span',item.status==='done'?'✓':'○','desk-task-symbol'),node('span',item.id===t?.id?(t.title||'Untitled task'):item.title));b.addEventListener('click',async()=>{clearTimeout(timer);if(await model.select(item.id)){$('link-form').hidden=true;hideConfirm();$('title').focus();}}, {signal});$('tasks').append(b);}
  }
  fitTitle();
  if(s.error&&lastError!==s.error)$('notice').scrollIntoView({block:'nearest'});lastError=s.error;
  schedule();
 }
 function hideConfirm(){confirmAction=null;$('confirm').hidden=true;}
 function confirm(message,label,fn){clearTimeout(timer);$('confirm-message').textContent=message;$('confirm-yes').textContent=label;confirmAction=fn;$('confirm').hidden=false;$('confirm-no').focus();}
 function download(){const t=model.state.task;if(!t)return;const lines=[`# ${t.title||'Untitled task'}`,'',`Status: ${t.status==='done'?'Completed':'In progress'}`,'','## Notes',t.notes,'','## Files & links',...t.links.map(l=>`${l.label}: ${l.url}`),'','## Result',t.result,''];const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));const a=node('a');a.href=url;a.download=(t.title.replace(/[^a-z0-9_-]+/gi,'-').slice(0,70)||'desk-task')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function close(){clearTimeout(timer);hideConfirm();session++;computer?.destroy();setView('tasks');dialog.close();returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});onClose();}
 async function requestClose(){clearTimeout(timer);const s=model.state;if(s.busy){confirm('A change is in progress. Wait for it to finish before closing your desk.','Stay at desk',hideConfirm);return;}if(s.dirty&&!await model.save()){confirm('This draft isn’t saved yet. Keep editing, or close the desk and keep it here until you return.','Close and keep draft',close);return;}close();}
 // Tasks and Computer (#486). One frame owner; Computer keeps its own sign-in, account, documents and saves.
 const computer=computerSettings?createComputerFrame({config:computerSettings,mount:$('computer-mount'),onChange:renderComputer,onRequestClose:()=>void leaveComputer('office')}):null;
 if(computer){$('views').hidden=false;$('computer-signin').href=computerSettings.signInURL;$('computer-open').href=computerSettings.openURL;
  for(const [panel,tab] of [['body','view-tasks'],['computer','view-computer']]){$(panel).setAttribute('role','tabpanel');$(panel).setAttribute('aria-labelledby',`desk-${tab}`);}}
 const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
 function setView(next){
  view=next;dialog.dataset.view=next;$('body').hidden=next!=='tasks';$('footer').hidden=next!=='tasks';$('computer').hidden=next!=='computer';
  for(const [id,name] of [['view-tasks','tasks'],['view-computer','computer']]){$(id).setAttribute('aria-selected',String(view===name));$(id).tabIndex=view===name?0:-1;}
  $('scope-label').textContent=next==='computer'?'Separate Computer sign-in':'Private to you';
  if(next==='computer')$('computer-receipt').textContent='';
  renderComputer();
 }
 function renderComputer(){
  if(disposed||!computer)return;const c=computer.state,failed=c.state==='failed',signin=c.state==='signin',held=['attention','unconfirmed'].includes(c.state);
  dialog.dataset.computer=c.state;
  text('computer-status',c.state==='usable'?computerSync[c.sync]:computerStatus[c.state]??'');
  $('computer-notice').hidden=!(failed||signin||held);
  text('computer-message',signin?'Sign in to TypeSafe Computer in a new tab, then continue here. River Oaks never shares your sign-in with Computer.':failed?`${computerFailures[c.code]??computerFailures.unavailable} Your tasks are still here.`:c.state==='attention'?'TypeSafe Computer needs your decision before you leave.':held?'TypeSafe Computer didn’t confirm your saves. Changes it hasn’t saved may be lost if you leave now.':'');
  $('computer-signin').hidden=!signin;$('computer-continue').hidden=!(signin||failed);$('computer-continue').textContent=signin?'Continue':'Try again';
  $('computer-keep').hidden=$('computer-try').hidden=$('computer-leave').hidden=!held;$('computer-open').hidden=!failed;$('computer-tasks').hidden=!(failed||signin);
  $('computer-mount').hidden=!c.mounted;if(computer.frame)computer.frame.inert=c.state==='closing';$('view-tasks').disabled=$('view-computer').disabled=departing||c.state==='closing';
 }
 async function showComputer(){
  if(!computer||view==='computer'||departing||disposed)return;clearTimeout(timer);hideConfirm();const s=model.state,token=session;
  if(s.busy){confirm('A change is in progress. Wait for it to finish before opening Computer.','Stay on Tasks',hideConfirm);return;}
  if(s.dirty){
   const saved=await model.save();
   // The desk may have closed, reopened or moved on while the save was in flight.
   if(token!==session||view!=='tasks'||!dialog.open||disposed)return;
   if(!saved){confirm('This draft isn’t saved yet. Keep editing, or open Computer and keep the draft here until you come back.','Open Computer and keep draft',enterComputer);return;}
  }
  enterComputer();
 }
 // The task model is untouched: its draft, retry operation and conflict state wait here for Tasks.
 function enterComputer(){if(!dialog.open||disposed||view!=='tasks'||model.state.busy)return;clearTimeout(timer);hideConfirm();$('link-form').hidden=true;setView('computer');computer.open();$('view-computer').focus();}
 function finishDeparture(target){heldTarget=null;if(target==='office'){close();return;}setView('tasks');render();$('view-tasks').focus();}
 // Normal departure asks Computer to resolve its own saves; the frame stays until it answers.
 async function leaveComputer(target){
  if(!computer||view!=='computer')return;departTarget=target==='office'||departTarget==='office'?'office':target;
  if(departing)return;departing=true;renderComputer();const result=await computer.depart();departing=false;const to=departTarget;departTarget=null;
  if(disposed||view!=='computer')return;
  // Destroyed here means Computer reported sign-in or an error mid-close: there is nothing left to decide.
  if(result.outcome==='ready'||result.outcome==='destroyed'){$('computer-receipt').textContent=to==='tasks'?computerReceipts[result.persistence]??'':'';finishDeparture(to);return;}
  if(result.outcome==='cancelled'){heldTarget=null;renderComputer();computer.frame?.focus();return;}
  heldTarget=to;renderComputer();$('computer-keep').focus();
 }
 function keepWorking(){heldTarget=null;computer.resume();computer.frame?.focus();}
 for(const field of ['title','notes','result'])$(field).addEventListener('input',()=>{
  if(field==='title')$(field).value=$(field).value.replace(/[\r\n]/g,' ');
  const values={[field]:$(field).value},t=model.state.task;
  if(field==='notes'&&t?.id===sceneTask&&!t.title.trim()){values.title='Scene idea';$('title').value='Scene idea';}
  model.edit(values);
 },{signal});
 $('title').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('notes').focus();}},{signal});
 async function newTask(){if(await model.create()){hideConfirm();$('link-form').hidden=true;$('title').focus();}}
 // An optional prompt (#363): a private task with a three-line hint, named Scene idea once the
 // visitor writes, so a click alone saves nothing. Nothing is shared or published.
 async function sceneIdea(){if(!await model.create())return;sceneTask=model.state.task?.id??null;hideConfirm();$('link-form').hidden=true;render();$('notes').focus();}
 listen('scene',()=>void sceneIdea());
 listen('new',newTask);listen('start',newTask);listen('save',()=>void model.save());listen('finish',()=>void model.finish());listen('close',()=>void(view==='computer'?leaveComputer('office'):requestClose()));
 listen('view-computer',()=>void showComputer());listen('view-tasks',()=>void leaveComputer('tasks'));listen('computer-return',()=>void leaveComputer('office'));
 listen('computer-continue',()=>{computer.open();$('view-computer').focus();});listen('computer-tasks',()=>{computer.destroy();finishDeparture('tasks');});
 listen('computer-keep',keepWorking);listen('computer-try',()=>{const target=heldTarget??'office';heldTarget=null;void leaveComputer(target);});listen('computer-leave',()=>{const target=heldTarget??'office';computer.destroy();finishDeparture(target);});
 $('views').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();(document.activeElement===$('view-tasks')?$('view-computer'):$('view-tasks')).focus();},{signal});
 listen('retry',()=>void model.retry());listen('reload',()=>confirm('Reloading will replace this draft with the saved version. Download your draft first if you want to keep it.','Reload saved work',async()=>{hideConfirm();await model.load({discard:true});}));
 listen('delete',()=>confirm('Remove this task and its saved notes, links, and result? Download a copy first if you need it.','Remove task',async()=>{hideConfirm();$('save-status').focus();if(await model.remove())(model.state.task?$('title'):$('start')).focus();}));
 listen('confirm-no',()=>{hideConfirm();$('title').focus();schedule();});listen('confirm-yes',()=>void confirmAction?.());listen('export',download);listen('rescue',download);
 listen('add-link',()=>{$('link-form').hidden=false;$('link-label').value='';$('link-url').value='';$('link-error').textContent='';$('link-label').focus();});listen('link-cancel',()=>{$('link-form').hidden=true;$('add-link').focus();});
 listen('link-save',()=>{const label=$('link-label').value.trim(),url=$('link-url').value.trim();if(!label||!safeDeskURL(url)){$('link-error').textContent='Add a name and a complete http or https link.';return;}model.edit({links:[...model.state.task.links,{label,url}]});$('link-form').hidden=true;$('add-link').focus();});
 $('editor').addEventListener('submit',e=>{e.preventDefault();void model.save();},{signal});
 // Escape inside Computer belongs to Computer: it closes its own menus and dialogs, then sends request-close.
 dialog.addEventListener('cancel',e=>{e.preventDefault();if(view!=='computer'){void requestClose();return;}if(document.activeElement!==computer.frame)void leaveComputer('office');},{signal});
 // A browser can close the modal without a cancel event. Never leave a live Computer behind a closed desk.
 // close() switches to Tasks first, so this sees only closes the desk did not make.
 dialog.addEventListener('close',()=>{
  if(disposed||!computer||view!=='computer')return;
  if(computer.state.mounted)try{dialog.showModal();void leaveComputer('office');return;}catch{}
  computer.destroy();setView('tasks');returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});onClose();
 },{signal});
 dialog.addEventListener('keydown',e=>{if(view==='tasks'&&(e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();void model.save();}},{signal});
 window.addEventListener('beforeunload',e=>{if(model.state.dirty){e.preventDefault();e.returnValue='';}},{signal});
 return {get active(){return dialog.open;},async open(){
  returnFocus=document.activeElement;hideConfirm();session++;computer?.destroy();$('computer-receipt').textContent='';setView('tasks');
  dialog.showModal();$('close').focus();
  if(!model.state.dirty)await model.load();else render();
 },
 // Access loss (leaving, revocation, disconnect, an account change or world teardown) removes Computer at once,
 // without waiting for it. A change Computer's service already accepted is not undone by this.
 suspend(){clearTimeout(timer);computer?.destroy();if(dialog.open)close();},reset(){clearTimeout(timer);computer?.destroy();$('computer-receipt').textContent='';if(dialog.open)close();model.reset();$('link-form').hidden=true;},dispose(){computer?.destroy();disposed=true;clearTimeout(timer);lifetime.abort();dialog.remove();model.reset();}};
}
