import * as THREE from 'three';
import { createWalkingEnvironment } from './walking.js';
import { carriageContains } from './carriage-parking.js';
import { createForceBody, createForceAnchor, forceAnchorPosition, stepForceBody, pushForceBody, releaseForceBody } from './force-motion.js';
import './force.css';

const RANGE=8;
const visible=object=>{for(let p=object;p;p=p.parent)if(!p.visible)return false;return true;};
const position=target=>target.local
  ?[target.local.position[0],target.local.position[2]+(target.local.force?.height??0),-target.local.position[1]]
  :target.object.getWorldPosition(new THREE.Vector3()).toArray();

export function createForceControls({host,walking,getTargets,getObstacles,getCarriage,onCast,onManual,onProjectileMove=()=>null}) {
  const panel=document.createElement('details');panel.className='force-controls';
  panel.innerHTML=`<summary><span>Force · telekinesis</span><span id="force-state" class="force-state">Off</span></summary>
    <button id="force-toggle" type="button" aria-pressed="false" aria-controls="force-actions"><span>Enable Force</span><kbd>T</kbd></button>
    <div id="force-actions" hidden>
      <label for="force-target">Nearby target</label><select id="force-target"></select>
      <div class="force-buttons"><button id="force-lift" type="button">Lift <kbd>G</kbd></button><button id="force-push" type="button">Push <kbd>R</kbd></button><button id="force-lower" type="button">Lower <kbd>X</kbd></button></div>
      <p class="force-help">Select a person or street bin. Walk and turn to carry your target. Push a held bin into a window to break it; glass restores after 20 seconds. Indoor people lift in place. Escape lowers gently.</p>
    </div><p id="force-status" role="status" aria-live="polite">Lift, hold, push, and gently lower nearby targets.</p>`;
  const $=id=>panel.querySelector(`#force-${id}`),choice=$('target');
  let enabled=false,environment=null,active=null,options=[],lastPaint=-Infinity;
  const removers=[];
  const say=text=>{if($('status').textContent!==text)$('status').textContent=text;};
  const eligible=target=>{
    const pose=walking.getPose();if(!environment||!pose||pose.riding||!visible(target.object))return false;
    if(target.local?.abducted||target.local?.wish)return false;
    const p=position(target);
    if((target.local?target.local.storeId??null:environment.roomAt(p[0],p[2])?.id??null)!==pose.roomId)return false;
    const eye=target.local?.eyeHeight??target.height/2;
    return Math.hypot(p[0]-pose.position[0],p[1]+eye-pose.position[1],p[2]-pose.position[2])<=RANGE
      && environment.hasSightLine([pose.position[0],-pose.position[2],pose.position[1]],[p[0],-p[2],p[1]+eye]);
  };
  const finish=()=>{
    if(!active)return;
    const {target}=active;
    if(target.local) {
      delete target.local.force;
      if(!target.local.indoor&&target.local.life) {
        const life=target.local.life;life.routeVersion++;life.route=[];life.destination=null;life.waitUntil=0;life.speed=life.velocity=0;
      }
    }
    say(`${target.name} is back on the ground.`);active=null;onCast(null);
  };
  const paint=()=>{
    const pose=walking.getPose(),previous=choice.value;
    options=getTargets().filter(eligible).sort((a,b)=>{
      const distance=t=>Math.hypot(position(t)[0]-pose.position[0],position(t)[2]-pose.position[2]);
      return distance(a)-distance(b);
    });
    if(active&&!options.some(t=>t.id===active.target.id))options.unshift(active.target);
    const ids=options.map(t=>t.id).sort().join('|');
    if(choice.dataset.ids!==ids&&document.activeElement!==choice) {
      choice.replaceChildren(...options.map(target=>{const option=document.createElement('option');option.value=target.id;option.textContent=target.name;return option;}));
      if(!options.length){const empty=document.createElement('option');empty.value='';empty.textContent='No target in reach';choice.append(empty);}
      choice.dataset.ids=ids;
      if(options.some(t=>t.id===previous))choice.value=previous;
    }
    if(active)choice.value=active.target.id;
    const selected=options.find(t=>t.id===choice.value);
    $('toggle').setAttribute('aria-pressed',String(enabled));$('actions').hidden=!enabled;
    $('toggle').querySelector('span').textContent=enabled?'Disable Force':'Enable Force';
    choice.disabled=Boolean(active)||!options.length;
    $('lift').disabled=!enabled||!selected||Boolean(active);
    $('push').disabled=!enabled||!selected||Boolean(selected.local?.indoor)||Boolean(active&&active.body.mode!=='lift');
    $('push').title=selected?.local?.indoor?'Indoor people are lifted and lowered in place':'';
    $('lower').disabled=!active||active.body.mode==='lower';
    panel.dataset.active=active?.target.id??'';panel.dataset.mode=active?.body.mode??'idle';
    const state=active?(active.body.blocked?'Obstructed':({lift:'Holding',lower:'Lowering',push:'Released'})[active.body.mode]):enabled?'Ready':'Off';
    $('state').textContent=state;panel.dataset.enabled=String(enabled);
    if(active?.body.mode==='lift')say(active.body.blocked?`${active.target.name} is obstructed. Move toward clear space or lower.`:active.target.local?.indoor?`Holding ${active.target.name} in place. Lower when ready.`:`Carrying ${active.target.name}. Walk and turn; push or lower when ready.`);
  };
  const begin=()=>{
    if(active)return active;
    const target=getTargets().find(t=>t.id===choice.value);if(!enabled||!target||!eligible(target)){say('Choose a visible target within 8 metres.');return null;}
    const p=position(target);
    active={target,body:createForceBody(p,target.mass,target.local?.indoor ? .65 : 1.25),anchor:createForceAnchor(p,walking.getPose())};
    if(target.local)target.local.force={height:0,mode:'lift'};
    onManual();return active;
  };
  const lift=()=>{if(active)return;if(begin()){say(`Holding ${active.target.name}. Push or lower when ready.`);paint();}};
  const push=()=>{
    const target=active?.target??options.find(t=>t.id===choice.value);if(target?.local?.indoor)return;
    const current=begin(),pose=walking.getPose();if(!current||!pose||current.body.mode!=='lift')return;
    if(pushForceBody(current.body,[current.body.position[0]-pose.position[0],current.body.position[2]-pose.position[2]]))say(`Pushing ${current.target.name}.`);
    paint();
  };
  const lower=()=>{if(active){releaseForceBody(active.body);say(`Lowering ${active.target.name}.`);paint();}};
  const toggle=()=>{enabled=!enabled;panel.open=true;if(!enabled)lower();else say('Choose a nearby target, then Lift or Push.');paint();panel.scrollIntoView({block:'nearest'});};
  for(const [id,action] of [['toggle',toggle],['lift',lift],['push',push],['lower',lower]])$(id).addEventListener('click',event=>{
    action();
    // Pointer actions hand movement back to the game. Keyboard users retain a
    // reachable control when an action disables the button they just activated.
    if(event.detail>0)host.focus({preventScroll:true});
    else if(event.currentTarget.disabled)(!$('lower').disabled?$('lower'):$('toggle')).focus({preventScroll:true});
  });
  choice.addEventListener('change',paint);choice.addEventListener('blur',paint);
  const key=event=>{
    if(event.repeat)return;
    const action=event.code==='KeyT'?toggle:enabled?({KeyG:lift,KeyR:push,KeyX:lower,Escape:lower})[event.code]:null;
    if(action){event.preventDefault();action();}
  };
  host.addEventListener('keydown',key);
  const blur=()=>lower();window.addEventListener('blur',blur);
  const hidden=()=>{if(document.hidden)lower();};document.addEventListener('visibilitychange',hidden);
  return {
    panel,
    get enabled(){return enabled;},
    get spell(){return active?{id:active.target.id,mode:active.body.mode,position:active.body.position,height:active.target.height,radius:active.target.radius}:null;},
    reset() {finish();removers.splice(0).forEach(remove=>remove());environment=null;options=[];choice.replaceChildren();delete choice.dataset.ids;},
    setWorld(world,objects) {
      this.reset();environment=createWalkingEnvironment(world);
      for(const object of objects)removers.push(walking.addObstacle({contains(x,y,z,radius=0){const p=object.position,b=object.userData.forceBody;return y>p.y-radius&&y<p.y+b.height+radius&&Math.hypot(x-p.x,z-p.z)<b.radius+radius;}}));
      paint();
    },
    pick(raycaster) {
      if(!enabled)return false;
      if(active){say('Lower the current target before choosing another.');return true;}
      const targets=getTargets().filter(eligible),owners=new Map(targets.map(t=>[t.object,t]));
      for(const target of targets)target.object.traverseVisible(item=>{if(item.isSkinnedMesh){item.computeBoundingSphere();if(item.boundingBox)item.computeBoundingBox();}});
      for(const hit of raycaster.intersectObjects(targets.map(t=>t.object),true)) {
        if(!visible(hit.object))continue;
        let object=hit.object;while(object&&!owners.has(object))object=object.parent;
        if(!object)continue;
        paint();choice.value=owners.get(object).id;paint();say(`${owners.get(object).name} selected. Lift or push.`);return true;
      }
      say('No movable target here. Get closer to a person or street bin.');return true;
    },
    update(delta,now) {
      if(active&&environment) {
        const {target,body,anchor}=active,pose=walking.getPose();
        if(target.local?.abducted){finish();return;}
        if(!pose||pose.riding||(target.local&&(target.local.storeId??null)!==pose.roomId)||Math.hypot(body.position[0]-pose.position[0],body.position[2]-pose.position[2])>12)releaseForceBody(body);
        const others=getTargets().filter(t=>t.id!==target.id).map(t=>({position:position(t),radius:t.radius}));
        const groundAt=(x,z)=>Math.max(...[[0,0],[target.radius,0],[-target.radius,0],[0,target.radius],[0,-target.radius]].map(([dx,dz])=>environment.groundAt(x+dx,z+dz)));
        let windowImpact=false;
        stepForceBody(body,delta,{groundAt,anchor:pose&&!target.local?.indoor?forceAnchorPosition(anchor,pose):null,canMove:(from,to)=>{
          if(target.local?.indoor||windowImpact)return false;
          const impact=!target.local&&body.mode==='push'
            ?onProjectileMove(from,to,{velocity:body.velocity,mass:body.mass,radius:target.radius,height:target.height}):null;
          if(impact?.blocked)return false;
          if(impact?.hit) {
            // Spend the throw's horizontal impulse at the pane, then let gravity
            // settle the prop outside. Display backings may be solid behind it.
            body.velocity[0]=body.velocity[2]=0;windowImpact=true;
            say('Window shattered. The glass will restore in 20 seconds.');return false;
          }
          if(!impact?.opening&&!environment.isFree(to[0],to[2]))return false;
          if(target.local&&environment.roomAt(to[0],to[2]))return false;
          const nearer=(x,z,radius)=>Math.hypot(to[0]-x,to[2]-z)<radius+target.radius&&Math.hypot(to[0]-x,to[2]-z)<Math.hypot(from[0]-x,from[2]-z);
          if(getObstacles().some(o=>nearer(o.x,o.z,o.radius)))return false;
          if(others.some(o=>Math.abs(o.position[1]-to[1])<1.8&&nearer(o.position[0],o.position[2],o.radius)))return false;
          if(pose&&Math.abs(pose.ground+(pose.altitude??0)-to[1])<1.8&&nearer(pose.position[0],pose.position[2],.35))return false;
          return !carriageContains(getCarriage()?.placement,to[0],to[1]+.8,to[2],target.radius);
        }});
        if(target.local) {
          if(!target.local.indoor)target.local.position=[body.position[0],-body.position[2],environment.groundAt(body.position[0],body.position[2])];
          target.local.force={height:Math.max(0,body.position[1]-target.local.position[2]),mode:body.mode};
        }else {target.object.position.fromArray(body.position);target.object.updateMatrixWorld(true);}
        onCast([body.position[0],body.position[1]+target.height*.6,body.position[2]]);
        if(body.mode==='landed')finish();
      }
      if(now-lastPaint>200){paint();lastPaint=now;}
    },
    inspect() {return {enabled,active:active?{id:active.target.id,name:active.target.name,mode:active.body.mode,position:[...active.body.position],velocity:[...active.body.velocity],mass:active.body.mass,blocked:active.body.blocked}:null,targets:getTargets().map(t=>({id:t.id,name:t.name,kind:t.local?'person':'object',position:position(t),renderedPosition:t.object.getWorldPosition(new THREE.Vector3()).toArray(),eligible:eligible(t)}))};},
    dispose() {this.reset();host.removeEventListener('keydown',key);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);panel.remove();},
  };
}
