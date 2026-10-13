import { spaceTemplates, createSpace } from './space-templates.js';

// Use the actual region geometry for thumbnails, so plans cannot drift from files.
export function districtPlan(region) {
  const [west,south,east,north]=region.bounds_m;
  const paths=region.roads.map(road=>`<polyline points="${road.points.map(([x,y])=>`${x},${-y}`).join(' ')}" fill="none" stroke="#f9f4e6" stroke-width="${road.width_m}" />`).join('');
  const buildings=region.buildings.map(b=>`<rect x="${b.center[0]-b.size[0]/2}" y="${-b.center[1]-b.size[1]/2}" width="${b.size[0]}" height="${b.size[1]}" rx="1" fill="#416359" stroke="#26493f" stroke-width=".7" />`).join('');
  const trees=region.trees.map(t=>`<circle cx="${t.position[0]}" cy="${-t.position[1]}" r="${t.crown_radius_m}" fill="#81a385" />`).join('');
  return `<svg viewBox="${west} ${-north} ${east-west} ${north-south}" aria-hidden="true" focusable="false"><rect x="${west}" y="${-north}" width="${east-west}" height="${north-south}" fill="#dce7db" />${paths}${buildings}${trees}<circle cx="${region.spawn[0]}" cy="${-region.spawn[1]}" r="4" fill="#b45132" stroke="white" stroke-width="1.5" /></svg>`;
}

export function spacePlan(space) {
  const [w,s,e,n]=space.bounds_m;
  const colors={wall:'#626760',glazing:'#91b7b0',floor:'#e5d9c4',rug:'#c7bda8',plant:'#66856b'};
  const objects=[...space.objects].sort((a,b)=>(a.kind==='floor'?-1:0)-(b.kind==='floor'?-1:0));
  const shapes=objects.filter(o=>o.kind!=='pendant'&&o.elevation<1.8).map(o=>`<rect x="${o.east-o.width/2}" y="${-o.north-o.depth/2}" width="${o.width}" height="${o.depth}" transform="rotate(${-o.yaw} ${o.east} ${-o.north})" rx="${o.kind==='wall'?0:.12}" fill="${colors[o.kind]??'#947856'}" stroke="#fff9" stroke-width=".04"/>`).join('');
  return `<svg viewBox="${w} ${-n} ${e-w} ${n-s}" aria-hidden="true" focusable="false"><rect x="${w}" y="${-n}" width="${e-w}" height="${n-s}" fill="#d7dfcf"/>${shapes}<circle cx="${space.spawn[0]}" cy="${-space.spawn[1]}" r=".35" fill="#b45132"/></svg>`;
}

export function mountTemplatePicker(host, { choose }) {
  const dialog=document.createElement('dialog');dialog.className='studio-templates';dialog.setAttribute('aria-labelledby','studio-template-title');
  dialog.innerHTML='<div class="studio-template-heading"><div><p class="studio-caption">START WITH A PLACE</p><h2 id="studio-template-title">Choose a space</h2></div><button type="button" data-template-close aria-label="Close space templates">Close</button></div><p>Four furnished spaces, ready to make your own. Start with a home, workplace, shop or café.</p><p class="studio-caption">Plans show the actual furnishings and walls. The orange dot marks your arrival.</p><div class="studio-template-grid"></div><p class="studio-caption">Opening a template replaces the current draft after any unsaved-change confirmation. Save or export to keep your work. Walk inside, select any furnishing, or ask the agent to propose a change.</p>';
  for(const template of spaceTemplates){
    const region=createSpace(template.id),card=document.createElement('article');
    card.innerHTML=spacePlan(region);
    const title=document.createElement('h3');title.textContent=template.name;
    const description=document.createElement('p');description.textContent=template.description;
    const count=document.createElement('p');count.className='studio-caption';count.textContent=`${region.objects.length} editable elements · ${template.walkTargets.length} spaces`;
    const tip=document.createElement('p');tip.className='studio-template-tip';tip.textContent=template.firstEdit;
    const button=document.createElement('button');button.type='button';button.className='studio-primary';button.textContent=`Use ${template.name}`;
    button.addEventListener('click',()=>{if(choose(template)!==false)dialog.close();});
    card.append(title,description,count,tip,button);dialog.querySelector('.studio-template-grid').append(card);
  }
  dialog.querySelector('[data-template-close]').addEventListener('click',()=>dialog.close());
  host.append(dialog);
  return {open(){dialog.showModal();},dispose(){dialog.remove();}};
}
