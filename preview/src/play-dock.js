// One predictable home for play actions. On small windows the native disclosure
// preserves the world view; its contents remain scrollable when expanded.
export function createPlayDock() {
  const dock=document.createElement('details');dock.className='visit-tools';
  const toggle=document.createElement('summary');toggle.className='visit-tools-toggle';
  toggle.textContent='Play, build & rides';
  const content=document.createElement('div');content.className='visit-tools-content';
  dock.append(toggle,content);
  const compact=window.matchMedia('(max-width: 700px), (max-height: 600px)');
  const collapse=()=>{
    if(content.contains(document.activeElement))toggle.focus({preventScroll:true});
    dock.open=false;
  };
  const resize=()=>{if(compact.matches)collapse();else dock.open=true;};
  resize();compact.addEventListener('change',resize);
  dock.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!dock.open)return;
    event.preventDefault();event.stopPropagation();collapse();
  });
  return {element:dock,content};
}
