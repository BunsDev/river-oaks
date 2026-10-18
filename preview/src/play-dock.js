import { PLAY_PANES, nextPlayTab, playPaneFor } from './play-rail-tabs.js';

// One predictable home for play actions, laid out like a game menu: a tab per
// activity and one pane at a time. Modules still append their panels to
// `content`; the dock files each under its tab. On small windows the native
// disclosure preserves the world view; the open pane scrolls if it must.
export function createPlayDock({creationToolsEnabled=false}={}) {
  const dock=document.createElement('details');dock.className='visit-tools';
  const toggle=document.createElement('summary');toggle.className='visit-tools-toggle';
  toggle.innerHTML=`<span>${creationToolsEnabled?'Play, build & rides':'Play & rides'}</span><kbd class="rail-key-hint" aria-hidden="true"></kbd>`;
  toggle.querySelector('kbd').textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘⇧B':'Ctrl ⇧B';
  toggle.setAttribute('aria-keyshortcuts','Meta+Shift+B Control+Shift+B');
  const tabs=document.createElement('div');tabs.className='play-rail-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Play activities');
  // The chosen activity's name, with previous and next for pointer and touch.
  const heading=document.createElement('div');heading.className='play-rail-heading';
  const title=document.createElement('p');title.className='play-rail-title';title.setAttribute('aria-hidden','true');
  const step=(label,glyph)=>{const button=document.createElement('button');button.type='button';button.className='play-rail-step';button.setAttribute('aria-label',label);button.textContent=glyph;return button;};
  const previous=step('Previous activity','‹'),next=step('Next activity','›');heading.append(previous,title,next);
  const context=document.createElement('p');context.className='play-rail-context';
  const content=document.createElement('div');content.className='visit-tools-content';
  const shell=document.createElement('div');shell.className='play-rail-shell';
  shell.append(tabs,heading,content,context);dock.append(toggle,shell);
  const compact=window.matchMedia('(max-width: 700px), (max-height: 600px)');
  const key='river-oaks-play-rail-open';let preference=null;
  try{preference=localStorage.getItem(key);}catch{/* Session choice still works. */}
  dock.open=preference===null?!compact.matches:preference==='true';
  // The toggle event is queued, so a choice made in code is saved at once: a
  // reload right after closing the rail must not bring it back open.
  const remember=open=>{try{localStorage.setItem(key,String(open));}catch{/* Session choice still works. */}};
  const setOpen=(open,{focus=false}={})=>{
    if(!open&&shell.contains(document.activeElement))toggle.focus({preventScroll:true});
    dock.open=open;remember(open);
    dock.classList.toggle('play-rail-requested',open&&document.body.classList.contains('bird-riding'));
    if(focus)toggle.focus({preventScroll:true});
  };
  dock.addEventListener('toggle',()=>remember(dock.open));
  dock.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||event.isComposing||!dock.open)return;
    event.preventDefault();event.stopPropagation();setOpen(false);
  });
  const panes=new Map(),order=PLAY_PANES.map(pane=>pane.id),tabKey='river-oaks-play-rail-tab';let selected=null,saved=null,chosen=false;
  try{saved=localStorage.getItem(tabKey);}catch{/* The first activity opens instead. */}
  const paneFor=definition=>{
    let entry=panes.get(definition.id);if(entry)return entry;
    const tab=document.createElement('button');tab.type='button';tab.className='play-rail-tab';tab.id=`play-tab-${definition.id}`;tab.tabIndex=-1;
    tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`play-pane-${definition.id}`);tab.setAttribute('aria-selected','false');
    tab.setAttribute('aria-label',definition.label);tab.title=definition.label;tab.innerHTML=definition.icon;
    const pane=document.createElement('section');pane.className='play-rail-pane';pane.id=`play-pane-${definition.id}`;pane.hidden=true;
    pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',tab.id);
    tab.addEventListener('click',()=>select(definition.id));
    entry={definition,tab,pane};panes.set(definition.id,entry);
    // Menu order holds however late a module adds its panel.
    const sorted=[...panes.values()].sort((a,b)=>order.indexOf(a.definition.id)-order.indexOf(b.definition.id));
    tabs.append(...sorted.map(item=>item.tab));content.append(...sorted.map(item=>item.pane));
    return entry;
  };
  const visible=()=>[...panes.values()].filter(entry=>!entry.tab.hidden).map(entry=>entry.definition.id).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  // Only a player's choice is remembered; until then the dock keeps preferring the
  // remembered tab, then Character, as panels arrive (the character card comes last).
  function select(id,{focus=false,user=true}={}){
    const entry=panes.get(id);if(!entry||entry.tab.hidden)return false;
    selected=id;if(user)chosen=true;
    for(const item of panes.values()){const on=item===entry;item.tab.setAttribute('aria-selected',String(on));item.tab.tabIndex=on?0:-1;item.pane.hidden=!on;}
    title.textContent=entry.definition.label;dock.setAttribute('data-play-tab',id);content.scrollTop=0;
    if(user)try{localStorage.setItem(tabKey,id);}catch{/* The choice lasts for this visit. */}
    if(focus)entry.tab.focus({preventScroll:true});
    return true;
  }
  tabs.addEventListener('keydown',event=>{
    // Step from the focused tab: it is normally the selected one, but a pointer can focus another.
    const from=event.target.closest?.('[role=tab]')?.id?.slice('play-tab-'.length)??selected;
    const target=nextPlayTab(visible(),from,event.key);if(!target)return;
    event.preventDefault();select(target,{focus:true});
  });
  previous.addEventListener('click',()=>select(nextPlayTab(visible(),selected,'ArrowLeft')));
  next.addEventListener('click',()=>select(nextPlayTab(visible(),selected,'ArrowRight')));
  // Rides was a disclosure inside the character panel; now it is its own activity,
  // so it stays open and its summary is not shown.
  const keptOpen=new WeakSet();
  const adopt=()=>{
    for(const child of [...(content.children??[])])if(!child.classList?.contains('play-rail-pane'))paneFor(playPaneFor(child)).pane.append(child);
    const rides=content.querySelector?.('.player-controls .player-settings');
    if(rides){
      // The pane shares the character card's control styles (see play-rail-menu.css).
      const ridesPane=paneFor(PLAY_PANES.find(pane=>pane.id==='rides')).pane;ridesPane.classList.add('play-rail-rides');
      rides.open=true;ridesPane.append(rides);
      if(!keptOpen.has(rides)){keptOpen.add(rides);rides.addEventListener('toggle',()=>{if(!rides.open)rides.open=true;});}
    }
  };
  const jump=selector=>{
    const target=content.querySelector(selector);if(!target||target.hidden)return;
    const pane=target.closest?.('.play-rail-pane');if(pane)select(pane.id.slice('play-pane-'.length));
    if(target.tagName==='DETAILS')target.open=true;
    const candidates=target.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)');
    const visible=node=>node.checkVisibility({visibilityProperty:true});
    const focusTarget=[...candidates].find(visible)??[...target.querySelectorAll('summary')].find(visible)??target;
    target.style.scrollMarginTop='8px';focusTarget.style.scrollMarginTop='8px';
    target.scrollIntoView({block:'start',behavior:'instant'});
    focusTarget.scrollIntoView({block:'nearest',behavior:'instant'});
    focusTarget.focus({preventScroll:true});
  };
  const refresh=()=>{
    if(!document.body.classList.contains('bird-riding'))dock.classList.remove('play-rail-requested');
    adopt();
    // An activity whose panels are all hidden (no bird cams yet, not in an office) has no tab.
    for(const entry of panes.values()){const hidden=![...entry.pane.children].some(child=>!child.hidden);if(entry.tab.hidden!==hidden)entry.tab.hidden=hidden;}
    const ids=visible(),preferred=[saved,'character'].find(id=>ids.includes(id))??ids[0];
    if(preferred&&(!chosen?selected!==preferred:!selected||panes.get(selected)?.tab.hidden))select(preferred,{user:false});
    const activity=document.body.classList.contains('bird-riding')?'Bird ride · T control · N next · Esc land'
      :content.querySelector('#build-mode[aria-pressed=true]')?'Building · R rotate · Enter place · Esc finish'
      :content.querySelector('#player-flight[aria-pressed=true]')?'Flying · Space rise · C lower · B land'
      :'Choose an activity · ? opens commands & keys';
    if(context.textContent!==activity)context.textContent=activity;
    if(shell.contains(document.activeElement)&&document.activeElement.closest('[hidden]'))toggle.focus({preventScroll:true});
  };
  const observer=new MutationObserver(refresh);
  observer.observe(content,{subtree:true,attributes:true,attributeFilter:['hidden','aria-pressed'],childList:true});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  refresh();
  return {element:dock,content,setOpen,jump,select};
}
