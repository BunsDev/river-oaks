import { newAssembly,newObjectPart,validAssembly,MAX_OBJECT_PARTS,OBJECT_SHAPES,OBJECT_MATERIALS } from './creator-object.js';

export function createObjectEditor(onChange){
  const element=document.createElement('fieldset');element.className='creator-object-editor';element.hidden=true;
  element.innerHTML='<legend>Custom object</legend><label for="creator-name">Name</label><input id="creator-name" maxlength="48" />'+
    '<label for="creator-part">Part</label><select id="creator-part"></select><div class="creator-part-actions"><button type="button" id="creator-add">Add part</button><button type="button" id="creator-remove">Remove part</button></div>'+
    '<div class="shared-build-fields"><label for="creator-shape">Shape<select id="creator-shape"></select></label><label for="creator-material">Material<select id="creator-material"></select></label></div>'+
    '<label for="creator-color">Color (#RRGGBB)</label><input id="creator-color" value="#b97986" maxlength="7" pattern="#[0-9a-fA-F]{6}" />'+
    ['size','position','rotation'].map(group=>`<p>${{size:'Dimensions (m)',position:'Position within object (m)',rotation:'Rotation (degrees)'}[group]}</p><div class="creator-vector">`+
      ['x','y','z'].map((axis,i)=>`<label for="creator-${group}-${axis}">${group==='size'?['Width','Height','Depth'][i]:group==='position'?['Right','Up','Forward'][i]:['Pitch','Yaw','Roll'][i]}<input type="number" id="creator-${group}-${axis}" step="${group==='rotation'?'1':'.05'}" min="${group==='size'?'.05':group==='rotation'?'-180':'-4'}" max="${group==='rotation'?'180':'4'}" /></label>`).join('')+'</div>').join('')+
    '<p id="creator-error" role="status" aria-live="polite"></p>';
  const $=id=>element.querySelector('#creator-'+id),partSelect=$('part');
  for(const shape of OBJECT_SHAPES)$('shape').add(new Option(shape[0].toUpperCase()+shape.slice(1),shape));
  for(const material of OBJECT_MATERIALS)$('material').add(new Option(material[0].toUpperCase()+material.slice(1),material));
  let value=newAssembly(),selected=0,disabled=false;
  const refresh=(fields=true)=>{
    const part=value.parts[selected];
    partSelect.replaceChildren(...value.parts.map((item,index)=>new Option(`${index+1}. ${item.shape}`,String(index))));partSelect.value=String(selected);
    if(fields){
      $('name').value=value.name;$('shape').value=part.shape;$('material').value=part.material;$('color').value=part.color;
      for(const group of ['size','position','rotation'])for(const [i,axis]of ['x','y','z'].entries())
        $(group+'-'+axis).value=String(Math.round(part[group][i]*(group==='rotation'?180/Math.PI:1)*1000)/1000);
    }
    $('add').disabled=disabled||value.parts.length>=MAX_OBJECT_PARTS;$('remove').disabled=disabled||value.parts.length===1;
    $('error').textContent=validAssembly(value)?`${value.parts.length}/${MAX_OBJECT_PARTS} parts`:'Fill every field. Keep parts above ground, below 4 m, and within 2.6 m of the object center.';
  };
  const changed=()=>{refresh(false);onChange();};
  $('name').addEventListener('input',()=>{value={...value,name:$('name').value};changed();});
  partSelect.addEventListener('change',()=>{selected=Number(partSelect.value);refresh();});
  for(const id of ['shape','material','color',...['size','position','rotation'].flatMap(group=>['x','y','z'].map(axis=>group+'-'+axis))]){
    $(id).addEventListener(id==='shape'||id==='material'?'change':'input',()=>{
      const part={...value.parts[selected]};
      if(['shape','material','color'].includes(id))part[id]=$(id).value;
      else{const [group,axis]=id.split('-'),index=['x','y','z'].indexOf(axis);part[group]=[...part[group]];part[group][index]=$(id).valueAsNumber*(group==='rotation'?Math.PI/180:1);}
      value={...value,parts:value.parts.map((item,index)=>index===selected?part:item)};changed();
    });
  }
  $('add').addEventListener('click',()=>{if(value.parts.length>=MAX_OBJECT_PARTS)return;value={...value,parts:[...value.parts,newObjectPart()]};selected=value.parts.length-1;refresh();onChange();});
  $('remove').addEventListener('click',()=>{if(value.parts.length===1)return;value={...value,parts:value.parts.filter((_,index)=>index!==selected)};selected=Math.min(selected,value.parts.length-1);refresh();onChange();});
  refresh();
  return {element,get value(){return value;},get valid(){return validAssembly(value);},
    load(assembly){value=structuredClone(assembly??newAssembly());selected=0;refresh();},
    setDisabled(on){disabled=on;element.querySelectorAll('input,select,button').forEach(node=>node.disabled=on);refresh(false);}};
}
