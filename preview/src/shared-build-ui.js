import { BUILD_KINDS, BUILD_FINISHES, buildKind } from './shared-build.js';
import './shared-build-ui.css';

export function createSharedBuildControls({getPose,request}){
  const panel=document.createElement('section');panel.className='shared-build-controls';panel.hidden=true;panel.setAttribute('aria-label','Build and decorate');
  panel.innerHTML=`<h2>Build & decorate</h2><p>Place an object on open ground ahead of you. Your creations stay in the shared town.</p>
    <div class="shared-build-fields"><label for="build-kind">Object<select id="build-kind"></select></label><label for="build-finish">Finish<select id="build-finish"></select></label></div>
    <button type="button" id="build-place">Place ahead</button><p id="build-status" role="status" aria-live="polite"></p>
    <h3>Your creations <span id="build-count"></span></h3><div class="shared-build-list" id="build-list"></div>`;
  const kindSelect=panel.querySelector('#build-kind'),finishSelect=panel.querySelector('#build-finish'),status=panel.querySelector('#build-status');
  for(const item of BUILD_KINDS)kindSelect.add(new Option(item.label,item.id));
  for(const item of BUILD_FINISHES)finishSelect.add(new Option(item.label,item.id));
  const list=panel.querySelector('#build-list'),count=panel.querySelector('#build-count');
  let own=[],signature='',busy=false;
  const front=()=>{
    const pose=getPose();if(!pose||pose.roomId||pose.flying||pose.riding)return null;
    return [Math.round((pose.position[0]-Math.sin(pose.yaw)*2.4)*10)/10,Math.round((-pose.position[2]+Math.cos(pose.yaw)*2.4)*10)/10];
  };
  const send=async message=>{
    if(busy)return;
    busy=true;panel.querySelectorAll('button').forEach(button=>button.disabled=true);status.textContent='Saving creation…';
    try{const result=await request(message);status.textContent=result.ok?'Town updated.':result.message??'Creation could not be saved.';}
    catch(error){status.textContent=error.message;}
    finally{busy=false;panel.querySelectorAll('button').forEach(button=>button.disabled=false);}
  };
  panel.querySelector('#build-place').addEventListener('click',()=>{
    const position=front();if(!position){status.textContent='Stand outside on the ground to build.';return;}
    send({type:'build',action:'place',kind:kindSelect.value,finish:finishSelect.value,position,yaw:getPose().yaw});
  });
  function render(){
    count.textContent=`${own.length}/24`;
    if(!own.length){const empty=document.createElement('p');empty.textContent='Nothing placed yet.';list.replaceChildren(empty);return;}
    const rows=own.map(item=>{
      const row=document.createElement('div');row.className='shared-build-row';
      const title=document.createElement('strong');title.textContent=buildKind(item.kind).label;
      const actions=document.createElement('div');actions.className='shared-build-actions';
      const button=(label,action)=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.disabled=busy;node.addEventListener('click',action);actions.append(node);};
      button('Move here',()=>{const position=front();if(!position){status.textContent='Stand outside on the ground to move a creation.';return;}send({type:'build',action:'edit',id:item.id,position,yaw:item.yaw});});
      button('Turn',()=>send({type:'build',action:'edit',id:item.id,position:item.position,yaw:item.yaw+Math.PI/4}));
      button('Remove',()=>send({type:'build',action:'remove',id:item.id}));
      row.append(title,actions);return row;
    });
    list.replaceChildren(...rows);
  }
  return {
    panel,
    show(){panel.hidden=false;},
    sync(items,selfId){
      const next=items.filter(item=>item.ownerId===selfId).sort((a,b)=>a.createdAt-b.createdAt);
      const key=JSON.stringify(next.map(item=>[item.id,item.kind,item.position,item.yaw]));
      if(key!==signature){own=next;signature=key;render();}
    },
    dispose(){panel.remove();},
  };
}
