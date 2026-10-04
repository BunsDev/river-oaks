import { DEFAULT_WORLD_ID, validateWorldId } from './world-contract.js';
import './world-portal.css';

const element=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
export function worldVisitUrl(id,base=location.href) {
  validateWorldId(id);
  const url=new URL('/',base);
  if(id!==DEFAULT_WORLD_ID)url.searchParams.set('world',id);
  url.searchParams.set('play','multiplayer');
  return url.href;
}

export function createWorldPortal({host,getCanPublish=()=>false}={}) {
  const section=element('section',null,'world-portal');section.setAttribute('aria-label','Worlds');
  const heading=element('h3','Worlds');
  const intro=element('p','Visit a shared space. New worlds begin with the River Oaks district layout and keep their own residents, creations, and chat.','quiet-note');
  const status=element('p','Loading worlds…','world-portal-status');status.setAttribute('role','status');
  const list=element('ul',null,'world-portal-list');
  const form=element('form',null,'world-portal-form');form.hidden=true;
  const createTitle=element('h4','Publish a world');
  const titleLabel=element('label','World name');const title=element('input');title.name='title';title.maxLength=64;title.required=true;titleLabel.append(title);
  const idLabel=element('label','World ID');const id=element('input');id.name='id';id.maxLength=48;id.pattern='[a-z0-9]+(-[a-z0-9]+)*';id.placeholder='moon-garden';id.required=true;idLabel.append(id);
  const descriptionLabel=element('label','Description');const description=element('textarea');description.name='description';description.maxLength=280;description.rows=2;descriptionLabel.append(description);
  const publish=element('button','Publish world');publish.type='submit';
  form.append(createTitle,titleLabel,idLabel,descriptionLabel,publish);
  section.append(heading,intro,status,list,form);host.prepend(section);
  let worlds=[],loaded=false,loading=null,lastAttempt=0;
  const currentId=()=>{try{return validateWorldId(new URLSearchParams(location.search).get('world')??DEFAULT_WORLD_ID);}catch{return DEFAULT_WORLD_ID;}};
  const render=()=>{
    list.replaceChildren();
    for(const world of worlds) {
      const row=element('li');const link=element('a',world.title);link.href=worldVisitUrl(world.id);
      const detail=element('small',world.id===currentId()?'Here now':world.description||'Shared world');
      row.append(link,detail);list.append(row);
    }
    const current=worlds.find(world=>world.id===currentId());
    if(current) {
      document.title=`${current.title} — River Oaks`;
      const view=document.querySelector('#view-name');if(view)view.textContent=current.title;
    }
    form.hidden=!getCanPublish();
  };
  function load() {
    if(loaded)return Promise.resolve();
    if(loading)return loading;
    if(Date.now()-lastAttempt<5000)return Promise.resolve();
    lastAttempt=Date.now();
    loading=(async()=>{
      try {
        const response=await fetch('/api/worlds',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok || !response.headers.get('content-type')?.includes('application/json'))throw new Error('World directory unavailable.');
        const data=await response.json();
        if(!Array.isArray(data.worlds))throw new Error('World directory unavailable.');
        worlds=data.worlds;loaded=true;render();status.textContent=`${worlds.length} ${worlds.length===1?'world':'worlds'} to visit`;
      } catch {status.textContent='World directory unavailable right now.';}
    })().finally(()=>{loading=null;});
    return loading;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!getCanPublish())return;
    publish.disabled=true;status.textContent='Publishing world…';
    try {
      const session=await (await fetch('/auth/session',{credentials:'same-origin',cache:'no-store'})).json();
      if(!session.authenticated || session.canGrantWishes!==true)throw new Error('Only Jevica can publish a world.');
      const response=await fetch('/api/worlds',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({id:id.value.trim(),title:title.value.trim(),description:description.value.trim()})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error==='world_exists'?'That world ID is already in use.':result.error==='world_limit'?'The world directory is full.':result.error??'World could not be published.');
      worlds=[...worlds,result.world];render();status.textContent=`${result.world.title} is published. Open it from the list.`;form.reset();
    } catch(error) {status.textContent=error.message||'World could not be published.';}
    finally {publish.disabled=false;}
  });
  render();
  return {element:section,load,refreshCapability:render};
}
