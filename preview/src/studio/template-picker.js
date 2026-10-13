import { dismissOnOutsideClick } from '../modal-dismiss.js';
import { districtTemplates, createDistrict } from './templates.js';

// Use the actual region geometry for thumbnails, so plans cannot drift from files.
export function districtPlan(region) {
  const [west,south,east,north]=region.bounds_m;
  const paths=region.roads.map(road=>`<polyline points="${road.points.map(([x,y])=>`${x},${-y}`).join(' ')}" fill="none" stroke="#f9f4e6" stroke-width="${road.width_m}" />`).join('');
  const buildings=region.buildings.map(b=>`<rect x="${b.center[0]-b.size[0]/2}" y="${-b.center[1]-b.size[1]/2}" width="${b.size[0]}" height="${b.size[1]}" rx="1" fill="#416359" stroke="#26493f" stroke-width=".7" />`).join('');
  const trees=region.trees.map(t=>`<circle cx="${t.position[0]}" cy="${-t.position[1]}" r="${t.crown_radius_m}" fill="#81a385" />`).join('');
  return `<svg viewBox="${west} ${-north} ${east-west} ${north-south}" aria-hidden="true" focusable="false"><rect x="${west}" y="${-north}" width="${east-west}" height="${north-south}" fill="#dce7db" />${paths}${buildings}${trees}<circle cx="${region.spawn[0]}" cy="${-region.spawn[1]}" r="4" fill="#b45132" stroke="white" stroke-width="1.5" /></svg>`;
}

export function mountTemplatePicker(host, { choose }) {
  const dialog=document.createElement('dialog');dialog.className='studio-templates';dialog.setAttribute('aria-labelledby','studio-template-title');
  dialog.innerHTML='<div class="studio-template-heading"><div><p class="studio-caption">START WITH A PLACE</p><h2 id="studio-template-title">Choose a district</h2></div><button type="button" data-template-close aria-label="Close district templates">Close</button></div><p>Five editable starting points. Each is 160 × 160 metres with flat terrain, clear walking routes and room to grow.</p><p class="studio-caption">Plan key: dark blocks — buildings · circles — trees · pale lines — paths · orange dot — arrival. North is up.</p><div class="studio-template-grid"></div><p class="studio-caption">Opening a template replaces the current draft after any unsaved-change confirmation. Save or export to keep your work. Buildings are solid blockouts, not furnished interiors.</p>';
  for(const template of districtTemplates){
    const region=createDistrict(template.id),card=document.createElement('article');
    card.innerHTML=districtPlan(region);
    const title=document.createElement('h3');title.textContent=template.name;
    const description=document.createElement('p');description.textContent=template.description;
    const count=document.createElement('p');count.className='studio-caption';count.textContent=`${region.buildings.length} buildings · ${region.places.length} destinations`;
    const tip=document.createElement('p');tip.className='studio-template-tip';tip.textContent=`Try first: ${template.firstEdit}`;
    const button=document.createElement('button');button.type='button';button.className='studio-primary';button.textContent=`Use ${template.name}`;
    button.addEventListener('click',()=>{if(choose(template)!==false)dialog.close();});
    card.append(title,description,count,tip,button);dialog.querySelector('.studio-template-grid').append(card);
  }
  dialog.querySelector('[data-template-close]').addEventListener('click',()=>dialog.close());
  dismissOnOutsideClick(dialog, () => dialog.close());
  host.append(dialog);
  return {open(){dialog.showModal();},dispose(){dialog.remove();}};
}
