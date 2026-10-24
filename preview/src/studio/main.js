import { mountNeighborhoodPanel } from './neighborhood-panel.js';
import { createSpaceAssessmentRunner } from './space-assessment-runner.js';
import './studio.css';
import { createSpace, spaceTemplates, spaceAssessmentContext, SPACE_PROFILE_VERSION } from './space-templates.js';
import { isSpaceDocument, SPACE_KINDS, SPACE_FINISHES, SPACE_LIGHTING } from './space-document.js';
import { mountTemplatePicker } from './template-picker.js';
import { mountAgentChat } from './agent-chat.js';
import { mountDesignerPanel } from './designer-panel.js';
import { blankRegion } from '../region-draft.js';
import { createStudioDocument, parseRegion, MAX_REGION_BYTES, STORAGE_KEY } from './document.js';
import { createStudioViewport } from './viewport.js';
import { renderBuildingInteriorPanel } from './interior-panel.js';

export function startStudio(host) {
  host.innerHTML=`<header class="studio-header"><a class="studio-brand" href="/play" title="Return to the world">TypeSafe Place<span>World Studio</span></a><div class="studio-file-tools"><button id="studio-designer-open">World Designer</button><button id="studio-new">New region</button><button id="studio-templates">Space templates</button><button id="studio-neighborhood">Neighborhood</button><label class="studio-open">Open JSON<input id="studio-import" type="file" accept=".json,application/json"></label><button id="studio-export">Export JSON</button><button id="studio-save" class="studio-primary">Save on device</button></div><a class="studio-return" href="/play">Back to world ↗</a></header>
    <div class="studio-workspace"><aside class="studio-scene-panel" aria-label="Scene"><div class="studio-panel-title"><h1>Region</h1><span id="studio-count"></span></div><p class="studio-caption">A private draft · metres</p><div class="studio-palette" aria-label="Add to region"><button data-add="furnishing" aria-label="Add furnishing" hidden>+ Furnishing</button><button data-add="building" aria-label="Add building">▱ Building</button><button data-add="tree" aria-label="Add tree">♧ Tree</button><button data-add="place" aria-label="Add place">⌖ Place</button></div><h2>Scene objects</h2><div id="studio-items" class="studio-items"></div><div class="studio-scene-note">Roads, terrain and parcels are preserved from your region file. This view shows a blockout of your world.</div></aside>
    <section class="studio-stage" aria-label="World viewport"><div class="studio-toolbar" role="toolbar" aria-label="Viewport tools"><div><button data-tool="translate" aria-pressed="true">Move <kbd>W</kbd></button><button data-tool="rotate" aria-pressed="false">Rotate <kbd>E</kbd></button><button data-tool="scale" aria-pressed="false">Size <kbd>R</kbd></button></div><div><button id="studio-undo" aria-label="Undo" title="Undo (⌘/Ctrl Z)">↶</button><button id="studio-redo" aria-label="Redo" title="Redo (⌘/Ctrl Shift Z)">↷</button></div><button id="studio-walk" class="studio-play">Walk through</button></div><div id="studio-viewport" tabindex="0" aria-label="Interactive 3D viewport"></div><div class="studio-view-tools"><button id="studio-frame">Frame selection</button><button id="studio-region">Frame region</button><span id="studio-hint">Drag to orbit · right-drag to pan · scroll to zoom</span></div></section>
    <aside class="studio-inspector" aria-label="Object properties"><div class="studio-panel-title"><h2>Inspector</h2><span id="studio-kind">Selection</span></div><h3 id="studio-selected">Choose an object</h3><form id="studio-properties" autocomplete="off"></form><section id="studio-building-interior" class="studio-building-interior" aria-label="Generated interior" hidden></section><button id="studio-delete" class="studio-delete" hidden>Delete object</button><p class="studio-inspector-note">Moves snap to 0.5 m. Rotation snaps to 22.5°. Use the fields for precise values.</p><section id="studio-assessment" class="studio-document-note" aria-label="Required routes" hidden><label>Assessment program<select id="studio-profile"></select></label><p id="studio-assessment-status" role="status"></p><div id="studio-findings"></div></section><div class="studio-document-note"><strong>Yours to shape</strong><p>Save keeps a draft on this device. Export makes a portable Studio file. Your edits never change a live shared world.</p><button id="studio-reopen">Reopen saved draft</button></div></aside></div>
    <footer class="studio-footer"><span id="studio-dirty">New draft</span><p id="studio-status" role="status" aria-live="polite">Select an object, or add something to your region.</p><span id="studio-position">East / North · m</span></footer>`;
  const routes=createSpaceAssessmentRunner();
  const $=selector=>host.querySelector(selector),doc=createStudioDocument(undefined,{assessmentRunner:routes.assess});
  let selected=null,interiorView=null,lastFocus=null,walking=false,disposed=false,importGeneration=0,viewport,designer,agent,neighborhood;
  let renderedRevision = doc.revision, assessingRevision=null, assessmentError=null, editPending=0;
  const say=text=>{$('#studio-status').textContent=text;};
  try { if(doc.restore(localStorage))say('Saved draft reopened.'); } catch(error){say(`${error.message} Export or open a valid Studio file; the saved draft has not been changed.`);}
  const acceptDiscard=()=>!doc.dirty||window.confirm('Discard unsaved changes? Export or save first to keep them.');
  // A refused edit says so and names the furnishings to move, as the findings panel shows them.
  const reportError=error=>{
    const findings=error.assessment?.findings??[],names=[...new Set(findings.flatMap(finding=>finding.objectIds))].map(id=>doc.items.find(item=>item.id===id)?.label).filter(Boolean);
    say(findings.length?`Edit not applied; your draft is unchanged. ${error.message}${names.length?` Nearby: ${names.join(', ')}.`:''}`:error.message);render();
  };
  // Only awaited edits hold the busy state; a synchronous action must not re-render
  // panels, which would discard transient UI such as an open interior preview.
  const run=action=>{
    let pending;
    try{pending=action();}catch(error){reportError(error);return;}
    if(typeof pending?.then!=='function')return;
    editPending++;document.body.dataset.studioBusy='true';renderPanels();say('Checking edit…');
    pending.catch(reportError).finally(()=>{editPending--;document.body.dataset.studioBusy=String(editPending>0);renderPanels();refreshRoutes();});
  };
  const select=id=>{if(id!==selected)interiorView=null;selected=id;viewport.select(id);viewport.showInterior(interiorView);renderPanels();};
  viewport=createStudioViewport($('#studio-viewport'),{onSelect:select,getRevision:()=>doc.revision,onTransform:(id,patch,baseRevision)=>run(async()=>{await doc.update(id,patch,{baseRevision});render();say('Transform applied.');}),onExitWalk:()=>setWalk(false),onPosition:position=>{$('#studio-position').textContent=`${position[0].toFixed(1)} E / ${(-position[2]).toFixed(1)} N · m`;}});
  function renderAssessment(space=isSpaceDocument(doc.value),items=doc.items){
    $('#studio-assessment').hidden=!space;
    if(space){
      const context=doc.assessmentContext, assessment=doc.assessment, rejected=doc.rejectedAssessment;
      const profile=$('#studio-profile');
      profile.replaceChildren(...[{id:'',name:'Not assessed · select program'},...spaceTemplates].map(template=>{
        const option=document.createElement('option');option.value=template.id;option.textContent=template.name;option.disabled=!template.id&&Boolean(context);return option;
      }));
      const unsupported=context&&(context.profileVersion!==SPACE_PROFILE_VERSION||!spaceTemplates.some(t=>t.id===context.templateId));
      if(unsupported){
        const option=document.createElement('option');option.value='unsupported';option.textContent=`${context.templateId} v${context.profileVersion} · not assessed`;option.disabled=true;profile.append(option);
      }
      profile.value=unsupported?'unsupported':context?.templateId??'';profile.disabled=walking||editPending>0;
      $('#studio-assessment-status').textContent=assessment.status==='passed'?`Required routes passed · v${context.profileVersion} · revision ${doc.revision}`:
        assessment.status==='pending'?`Checking required routes · revision ${doc.revision}`:assessment.status==='blocked'?`Draft needs repair · revision ${doc.revision}`:'Not assessed. Select a current program; bare JSON has no assessment context.';
      const findings=$('#studio-findings');findings.replaceChildren();
      if(assessmentError?.revision===doc.revision){
        $('#studio-assessment-status').textContent=assessmentError.message;
        const retry=document.createElement('button');retry.type='button';retry.textContent='Retry assessment';retry.disabled=walking||editPending>0;
        retry.addEventListener('click',()=>refreshRoutes());findings.append(retry);
      }
      const result=rejected??assessment;
      if(result.findings.some(finding=>finding.ruleId==='required-role')){
        const button=document.createElement('button');button.type='button';button.textContent='Restore required furnishings';button.disabled=walking||editPending>0;
        button.addEventListener('click',()=>run(async()=>{await doc.restoreRequiredRoles();render();say('Required furnishings restored as one edit.');}));findings.append(button);
      }
      for(const finding of result.findings){
        const text=document.createElement('p');text.textContent=`${rejected?'Edit rejected. ':''}${finding.message} ${finding.route} · ${finding.ruleId} · ${finding.targetId} · revision ${finding.revision}`;findings.append(text);
        for(const id of finding.objectIds){
          if(!items.some(item=>item.id===id))continue;
          const button=document.createElement('button');button.type='button';button.textContent=`Select ${id}`;button.disabled=walking;
          button.addEventListener('click',()=>{select(id);viewport.frameSelection();$('#studio-properties input')?.focus();});findings.append(button);
        }
      }
    }
  }
  function renderPanels(){
    designer?.refresh();agent?.refresh();neighborhood?.refresh();
    const space=isSpaceDocument(doc.value),items=doc.items,item=items.find(value=>value.id===selected);
    $('.studio-panel-title h1').textContent=space?doc.value.name:'Region';
    $('.studio-scene-panel h2').textContent=space?'Level 0 · objects':'Scene objects';
    $('.studio-scene-note').textContent=space?'Level 0 · furnished local space. Select an element to change its finish, dimensions or position. Save or export to keep your work.':'Roads, terrain and parcels are preserved from your region file. Select a generated building to inspect its levels; walking still uses the exterior blockout.';
    if(viewport.architecture)$('.studio-scene-note').textContent=`Fixed architectural modules in building envelopes. Private walking uses their walls and floor slabs. ${viewport.architecture.counts.fallbacks} authored objects retain solid blockouts; open Neighborhood for diagnostics. Region-only exports retain the standard shared-world blockout contract.`;
    renderAssessment(space,items);
    $('#studio-count').textContent=`${items.length} objects`;
    $('#studio-dirty').textContent=doc.dirty?'● Unsaved changes':'○ Draft unchanged';
    $('#studio-undo').disabled=walking||!doc.canUndo;$('#studio-redo').disabled=walking||!doc.canRedo;
    // The list and form are rebuilt only when their shape changes, so the control in use keeps focus.
    const list=$('#studio-items'),listShape=items.map(value=>`${value.id}:${value.type}`).join('\n');
    if(list.dataset.shape!==listShape){list.dataset.shape=listShape;list.replaceChildren(...items.map(value=>{
      const button=document.createElement('button');button.type='button';button.dataset.item=value.id;
      const icon=document.createElement('span');icon.className='studio-object-icon';icon.textContent={building:'▱',tree:'♧',place:'⌖',arrival:'◇',furnishing:'▱',environment:'☀'}[value.type];
      button.append(icon,document.createElement('span'));button.addEventListener('click',()=>select(value.id));return button;
    }));}
    items.forEach((value,index)=>{const button=list.children[index];button.setAttribute('aria-pressed',String(value.id===selected));button.disabled=walking;button.lastChild.textContent=value.label;});
    $('#studio-selected').textContent=item?.label??'Choose an object';$('#studio-kind').textContent=item?.type??'Selection';
    const form=$('#studio-properties');
    const definitions=[['label','Name','text'],['east','East (m)','number'],['north','North (m)','number'],['width','Width (m)','number'],['depth','Depth (m)','number'],['height','Height (m)','number'],['radius','Crown radius (m)','number'],['yaw','Yaw (degrees)','number'],['elevation','Elevation (m)','number']]
      .filter(([key])=>item?.[key]!==undefined&&(key!=='label'||['place','furnishing'].includes(item.type)));
    const choices=[['kind','Furnishing',SPACE_KINDS],['finish','Finish',SPACE_FINISHES],['lighting','Lighting',SPACE_LIGHTING]].filter(([key])=>item?.[key]!==undefined);
    const formShape=item?[item.id,...definitions.map(([key])=>key),...choices.map(([key])=>key)].join('\n'):'';
    if(form.dataset.shape!==formShape){
      form.dataset.shape=formShape;form.replaceChildren();
      for(const [key,label,type] of definitions){
        const wrapper=document.createElement('label');wrapper.textContent=label;
        const input=document.createElement('input');input.type=type;input.name=key;
        if(type==='number')input.step=key==='yaw'?'1':'.1';else input.maxLength=64;
        input.addEventListener('change',()=>run(async()=>{
          if(type==='number'&&!input.value.trim())throw Error('Enter a finite number.');
          await doc.update(item.id,{[key]:type==='number'?Number(input.value):input.value});render();say('Property updated.');
        }));wrapper.append(input);form.append(wrapper);
      }
      for(const [key,label,values] of choices){
        const wrapper=document.createElement('label');wrapper.textContent=label;
        const input=document.createElement('select');input.name=key;
        for(const value of values){const option=document.createElement('option');option.value=value;option.textContent=value[0].toUpperCase()+value.slice(1);input.append(option);}
        input.addEventListener('change',()=>run(async()=>{await doc.update(item.id,{[key]:input.value});render();say('Property updated.');}));wrapper.append(input);form.append(wrapper);
      }
    }
    // A checked edit makes fields read-only rather than disabled, so Tab can still reach them.
    // A value being typed survives renders that are not the result of an edit.
    for(const input of form.elements){
      const value=String(item[input.name]),typing=input===document.activeElement&&input.value!==input.dataset.rendered&&editPending===0;
      if(!typing&&input.value!==value)input.value=value;input.dataset.rendered=value;
      if(input.tagName==='SELECT')input.disabled=walking||editPending>0;else{input.disabled=walking;input.readOnly=editPending>0;}
    }
    renderBuildingInteriorPanel($('#studio-building-interior'), { doc, buildingId: item?.type === 'building' ? item.id : null,
      disabled: walking, apply: render, say, run, interiorView,
      onViewLevel:levelIndex=>{const focusLevel=levelIndex??interiorView?.levelIndex;
        interiorView=levelIndex===null?null:{buildingId:selected,levelIndex,layers:interiorView?.layers??{}};
        viewport.showInterior(interiorView);renderPanels();if(interiorView)viewport.frameSelection();
        $(`#studio-building-interior [data-interior-level="${focusLevel}"]`)?.focus();},
      onLayer:(name,visible)=>{interiorView={...interiorView,layers:{...interiorView.layers,[name]:visible}};
        viewport.showInterior(interiorView);} });
    for(const button of host.querySelectorAll('[data-add]'))button.hidden=space?button.dataset.add!=='furnishing':button.dataset.add==='furnishing';
    $('#studio-delete').hidden=!item||['arrival','environment'].includes(item.type);$('#studio-delete').disabled=walking||editPending>0;
    $('#studio-frame').disabled=!item||item.type==='environment'||walking;$('#studio-region').disabled=walking;
    for(const button of host.querySelectorAll('[data-add],[data-tool],#studio-new,#studio-templates,#studio-neighborhood,#studio-reopen,#studio-import'))button.disabled=walking||editPending>0;
    $('#studio-walk').disabled=editPending>0;
    // A control that was disabled or rebuilt while focused hands focus back once it is usable.
    // Deferred: a field commits during Tab's blur, and restoring then would cancel the move.
    if(lastFocus)setTimeout(()=>{
      if(disposed||!lastFocus||document.activeElement&&document.activeElement!==document.body&&!document.activeElement.disabled)return;
      const target=[lastFocus,{'#studio-undo':'#studio-redo','#studio-redo':'#studio-undo'}[lastFocus]].map(key=>key&&host.querySelector(key)).find(element=>element&&!element.disabled&&!element.hidden);
      target?.focus({preventScroll:true});
    });
  }
  function render(){if (doc.revision !== renderedRevision) { designer?.changed(); renderedRevision = doc.revision; }
    if(!doc.items.some(item=>item.id===selected))selected=null;
    const building=doc.value.buildings?.find(item=>item.id===interiorView?.buildingId);
    if(!building?.interior?.generation||interiorView.levelIndex>=building.interior.generation.levels||selected!==interiorView.buildingId)interiorView=null;
    viewport.render(doc.value,selected,interiorView,doc.neighborhood);renderPanels();refreshRoutes();
  }
  function refreshRoutes(){
    if(!walking&&!editPending&&doc.assessment.status==='pending'&&assessingRevision!==doc.revision){
      const revision=doc.revision;assessingRevision=revision;assessmentError=null;renderAssessment();
      doc.refreshAssessment().then(()=>{if(!disposed&&doc.revision===revision)renderAssessment();}).catch(error=>{
        if(error.name==='AbortError'){if(assessingRevision===revision)assessingRevision=null;}
        else if(!disposed&&doc.revision===revision){assessingRevision=null;assessmentError={revision,message:error.message};renderAssessment();say(error.message);}
      });
    }
  }
  function setWalk(enabled){
    try {if(enabled)doc.cancelPendingAssessments();viewport.walk(enabled);walking=enabled;document.body.dataset.mode=enabled?'walk':'edit';$('#studio-walk').textContent=enabled?'Return to editor':'Walk through';
      $('#studio-hint').textContent=enabled?'WASD / ↑↓ to move · ←→ or drag to turn · Shift to hurry · Esc to edit':'Drag to orbit · right-drag to pan · scroll to zoom';renderPanels();say(enabled?(isSpaceDocument(doc.value)?'Private space walkthrough. Walls and furniture block movement.':viewport.architecture?'Private neighborhood playtest. Kit doors are open; walls block movement. Unsupported authored objects retain solid blockouts.':'Private blockout playtest. Buildings use solid collision; interiors are not furnished in this view.'):'Returned to your draft.');if(!enabled)refreshRoutes();
    }catch(error){say(error.message);}
  }
  for(const button of host.querySelectorAll('[data-add]'))button.addEventListener('click',()=>run(async()=>{selected=await doc.add(button.dataset.add);render();say('Object added. Use the inspector or the handles to shape it.');}));
  function setTool(value){viewport.tool(value);for(const button of host.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===value));}
  for(const button of host.querySelectorAll('[data-tool]'))button.addEventListener('click',()=>setTool(button.dataset.tool));
  $('#studio-undo').addEventListener('click',()=>{doc.undo();render();say('Undid the last change.');});
  $('#studio-redo').addEventListener('click',()=>{doc.redo();render();say('Redid the change.');});
  $('#studio-delete').addEventListener('click',()=>run(async()=>{await doc.remove(selected);render();say('Object deleted. Undo restores it.');}));
  $('#studio-save').addEventListener('click',()=>run(()=>{doc.save(localStorage);renderPanels();say('Draft saved on this device.');}));
  $('#studio-new').addEventListener('click',()=>run(()=>{if(!acceptDiscard())return;importGeneration++;doc.open(blankRegion());selected=null;render();viewport.frameRegion();say('New region. Save to replace the device draft, or export a separate file.');}));
  const templates=mountTemplatePicker(host,{choose:template=>{
    if(walking||!acceptDiscard())return false;
    try {const region=createSpace(template.id);doc.open(region,{assessmentContext:spaceAssessmentContext(template.id)});importGeneration++;selected=null;render();viewport.frameRegion();say(`${template.name} opened. ${template.firstEdit} Save or export to keep your version.`);return true;}
    catch(error){say(error.message);return false;}
  }});
  $('#studio-profile').addEventListener('change',event=>{const context=spaceAssessmentContext(event.target.value);run(()=>{doc.selectAssessmentContext(context);render();say('Assessment program selected. Review route findings before editing.');});});
  $('#studio-templates').addEventListener('click',()=>templates.open());
  $('#studio-reopen').addEventListener('click',()=>run(()=>{if(!acceptDiscard())return;importGeneration++;if(!doc.restore(localStorage)){say('No saved draft on this device yet.');return;}selected=null;render();viewport.frameRegion();say('Saved draft reopened.');}));
  $('#studio-export').addEventListener('click',()=>run(()=>{
    const blob=new Blob([JSON.stringify(doc.value)],{type:'application/json'});if(blob.size>MAX_REGION_BYTES)throw Error('Region exceeds the 128 KiB export limit.');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=isSpaceDocument(doc.value)?'world-studio-space.json':'world-studio-region.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Export requested. Choose where to keep your Studio JSON.');
  }));
  $('#studio-import').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file||walking)return;const generation=++importGeneration;
    try {if(file.size>MAX_REGION_BYTES)throw Error('Studio files must be at most 128 KiB.');const candidate=parseRegion(await file.text());if(disposed||generation!==importGeneration)return;if(walking)throw Error('Return to the editor before opening a document.');if(!acceptDiscard())return;doc.open(candidate);selected=null;render();viewport.frameRegion();say('Document opened. Save on this device or export to keep your edits.');}catch(error){say(error.message);}
  });
  $('#studio-properties').addEventListener('submit',event=>event.preventDefault());
  $('#studio-frame').addEventListener('click',()=>viewport.frameSelection());$('#studio-region').addEventListener('click',()=>viewport.frameRegion());
  $('#studio-walk').addEventListener('click',()=>setWalk(!walking));
  const events=new AbortController();
  // Remembers the scene object, field or history button in use; a deliberate move elsewhere forgets it.
  host.addEventListener('focusin',({target})=>{
    lastFocus=target.dataset.item&&target.closest('#studio-items')?`#studio-items [data-item="${CSS.escape(target.dataset.item)}"]`:
      target.name&&target.closest('#studio-properties')?`#studio-properties [name="${target.name}"]`:['studio-undo','studio-redo'].includes(target.id)?`#${target.id}`:null;
  },{signal:events.signal});
  host.addEventListener('focusout',({target,relatedTarget})=>{
    if(!relatedTarget)queueMicrotask(()=>{if(target.isConnected&&!target.disabled&&document.activeElement===document.body)lastFocus=null;});
  },{signal:events.signal});
  window.addEventListener('keydown',event=>{
    if(host.querySelector('dialog[open]')||walking||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();$('#studio-save').click();}
    else if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'#studio-redo':'#studio-undo').click();}
    else if(!event.metaKey&&!event.ctrlKey&&!event.altKey){
      const mode={w:'translate',e:'rotate',r:'scale'}[event.key.toLowerCase()];if(mode){event.preventDefault();setTool(mode);}
      else if(event.key.toLowerCase()==='f'){event.preventDefault();viewport.frameSelection();}
      else if(event.key==='Delete'&&selected){event.preventDefault();$('#studio-delete').click();}
    }
  },{signal:events.signal});
  window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY)say('The saved draft changed in another tab. Export your edits before reopening.');},{signal:events.signal});
  window.addEventListener('beforeunload',event=>{if(doc.dirty){event.preventDefault();event.returnValue='';}},{signal:events.signal});
  window.addEventListener('pagehide',event=>{if(!event.persisted&&!disposed){disposed=true;events.abort();doc.dispose();routes.dispose();designer?.dispose();neighborhood?.dispose();templates.dispose();agent?.dispose();viewport.dispose();}},{signal:events.signal});
  neighborhood = mountNeighborhoodPanel(host, {doc,selected:()=>selected,apply:()=>{importGeneration++;selected=null;render();viewport.frameRegion();},canEdit:()=>!walking&&!editPending,say});
  $('#studio-neighborhood').addEventListener('click',event=>neighborhood.open(event.currentTarget));
  designer = mountDesignerPanel(host, { doc, selected: () => selected, apply: render, reportError, canEdit: () => !walking });
  agent = mountAgentChat($('.studio-stage'), { doc, selected: () => selected, apply: render, reportError, canEdit: () => !walking });
  $('#studio-designer-open').addEventListener('click', event => designer.open(event.currentTarget));
  render();viewport.frameRegion();document.body.dataset.mode='edit';document.body.dataset.studioReady='true';
}
