// Shared voice controls: a row in the walking console (Join / Unmute with
// keycaps), the chat dock's row (Join, Mute, Deafen, Enable audio) with the
// dock pill, a Mute button per resident in the roster, and the Settings pane.
// Presentation only: every decision lives in voice-chat.js and on the server.
import './voice.css';

const make = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
// Same DOM shape as the walking console's actions: the keycap follows the label
// in the DOM, reads first in the HUD (CSS order) and is announced by aria-keyshortcuts.
export function labelWithKey(button, text, key = null) {
  const signature = `${text}|${key ?? ''}`;
  if (button.dataset.action === signature) return;
  button.dataset.action = signature;
  button.replaceChildren(text);
  if (key) { const cap = make('kbd', key); cap.setAttribute('aria-hidden', 'true'); button.append(cap); button.setAttribute('aria-keyshortcuts', key); }
  else button.removeAttribute('aria-keyshortcuts');
}
const busy = (button, value) => button.setAttribute('aria-disabled', String(Boolean(value)));
const pressed = (button, value) => button.setAttribute('aria-pressed', String(Boolean(value)));
const joinedLike = status => ['joined', 'rejoining', 'joining'].includes(status);

export function createVoiceUI({ voice, chatSection, chatDock = null, walking = null, players = () => new Map() }) {
  // Walking console row.
  const console = make('div', null, 'walking-voice'); console.setAttribute('role', 'group'); console.setAttribute('aria-label', 'Voice chat'); console.hidden = true;
  const consoleJoin = make('button'); consoleJoin.type = 'button'; consoleJoin.id = 'walking-voice-join';
  const consoleMic = make('button'); consoleMic.type = 'button'; consoleMic.id = 'walking-voice-mic'; consoleMic.hidden = true; pressed(consoleMic, false);
  const status = make('p', null, 'voice-status'); status.id = 'voice-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  console.append(consoleJoin, consoleMic, status);
  walking?.mountVoice?.(console);
  // Chat dock row: the control surface on compact screens, where the console hides.
  const dock = make('div', null, 'multiplayer-voice'); dock.setAttribute('role', 'group'); dock.setAttribute('aria-label', 'Voice chat'); dock.hidden = true;
  const dockJoin = make('button', 'Join voice'); dockJoin.type = 'button'; dockJoin.className = 'voice-join';
  const dockMic = make('button', 'Unmute'); dockMic.type = 'button'; dockMic.className = 'voice-mic'; dockMic.hidden = true; pressed(dockMic, false);
  const dockDeafen = make('button', 'Deafen'); dockDeafen.type = 'button'; dockDeafen.className = 'voice-deafen'; dockDeafen.hidden = true; pressed(dockDeafen, false);
  const dockUnlock = make('button', 'Enable audio'); dockUnlock.type = 'button'; dockUnlock.className = 'voice-unlock'; dockUnlock.hidden = true;
  const dockStatus = make('p', null, 'voice-dock-status'); dockStatus.setAttribute('aria-hidden', 'true');
  dock.append(dockJoin, dockMic, dockDeafen, dockUnlock, dockStatus);
  chatSection?.insertBefore?.(dock, chatSection.querySelector?.('.multiplayer-chat-history') ?? null);
  const rosterButtons = new Map();
  for (const button of [consoleJoin, dockJoin]) button.addEventListener('click', () => void voice.toggleJoin());
  // Push to talk by touch or mouse transmits while the button is held and stops when it
  // lifts or is cancelled; the click that follows a press never turns the microphone on.
  // Keyboard and switch activation (detail 0) still toggle.
  for (const button of [consoleMic, dockMic]) {
    let holding = false;
    const release = () => { if (!holding) return; holding = false; voice.setTransmit(false); };
    button.addEventListener('pointerdown', event => {
      if (!voice.state.pushToTalk || event.button !== 0) return;
      event.preventDefault(); holding = true;
      try { button.setPointerCapture?.(event.pointerId); } catch { /* the pointer already lifted */ }
      voice.setTransmit(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('click', event => { if (voice.state.pushToTalk && event.detail !== 0) return; void voice.toggleMic(); });
  }
  dockDeafen.addEventListener('click', () => voice.setDeafened(dockDeafen.getAttribute('aria-pressed') !== 'true'));
  dockUnlock.addEventListener('click', () => void voice.unlockAudio());
  let last = null;
  function render(state = voice.state) {
    const joined = state.status === 'joined', inFlight = state.status === 'joining' || state.status === 'rejoining';
    console.hidden = dock.hidden = state.status === 'unavailable';
    const joinText = joinedLike(state.status) ? 'Leave voice' : 'Join voice';
    labelWithKey(consoleJoin, joinText, 'Y'); dockJoin.textContent = joinText;
    busy(consoleJoin, inFlight); busy(dockJoin, inFlight);
    consoleMic.hidden = dockMic.hidden = !joined; dockDeafen.hidden = !joined;
    const micOn = state.mic === 'on', micText = state.pushToTalk ? (micOn ? 'Talking' : 'Hold to talk') : micOn ? 'Mute' : 'Unmute';
    labelWithKey(consoleMic, micText, 'M'); dockMic.textContent = micText;
    pressed(consoleMic, micOn); pressed(dockMic, micOn);
    busy(consoleMic, state.mic === 'requesting' || state.deafened); busy(dockMic, state.mic === 'requesting' || state.deafened);
    pressed(dockDeafen, state.deafened); dockDeafen.textContent = state.deafened ? 'Undeafen' : 'Deafen';
    dockUnlock.hidden = !joined || !state.playbackBlocked;
    if (status.textContent !== state.message) status.textContent = state.message;
    dockStatus.textContent = state.message;
    console.dataset.status = dock.dataset.status = state.status;
    const talking = state.speaking.size;
    chatDock?.setVoiceSummary?.(joined ? `Voice on${talking ? ` · ${talking} talking` : ''}` : '');
    for (const [playerId, button] of rosterButtons) {
      const peer = state.peers.get(playerId);
      button.hidden = !joined || !peer;
      pressed(button, Boolean(peer?.muted));
      const name = players().get(playerId)?.name ?? button.dataset.name ?? '';
      const text = peer?.muted ? 'Unmute voice' : 'Mute voice';
      if (button.textContent !== text) button.textContent = text;
      button.dataset.label = `${text} from {name}`;
      button.setAttribute('aria-label', `${text} from ${name}`);
    }
    last = state;
  }
  return {
    render,
    // A roster row's voice control. Hidden until both residents share a voice room.
    rosterButton(row, player) {
      const button = make('button', 'Mute voice'); button.type = 'button'; button.className = 'voice-roster-mute'; button.hidden = true;
      button.dataset.name = player.name; button.dataset.label = 'Mute voice from {name}'; button.setAttribute('aria-label', `Mute voice from ${player.name}`); pressed(button, false);
      button.addEventListener('click', () => voice.setPeerMuted(player.id, button.getAttribute('aria-pressed') !== 'true'));
      rosterButtons.set(player.id, button); row.append(button);
      if (last) render(last);
      return button;
    },
    forgetRow(playerId) { rosterButtons.delete(playerId); },
    elements: { console, dock, status, consoleJoin, consoleMic, dockJoin, dockMic, dockDeafen, dockUnlock },
    dispose() { console.remove(); dock.remove(); rosterButtons.clear(); },
  };
}

// Settings → Audio: microphone choice, push-to-talk and automatic unmute. Built
// before the town connects, so it talks only to the preferences store; the
// device list is read on focus and never asks for permission by itself.
export function createVoiceSettings({ preferences, listDevices = () => navigator.mediaDevices?.enumerateDevices?.() ?? Promise.resolve([]) }) {
  const details = make('details', null, 'rail-disclosure voice-settings'); details.open = true;
  const summary = make('summary', 'Voice chat'); details.append(summary);
  const intro = make('p', 'Voice between residents in the same place. The microphone is asked for only when you unmute.', 'voice-settings-intro');
  const label = make('label', 'Microphone'); label.setAttribute('for', 'voice-input-device');
  const select = make('select'); select.id = 'voice-input-device';
  const fill = async () => {
    let devices = [];
    try { devices = (await listDevices()) ?? []; } catch { devices = []; }
    const inputs = devices.filter(device => device.kind === 'audioinput');
    const current = preferences.get().deviceId;
    select.replaceChildren();
    const auto = make('option', 'Default microphone'); auto.value = ''; select.append(auto);
    inputs.forEach((device, index) => { const option = make('option', device.label || `Microphone ${index + 1}`); option.value = device.deviceId; select.append(option); });
    select.value = current && inputs.some(device => device.deviceId === current) ? current : '';
  };
  void fill();
  select.addEventListener('focus', () => void fill());
  select.addEventListener('change', () => preferences.set({ deviceId: select.value || null }));
  const mode = make('fieldset', null, 'voice-mode'); const legend = make('legend', 'Talk'); mode.append(legend);
  const radios = [['open', 'Open microphone'], ['ptt', 'Push to talk (hold M)']].map(([value, text]) => {
    const wrap = make('label', null, 'layer-row'); const input = make('input'); input.type = 'radio'; input.name = 'voice-mode'; input.value = value; input.id = `voice-mode-${value}`;
    input.checked = preferences.get().pushToTalk === (value === 'ptt');
    input.addEventListener('change', () => { if (input.checked) preferences.set({ pushToTalk: value === 'ptt' }); });
    wrap.append(input, make('span', text)); mode.append(wrap); return input;
  });
  const autoWrap = make('label', null, 'layer-row'); const auto = make('input'); auto.type = 'checkbox'; auto.id = 'voice-auto-unmute';
  auto.checked = preferences.get().autoUnmute;
  auto.addEventListener('change', () => preferences.set({ autoUnmute: auto.checked }));
  autoWrap.append(auto, make('span', 'Unmute automatically after joining (only once you have allowed the microphone)'));
  details.append(intro, label, select, mode, autoWrap);
  preferences.subscribe(next => { radios[0].checked = !next.pushToTalk; radios[1].checked = next.pushToTalk; auto.checked = next.autoUnmute; });
  return details;
}
