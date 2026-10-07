// One predictable home for play actions. On small windows the native disclosure
// preserves the world view; its contents remain scrollable when expanded.
export function createPlayDock({creationToolsEnabled=false}={}) {
  const dock=document.createElement('details');dock.className='visit-tools';
  const toggle=document.createElement('summary');toggle.className='visit-tools-toggle';
  toggle.innerHTML=`<span>${creationToolsEnabled?'Play, build & rides':'Play & rides'}</span><kbd class="rail-key-hint" aria-hidden="true"></kbd>`;
  toggle.querySelector('kbd').textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘⇧B':'Ctrl ⇧B';
  toggle.setAttribute('aria-keyshortcuts','Meta+Shift+B Control+Shift+B');
  const nav=document.createElement('nav');nav.className='play-rail-nav';nav.setAttribute('aria-label','Play activities');
  const context=document.createElement('p');context.className='play-rail-context';
  const content=document.createElement('div');content.className='visit-tools-content';
  const shell=document.createElement('div');shell.className='play-rail-shell';
  shell.append(nav,context,content);dock.append(toggle,shell);
  const compact=window.matchMedia('(max-width: 700px), (max-height: 600px)');
  const key='river-oaks-play-rail-open';let preference=null;
  try{preference=localStorage.getItem(key);}catch{/* Session choice still works. */}
  dock.open=preference===null?!compact.matches:preference==='true';
  const setOpen=(open,{focus=false}={})=>{
    if(!open&&shell.contains(document.activeElement))toggle.focus({preventScroll:true});
    dock.open=open;
    dock.classList.toggle('play-rail-requested',open&&document.body.classList.contains('bird-riding'));
    if(focus)toggle.focus({preventScroll:true});
  };
  dock.addEventListener('toggle',()=>{try{localStorage.setItem(key,String(dock.open));}catch{/* Session choice still works. */}});
  dock.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||event.isComposing||!dock.open)return;
    event.preventDefault();event.stopPropagation();setOpen(false);
  });
  const activities=[['Camera','.photo-tools'],['Character','.player-controls'],['Rides','.player-settings'],['Jev','.auto-controls'],['Birds','.bird-cams'],['Build','.shared-build-controls'],['Magic','.force-controls'],['Invasion','.invasion-controls']];
  const jump=selector=>{
    const target=content.querySelector(selector);if(!target||target.hidden)return;
    if(target.tagName==='DETAILS')target.open=true;
    const candidates=target.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)');
    const visible=node=>node.checkVisibility({visibilityProperty:true});
    const focusTarget=[...candidates].find(visible)??[...target.querySelectorAll('summary')].find(visible)??target;
    target.style.scrollMarginTop='8px';focusTarget.style.scrollMarginTop='8px';
    target.scrollIntoView({block:'start',behavior:'instant'});
    focusTarget.scrollIntoView({block:'nearest',behavior:'instant'});
    focusTarget.focus({preventScroll:true});
  };
  const links=activities.map(([label,selector])=>{
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.addEventListener('click',()=>jump(selector));nav.append(button);return {button,selector};
  });
  const refresh=()=>{
    if(!document.body.classList.contains('bird-riding'))dock.classList.remove('play-rail-requested');
    for(const {button,selector}of links){const target=content.querySelector(selector);const hidden=!target||target.hidden;if(button.hidden!==hidden)button.hidden=hidden;}
    const activity=document.body.classList.contains('bird-riding')?'Bird ride · T control · N next · Esc land'
      :content.querySelector('#build-mode[aria-pressed=true]')?'Building · R rotate · Enter place · Esc finish'
      :content.querySelector('#player-flight[aria-pressed=true]')?'Flying · Space rise · C lower · B land'
      :content.querySelector('#auto-toggle[aria-pressed=true]')?'Jev is guiding · movement takes over'
      :'Choose an activity · ? opens commands & keys';
    if(context.textContent!==activity)context.textContent=activity;
    if(shell.contains(document.activeElement)&&document.activeElement.closest('[hidden]'))toggle.focus({preventScroll:true});
  };
  const observer=new MutationObserver(refresh);
  observer.observe(content,{subtree:true,attributes:true,attributeFilter:['hidden','aria-pressed'],childList:true});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  refresh();
  return {element:dock,content,setOpen,jump};
}
