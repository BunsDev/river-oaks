import './studio.css';
import { mountDesignerPanel } from './designer-panel.js';
import { blankRegion } from '../region-draft.js';
import { createStudioDocument, parseRegion, MAX_REGION_BYTES, STORAGE_KEY } from './document.js';
import { createStudioViewport } from './viewport.js';

export function startStudio(host) {
  host.innerHTML=`<header class="studio-header"><a class="studio-brand" href="/play" title="Return to the world">TypeSafe Place<span>World Studio</span></a><div class="studio-file-tools"><button id="studio-designer-open">World Designer</button><button id="studio-new">New region</button><label class="studio-open">Open JSON<input id="studio-import" type="file" accept=".json,application/json"></label><button id="studio-export">Export JSON</button><button id="studio-save" class="studio-primary">Save on device</button></div><a class="studio-return" href="/play">Back to world ↗</a></header>
    <div class="studio-workspace"><aside class="studio-scene-panel" aria-label="Scene"><div class="studio-panel-title"><h1>Region</h1><span id="studio-count"></span></div><p class="studio-caption">A private draft · metres</p><div class="studio-palette" aria-label="Add to region"><button data-add="building" aria-label="Add building">▱ Building</button><button data-add="tree" aria-label="Add tree">♧ Tree</button><button data-add="place" aria-label="Add place">⌖ Place</button></div><h2>Scene objects</h2><div id="studio-items" class="studio-items"></div><div class="studio-scene-note">Roads, terrain and parcels are preserved from your region file. This view shows a blockout of your world.</div></aside>
    <section class="studio-stage" aria-label="World viewport"><div class="studio-toolbar" role="toolbar" aria-label="Viewport tools"><div><button data-tool="translate" aria-pressed="true">Move <kbd>W</kbd></button><button data-tool="rotate" aria-pressed="false">Rotate <kbd>E</kbd></button><button data-tool="scale" aria-pressed="false">Size <kbd>R</kbd></button></div><div><button id="studio-undo" aria-label="Undo" title="Undo (⌘/Ctrl Z)">↶</button><button id="studio-redo" aria-label="Redo" title="Redo (⌘/Ctrl Shift Z)">↷</button></div><button id="studio-walk" class="studio-play">Walk through</button></div><div id="studio-viewport" tabindex="0" aria-label="Interactive 3D viewport"></div><div class="studio-view-tools"><button id="studio-frame">Frame selection</button><button id="studio-region">Frame region</button><span id="studio-hint">Drag to orbit · right-drag to pan · scroll to zoom</span></div></section>
    <aside class="studio-inspector" aria-label="Object properties"><div class="studio-panel-title"><h2>Inspector</h2><span id="studio-kind">Selection</span></div><h3 id="studio-selected">Choose an object</h3><form id="studio-properties" autocomplete="off"></form><button id="studio-delete" class="studio-delete" hidden>Delete object</button><p class="studio-inspector-note">Moves snap to 0.5 m. Rotation snaps to 22.5°. Use the fields for precise values.</p><div class="studio-document-note"><strong>Yours to shape</strong><p>Save keeps a draft on this device. Export makes a portable region file. Your edits never change a live shared world.</p><button id="studio-reopen">Reopen saved draft</button></div></aside></div>
    <footer class="studio-footer"><span id="studio-dirty">New draft</span><p id="studio-status" role="status" aria-live="polite">Select an object, or add something to your region.</p><span id="studio-position">East / North · m</span></footer>`;
  const $=selector=>host.querySelector(selector),doc=createStudioDocument();
  let selected=null,walking=false,disposed=false,importGeneration=0,viewport,designer;
  let renderedRevision = doc.revision;
  const say=text=>{$('#studio-status').textContent=text;};
  try { if(doc.restore(localStorage))say('Saved draft reopened.'); } catch(error){say(`${error.message} Export or open a valid region file; the saved draft has not been changed.`);}
  const acceptDiscard=()=>!doc.dirty||window.confirm('Discard unsaved changes? Export or save first to keep them.');
  const run=action=>{try{action();}catch(error){say(error.message);render();}};
  const select=id=>{selected=id;viewport.select(id);renderPanels();};
  viewport=createStudioViewport($('#studio-viewport'),{onSelect:select,onTransform:(id,patch)=>run(()=>{doc.update(id,patch);render();say('Transform applied.');}),onExitWalk:()=>setWalk(false),onPosition:position=>{$('#studio-position').textContent=`${position[0].toFixed(1)} E / ${(-position[2]).toFixed(1)} N · m`;}});
  function renderPanels(){
    designer?.refresh();
    const items=doc.items,item=items.find(value=>value.id===selected);
    $('#studio-count').textContent=`${items.length} objects`;
    $('#studio-dirty').textContent=doc.dirty?'● Unsaved changes':'○ Draft unchanged';
    $('#studio-undo').disabled=walking||!doc.canUndo;$('#studio-redo').disabled=walking||!doc.canRedo;
    $('#studio-items').replaceChildren(...items.map(value=>{
      const button=document.createElement('button');button.type='button';button.dataset.item=value.id;button.setAttribute('aria-pressed',String(value.id===selected));button.disabled=walking;
      const icon=document.createElement('span');icon.className='studio-object-icon';icon.textContent={building:'▱',tree:'♧',place:'⌖',arrival:'◇'}[value.type];
      const label=document.createElement('span');label.textContent=value.label;button.append(icon,label);button.addEventListener('click',()=>select(value.id));return button;
    }));
    $('#studio-selected').textContent=item?.label??'Choose an object';$('#studio-kind').textContent=item?.type??'Selection';
    const form=$('#studio-properties');form.replaceChildren();
    const definitions=[['label','Name','text'],['east','East (m)','number'],['north','North (m)','number'],['width','Width (m)','number'],['depth','Depth (m)','number'],['height','Height (m)','number'],['radius','Crown radius (m)','number'],['yaw','Yaw (degrees)','number']];
    if(item)for(const [key,label,type] of definitions){
      if(item[key]===undefined||key==='label'&&item.type!=='place')continue;
      const wrapper=document.createElement('label');wrapper.textContent=label;
      const input=document.createElement('input');input.type=type;input.name=key;input.value=item[key];input.disabled=walking;
      if(type==='number')input.step=key==='yaw'?'1':'.1';else input.maxLength=64;
      input.addEventListener('change',()=>run(()=>{
        if(type==='number'&&!input.value.trim())throw Error('Enter a finite number.');
        doc.update(item.id,{[key]:type==='number'?Number(input.value):input.value});render();say('Property updated.');
      }));wrapper.append(input);form.append(wrapper);
    }
    $('#studio-delete').hidden=!item||item.type==='arrival';$('#studio-delete').disabled=walking;
    $('#studio-frame').disabled=!item||walking;$('#studio-region').disabled=walking;
    for(const button of host.querySelectorAll('[data-add],[data-tool],#studio-new,#studio-reopen,#studio-import'))button.disabled=walking;
  }
  function render(){if (doc.revision !== renderedRevision) { designer?.changed(); renderedRevision = doc.revision; } if(!doc.items.some(item=>item.id===selected))selected=null;viewport.render(doc.value,selected);renderPanels();}
  function setWalk(enabled){
    try {viewport.walk(enabled);walking=enabled;document.body.dataset.mode=enabled?'walk':'edit';$('#studio-walk').textContent=enabled?'Return to editor':'Walk through';
      $('#studio-hint').textContent=enabled?'WASD / arrows · drag to look · Shift to hurry · Esc to edit':'Drag to orbit · right-drag to pan · scroll to zoom';renderPanels();say(enabled?'Private blockout playtest. Buildings use solid collision; interiors are not furnished in this view.':'Returned to your draft.');
    }catch(error){say(error.message);}
  }
  for(const button of host.querySelectorAll('[data-add]'))button.addEventListener('click',()=>run(()=>{selected=doc.add(button.dataset.add);render();say('Object added. Use the inspector or the handles to shape it.');}));
  function setTool(value){viewport.tool(value);for(const button of host.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===value));}
  for(const button of host.querySelectorAll('[data-tool]'))button.addEventListener('click',()=>setTool(button.dataset.tool));
  $('#studio-undo').addEventListener('click',()=>{doc.undo();render();say('Undid the last change.');});
  $('#studio-redo').addEventListener('click',()=>{doc.redo();render();say('Redid the change.');});
  $('#studio-delete').addEventListener('click',()=>run(()=>{doc.remove(selected);render();say('Object deleted. Undo restores it.');}));
  $('#studio-save').addEventListener('click',()=>run(()=>{doc.save(localStorage);renderPanels();say('Draft saved on this device.');}));
  $('#studio-new').addEventListener('click',()=>run(()=>{if(!acceptDiscard())return;importGeneration++;doc.replace(blankRegion());selected=null;render();viewport.frameRegion();say('New region. Save to replace the device draft, or export a separate file.');}));
  $('#studio-reopen').addEventListener('click',()=>run(()=>{if(!acceptDiscard())return;importGeneration++;if(!doc.restore(localStorage)){say('No saved draft on this device yet.');return;}selected=null;render();viewport.frameRegion();say('Saved draft reopened.');}));
  $('#studio-export').addEventListener('click',()=>run(()=>{
    const blob=new Blob([JSON.stringify(doc.value)],{type:'application/json'});if(blob.size>MAX_REGION_BYTES)throw Error('Region exceeds the 128 KiB export limit.');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='world-studio-region.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Export requested. Choose where to keep your region JSON.');
  }));
  $('#studio-import').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file||walking)return;const generation=++importGeneration;
    try {if(file.size>MAX_REGION_BYTES)throw Error('Region files must be at most 128 KiB.');const candidate=parseRegion(await file.text());if(disposed||generation!==importGeneration)return;if(walking)throw Error('Return to the editor before opening a region.');if(!acceptDiscard())return;doc.replace(candidate);selected=null;render();viewport.frameRegion();say('Region opened. Save on this device or export to keep your edits.');}catch(error){say(error.message);}
  });
  $('#studio-properties').addEventListener('submit',event=>event.preventDefault());
  $('#studio-frame').addEventListener('click',()=>viewport.frameSelection());$('#studio-region').addEventListener('click',()=>viewport.frameRegion());
  $('#studio-walk').addEventListener('click',()=>setWalk(!walking));
  const events=new AbortController();
  window.addEventListener('keydown',event=>{
    if(walking||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
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
  window.addEventListener('pagehide',event=>{if(!event.persisted&&!disposed){disposed=true;events.abort();designer?.dispose();viewport.dispose();}},{signal:events.signal});
  designer = mountDesignerPanel(host, { doc, selected: () => selected, apply: render, canEdit: () => !walking });
  $('#studio-designer-open').addEventListener('click', event => designer.open(event.currentTarget));
  render();viewport.frameRegion();document.body.dataset.mode='edit';document.body.dataset.studioReady='true';
}
