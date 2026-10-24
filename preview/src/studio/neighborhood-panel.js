import './neighborhood.css';
import stock from '../../../config/neighborhoods/garden-blocks.json';
import market from '../../../config/neighborhoods/garden-market.json';
import court from '../../../config/neighborhoods/garden-court.json';
import {createNeighborhoodSession} from './neighborhood-session.js';
import {previewSvg} from '../../../shared/neighborhood/preview.js';
import {canonical} from '../../../shared/neighborhood/format.js';

export function mountNeighborhoodPanel(host,{doc,selected,apply,canEdit,say}) {
  const session=createNeighborhoodSession(doc), dialog=document.createElement('dialog');
  dialog.className='studio-neighborhood';dialog.setAttribute('aria-labelledby','neighborhood-title');
  dialog.innerHTML=`<header><h2 id="neighborhood-title">Neighborhood candidates</h2><button type="button" data-neighborhood-close>Close</button></header>
    <p>Preview a small neighborhood, then apply it as one undoable edit. Existing edits and approvals stay attached when you regenerate this neighborhood.</p>
    <div class="neighborhood-controls"><label>Recipe or authoring JSON<input type="file" data-file accept=".json,application/json"></label><button type="button" data-stock>Use Garden Blocks</button><button type="button" data-market>Use Garden Market</button><button type="button" data-court>Use Garden Court</button><label>Variation seed<input data-seed maxlength="200"></label><button type="button" data-preview>Preview candidate</button><button type="button" data-approve>Preview approval of selected object</button></div>
    <p data-status role="status" aria-live="polite"></p><img data-plan alt="Top-down neighborhood candidate" hidden><ul data-findings></ul>
    <p class="neighborhood-note">The plan shows building envelopes. Market and Court use reusable architecture in the 3D view; resized or custom buildings retain their blockout with a diagnostic. Geographic parcels and protected buildings are reference overlays. Applying replaces the current region; undo restores it. Save on device keeps authoring history; Export authoring makes a portable copy.</p>
    <footer><button type="button" data-apply disabled>Apply candidate</button><button type="button" data-cancel>Cancel preview</button><button type="button" data-export>Export authoring</button></footer>`;
  host.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  let input=null, generation=0, url=null, opener=null, disposed=false, busy=false;
  const status=text=>{$('[data-status]').textContent=text;};
  const clearImage=()=>{if(url)URL.revokeObjectURL(url);url=null;$('[data-plan]').hidden=true;$('[data-plan]').removeAttribute('src');};
  const cancel=()=>{generation++;session.cancel();busy=false;clearImage();$('[data-apply]').disabled=true;refresh();};
  const refresh=()=>{
    if(disposed)return;
    const enabled=canEdit();
    for(const key of ['preview','stock','market','court','file','seed'])$(`[data-${key}]`).disabled=!enabled||busy;
    $('[data-export]').disabled=!enabled||busy||!doc.neighborhood;
    $('[data-approve]').disabled=!enabled||busy||!doc.neighborhood||!selected()||selected()==='@arrival';
    if(!enabled)$('[data-apply]').disabled=true;
  };
  const load=value=>{cancel();input=value;$('[data-seed]').value=(value.recipe??value).seed??'';status(`Ready: ${(value.recipe??value).title??'Imported candidate'}. Preview before applying.`);$('[data-findings]').replaceChildren();};
  const failure=error=>{status([error.message,...(error.diagnostics??[]).slice(0,8).map(d=>`${d.id}: ${d.message}`)].join(' '));};
  const preview=async(approve=[])=>{
    if(!canEdit()||busy)return;
    cancel();const token=generation;busy=true;refresh();status('Building preview…');
    try{
      const source=approve.length?doc.neighborhood.recipe:input;
      const candidate=await session.preview(source,{seed:$('[data-seed]').value,approve});
      if(disposed||token!==generation)return;
      url=URL.createObjectURL(new Blob([previewSvg(candidate)],{type:'image/svg+xml'}));$('[data-plan]').src=url;$('[data-plan]').hidden=false;
      const ref=candidate.recipe.reference;
      status(`${candidate.region.buildings.length} buildings · ${candidate.blocks.length} blocks · ${ref?.parcels.length??candidate.region.parcels.length} parcels · ${candidate.approved.length} approved. Review, then apply or cancel.`);
      $('[data-findings]').replaceChildren(...candidate.diagnostics.slice(0,12).map(finding=>{const li=document.createElement('li');li.textContent=finding.message;return li;}));
      $('[data-apply]').disabled=false;
    }catch(error){if(token===generation)failure(error);}finally{if(token===generation){busy=false;refresh();}}
  };
  $('[data-file]').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    cancel();const token=generation;
    try{if(file.size>2*1024*1024)throw Error('Authoring files must be at most 2 MiB.');const value=JSON.parse(await file.text());if(disposed||token!==generation)return;load(value);}catch(error){if(token===generation)failure(error);}
  });
  $('[data-stock]').addEventListener('click',()=>load(structuredClone(stock)));
  $('[data-market]').addEventListener('click',()=>load(structuredClone(market)));
  $('[data-court]').addEventListener('click',()=>load(structuredClone(court)));
  $('[data-seed]').addEventListener('input',()=>{cancel();status('Seed changed. Preview again before applying.');});
  $('[data-preview]').addEventListener('click',()=>preview());
  $('[data-approve]').addEventListener('click',()=>preview([selected()]));
  $('[data-apply]').addEventListener('click',()=>{
    try{if(!canEdit())throw Error('Return to the editor before applying.');session.apply();apply();cancel();input=doc.neighborhood.recipe;status('Candidate applied. Undo restores the previous region and approvals.');say('Neighborhood candidate applied. Save on device or export authoring to keep its regeneration history.');}catch(error){failure(error);$('[data-apply]').disabled=true;}
  });
  $('[data-cancel]').addEventListener('click',()=>{cancel();status('Preview cancelled. Your draft is unchanged.');});
  $('[data-export]').addEventListener('click',async()=>{
    cancel();const token=generation;busy=true;refresh();
    try{const artifact=await session.exportArtifact();if(disposed||token!==generation)return;
      const downloadUrl=URL.createObjectURL(new Blob([canonical(artifact)+'\n'],{type:'application/json'})),anchor=document.createElement('a');
      anchor.href=downloadUrl;anchor.download=`${artifact.recipe.id}-authoring.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(downloadUrl),1000);status('Authoring exported with your current edits and approvals.');
    }catch(error){if(token===generation)failure(error);}finally{if(token===generation){busy=false;refresh();}}
  });
  $('[data-neighborhood-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{cancel();opener?.focus();});
  return {open(button){opener=button;load(doc.neighborhood?.recipe??structuredClone(stock));dialog.showModal();},refresh,
    dispose(){disposed=true;cancel();dialog.remove();}};
}
