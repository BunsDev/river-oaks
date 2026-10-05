import { DEFAULT_WORLD_ID, validateWorldId } from './world-contract.js';
import { REGION_DRAFT_STORAGE_KEY } from './region-draft.js';
import './world-portal.css';

const element=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
export function worldVisitUrl(id,base=location.href) {
  validateWorldId(id);
  const url=new URL('/',base);
  if(id!==DEFAULT_WORLD_ID)url.searchParams.set('world',id);
  url.searchParams.set('play','multiplayer');
  return url.href;
}

export function createWorldPortal({host,getCanPublish=()=>false}={}) {
  const section=element('section',null,'world-portal');section.setAttribute('aria-label','Worlds');
  const heading=element('h3','Worlds');
  const intro=element('p','Visit a shared space. Each world keeps its own residents, creations, and chat. Jevica can publish a region and prepare private revision drafts.','quiet-note');
  const status=element('p','Loading worlds…','world-portal-status');status.setAttribute('role','status');
  const list=element('ul',null,'world-portal-list');
  const form=element('form',null,'world-portal-form');form.hidden=true;
  const createTitle=element('h4','Publish a world');
  const titleLabel=element('label','World name');const title=element('input');title.name='title';title.maxLength=64;title.required=true;titleLabel.append(title);
  const idLabel=element('label','World ID');const id=element('input');id.name='id';id.maxLength=48;id.pattern='[a-z0-9]+(-[a-z0-9]+)*';id.placeholder='moon-garden';id.required=true;idLabel.append(id);
  const descriptionLabel=element('label','Description');const description=element('textarea');description.name='description';description.maxLength=280;description.rows=2;descriptionLabel.append(description);
  const regionLabel=element('label','Region package (optional)');const region=element('input');region.name='region';region.type='file';region.accept='.json,application/json';regionLabel.append(region);
  const example=element('a','Download a sample region package','world-portal-example');example.href='/data/sample-region.json';example.download='sample-region.json';
  const design=element('button','Design a region','world-portal-design');design.type='button';
  const regionSource=element('p','','world-portal-region-source');regionSource.setAttribute('role','status');
  const publish=element('button','Publish world');publish.type='submit';
  form.append(createTitle,titleLabel,idLabel,descriptionLabel,regionLabel,example,design,regionSource,publish);
  const revisionPanel=element('section',null,'world-portal-revision');revisionPanel.hidden=true;
  const revisionTitle=element('h4'),revisionNote=element('p','Save the draft before applying it. Applying disconnects visitors so they can reload the revised region; active NPC wishes reset. Existing creations must fit the new layout.');
  const revisionStatus=element('p',null,'world-portal-revision-status');revisionStatus.setAttribute('role','status');
  const saveRevision=element('button','Save revision draft');saveRevision.type='button';
  const applyRevision=element('button','Apply saved draft');applyRevision.type='button';applyRevision.disabled=true;
  const discardRevision=element('button','Discard revision draft');discardRevision.type='button';
  const versionLabel=element('label','Previous published version');versionLabel.hidden=true;
  const versionSelect=element('select');versionSelect.setAttribute('aria-label','Previous published version');versionLabel.append(versionSelect);
  const restoreVersion=element('button','Load version into editor');restoreVersion.type='button';restoreVersion.hidden=true;
  revisionPanel.append(revisionTitle,revisionNote,revisionStatus,saveRevision,applyRevision,discardRevision,versionLabel,restoreVersion);
  section.append(heading,intro,status,list,revisionPanel,form);host.prepend(section);
  let worlds=[],loaded=false,loading=null,lastAttempt=0,lastLoaded=0;
  let useDraft=false,revisionTarget=null;
  let editor=null,editorLoading=null;
  const parcelOwnerChoices=async()=>{
    const response=await fetch('/auth/session',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)return [];
    const session=await response.json();
    if(!session.authenticated||!session.canGrantWishes||typeof session.user?.id!=='string')return [];
    const choices=[{id:session.user.id,name:session.user.name??'Jevica'}];
    try{
      const contacts=await fetch(`/api/social/list?world=${encodeURIComponent(currentId())}`,{
        method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':session.csrfToken??''}});
      if(contacts.ok){
        const data=await contacts.json();
        for(const item of data.contacts??[])if(item.status==='accepted'&&typeof item.peer?.id==='string'&&typeof item.peer.name==='string')
          choices.push({id:item.peer.id,name:item.peer.name});
      }
    }catch{/* The owner can still leave a parcel unassigned or assign it to herself. */}
    return choices;
  };
  const ensureEditor=()=>editor?Promise.resolve(editor):editorLoading??=import('./region-editor.js')
    .then(({createRegionEditor})=>editor=createRegionEditor({getOwnerChoices:parcelOwnerChoices,onChange:()=>{
      if(revisionTarget){revisionStatus.textContent='Changes on this device are ready to save.';applyRevision.disabled=true;}
      else if(useDraft)regionSource.textContent='Your region draft is ready to publish.';
    }}))
    .catch(error=>{editorLoading=null;throw error;});
  const hasDraft=()=>{try{return Boolean(editor?.hasDraft()||localStorage.getItem(REGION_DRAFT_STORAGE_KEY));}catch{return Boolean(editor?.hasDraft());}};
  const updateRegionSource=()=>{
    design.textContent=hasDraft()?'Edit region draft':'Design a region';
    regionSource.textContent=region.files?.[0]?'The selected JSON file will be published.':useDraft?'Your region draft is ready to publish.'
      :hasDraft()?'A saved draft is available. Open it to use it.':'Leave this empty to use the River Oaks layout.';
  };
  region.addEventListener('change',()=>{if(region.files?.length)useDraft=false;updateRegionSource();});
  design.addEventListener('click',async()=>{
    try {
      revisionTarget=null;revisionPanel.hidden=true;
      const studio=await ensureEditor();
      if(region.files?.[0]){await studio.loadFile(region.files[0]);region.value='';}
      else studio.open();
      useDraft=true;updateRegionSource();
    } catch(error) {status.textContent=error.message||'Could not open the region editor.';}
  });
  const revisionKey=worldId=>`${REGION_DRAFT_STORAGE_KEY}:${worldId}`;
  const adminSession=async()=>{
    const session=await (await fetch('/auth/session',{credentials:'same-origin',cache:'no-store'})).json();
    if(!session.authenticated || session.canGrantWishes!==true)throw new Error('Only Jevica can edit a region draft.');
    return session;
  };
  const draftRequest=async(action,payload)=>{
    const session=await adminSession();
    const response=await fetch(`/api/world-draft/${action}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify(payload)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error==='stale'?'This world changed. Reload its published region before saving.'
      :result.error==='draft_conflict'?'A newer revision draft was saved elsewhere. Download your JSON before reloading it.'
        :result.error==='invalid_draft'?'The region draft is invalid. Check its layout.'
          :result.error==='incompatible_region'?'This layout conflicts with existing creations. Move or remove them before applying.':result.error??'Region draft is unavailable.');
    return result;
  };
  const editRevision=async world=>{
    try {
      const editable=await draftRequest('load',{id:world.id});
      const history=await draftRequest('history',{id:world.id});
      if(history.world.regionSha256!==editable.world.regionSha256)throw new Error('This world changed. Reload its published region before editing.');
      const studio=await ensureEditor(),key=revisionKey(world.id);
      revisionTarget={world:editable.world,key,draftVersion:editable.draft?.version??0};revisionTitle.textContent=`Revision draft for ${world.title}`;revisionPanel.hidden=false;
      versionSelect.replaceChildren(...history.versions.map(version=>{
        const option=element('option',`Version ${version.revision}`);option.value=String(version.revision);return option;
      }));
      versionLabel.hidden=restoreVersion.hidden=!history.versions.length;
      const local=studio.draftFor(key);
      const differs=Boolean(local&&editable.draft&&JSON.stringify(local)!==JSON.stringify(editable.draft.region));
      const openLocal=Boolean(local)&&(!differs||window.confirm('This device has a different local draft. Open it instead of the saved server draft?'));
      if(openLocal)studio.open(key);
      else studio.loadRegion(editable.draft?.region??editable.publishedRegion,key);
      applyRevision.disabled=!revisionTarget.draftVersion || differs && openLocal;
      revisionStatus.textContent=openLocal?'Local draft opened. Save it to sync across devices.'
        :editable.draft?'Saved server draft loaded.':'Published region copied into a private draft.';
    } catch(error) {status.textContent=error.message||'Could not load the region draft.';}
  };
  restoreVersion.addEventListener('click',async()=>{
    if(!revisionTarget || !window.confirm('Replace this device’s region draft with the selected published version?'))return;
    restoreVersion.disabled=true;
    try {
      const revision=Number(versionSelect.value);
      const result=await draftRequest('version',{id:revisionTarget.world.id,revision,
        baseRegionSha256:revisionTarget.world.regionSha256});
      editor.loadRegion(result.region,revisionTarget.key);
      applyRevision.disabled=true;
      revisionStatus.textContent=`Version ${revision} is in the editor. Save the draft, then apply it.`;
    } catch(error) {revisionStatus.textContent=error.message||'Could not load that version.';}
    finally {restoreVersion.disabled=false;}
  });
  saveRevision.addEventListener('click',async()=>{
    if(!revisionTarget)return;
    saveRevision.disabled=true;
    try {
      const result=await draftRequest('save',{id:revisionTarget.world.id,baseRegionSha256:revisionTarget.world.regionSha256,
        expectedDraftVersion:revisionTarget.draftVersion,region:editor?.getRegion()});
      revisionStatus.textContent=`Draft saved across devices. Published ${revisionTarget.world.title} is unchanged.`;
      status.textContent=`Revision draft saved for ${revisionTarget.world.title}.`;
      revisionTarget.draftVersion=result.draft.version;
      applyRevision.disabled=false;
    } catch(error) {revisionStatus.textContent=error.message||'Could not save the region draft.';}
    finally {saveRevision.disabled=false;}
  });
  applyRevision.addEventListener('click',async()=>{
    if(!revisionTarget?.draftVersion)return;
    applyRevision.disabled=true;
    try {
      const result=await draftRequest('apply',{id:revisionTarget.world.id,expectedDraftVersion:revisionTarget.draftVersion});
      worlds=worlds.map(world=>world.id===result.world.id?result.world:world);render();
      editor?.clearDraft(revisionTarget.key);
      revisionStatus.textContent=`${result.world.title} is live. Visitors are rejoining its revised layout.`;
      status.textContent=`Applied revision ${result.world.revision} to ${result.world.title}.`;
      revisionTarget=null;revisionPanel.hidden=true;
      if(currentId()===result.world.id && !window.__riverRegionReloadScheduled){
        window.__riverRegionReloadScheduled=true;setTimeout(()=>location.reload(),0);
      }
    } catch(error) {revisionStatus.textContent=error.message||'Could not apply the revision.';applyRevision.disabled=false;}
  });
  discardRevision.addEventListener('click',async()=>{
    if(!revisionTarget)return;
    discardRevision.disabled=true;
    try {
      await draftRequest('discard',{id:revisionTarget.world.id,expectedDraftVersion:revisionTarget.draftVersion});
      editor?.clearDraft(revisionTarget.key);revisionStatus.textContent='Revision draft discarded.';
      revisionTarget=null;revisionPanel.hidden=true;
    } catch(error) {revisionStatus.textContent=error.message||'Could not discard the revision draft.';}
    finally {discardRevision.disabled=false;}
  });
  const currentId=()=>{try{return validateWorldId(new URLSearchParams(location.search).get('world')??DEFAULT_WORLD_ID);}catch{return DEFAULT_WORLD_ID;}};
  const render=()=>{
    list.replaceChildren();
    for(const world of worlds) {
      const row=element('li');const link=element('a',world.title);link.href=worldVisitUrl(world.id);
      const visitors=Number.isSafeInteger(world.visitors)&&world.visitors>=0?world.visitors:0;
      const detail=element('small',`${world.id===currentId()?'Here now':world.description||'Shared world'} · ${visitors} ${visitors===1?'visitor':'visitors'} online`);
      row.append(link,detail);
      if(getCanPublish() && world.template==='region-v1') {
        const edit=element('button','Edit draft');edit.type='button';edit.setAttribute('aria-label',`Edit revision draft for ${world.title}`);
        edit.addEventListener('click',()=>editRevision(world));row.append(edit);
      }
      list.append(row);
    }
    const current=worlds.find(world=>world.id===currentId());
    if(current) {
      document.title=`${current.title} — ${current.template==='region-v1'?'Shared worlds':'River Oaks'}`;
      const view=document.querySelector('#view-name');if(view)view.textContent=current.title;
    }
    form.hidden=!getCanPublish();
  };
  function load() {
    if(loading)return loading;
    if(loaded&&(!section.checkVisibility()||Date.now()-lastLoaded<15000))return Promise.resolve();
    if(Date.now()-lastAttempt<5000)return Promise.resolve();
    lastAttempt=Date.now();
    loading=(async()=>{
      try {
        const response=await fetch('/api/worlds',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok || !response.headers.get('content-type')?.includes('application/json'))throw new Error('World directory unavailable.');
        const data=await response.json();
        if(!Array.isArray(data.worlds))throw new Error('World directory unavailable.');
        worlds=data.worlds;loaded=true;lastLoaded=Date.now();render();status.textContent=`${worlds.length} ${worlds.length===1?'world':'worlds'} to visit`;
      } catch {status.textContent='World directory unavailable right now.';}
    })().finally(()=>{loading=null;});
    return loading;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!getCanPublish())return;
    publish.disabled=true;status.textContent='Publishing world…';
    try {
      const session=await (await fetch('/auth/session',{credentials:'same-origin',cache:'no-store'})).json();
      if(!session.authenticated || session.canGrantWishes!==true)throw new Error('Only Jevica can publish a world.');
      const proposal={id:id.value.trim(),title:title.value.trim(),description:description.value.trim()};
      const file=region.files?.[0];
      if(file) {
        if(file.size>128*1024)throw new Error('Region package must be at most 128 KB.');
        try {proposal.region=JSON.parse(await file.text());}
        catch {throw new Error('Region package must be valid JSON.');}
      } else if(useDraft)proposal.region=editor?.getRegion();
      const response=await fetch('/api/worlds',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify(proposal)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error==='world_exists'?'That world ID is already in use.':result.error==='world_limit'?'The world directory is full.':result.error==='invalid_region'?'The region package is invalid. Check the sample format.':result.error??'World could not be published.');
      worlds=[...worlds,result.world];render();status.textContent=`${result.world.title} is published. Open it from the list.`;form.reset();useDraft=false;updateRegionSource();
    } catch(error) {status.textContent=error.message||'World could not be published.';}
    finally {publish.disabled=false;}
  });
  updateRegionSource();
  render();
  setInterval(()=>{if(document.visibilityState==='visible'&&section.checkVisibility())void load();},15000);
  return {element:section,load,refreshCapability:render};
}
