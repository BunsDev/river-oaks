import { createDeskModel } from './office-desk-model.js';
import { DESK_LIMITS, safeDeskURL } from './office-desk-contract.js';
import './office-desk.css';
const messages={desk_conflict:'This task changed in another tab. Download your draft, then reload saved work to continue.',desk_limit:'Your desk is full. Download and remove a finished task to make room.',invalid_desk:'Add a task title and check the field limits and file links.',office_visit_required:'Return to the office to save. Your unsaved work is still here.',desk_rate_limited:'You’re saving quickly. Wait a moment, then try again.'};
const node=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;};
export function createOfficeDeskUI({getMultiplayer,getWorkspace=()=>null,onClose=()=>{}}){
 const lifetime=new AbortController(),signal=lifetime.signal;
 const dialog=node('dialog',null,'office-desk');dialog.id='office-desk';dialog.setAttribute('aria-labelledby','desk-heading');
 // This template is static. Every user-authored value is assigned through value/textContent.
 dialog.innerHTML=`<div class="desk-topbar"><div class="desk-brand"><span class="desk-monogram" aria-hidden="true">RO</span><div><p class="desk-eyebrow">RIVER OAKS · OFFICE</p><h2 id="desk-heading">Your desk</h2></div></div><div class="desk-top-actions"><span id="desk-scope-label" class="desk-private">Private to you</span><button type="button" id="desk-close" class="desk-icon-button" aria-label="Close desk">×</button></div></div>
 <nav class="desk-scopes" aria-label="Task scope"><button type="button" id="desk-scope-private" aria-pressed="true">My tasks</button><button type="button" id="desk-scope-shared" aria-pressed="false">Office tasks</button></nav>
 <div class="desk-body"><aside class="desk-sidebar" aria-label="Your tasks"><div class="desk-sidebar-heading"><h3 id="desk-list-heading">My tasks</h3><span id="desk-count">0</span></div><button type="button" id="desk-new" class="desk-new"><span aria-hidden="true">＋</span> New task</button><nav id="desk-tasks" aria-label="Tasks"></nav><p class="desk-sidebar-note">A little space for<br>your next good idea.</p></aside>
 <main class="desk-work"><div id="desk-empty" class="desk-empty"><span class="desk-empty-mark" aria-hidden="true">✧</span><p class="desk-eyebrow">MAKE ROOM FOR GOOD WORK</p><h3>What’s on your mind?</h3><p>Start with a task. Keep your notes and file links together, then save something worth coming back to.</p><button type="button" id="desk-start" class="desk-primary">Start your first task <span aria-hidden="true">↗</span></button><small id="desk-scope-help">Your work stays private, even when you share an office.</small></div>
 <div id="desk-loading" class="desk-loading" role="status" hidden>Opening your desk…</div>
 <form id="desk-editor" class="desk-editor" hidden><div class="desk-document-top"><span id="desk-task-state" class="desk-task-state">IN PROGRESS</span><button type="button" id="desk-delete" class="desk-text-button">Remove task</button></div>
 <label class="desk-sr-only" for="desk-title">Task title</label><textarea id="desk-title" class="desk-title" rows="1" maxlength="120" placeholder="Give this task a name" autocomplete="off" required></textarea>
 <section class="desk-section"><div class="desk-field-heading"><label for="desk-notes">Notes</label><span id="desk-notes-count"></span></div><textarea id="desk-notes" maxlength="4000" placeholder="Ideas, a plan, the details you want to remember…"></textarea></section>
 <section class="desk-section desk-files"><div class="desk-field-heading"><h3>Files & links</h3><button type="button" id="desk-add-link" class="desk-text-button">＋ Add link</button></div><ul id="desk-links"></ul><p id="desk-links-empty" class="desk-hint">Keep your brief, document, or project one click away.</p><div id="desk-link-form" hidden><label for="desk-link-label">Link name</label><input id="desk-link-label" maxlength="80" placeholder="Project brief"><label for="desk-link-url">Web address</label><input id="desk-link-url" type="url" maxlength="2048" placeholder="https://…"><p id="desk-link-error" role="status"></p><div><button type="button" id="desk-link-save" class="desk-secondary">Add to task</button><button type="button" id="desk-link-cancel" class="desk-text-button">Cancel</button></div></div></section>
 <section class="desk-section desk-result"><div class="desk-field-heading"><label for="desk-result">The result</label><span id="desk-result-count"></span></div><p class="desk-hint">The finished thought, decision, or next step.</p><textarea id="desk-result" maxlength="8000" placeholder="Leave something useful for your future self…"></textarea></section></form>
 <div id="desk-notice" class="desk-notice" hidden><p id="desk-error" role="alert"></p><div><button type="button" id="desk-retry" class="desk-secondary">Try again</button><button type="button" id="desk-reload" class="desk-secondary">Reload saved work</button><button type="button" id="desk-rescue" class="desk-text-button">Download draft</button></div></div>
 <div id="desk-confirm" class="desk-confirm" hidden><p id="desk-confirm-message"></p><div><button type="button" id="desk-confirm-yes" class="desk-primary">Continue</button><button type="button" id="desk-confirm-no" class="desk-secondary">Keep editing</button></div></div>
 </main></div><footer class="desk-footer"><p id="desk-save-status" tabindex="-1" role="status" aria-live="polite">Ready when you are</p><div><button type="button" id="desk-export" class="desk-text-button">Download</button><button type="button" id="desk-save" class="desk-secondary">Save</button><button type="button" id="desk-finish" class="desk-primary">Mark complete <span aria-hidden="true">✓</span></button></div></footer>`;
 document.body.append(dialog);
 const $=id=>dialog.querySelector(`#desk-${id}`),listen=(id,fn)=>$(id).addEventListener('click',fn,{signal});
 let disposed=false,timer=null,renderedTask=null,listKey='',linkKey='',confirmAction=null,returnFocus=null,lastError=null,scope='private',deskWorkspace=null;
 function fitTitle(){if($('editor').hidden)return;$('title').style.height='0px';$('title').style.height=`${$('title').scrollHeight}px`;}
 window.addEventListener('resize',fitTitle,{signal});
 const sharedAvailable=()=>/^office-[a-f0-9]{64}$/.test(getWorkspace()??'');
 const model=createDeskModel({account:()=>getMultiplayer()?.identity?.id??null,scope:()=>scope==='shared'?deskWorkspace:'private',request:async(action,data)=>{
  const mp=getMultiplayer();if(!mp?.connected)throw new Error('office_visit_required');
  const workspaceId=deskWorkspace,shared=scope==='shared',account=mp.identity?.id;
  if(shared&&(!sharedAvailable()||workspaceId!==getWorkspace()))throw new Error('office_visit_required');
  try{return await mp.officeDeskRequest(shared?`workspace/${action}`:action,shared?{...data,workspaceId}:data);}
  catch(error){if(shared&&scope==='shared'&&getWorkspace()===workspaceId&&getMultiplayer()===mp&&mp.identity?.id===account&&['office_access_denied','office_visit_required'].includes(error.message))revokeShared();throw error;}
 },onChange:render});
 function schedule(){clearTimeout(timer);const s=model.state;if(dialog.open&&s.dirty&&!s.busy&&!s.error&&s.task?.title.trim())timer=setTimeout(()=>void model.save(),1200);}
 function render(){
  if(disposed)return;const s=model.state,t=s.task,busy=s.busy,shared=scope==='shared';
  $('scope-private').setAttribute('aria-pressed',String(!shared));$('scope-shared').setAttribute('aria-pressed',String(shared));
  $('scope-private').disabled=busy;$('scope-shared').disabled=busy||!sharedAvailable();
  $('scope-shared').title=sharedAvailable()?'Shared with accepted collaborators':'Office tasks are available in personal workspaces';
  $('scope-label').textContent=shared?'Shared with office collaborators':'Private to you';$('list-heading').textContent=shared?'Office tasks':'My tasks';
  $('scope-help').textContent=shared?'These tasks are visible to this office’s accepted collaborators.':'Your work stays private, even when you share an office.';
  $('loading').hidden=s.status!=='loading';$('empty').hidden=Boolean(t)||s.status==='loading'||Boolean(s.error);$('editor').hidden=!t;$('editor').inert=s.status==='removing';$('editor').setAttribute('aria-busy',String(s.status==='removing'));
  $('new').disabled=busy;$('start').disabled=busy;$('count').textContent=s.desk.tasks.length;
  $('save').disabled=busy||!t||!s.dirty||s.error==='desk_conflict';$('finish').disabled=busy||!t||!t.title.trim()||s.error==='desk_conflict';$('delete').disabled=busy;
  $('export').disabled=!t;$('finish').textContent=t?.status==='done'?'Reopen task':'Mark complete ✓';
  $('save-status').dataset.state=s.error?'error':s.status;
  $('save-status').textContent=s.error?'Not saved · your draft is kept here':s.status==='removing'?'Removing task…':s.status==='saving'?'Saving…':s.status==='loading'?'Opening your desk…':s.dirty?'Unsaved changes':s.status==='new'?'Start with a title':s.desk.updatedAt?'All changes saved':'Ready when you are';
  $('notice').hidden=!s.error;$('error').textContent=messages[s.error]??'Your desk couldn’t connect. Your draft is kept here. Try again.';
  $('reload').hidden=s.error!=='desk_conflict';$('retry').hidden=s.error==='desk_conflict';$('rescue').hidden=!t;
  if(t){
   const switched=renderedTask!==t.id;
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
 function confirmOfficeLeave(proceed){
  const s=model.state;if(scope!=='shared'||!s.dirty&&!s.busy&&!s.retrying)return false;
  clearTimeout(timer);if(!dialog.open){returnFocus=document.activeElement;dialog.showModal();}
  if(s.busy)confirm('A change is in progress. Wait for it to finish before leaving the office.','Stay at desk',hideConfirm);
  else confirm('Leaving this office will discard your unsaved shared draft. Download it first, or keep editing.','Discard draft and leave',()=>{revokeShared();proceed();});
  return true;
 }
 function revokeShared(){if(scope!=='shared')return;clearTimeout(timer);if(dialog.open)close();scope='private';model.reset();$('link-form').hidden=true;}
 async function switchScope(next){
  if(next===scope||model.state.busy||next==='shared'&&!sharedAvailable())return;
  clearTimeout(timer);
  const change=async()=>{hideConfirm();scope=next;deskWorkspace=getWorkspace();renderedTask=null;listKey='';linkKey='';$('link-form').hidden=true;model.reset();await model.load();};
  if(model.state.dirty||model.state.retrying){if(!await model.save()){confirm('This draft is not saved. Download it before switching, or keep editing.','Discard draft and switch',()=>void change());return;}}
  await change();
 }
 function hideConfirm(){confirmAction=null;$('confirm').hidden=true;}
 function confirm(message,label,fn){clearTimeout(timer);$('confirm-message').textContent=message;$('confirm-yes').textContent=label;confirmAction=fn;$('confirm').hidden=false;$('confirm-no').focus();}
 function download(){const t=model.state.task;if(!t)return;const lines=[`# ${t.title||'Untitled task'}`,'',`Status: ${t.status==='done'?'Completed':'In progress'}`,'','## Notes',t.notes,'','## Files & links',...t.links.map(l=>`${l.label}: ${l.url}`),'','## Result',t.result,''];const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));const a=node('a');a.href=url;a.download=(t.title.replace(/[^a-z0-9_-]+/gi,'-').slice(0,70)||'desk-task')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function close(){clearTimeout(timer);hideConfirm();dialog.close();returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});onClose();}
 async function requestClose(){clearTimeout(timer);const s=model.state;if(s.busy){confirm('A change is in progress. Wait for it to finish before closing your desk.','Stay at desk',hideConfirm);return;}if(s.dirty&&!await model.save()){confirm('This draft isn’t saved yet. Keep editing, or close the desk and keep it here until you return.','Close and keep draft',close);return;}close();}
 for(const field of ['title','notes','result'])$(field).addEventListener('input',()=>{if(field==='title')$(field).value=$(field).value.replace(/[\r\n]/g,' ');model.edit({[field]:$(field).value});},{signal});
 $('title').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('notes').focus();}},{signal});
 async function newTask(){if(await model.create()){hideConfirm();$('link-form').hidden=true;$('title').focus();}}
 listen('new',newTask);listen('start',newTask);listen('save',()=>void model.save());listen('finish',()=>void model.finish());listen('close',()=>void requestClose());
 listen('scope-private',()=>void switchScope('private'));listen('scope-shared',()=>void switchScope('shared'));
 listen('retry',()=>void model.retry());listen('reload',()=>confirm('Reloading will replace this draft with the saved version. Download your draft first if you want to keep it.','Reload saved work',async()=>{hideConfirm();await model.load({discard:true});}));
 listen('delete',()=>confirm('Remove this task and its saved notes, links, and result? Download a copy first if you need it.','Remove task',async()=>{hideConfirm();$('save-status').focus();if(await model.remove())(model.state.task?$('title'):$('start')).focus();}));
 listen('confirm-no',()=>{hideConfirm();$('title').focus();schedule();});listen('confirm-yes',()=>void confirmAction?.());listen('export',download);listen('rescue',download);
 listen('add-link',()=>{$('link-form').hidden=false;$('link-label').value='';$('link-url').value='';$('link-error').textContent='';$('link-label').focus();});listen('link-cancel',()=>{$('link-form').hidden=true;$('add-link').focus();});
 listen('link-save',()=>{const label=$('link-label').value.trim(),url=$('link-url').value.trim();if(!label||!safeDeskURL(url)){$('link-error').textContent='Add a name and a complete http or https link.';return;}model.edit({links:[...model.state.task.links,{label,url}]});$('link-form').hidden=true;$('add-link').focus();});
 $('editor').addEventListener('submit',e=>{e.preventDefault();void model.save();},{signal});
 dialog.addEventListener('cancel',e=>{e.preventDefault();void requestClose();},{signal});
 dialog.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();void model.save();}},{signal});
 window.addEventListener('beforeunload',e=>{if(model.state.dirty){e.preventDefault();e.returnValue='';}},{signal});
 return {confirmOfficeLeave,get active(){return dialog.open;},async open(){
  returnFocus=document.activeElement;hideConfirm();
  if(scope==='shared'&&deskWorkspace!==getWorkspace()){scope='private';model.reset();}
  dialog.showModal();$('close').focus();
  if(scope==='shared')await model.load({preserveDraft:true});else if(!model.state.dirty)await model.load();else render();
 },suspend(){clearTimeout(timer);if(dialog.open)close();},reset(){clearTimeout(timer);if(dialog.open)close();scope='private';model.reset();$('link-form').hidden=true;},revokeShared,dispose(){disposed=true;clearTimeout(timer);lifetime.abort();dialog.remove();model.reset();}};
}
