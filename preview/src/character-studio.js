import { createCharacterAccount } from './character-account.js';
import { createCharacterDraft } from './character-studio-state.js';
import { createCharacterPreview } from './character-studio-preview.js';
import { CHARACTER_PALETTES, CHARACTER_HAIR } from './character-customization.js';
import { validateCharacterDefinition } from './character-definition.js';
import { describeLook, studioChoices, studioRoster } from './character-studio-guide.js';
import { appearanceFor, sharedAppearance, sharedCharacter } from './shared-appearances.js';
import './character-studio.css';

export function createCharacterStudio({ownerId,getDefinition,accountTransport=null,canOpen=()=>true,canStayOpen=canOpen,onOpen=()=>{},reducedMotion=false}){
  const trigger=document.createElement('button');trigger.type='button';trigger.className='character-studio-trigger';trigger.textContent='Open character studio';trigger.setAttribute('aria-haspopup','dialog');
  const dialog=document.createElement('dialog');dialog.className='character-studio';dialog.setAttribute('aria-labelledby','character-studio-title');
  dialog.innerHTML=`<header class="cs-header"><div><p class="cs-eyebrow">TypeSafe Place · Atelier</p><h2 id="character-studio-title">Character studio</h2></div><button type="button" data-close aria-label="Close character studio">✕</button></header>
    <div class="cs-workspace"><section class="cs-stage" aria-label="Character preview"><div class="cs-preview"></div><div class="cs-caption"><span data-look></span><span data-comparing hidden>Original</span></div>
      <div class="cs-view-tools"><label>View<select name="framing"><option value="full">Full look</option><option value="portrait">Portrait</option></select></label><label>Light<select name="lighting"><option value="day">Garden daylight</option><option value="warm">Golden hour</option></select></label><label>Pose<select name="pose"><option value="idle">Idle</option><option value="walk">Walk</option><option value="wave">Wave</option></select></label></div>
      <div class="cs-rotation"><label for="cs-yaw">Rotate</label><input id="cs-yaw" type="range" min="-180" max="180" value="0" step="1"><button type="button" data-turntable aria-pressed="false">Turntable</button></div></section>
    <section class="cs-controls" aria-label="Customize character"><p class="cs-intro">Start with someone you love. Make the look yours.</p>
      <fieldset class="cs-step"><legend><span class="cs-step-mark" aria-hidden="true">1</span>Choose a character</legend><div class="cs-roster">${studioRoster(ownerId).map(person=>`<label class="cs-chip" data-character="${person.id}" title="${person.name} · ${person.title}" style="--cs-accent:${person.accent}"><input type="radio" name="cs-character" value="${person.id}"><span class="cs-mark" aria-hidden="true">${person.name[0]}</span><span>${person.name}</span></label>`).join('')}</div>
        <div class="cs-summary"><p><strong data-cs-summary-name></strong><span data-cs-summary-title></span></p><p class="cs-summary-description" data-cs-summary-description></p><p class="cs-summary-options" data-cs-summary-options></p></div></fieldset>
      <fieldset class="cs-step"><legend><span class="cs-step-mark" aria-hidden="true">2</span>Choose a form</legend><div class="cs-segments"><label><input type="radio" name="cs-form" value="human"><span>Humanoid</span></label><label><input type="radio" name="cs-form" value="beast"><span>Beast<small data-cs-species></small></span></label></div>
        <fieldset class="cs-wardrobe" data-cs-wardrobe hidden><legend>Wardrobe</legend><div class="cs-segments" data-cs-variants></div></fieldset></fieldset>
      <fieldset class="cs-step"><legend><span class="cs-step-mark" aria-hidden="true">3</span>Add color</legend><div class="cs-colors" data-cs-colors>
        <fieldset data-palette><legend>Dress color</legend><div class="cs-swatches">${Object.entries(CHARACTER_PALETTES).map(([id,item])=>`<label class="cs-swatch" data-palette="${id}" title="${item.label}" style="--cs-swatch:${item.color}"><input type="radio" name="cs-palette" value="${id}" aria-label="${item.label}"></label>`).join('')}</div><p data-palette-name></p></fieldset>
        <fieldset data-hair><legend>Hair color</legend><div class="cs-swatches">${Object.entries(CHARACTER_HAIR).map(([id,item])=>`<label class="cs-swatch" data-hair="${id}" title="${item.label}" style="--cs-swatch:${item.color}"><input type="radio" name="cs-hair" value="${id}" aria-label="${item.label}"></label>`).join('')}</div><p data-hair-name></p></fieldset></div>
        <p class="cs-help" data-compatibility></p></fieldset>
      <p class="sr-only" data-cs-announce aria-live="polite"></p>
      <div class="cs-edit-tools"><button type="button" data-undo aria-keyshortcuts="Control+Z Meta+Z">Undo</button><button type="button" data-redo aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">Redo</button><button type="button" data-compare aria-pressed="false">Before / after</button><button type="button" data-remix>Remix</button><button type="button" data-random>Surprise me</button></div>
      <div class="cs-favorites"><button type="button" data-favorite>Favorite this look</button><label class="sr-only" for="cs-favorites">Favorite looks</label><select id="cs-favorites"><option value="">Your favorites</option></select><button type="button" data-remove-favorite disabled>Remove favorite</button></div>
      <div class="cs-portrait"><button type="button" data-portrait>Create 4K portrait</button><a data-download hidden>Download PNG</a><p>Front pose · Garden daylight · 3840 × 2160</p></div>
      <p class="cs-status" role="status" aria-live="polite"></p></section></div>
    <footer class="cs-footer"><div class="cs-account"><p data-account-status role="status" aria-live="polite">Connecting to your saved looks…</p><p>Save a private draft, or wear this look for others in town to see. Favorites stay on this device.</p><div class="cs-account-recovery"><button type="button" data-retry hidden>Retry</button><button type="button" data-refresh hidden>Check saved account</button><button type="button" data-load-draft hidden>Use saved draft</button></div></div><div class="cs-save-actions"><button type="button" data-cancel>Discard edits</button><button type="button" data-save disabled>Save draft</button><button type="button" data-wear disabled>Wear in town</button><button type="button" data-keep>Close studio</button></div></footer>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector),status=$('.cs-status'),stage=$('.cs-preview');
  let draft=null,preview=null,retained=null,baseline=null,comparing=false,spinning=false,returnFocus=null,closed=false;
  let portraitGeneration=0,portraitPending=false,portraitURL=null,portraitKey='';
  const releasePortrait=()=>{portraitGeneration++;if(portraitURL)URL.revokeObjectURL(portraitURL);portraitURL=null;$('[data-download]').hidden=true;$('[data-download]').removeAttribute('href');$('[data-portrait]').disabled=portraitPending||stage.dataset.ready!=='true';};
  let favorites=[],storageUnavailable=false;const storageKey=`river-oaks-character-favorites-v2:${encodeURIComponent(ownerId)}`;
  const valid=value=>validateCharacterDefinition(value,{ownerId}).ok;
  const editable=value=>({...value,revision:0});
  const sameLook=(a,b)=>Boolean(a&&b)&&JSON.stringify(editable(a))===JSON.stringify(editable(b));
  const readFavorites=()=>{if(storageUnavailable)return;try{const saved=JSON.parse(localStorage.getItem(storageKey)??'[]');favorites=Array.isArray(saved)?saved.filter(valid).slice(0,8).map(editable):[];}catch{storageUnavailable=true;}};
  const saveFavorites=()=>{try{localStorage.setItem(storageKey,JSON.stringify(favorites));return true;}catch{storageUnavailable=true;status.textContent='Device storage is unavailable. Favorites will last for this visit only.';return false;}};
  const showFavorites=()=>{$('#cs-favorites').replaceChildren(new Option('Your favorites',''),...favorites.map((value,index)=>new Option(describeLook(value),String(index))));$('[data-remove-favorite]').disabled=true;};
  const setStatus=state=>{$('[data-portrait]').disabled=state!=='ready'||portraitPending;status.textContent=state==='loading'?'Preparing your look…':state==='error'?'The preview could not load. Choose a character to try again.':'Preview ready. Your town appearance is unchanged.';};
  const render=()=>{
    if(!draft||!dialog.open)return;
    const value=draft.value,shown=comparing?draft.original:value,key=JSON.stringify(shown);if(portraitKey!==key){releasePortrait();portraitKey=key;}
    const choices=studioChoices(ownerId,value.appearanceId),person=sharedCharacter(choices.character),colors=choices.colors;
    const variants=$('[data-cs-variants]');
    if(variants.dataset.csFor!==person.id){
      variants.dataset.csFor=person.id;
      variants.replaceChildren(...choices.variants.map(variant=>{const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='radio';input.name='cs-variant';input.value=variant.id;text.textContent=variant.label;label.append(input,text);return label;}));
    }
    $('[data-cs-wardrobe]').hidden=choices.variants.length<2;
    // Radios mirror the staged definition, so a rejected or undone choice snaps back.
    const selected={'cs-character':person.id,'cs-form':choices.form,'cs-variant':choices.variant,'cs-palette':value.palette??'authored','cs-hair':value.hair??'authored'};
    for(const input of dialog.querySelectorAll('.cs-controls input[type=radio]'))input.checked=input.value===selected[input.name];
    $('[data-cs-species]').textContent=person.species;$('[data-remix]').textContent=`Remix ${person.name}`;
    $('[data-cs-summary-name]').textContent=person.name;$('[data-cs-summary-title]').textContent=person.title;
    $('[data-cs-summary-description]').textContent=choices.description;$('[data-cs-summary-options]').textContent=choices.summary;
    $('[data-cs-colors]').hidden=!colors;
    $('[data-palette-name]').textContent=colors?CHARACTER_PALETTES[value.palette].label:'';$('[data-hair-name]').textContent=colors?CHARACTER_HAIR[value.hair].label:'';
    $('[data-compatibility]').textContent=colors?'Colors are fitted to Sable’s human and fox looks. Shape, skin and accessories keep their authored fit.':`${person.name}’s colors stay as designed for now. Choose Sable to try dress and hair colors.`;
    $('[data-undo]').disabled=!draft.canUndo;$('[data-redo]').disabled=!draft.canRedo;
    $('[data-compare]').setAttribute('aria-pressed',String(comparing));$('[data-comparing]').hidden=!comparing;
    $('[data-look]').textContent=sharedAppearance(shown.appearanceId).label;
    dialog.dataset.appearance=value.appearanceId;dialog.dataset.palette=value.palette;dialog.dataset.hair=value.hair;
    // The preview image names the look it shows, including the original during before/after.
    stage.querySelector('canvas')?.setAttribute('aria-label',`${comparing?'Original look':'Live preview'}: ${describeLook(shown)}`);
    preview?.setDefinition(shown);renderAccount();
  };
  const change=patch=>{try{draft.change(patch);comparing=false;}catch{status.textContent='That combination is not available. Choose one of the fitted options.';}render();};
  // Undo, redo, Surprise me and favorites change the look without moving focus,
  // so screen readers hear the result here. Direct radio choices announce themselves.
  const announce=text=>{const region=$('[data-cs-announce]');region.textContent='';requestAnimationFrame(()=>{region.textContent=text;});};
  const step=(action,verb)=>{
    action();comparing=false;render();announce(`${verb}: ${describeLook(draft.value)}.`);
    // An undo can hide the focused swatch or disable the focused button; keep keyboard focus in the Studio.
    const active=document.activeElement;
    if(!dialog.contains(active)||active.closest('[hidden]')||active.disabled)
      [verb==='Undone'&&'[data-redo]',verb==='Redone'&&'[data-undo]','input[name=cs-character]:checked'].filter(Boolean).map($).find(node=>node&&!node.disabled)?.focus();
  };
  let accountState={phase:'idle',character:null,selection:null,canRetry:false,error:null};
  const renderAccount=()=>{
    const state=accountState,busy=['loading','saving','publishing','equipping'].includes(state.phase),value=draft?.value;
    const saved=sameLook(value,state.character?.draft),worn=sameLook(value,state.selection?.character),current=Boolean(value)&&sameLook(value,getDefinition());
    const messages={idle:'Connecting to your saved looks…',loading:'Checking your saved looks…',saving:'Saving your private draft…',publishing:'Preparing your look for town…',equipping:'Waiting for the town to confirm your look…',
      conflict:'Your account changed elsewhere. Your edits are still here. Check the saved account before choosing what to save.',
      error:state.error==='character_studio_disabled'?'Character Studio is paused. Your saved looks and local edits are safe.':state.error==='appearance_cooldown'?'Your draft is saved. Wait a moment, then retry wearing it.':state.canRetry?'The action is not confirmed. Your edits are safe here. Retry to check the same action.':'Your account could not be updated. Your edits are safe here. Check the saved account to try again.',
      ready:worn?'You are wearing this look in town.':saved?'Private draft saved. Wear it when you are ready.':current?'This is your current town look. Change anything to start a new one.':'You have unsaved edits. Your town appearance is unchanged.'};
    $('[data-account-status]').textContent=accountTransport?messages[state.phase]:'Saved looks are unavailable. Your edits stay in this tab.';
    dialog.dataset.accountPhase=state.phase;
    $('[data-save]').disabled=!accountTransport||busy||state.phase!=='ready'||saved;
    $('[data-wear]').disabled=!accountTransport||busy||state.phase!=='ready'||!state.selection||worn;
    $('[data-retry]').hidden=!state.canRetry;
    $('[data-refresh]').hidden=!accountTransport||state.canRetry||!['error','conflict'].includes(state.phase);
    $('[data-load-draft]').hidden=!state.character?.draft||saved||busy||state.canRetry;
    $('[data-cancel]').disabled=busy||state.canRetry;
  };
  let refreshOnOpen=false,refreshQueued=false;
  const account=accountTransport?createCharacterAccount({ownerId,...accountTransport,onChange:state=>{accountState=state;renderAccount();refreshAccount();}}):null;
  const accountAction=action=>{action().catch(()=>{});};
  function refreshAccount(){
    if(!account||!dialog.open||!refreshOnOpen||refreshQueued||accountState.canRetry||['loading','saving','publishing','equipping'].includes(accountState.phase))return;
    refreshQueued=true;
    // Controller notifications precede its finally block releasing the busy guard.
    queueMicrotask(()=>{
      refreshQueued=false;
      if(closed||!dialog.open||!refreshOnOpen||accountState.canRetry||['loading','saving','publishing','equipping'].includes(accountState.phase))return;
      refreshOnOpen=false;accountAction(()=>account.load());
    });
  }
  $('[data-save]').addEventListener('click',()=>accountAction(()=>account.save(draft.value)));
  $('[data-wear]').addEventListener('click',()=>accountAction(()=>account.wear(draft.value)));
  $('[data-retry]').addEventListener('click',()=>accountAction(()=>account.retry()));
  $('[data-refresh]').addEventListener('click',()=>accountAction(()=>account.load()));
  $('[data-load-draft]').addEventListener('click',()=>{draft.restore(editable(accountState.character.draft));comparing=false;render();});
  function open(){
    if(closed||dialog.open||!canOpen()||document.querySelector('dialog[open]'))return;
    const confirmed=getDefinition();if(!valid(confirmed))return;
    const confirmedDraft=editable(confirmed);
    if(retained&&sameLook(retained,baseline))retained=null;baseline=confirmedDraft;
    draft=createCharacterDraft({ownerId,definition:retained??confirmedDraft});comparing=false;spinning=false;
    returnFocus=document.activeElement;onOpen();dialog.showModal();readFavorites();showFavorites();
    $('[name=pose]').value='idle';$('[name=pose]').disabled=reducedMotion;$('[data-turntable]').disabled=reducedMotion;$('[data-turntable]').setAttribute('aria-pressed','false');$('#cs-yaw').value='0';
    $('[name=framing]').value='full';$('[name=lighting]').value='day';
    try{preview=createCharacterPreview({host:stage,ownerId,reducedMotion,onStatus:setStatus});}
    catch{setStatus('error');}
    render();
    renderAccount();refreshOnOpen=true;refreshAccount();
    $('[data-close]').focus();
  }
  const close=keep=>{if(!dialog.open)return;retained=keep?draft.value:draft.original;dialog.close();};
  trigger.addEventListener('click',open);
  $('[data-close]').addEventListener('click',()=>close(true));$('[data-keep]').addEventListener('click',()=>close(true));$('[data-cancel]').addEventListener('click',()=>close(false));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
  dialog.addEventListener('close',()=>{releasePortrait();preview?.dispose();preview=null;stage.replaceChildren();returnFocus?.focus({preventScroll:true});});
  $('.cs-controls').addEventListener('change',event=>{
    const input=event.target;if(input.type!=='radio'||!draft)return;
    const look=sharedAppearance(draft.value.appearanceId),key=input.name.slice(3);
    if(key==='character')change({appearanceId:appearanceFor(input.value,{form:look.form})?.id});
    else if(key==='form'||key==='variant')change({appearanceId:appearanceFor(look.character,{form:look.form,variant:look.variant,[key]:input.value})?.id});
    else if(key==='palette'||key==='hair')change({[key]:input.value});
  });
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
  $('[data-undo]').addEventListener('click',()=>step(()=>draft.undo(),'Undone'));$('[data-redo]').addEventListener('click',()=>step(()=>draft.redo(),'Redone'));
  $('[data-compare]').addEventListener('click',()=>{comparing=!comparing;render();announce(comparing?`Showing the original: ${describeLook(draft.original)}.`:`Showing your edit: ${describeLook(draft.value)}.`);});
  $('[data-remix]').addEventListener('click',()=>step(()=>draft.remix(),'Remix'));$('[data-random]').addEventListener('click',()=>step(()=>draft.randomize(),'Surprise'));
  $('[data-favorite]').addEventListener('click',()=>{const value=draft.value;if(favorites.some(item=>JSON.stringify(item)===JSON.stringify(value))){status.textContent='This look is already a favorite.';return;}if(favorites.length>=8){status.textContent='Your eight favorites are full. Remove one to make room.';return;}favorites.push(value);if(saveFavorites())status.textContent='Favorite saved on this device.';showFavorites();});
  $('#cs-favorites').addEventListener('change',event=>{const index=event.target.value;if(index==='')return;try{step(()=>draft.restore(editable(favorites[Number(index)])),'Favorite');$('[data-remove-favorite]').disabled=false;}catch{status.textContent='That favorite is no longer compatible.';}});
  $('[data-remove-favorite]').addEventListener('click',()=>{const index=$('#cs-favorites').value;if(index==='')return;favorites.splice(Number(index),1);saveFavorites();showFavorites();});
  for(const name of ['pose','framing','lighting'])$(`[name=${name}]`).addEventListener('change',event=>preview?.setView({[name]:event.target.value}));
  $('#cs-yaw').addEventListener('input',event=>{spinning=false;$('[data-turntable]').setAttribute('aria-pressed','false');preview?.setView({yaw:Number(event.target.value),turntable:false});});
  $('[data-turntable]').addEventListener('click',()=>{spinning=!spinning;$('[data-turntable]').setAttribute('aria-pressed',String(spinning));preview?.setView({turntable:spinning});});
  // Choice controls are radios, so only text entry keeps its own undo.
  dialog.addEventListener('keydown',event=>{if(draft&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.target.matches('textarea,input:not([type=radio],[type=range])')){event.preventDefault();if(event.shiftKey?draft.canRedo:draft.canUndo)event.shiftKey?step(()=>draft.redo(),'Redone'):step(()=>draft.undo(),'Undone');}});
  return {trigger,open,get active(){return dialog.open;},update(){trigger.disabled=!canOpen();if(dialog.open&&!canStayOpen())close(true);},dispose(){close(false);closed=true;account?.dispose();preview?.dispose();dialog.remove();trigger.remove();}};
}
