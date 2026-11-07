import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { emptyDesk } from '../src/office-desk-contract.js';
import { computerConfig } from '../src/office-computer-protocol.js';

register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, next) { return url.endsWith('.css') ? {format:'module',source:'',shortCircuit:true} : next(url,context); }")}`,import.meta.url);
const { createOfficeDeskUI }=await import('../src/office-desk-ui.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

// A DOM stand-in for the desk controller, not layout or browser acceptance.
// Parse its static IDs and attributes; all state, task requests and frame ownership
// below use the actual modules. Frames record navigation without making requests.
class Element extends EventTarget {
 constructor(tag){super();this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.hidden=false;this.open=false;this.value='';this.textContent='';this.parent=null;this.contentWindow={postMessage(){}};}
 set innerHTML(value){
  this.nodes=new Map();
  for(const match of value.matchAll(/<([\w-]+)([^>]*\bid="([^"]+)"[^>]*)>/g)){
   const element=new Element(match[1]);element.id=match[3];element.hidden=/\bhidden\b/.test(match[2]);
   for(const attribute of match[2].matchAll(/([\w-]+)="([^"]*)"/g))element.setAttribute(attribute[1],attribute[2]);
   element.placeholder??='';this.nodes.set('#'+element.id,element);this.append(element);
  }
 }
 get isConnected(){return this.tagName==='body'||Boolean(this.parent?.isConnected);}
 append(...elements){for(const element of elements){element.remove();element.parent=this;this.children.push(element);}}
 replaceChildren(...elements){for(const element of [...this.children])element.remove();this.append(...elements);}
 querySelector(selector){return this.nodes?.get(selector)??null;}
 setAttribute(key,value){this.attributes[key]=String(value);if(['placeholder','href','rel','target'].includes(key))this[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 focus(){document.activeElement=this;}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent(new Event('close'));}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(element=>element!==this);this.parent=null;}
 scrollIntoView(){}
}

function setup(t,{computer,pageOrigin='https://typesafe.place',request=async()=>({desk:emptyDesk()})}={}){
 const original={document:globalThis.document,window:globalThis.window,location:globalThis.location};
 // The desk reads its default Computer configuration from the page origin when it is created.
 globalThis.location={origin:pageOrigin};
 const body=new Element('body'),trigger=new Element('button'),createdFrames=[],calls=[];body.append(trigger);
 globalThis.document={body,activeElement:trigger,createElement:tag=>{const element=new Element(tag);if(tag==='iframe')createdFrames.push(element);return element;}};
 globalThis.window=new EventTarget();
 const mp={connected:true,identity:{id:'alice'},officeDeskRequest:async(action,data)=>{calls.push({action,data});return request(action,data);}};
 const ui=createOfficeDeskUI({getMultiplayer:()=>mp,...(computer===undefined?{}:{computer})});
 const dialog=body.children.find(element=>element.id==='office-desk');
 const find=id=>dialog.querySelector('#desk-'+id);
 t.after(()=>{ui.dispose();Object.assign(globalThis,original);});
 return {ui,dialog,find,calls,createdFrames,frames:()=>find('computer-mount').children,
  async click(id){find(id).dispatchEvent(new Event('click'));await tick();},
  input(id,value){find(id).value=value;find(id).dispatchEvent(new Event('input'));}};
}

test('opening a desk selects hosted Computer and offers its safe separate-tab link',async t=>{
 const f=setup(t);
 assert.equal(f.createdFrames.length,0,'constructing the desk does not load Computer');
 await f.ui.open();
 assert.equal(f.dialog.dataset.view,'computer');assert.equal(f.find('body').hidden,true);
 assert.equal(f.find('view-computer').getAttribute('aria-selected'),'true');
 assert.equal(f.find('heading').textContent,'TypeSafe Computer');
 assert.equal(f.frames().length,1);assert.equal(f.frames()[0].src,'https://computer.typesafe.place/?embed=place');
 assert.equal(f.find('computer-open').href,'https://computer.typesafe.place/');
 assert.equal(f.find('computer-open').target,'_blank');assert.equal(f.find('computer-open').rel,'noopener noreferrer');
 assert.equal(f.find('computer-open').hidden,false,'separate opening is available while the frame loads');
 await f.click('view-tasks');
 assert.equal(f.dialog.dataset.view,'tasks');assert.equal(f.frames().length,0,'switching views destroys the unused frame');
});

test('a default desk on a Preview host stays on Tasks and never frames hosted Computer',async t=>{
 const f=setup(t,{pageOrigin:'https://river-oaks-git-branch-bunsdev.vercel.app'});
 await f.ui.open();
 assert.equal(f.dialog.dataset.view,'tasks');assert.equal(f.find('body').hidden,false);
 assert.equal(f.find('views').hidden,true,'no Computer tab where Computer refuses to be framed');assert.equal(f.createdFrames.length,0);
});

test('the explicit off configuration retains the Tasks desk and creates no Computer frame',async t=>{
 const f=setup(t,{computer:computerConfig({VITE_TYPESAFE_COMPUTER_ORIGIN:'off'})});
 await f.ui.open();
 assert.equal(f.dialog.dataset.view,'tasks');assert.equal(f.find('body').hidden,false);
 assert.equal(f.find('views').hidden,true);assert.equal(f.createdFrames.length,0);
});

test('reopening during a task read starts Computer only for the current desk session',async t=>{
 const read=deferred(),f=setup(t,{request:()=>read.promise});
 const first=f.ui.open();f.ui.suspend();const second=f.ui.open();
 assert.equal(f.createdFrames.length,0);assert.equal(f.calls.length,1,'reentry reuses the pending read');
 read.resolve({desk:emptyDesk()});await Promise.all([first,second]);
 assert.equal(f.dialog.open,true);assert.equal(f.dialog.dataset.view,'computer');
 assert.equal(f.createdFrames.length,1,'only the latest open starts a frame');assert.equal(f.frames().length,1);
});

for(const action of ['suspend','dispose'])test(`a task read completing after ${action} cannot open Computer`,async t=>{
 const read=deferred(),f=setup(t,{request:()=>read.promise});
 const opening=f.ui.open();f.ui[action]();read.resolve({desk:emptyDesk()});await opening;
 assert.equal(f.createdFrames.length,0);assert.equal(f.frames().length,0);
 if(action==='suspend')assert.equal(f.dialog.open,false);
 else assert.equal(f.dialog.isConnected,false);
});

test('reopening with a failed task draft keeps Tasks visible without starting Computer',async t=>{
 const f=setup(t,{request:async action=>{if(action==='save')throw new Error('desk_unavailable');return {desk:emptyDesk()};}});
 await f.ui.open();await f.click('view-tasks');await f.click('start');
 f.input('title','A studio gathering');f.input('notes','Keep this private draft.');await f.click('save');
 assert.equal(f.find('notice').hidden,false,'the task save failed');
 const created=f.createdFrames.length,reads=f.calls.filter(call=>call.action==='read').length;
 f.ui.suspend();await f.ui.open();
 assert.equal(f.dialog.dataset.view,'tasks');assert.equal(f.find('body').hidden,false);
 assert.equal(f.find('title').value,'A studio gathering');assert.equal(f.find('notes').value,'Keep this private draft.');
 assert.equal(f.find('notice').hidden,false);assert.equal(f.createdFrames.length,created);assert.equal(f.frames().length,0);
 assert.equal(f.calls.filter(call=>call.action==='read').length,reads,'reentry does not replace the retained draft');
});
