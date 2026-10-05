// The Places block: where you are, the world's named places, and your own
// landmarks, each with a button that takes you there. Rendering is plain DOM
// so the e2e harness and screen readers see real buttons and lists.
import { nearestPlace, placeLink, positionLink } from './places.js';
import { worldIdFromSearch } from './world-contract.js';
import { worldVisitUrl } from './world-portal.js';
import { createWorldMap } from './world-map.js';
import './world-map.css';

const $ = selector => document.querySelector(selector);
const KIND_LABEL = { arrival: 'arrival', spot: 'meeting spot', shop: 'storefront', landmark: 'landmark', link: 'shared spot' };

export function setupPlacesUI({ places, landmarks, worldMapEnabled = false, onGo, getPosition, getYaw, isOutdoor = () => true, shareBase = () => worldVisitUrl(worldIdFromSearch(location.search)) }) {
  const host = $('#places'), here = $('#places-here'), list = $('#places-list'), marks = $('#landmarks-list'), status = $('#places-status');
  const nameInput = $('#landmark-name'), addButton = $('#landmark-add');
  if (!host) return null;
  let current = places, currentLandmarks = landmarks;
  const say = (message, tone = '') => { status.textContent = message; status.dataset.tone = tone; };
  const copy = async text => { try { await navigator.clipboard.writeText(text); say('Link copied'); } catch { say(text); } };
  const worldMap=worldMapEnabled ? createWorldMap({host,onGo,getPosition,getYaw,isOutdoor,shareBase,say,copy}) : null;

  function row(place, { removable = false } = {}) {
    const item = document.createElement('li');
    item.dataset.placeId = place.id;
    const name = document.createElement('span'); name.className = 'place-name'; name.textContent = place.name;
    const kind = document.createElement('span'); kind.className = 'place-kind';
    kind.textContent = place.kind === 'landmark' && place.worldId
      ? `${KIND_LABEL.landmark} · ${place.worldTitle ?? place.worldId}` : KIND_LABEL[place.kind] ?? place.kind;
    const crossWorld = place.kind === 'landmark' && place.worldId && place.worldId !== worldIdFromSearch(location.search);
    const go = document.createElement(crossWorld ? 'a' : 'button');
    if (crossWorld) go.href = positionLink(place.position, place.yaw ?? 0, worldVisitUrl(place.worldId));
    else {
      go.type = 'button';
      go.addEventListener('click', async () => { say(`Heading to ${place.name}…`); const result = await onGo(place); say(result?.ok === false ? (result.message ?? 'That place is not reachable right now.') : `You're at ${place.name}`, result?.ok === false ? 'error' : 'ok'); });
    }
    go.textContent = 'Go'; go.setAttribute('aria-label', `Go to ${place.name}${crossWorld ? ` in ${place.worldTitle ?? place.worldId}` : ''}`);
    const share = document.createElement('button'); share.type = 'button'; share.textContent = 'Link'; share.setAttribute('aria-label', `Copy a link to ${place.name}`);
    share.addEventListener('click', () => copy(place.kind === 'landmark' || place.kind === 'link'
      ? positionLink(place.position, place.yaw ?? 0, place.worldId ? worldVisitUrl(place.worldId) : shareBase()) : placeLink(place, shareBase())));
    item.append(name, kind, go, share);
    if (removable) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove landmark ${place.name}`);
      remove.addEventListener('click', async () => {
        const store=currentLandmarks;remove.disabled=true;
        try {
          const removed=await store.remove(place.id,place.worldId);
          if(store!==currentLandmarks)return;
          if(!removed)return say('That landmark is no longer available.','error');
          renderLandmarks();say(`Removed ${place.name}`);
        } catch(error) {if(store===currentLandmarks)say(error.message,'error');}
        finally {remove.disabled=false;}
      });
      item.append(remove);
    }
    return item;
  }
  function renderPlaces() {
    list.replaceChildren(...current.map(place => row(place)));
    $('#places-count').textContent = String(current.length);
    worldMap?.setPlaces(current);
  }
  function renderLandmarks() {
    const items = currentLandmarks.list();
    marks.replaceChildren(...items.map(place => row(place, { removable: true })));
    $('#landmarks-empty').hidden = items.length > 0;
    worldMap?.setLandmarks(items);
  }
  addButton.addEventListener('click', async () => {
    const position = getPosition();
    if (!position) return say('Stand somewhere first.', 'error');
    const store=currentLandmarks;addButton.disabled=true;
    try {
      const result = await store.add({ name: nameInput.value, position: [position[0], position[1]], yaw: getYaw?.() ?? 0 });
      if(store!==currentLandmarks)return;
      if (!result.ok) return say(result.reason === 'name' ? 'Give the landmark a name.' : result.reason === 'limit' ? 'You have reached the 50-landmark limit.' : 'Could not save that landmark.', 'error');
      nameInput.value = ''; renderLandmarks(); say(`Saved ${result.landmark.name}`, 'ok');
    } catch(error) {if(store===currentLandmarks)say(error.message==='name'?'Give the landmark a name.':error.message==='limit'?'You have reached the 50-landmark limit.':error.message,'error');}
    finally {addButton.disabled=false;}
  });
  nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addButton.click(); } });

  function refreshHere() {
    const position = getPosition();
    worldMap?.refresh();
    const near = position ? nearestPlace(current, position, 45) : null;
    here.replaceChildren();
    if (!near) { here.textContent = position ? 'Out on the street' : 'Not walking yet'; here.dataset.placeId = ''; return; }
    const label = document.createElement('strong'); label.textContent = near.place.name;
    here.append(near.distance < 8 ? 'You’re at ' : 'You’re near ', label, near.distance < 8 ? '' : ` (${Math.round(near.distance)} m)`);
    here.dataset.placeId = near.place.id;
  }
  renderPlaces(); renderLandmarks(); refreshHere();
  const timer = setInterval(refreshHere, 500);
  return {
    setWorld(next) { worldMap?.setWorld(next); },
    setPlayers(players,selfId) { worldMap?.setPlayers(players,selfId); },
    setPlaces(next) { current = next; renderPlaces(); refreshHere(); },
    setLandmarks(next) { currentLandmarks = next; renderLandmarks(); },
    refresh() { renderLandmarks(); refreshHere(); },
    say,
    dispose() { clearInterval(timer); worldMap?.dispose(); },
  };
}
