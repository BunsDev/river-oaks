import { createCharacterDraft } from './character-studio-state.js';
import { createCharacterPreview } from './character-studio-preview.js';
import { CHARACTER_PALETTES, CHARACTER_HAIR, supportsCharacterColors } from './character-customization.js';
import { validateCharacterDefinition } from './character-definition.js';
import { CHARACTERS, appearanceFor, canUseAppearance, sharedAppearance, sharedCharacter } from './shared-appearances.js';
import './character-studio.css';

export function createCharacterStudio({ownerId,getDefinition,canOpen=()=>true,onOpen=()=>{},reducedMotion=false}){
  const trigger=document.createElement('button');trigger.type='button';trigger.className='character-studio-trigger';trigger.textContent='Open character studio';trigger.setAttribute('aria-haspopup','dialog');
  const dialog=document.createElement('dialog');dialog.className='character-studio';dialog.setAttribute('aria-labelledby','character-studio-title');
  dialog.innerHTML=`<header class="cs-header"><div><p class="cs-eyebrow">TypeSafe Place · Atelier</p><h2 id="character-studio-title">Character studio</h2></div><button type="button" data-close aria-label="Close character studio">✕</button></header>
    <div class="cs-workspace"><section class="cs-stage" aria-label="Character preview"><div class="cs-preview"></div><div class="cs-caption"><span data-look></span><span data-comparing hidden>Original</span></div>
      <div class="cs-view-tools"><label>View<select name="framing"><option value="full">Full look</option><option value="portrait">Portrait</option></select></label><label>Light<select name="lighting"><option value="day">Garden daylight</option><option value="warm">Golden hour</option></select></label><label>Pose<select name="pose"><option value="idle">Idle</option><option value="walk">Walk</option><option value="wave">Wave</option></select></label></div>
      <div class="cs-rotation"><label for="cs-yaw">Rotate</label><input id="cs-yaw" type="range" min="-180" max="180" value="0" step="1"><button type="button" data-turntable aria-pressed="false">Turntable</button></div></section>
    <section class="cs-controls" aria-label="Customize character"><p class="cs-intro">Start with someone you love. Make the look yours.</p>
      <fieldset><legend>Starting character</legend><div class="cs-roster">${CHARACTERS.filter(person=>canUseAppearance(ownerId,appearanceFor(person.id).id)).map(person=>`<button type="button" data-character="${person.id}" aria-pressed="false" style="--cs-accent:${person.accent}"><span aria-hidden="true">${person.name[0]}</span>${person.name}</button>`).join('')}</div></fieldset>
      <div class="cs-pair"><label>Form<select name="form"><option value="human">Human</option><option value="beast">Beast</option></select></label><label>Wardrobe<select name="variant"></select></label></div>
      <fieldset data-palette><legend>Dress color</legend><div class="cs-swatches">${Object.entries(CHARACTER_PALETTES).map(([id,item])=>`<button type="button" data-palette="${id}" aria-label="${item.label}" aria-pressed="false" title="${item.label}" style="--cs-swatch:${item.color}"></button>`).join('')}</div><p data-palette-name></p></fieldset>
      <fieldset data-hair><legend>Hair color</legend><div class="cs-swatches">${Object.entries(CHARACTER_HAIR).map(([id,item])=>`<button type="button" data-hair="${id}" aria-label="${item.label}" aria-pressed="false" title="${item.label}" style="--cs-swatch:${item.color}"></button>`).join('')}</div><p data-hair-name></p></fieldset>
      <p class="cs-help" data-compatibility></p>
      <div class="cs-edit-tools"><button type="button" data-undo>Undo</button><button type="button" data-redo>Redo</button><button type="button" data-compare aria-pressed="false">Before / after</button><button type="button" data-random>Surprise me</button></div>
      <div class="cs-favorites"><button type="button" data-favorite>Favorite this look</button><label class="sr-only" for="cs-favorites">Favorite looks</label><select id="cs-favorites"><option value="">Your favorites</option></select><button type="button" data-remove-favorite disabled>Remove favorite</button></div>
      <div class="cs-portrait"><button type="button" data-portrait>Create 4K portrait</button><a data-download hidden>Download PNG</a><p>Front pose · Garden daylight · 3840 × 2160</p></div>
      <p class="cs-status" role="status" aria-live="polite"></p></section></div>
    <footer class="cs-footer"><p>Drafts stay in this tab. Favorites stay on this device.<br>Your town appearance changes only when publishing is available.</p><div><button type="button" data-cancel>Discard changes</button><button type="button" data-keep>Keep draft</button></div></footer>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector),status=$('.cs-status'),stage=$('.cs-preview');
  let draft=null,preview=null,retained=null,baseline=null,comparing=false,spinning=false,returnFocus=null,closed=false;
  let portraitGeneration=0,portraitPending=false,portraitURL=null,portraitKey='';
  const releasePortrait=()=>{portraitGeneration++;if(portraitURL)URL.revokeObjectURL(portraitURL);portraitURL=null;$('[data-download]').hidden=true;$('[data-download]').removeAttribute('href');$('[data-portrait]').disabled=portraitPending||stage.dataset.ready!=='true';};
  let favorites=[],storageUnavailable=false;const storageKey=`river-oaks-character-favorites-v2:${encodeURIComponent(ownerId)}`;
  const valid=value=>validateCharacterDefinition(value,{ownerId}).ok;
  const readFavorites=()=>{if(storageUnavailable)return;try{const saved=JSON.parse(localStorage.getItem(storageKey)??'[]');favorites=Array.isArray(saved)?saved.filter(valid).slice(0,8):[];}catch{storageUnavailable=true;}};
  const saveFavorites=()=>{try{localStorage.setItem(storageKey,JSON.stringify(favorites));return true;}catch{storageUnavailable=true;status.textContent='Device storage is unavailable. Favorites will last for this visit only.';return false;}};
  const showFavorites=()=>{$('#cs-favorites').replaceChildren(new Option('Your favorites',''),...favorites.map((value,index)=>new Option(`${sharedAppearance(value.appearanceId).name} · ${value.form} · ${CHARACTER_PALETTES[value.palette].label}`,String(index))));$('[data-remove-favorite]').disabled=true;};
  const setStatus=state=>{$('[data-portrait]').disabled=state!=='ready'||portraitPending;status.textContent=state==='loading'?'Preparing your look…':state==='error'?'The preview could not load. Choose a character to try again.':'Preview ready. Your town appearance is unchanged.';};
  const render=()=>{
    if(!draft||!dialog.open)return;
    const value=draft.value,shown=comparing?draft.original:value,key=JSON.stringify(shown);if(portraitKey!==key){releasePortrait();portraitKey=key;}
    const look=sharedAppearance(value.appearanceId),person=sharedCharacter(look.character),colors=supportsCharacterColors(value.appearanceId);
    for(const button of dialog.querySelectorAll('[data-character]'))button.setAttribute('aria-pressed',String(button.dataset.character===person.id));
    $('[name=form]').value=look.form;
    const variants=$('[name=variant]');if(variants.dataset.character!==person.id){variants.replaceChildren(...person.variants.map(v=>new Option(v.label,v.id)));variants.dataset.character=person.id;}
    variants.value=look.variant;variants.disabled=person.variants.length<2;
    for(const button of dialog.querySelectorAll('button[data-palette],button[data-hair]')){const key=button.hasAttribute('data-palette')?'palette':'hair';button.disabled=!colors;button.setAttribute('aria-pressed',String(button.dataset[key]===value[key]));}
    $('[data-palette-name]').textContent=colors?CHARACTER_PALETTES[value.palette].label:'Authored wardrobe';$('[data-hair-name]').textContent=colors?CHARACTER_HAIR[value.hair].label:'Authored hair';
    $('[data-compatibility]').textContent=colors?'Colors are fitted to Sable’s human and fox looks. Shape, skin and accessories keep their authored fit.':'This character keeps its authored colors. Choose Sable to explore dress and hair colors.';
    $('[data-undo]').disabled=!draft.canUndo;$('[data-redo]').disabled=!draft.canRedo;
    $('[data-compare]').setAttribute('aria-pressed',String(comparing));$('[data-comparing]').hidden=!comparing;
    $('[data-look]').textContent=sharedAppearance(shown.appearanceId).label;
    dialog.dataset.appearance=value.appearanceId;dialog.dataset.palette=value.palette;dialog.dataset.hair=value.hair;
    preview?.setDefinition(shown);
  };
  const change=patch=>{try{draft.change(patch);comparing=false;render();}catch{status.textContent='That combination is not available. Choose one of the fitted options.';}};
  function open(){
    if(closed||dialog.open||!canOpen()||document.querySelector('dialog[open]'))return;
    const confirmed=getDefinition();if(!valid(confirmed))return;
    if(baseline!==confirmed.appearanceId){retained=null;baseline=confirmed.appearanceId;}
    draft=createCharacterDraft({ownerId,definition:retained??confirmed});comparing=false;spinning=false;
    returnFocus=document.activeElement;onOpen();dialog.showModal();readFavorites();showFavorites();
    $('[name=pose]').value='idle';$('[name=pose]').disabled=reducedMotion;$('[data-turntable]').disabled=reducedMotion;$('[data-turntable]').setAttribute('aria-pressed','false');$('#cs-yaw').value='0';
    $('[name=framing]').value='full';$('[name=lighting]').value='day';
    try{preview=createCharacterPreview({host:stage,ownerId,reducedMotion,onStatus:setStatus});render();}
    catch{setStatus('error');}
    $('[data-close]').focus();
  }
  const close=keep=>{if(!dialog.open)return;retained=keep?draft.value:draft.original;dialog.close();};
  trigger.addEventListener('click',open);
  $('[data-close]').addEventListener('click',()=>close(true));$('[data-keep]').addEventListener('click',()=>close(true));$('[data-cancel]').addEventListener('click',()=>close(false));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
  dialog.addEventListener('close',()=>{releasePortrait();preview?.dispose();preview=null;stage.replaceChildren();returnFocus?.focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled||!draft)return;
    const look=sharedAppearance(draft.value.appearanceId);
    if(button.dataset.character)change({appearanceId:appearanceFor(button.dataset.character,{form:look.form}).id});
    if(button.dataset.palette)change({palette:button.dataset.palette});if(button.dataset.hair)change({hair:button.dataset.hair});
  });
  for(const name of ['form','variant'])$(`[name=${name}]`).addEventListener('change',event=>{const look=sharedAppearance(draft.value.appearanceId);change({appearanceId:appearanceFor(look.character,{form:look.form,variant:look.variant,[name]:event.target.value}).id});});
  $('[data-portrait]').addEventListener('click',async()=>{
    if(!preview||portraitPending)return;
    releasePortrait();const token=++portraitGeneration;portraitPending=true;$('[data-portrait]').disabled=true;status.textContent='Rendering your 4K portrait…';
    try{
      const result=await preview.capturePortrait();if(token!==portraitGeneration||!dialog.open)return;
      portraitURL=URL.createObjectURL(result.blob);const link=$('[data-download]');link.href=portraitURL;link.download=`typesafe-place-${result.definition.appearanceId}-4k.png`;link.hidden=false;
      link.dataset.width=String(result.width);link.dataset.height=String(result.height);link.dataset.appearance=result.definition.appearanceId;link.dataset.palette=result.definition.palette;link.dataset.preset=result.preset;
      status.textContent='Your 3840 × 2160 portrait is ready. Download the PNG to keep it.';link.focus();
    }catch(error){if(token===portraitGeneration&&dialog.open)status.textContent=error.message||'Portrait could not be created. Try again.';}
    finally{portraitPending=false;$('[data-portrait]').disabled=stage.dataset.ready!=='true';}
  });
  $('[data-undo]').addEventListener('click',()=>{draft.undo();comparing=false;render();});$('[data-redo]').addEventListener('click',()=>{draft.redo();comparing=false;render();});
  $('[data-compare]').addEventListener('click',()=>{comparing=!comparing;render();});$('[data-random]').addEventListener('click',()=>{draft.randomize();comparing=false;render();});
  $('[data-favorite]').addEventListener('click',()=>{const value=draft.value;if(favorites.some(item=>JSON.stringify(item)===JSON.stringify(value))){status.textContent='This look is already a favorite.';return;}if(favorites.length>=8){status.textContent='Your eight favorites are full. Remove one to make room.';return;}favorites.push(value);if(saveFavorites())status.textContent='Favorite saved on this device.';showFavorites();});
  $('#cs-favorites').addEventListener('change',event=>{const index=event.target.value;if(index==='')return;try{draft.restore(favorites[Number(index)]);comparing=false;render();$('[data-remove-favorite]').disabled=false;}catch{status.textContent='That favorite is no longer compatible.';}});
  $('[data-remove-favorite]').addEventListener('click',()=>{const index=$('#cs-favorites').value;if(index==='')return;favorites.splice(Number(index),1);saveFavorites();showFavorites();});
  for(const name of ['pose','framing','lighting'])$(`[name=${name}]`).addEventListener('change',event=>preview?.setView({[name]:event.target.value}));
  $('#cs-yaw').addEventListener('input',event=>{spinning=false;$('[data-turntable]').setAttribute('aria-pressed','false');preview?.setView({yaw:Number(event.target.value),turntable:false});});
  $('[data-turntable]').addEventListener('click',()=>{spinning=!spinning;$('[data-turntable]').setAttribute('aria-pressed',String(spinning));preview?.setView({turntable:spinning});});
  dialog.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.target.matches('input,select,textarea')){event.preventDefault();event.shiftKey?draft.redo():draft.undo();comparing=false;render();}});
  return {trigger,open,get active(){return dialog.open;},update(){trigger.disabled=!canOpen();if(dialog.open&&!canOpen())close(true);},dispose(){close(false);closed=true;preview?.dispose();dialog.remove();trigger.remove();}};
}
