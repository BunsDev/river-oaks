import { worldVisitUrl } from './world-portal.js';
import { placeLink } from './places.js';
import { worldIdFromSearch } from './world-contract.js';
import './world-events.css';

const node=(tag,text,className)=>{const element=document.createElement(tag);if(text)element.textContent=text;if(className)element.className=className;return element;};
const errors={invalid_event:'Use a title, a start within 30 days, and a duration of 15 minutes to 8 hours.',
  event_limit:'The calendar or your five-event limit is full.',event_full:'This event has reached its RSVP capacity.',
  event_missing:'This event ended or was cancelled.',event_forbidden:'Only the host or Jevica can cancel this event.',
  event_host:'The host stays on the guest list. Cancel the event to remove it.'};
const localInput=date=>new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);
export function createWorldEvents({host}) {
  const section=node('section',null,'world-events');section.setAttribute('aria-label','World events');
  const heading=node('h3','Events'),intro=node('p','Meet for art, conversation, and celebrations across shared worlds. Times are shown in your local time zone.','quiet-note');
  const status=node('p','Loading events…','world-events-status');status.setAttribute('role','status');
  const refresh=node('button','Refresh events');refresh.type='button';
  const filterLabel=node('label','Show'),filter=node('select');filter.setAttribute('aria-label','Filter events');
  filter.append(new Option('All worlds','all'),new Option('This world','here'),new Option('I’m going','going'));filterLabel.append(filter);
  const filters=node('div',null,'world-events-filters');filters.append(filterLabel,refresh);
  const list=node('ul',null,'world-events-list');
  const studio=node('details',null,'world-events-studio'),summary=node('summary','Host a gathering');
  const form=node('form',null,'world-events-form');
  const field=(label,input)=>{const element=node('label',label);element.append(input);return element;};
  const title=node('input');title.name='title';title.maxLength=64;title.required=true;
  const description=node('textarea');description.name='description';description.maxLength=400;description.rows=3;
  const venue=node('select');venue.name='placeId';venue.required=true;
  const start=node('input');start.name='start';start.type='datetime-local';start.required=true;
  const end=node('input');end.name='end';end.type='datetime-local';end.required=true;
  const capacity=node('input');capacity.name='capacity';capacity.type='number';capacity.min='2';capacity.max='32';capacity.value='16';capacity.required=true;
  const submit=node('button','Schedule event');submit.type='submit';submit.disabled=true;
  const note=node('p','Choose an outdoor meeting point in this world. RSVPs include you; they do not reserve a world connection or admission to a private home.','quiet-note');
  form.append(field('Event name',title),field('Description',description),field('Meeting point',venue),field('Starts (local time)',start),field('Ends (local time)',end),field('RSVP capacity',capacity),note,submit);
  studio.append(summary,form);section.append(heading,intro,filters,status,list,studio);const portal=host.querySelector('.world-portal');if(portal)portal.after(section);else host.append(section);
  let events=[],loading=null,busy=false,signature='';
  const resetTimes=()=>{const hour=new Date(Date.now()+3_600_000);start.value=localInput(hour);end.value=localInput(new Date(hour.getTime()+3_600_000));};resetTimes();
  async function request(action,data={}) {
    const sessionResponse=await fetch('/auth/session',{credentials:'same-origin',cache:'no-store'});
    if(!sessionResponse.ok)throw new Error('Sign in to use the event calendar.');
    const session=await sessionResponse.json();if(!session.authenticated)throw new Error('Sign in to use the event calendar.');
    const response=await fetch(`/api/events/${action}?world=${encodeURIComponent(worldIdFromSearch(location.search))}`,{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify(data)});
    const result=await response.json().catch(()=>{throw new Error('The event service is unavailable. Try again shortly.');});if(!response.ok)throw new Error(errors[result.error]??result.error??'Events are unavailable.');
    return result;
  }
  async function mutate(action,data,success) {
    if(busy)return;busy=true;
    for(const button of section.querySelectorAll('button'))button.disabled=true;
    try {await request(action,data);if(loading)await loading;signature='';await load();status.textContent=success;return true;}
    catch(error){if(loading)await loading;signature='';await load();status.textContent=error.message;return false;}
    finally {busy=false;submit.disabled=!venue.options.length;refresh.disabled=false;render();
      if(action==='rsvp'||action==='cancel'){const row=[...list.children].find(item=>item.dataset.eventId===data.id);(row?.querySelector('[data-action=rsvp]')??refresh).focus({preventScroll:true});}}
  }
  function render() {
    const active=document.activeElement,focusId=list.contains(active)?active.closest('.world-event')?.dataset.eventId:null,focusAction=active?.dataset.action;
    const filtered=events.filter(event=>filter.value==='all'||filter.value==='here'&&event.worldId===worldIdFromSearch(location.search)||filter.value==='going'&&event.going);
    list.replaceChildren();
    if(!filtered.length){list.append(node('li','No upcoming gatherings here yet.','world-events-empty'));if(focusId)refresh.focus({preventScroll:true});return;}
    for(const event of filtered) {
      const item=node('li',null,'world-event');item.dataset.eventId=event.id;
      const label=node('h4',event.title),time=node('p',null,'world-event-time');
      const stamp=node('time',new Date(event.startsAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}));stamp.dateTime=new Date(event.startsAt).toISOString();
      time.append(stamp,document.createTextNode(` – ${new Date(event.endsAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}`));
      if(event.startsAt<=Date.now())time.prepend(document.createTextNode('Happening now · '));
      const meta=node('p',`${event.placeName} · ${event.worldTitle}\nHosted by ${event.hostName} · ${event.attending}/${event.capacity} going${event.going?' · You’re going':''}`,'world-event-meta');
      item.append(label,time,meta);if(event.description)item.append(node('p',event.description,'world-event-description'));
      const actions=node('div',null,'world-event-actions'),visit=node('a','Visit meeting point');visit.href=placeLink({id:event.placeId},worldVisitUrl(event.worldId));actions.append(visit);
      if(!event.isHost){const rsvp=node('button',event.going?'Withdraw RSVP':'I’m going');rsvp.type='button';rsvp.dataset.action='rsvp';rsvp.disabled=busy||!event.going&&event.attending>=event.capacity;
        rsvp.addEventListener('click',()=>mutate('rsvp',{id:event.id,going:!event.going},event.going?'RSVP withdrawn.':'You’re on the guest list.'));actions.append(rsvp);}
      if(event.canCancel){const cancel=node('button','Cancel event');cancel.type='button';cancel.dataset.action='cancel';cancel.disabled=busy;
        cancel.addEventListener('click',()=>{if(window.confirm(`Cancel ${event.title}?`))void mutate('cancel',{id:event.id},'Event cancelled.');});actions.append(cancel);}
      item.append(actions);list.append(item);
    }
    if(focusId){const row=[...list.children].find(item=>item.dataset.eventId===focusId);
      (row?.querySelector(focusAction?`[data-action=${focusAction}]`:'a')??refresh).focus({preventScroll:true});}
  }
  async function load() {
    if(loading)return loading;
    loading=(async()=>{
      try {const result=await request('list');const next=JSON.stringify(result.events.map(event=>({...event,active:event.startsAt<=Date.now()})));
        events=result.events;if(next!==signature){signature=next;render();status.textContent=`${events.length} upcoming or active event${events.length===1?'':'s'}.`;}}
      catch(error){status.textContent=error.message;}
    })().finally(()=>{loading=null;});return loading;
  }
  refresh.addEventListener('click',()=>{signature='';void load();});filter.addEventListener('change',render);
  form.addEventListener('submit',async event=>{
    event.preventDefault();const done=await mutate('create',{title:title.value.trim(),description:description.value.trim(),placeId:venue.value,
      startsAt:new Date(start.value).getTime(),endsAt:new Date(end.value).getTime(),capacity:Number(capacity.value)},'Event scheduled across worlds.');
    if(done){form.reset();resetTimes();capacity.value='16';studio.open=false;summary.focus();}
  });
  setInterval(()=>{if(!busy&&document.visibilityState==='visible'&&section.checkVisibility())void load();},30_000);
  return {load,setPlaces(places){venue.replaceChildren(...places.map(place=>new Option(place.name,place.id)));submit.disabled=!places.length;}};
}
