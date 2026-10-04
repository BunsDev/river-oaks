import { BUILD_KINDS, BUILD_FINISHES, buildKind, buildFinish, MAX_SAVED_DESIGNS } from './shared-build.js';
import { BUILD_AHEAD, BUILD_ROTATE_STEP } from './builder-mode.js';
import './shared-build-ui.css';

// Build & decorate. With builder mode off, Place ahead drops the object a
// few steps in front of you. With it on, a live preview shows exactly where
// it will land and whether the town will accept it there; click the ground,
// press Enter or use Place here. Move on one of your creations picks it up
// into the preview.
export function createSharedBuildControls({getPose,request,isBuildableRoom=()=>false,onBuilderChange=()=>{}}){
  const panel=document.createElement('section');panel.className='shared-build-controls';panel.hidden=true;panel.setAttribute('aria-label','Build and decorate');
  panel.innerHTML=`<h2>Build & decorate</h2><p>Your creations stay in the shared town.</p>
    <div class="shared-build-fields"><label for="build-kind">Object<select id="build-kind"></select></label><label for="build-finish">Finish<select id="build-finish"></select></label></div>
    <button type="button" id="build-mode" aria-pressed="false">Builder mode</button>
    <div class="shared-build-aim" id="build-aim" hidden>
      <p id="build-hint" aria-live="polite"></p>
      <div class="shared-build-turn"><button type="button" id="build-turn-left" aria-label="Turn left (Shift+R)">↺ Turn</button><button type="button" id="build-turn-right" aria-label="Turn right (R)">Turn ↻</button></div>
      <p class="shared-build-keys">Point at the ground and click, or press Enter. R turns, Esc leaves builder mode.</p>
    </div>
    <button type="button" id="build-place">Place ahead</button><p id="build-status" role="status" aria-live="polite"></p>
    <h3>Town creations <span id="build-count"></span></h3><div class="shared-build-list" id="build-list"></div>
    <h3>Saved designs <span id="design-count"></span></h3><div class="shared-build-list" id="design-list"></div>`;
  const $=selector=>panel.querySelector(selector);
  const kindSelect=$('#build-kind'),finishSelect=$('#build-finish'),status=$('#build-status'),modeButton=$('#build-mode'),placeButton=$('#build-place'),aim=$('#build-aim'),hint=$('#build-hint');
  for(const item of BUILD_KINDS)kindSelect.add(new Option(item.label,item.id));
  for(const item of BUILD_FINISHES)finishSelect.add(new Option(item.label,item.id));
  const list=$('#build-list'),count=$('#build-count'),designList=$('#design-list'),designCount=$('#design-count');
  let own=[],selfId=null,signature='',designs=[],inventoryFor=null,inventoryVersion=0,libraryMode=false,busy=false,active=false,yaw=0,moving=null,target=null,verdict=null,selectedDesign=null;
  const grounded=()=>{const pose=getPose();return pose&&(!pose.roomId||isBuildableRoom(pose.roomId))&&!pose.flying&&!pose.riding?pose:null;};
  const front=()=>{
    const pose=grounded();if(!pose)return null;
    return [Math.round((pose.position[0]-Math.sin(pose.yaw)*BUILD_AHEAD)*10)/10,Math.round((-pose.position[2]+Math.cos(pose.yaw)*BUILD_AHEAD)*10)/10];
  };
  const refreshPlace=()=>{
    placeButton.textContent=active?(moving?`Move ${buildKind(moving.kind).label.toLowerCase()} here`:'Place here'):'Place ahead';
    placeButton.disabled=busy||(active&&!verdict?.valid);
  };
  const send=async message=>{
    if(busy)return false;
    busy=true;panel.querySelectorAll('button').forEach(button=>button.disabled=true);status.textContent='Saving creation…';
    let ok=false;
    try{const result=await request(message);ok=Boolean(result.ok);status.textContent=result.ok?'Town updated.':result.message??'Creation could not be saved.';
      if(result.ok&&Array.isArray(result.items)){
        inventoryVersion++;designs=result.items;libraryMode=Boolean(result.library);
        if(selectedDesign&&!designs.some(item=>item.id===selectedDesign.id))selectedDesign=null;
        renderDesigns();
      }}
    catch(error){status.textContent=error.message;}
    finally{busy=false;panel.querySelectorAll('button').forEach(button=>button.disabled=false);refreshPlace();}
    return ok;
  };
  const changed=()=>{refreshPlace();onBuilderChange(controls.builder);};
  function setBuilder(on,{item=null}={}){
    active=on;moving=on?item:null;target=null;verdict=null;
    if(item)selectedDesign=null;
    if(on){const pose=getPose();yaw=item?item.yaw:pose?.yaw??0;if(item){kindSelect.value=item.kind;finishSelect.value=item.finish;}}
    kindSelect.disabled=finishSelect.disabled=Boolean(moving);
    modeButton.setAttribute('aria-pressed',String(on));modeButton.textContent=on?'Leave builder mode':'Builder mode';
    aim.hidden=!on;hint.textContent=on?'Point at open ground…':'';panel.classList.toggle('building',on);
    changed();
  }
  async function place(){
    const placement=(position,angle)=>selectedDesign
      ? {type:'build',action:'place',templateId:selectedDesign.id,position,yaw:angle}
      : {type:'build',action:'place',kind:kindSelect.value,finish:finishSelect.value,position,yaw:angle};
    if(!active){
      const position=front();if(!position){status.textContent='Stand outside or inside a home to build.';return false;}
      return send(placement(position,getPose().yaw));
    }
    if(!grounded()){status.textContent='Stand outside or inside a home to build.';return false;}
    if(!target||!verdict?.valid){status.textContent=verdict?.message??'Point at open ground first.';return false;}
    const ok=await send(moving?{type:'build',action:'edit',id:moving.id,position:target,yaw}:placement(target,yaw));
    if(ok&&moving)setBuilder(true);
    return ok;
  }
  const rotate=direction=>{if(!active)return;yaw+=direction*BUILD_ROTATE_STEP;changed();};
  modeButton.addEventListener('click',()=>setBuilder(!active));
  placeButton.addEventListener('click',()=>void place());
  $('#build-turn-left').addEventListener('click',()=>rotate(-1));
  $('#build-turn-right').addEventListener('click',()=>rotate(1));
  for(const select of [kindSelect,finishSelect])select.addEventListener('change',()=>{selectedDesign=null;changed();});
  function renderDesigns(){
    const accountCount=designs.filter(item=>item.scope==='account').length;
    designCount.textContent=libraryMode?`${accountCount}/${MAX_SAVED_DESIGNS} account · ${designs.length-accountCount} this world`:`${designs.length}/${MAX_SAVED_DESIGNS}`;
    if(!designs.length){const empty=document.createElement('p');empty.textContent='Save a placed creation to reuse it.';designList.replaceChildren(empty);return;}
    const rows=designs.map(item=>{
      const row=document.createElement('div');row.className='shared-build-row';
      if(selectedDesign?.id===item.id)row.classList.add('moving');
      const title=document.createElement('strong');title.textContent=`${buildKind(item.kind).label} · ${buildFinish(item.finish).label}${libraryMode?item.scope==='account'?' · Every world':' · This world':''}`;
      const actions=document.createElement('div');actions.className='shared-build-actions';
      const use=document.createElement('button');use.type='button';use.textContent='Place a copy';use.disabled=busy;
      use.addEventListener('click',()=>{selectedDesign=item;kindSelect.value=item.kind;finishSelect.value=item.finish;setBuilder(true);status.textContent='Point at open ground to place a copy.';renderDesigns();});
      const remove=document.createElement('button');remove.type='button';remove.textContent='Delete design';remove.disabled=busy;
      remove.addEventListener('click',()=>void send({type:'inventory',action:'remove',id:item.id}));
      actions.append(use);
      if(libraryMode&&item.scope==='world'){
        const copy=document.createElement('button');copy.type='button';copy.textContent='Copy to account';copy.disabled=busy;
        copy.addEventListener('click',()=>void send({type:'inventory',action:'copy',id:item.id}));actions.append(copy);
      }
      actions.append(remove);row.append(title,actions);return row;
    });
    designList.replaceChildren(...rows);
  }
  function render(){
    count.textContent=`${own.filter(item=>item.ownerId===selfId).length}/24 yours · ${own.length} total`;
    if(!own.length){const empty=document.createElement('p');empty.textContent='Nothing placed yet.';list.replaceChildren(empty);return;}
    const rows=own.map(item=>{
      const row=document.createElement('div');row.className='shared-build-row';if(moving?.id===item.id)row.classList.add('moving');
      const title=document.createElement('strong');title.textContent=`${buildKind(item.kind).label}${item.ownerId===selfId?'':` · ${item.ownerName}`}`;
      const actions=document.createElement('div');actions.className='shared-build-actions';
      const button=(label,action)=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.disabled=busy;node.addEventListener('click',action);actions.append(node);};
      button('Move',()=>setBuilder(true,{item}));
      button('Turn',()=>send({type:'build',action:'edit',id:item.id,position:item.position,yaw:item.yaw+Math.PI/4}));
      if(item.ownerId===selfId)button('Save design',()=>void send({type:'inventory',action:'save',buildId:item.id}));
      button('Remove',()=>{if(moving?.id===item.id)setBuilder(true);send({type:'build',action:'remove',id:item.id});});
      row.append(title,actions);return row;
    });
    list.replaceChildren(...rows);
  }
  const controls={
    panel,
    show(){panel.hidden=false;},
    hide(){if(active)setBuilder(false);inventoryFor=null;inventoryVersion++;designs=[];libraryMode=false;selectedDesign=null;renderDesigns();panel.hidden=true;},
    get builder(){return {active,kind:kindSelect.value,finish:finishSelect.value,yaw,moving};},
    setBuilder,place,rotate,
    // The frame loop reports the aimed spot and the town's verdict on it.
    aimAt(position,result){target=position;verdict=result;hint.textContent=result?.message??'';hint.dataset.valid=String(Boolean(result?.valid));refreshPlace();},
    loadInventory(selfId){
      if(selfId===inventoryFor)return;
      inventoryFor=selfId;const version=++inventoryVersion;designs=[];libraryMode=false;selectedDesign=null;renderDesigns();
      if(!selfId)return;
      request({type:'inventory',action:'list'}).then(result=>{
        if(version!==inventoryVersion||inventoryFor!==selfId)return;
        if(!result.ok){inventoryFor=null;status.textContent=result.message??'Could not load saved designs.';return;}
        designs=result.items;libraryMode=Boolean(result.library);renderDesigns();
      }).catch(error=>{if(version===inventoryVersion){inventoryFor=null;status.textContent=error.message;}});
    },
    sync(items,ownerId){
      selfId=ownerId;
      const next=ownerId?[...items].sort((a,b)=>a.createdAt-b.createdAt):[];
      if(moving&&!next.some(item=>item.id===moving.id))setBuilder(true);
      else if(moving)moving=next.find(item=>item.id===moving.id);
      const key=JSON.stringify(next.map(item=>[item.id,item.kind,item.position,item.yaw,item.ownerId]));
      if(key!==signature){own=next;signature=key;render();}
    },
    dispose(){if(active)setBuilder(false);inventoryVersion++;panel.remove();},
  };
  renderDesigns();
  return controls;
}
