import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, next) { return url.endsWith('.css') ? {format:'module',source:'',shortCircuit:true} : next(url,context); }")}`, import.meta.url);
const { createVoiceUI, createVoiceSettings, labelWithKey } = await import('../src/voice-ui.js');
const { createVoicePreferences } = await import('../src/voice-preferences.js');

function dom() {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.events = {}; this.attributes = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.className = ''; this.checked = false; this.open = false; }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    insertBefore(item, before) { item.parent = this; const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, item); }
    replaceChildren(...items) { this.children = []; this.textContent = ''; for (const item of items) { if (typeof item === 'string') this.textContent = item; else this.append(item); } }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, callback) { this.events[type] = callback; }
    async click() { return this.events.click?.({ preventDefault() {} }); }
    querySelector(selector) { return this.find(node => selector === '.' + node.className); }
    find(predicate) { return predicate(this) ? this : this.children.map(child => child.find(predicate)).find(Boolean) ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    get text() { return [this.textContent, ...this.children.map(child => child.text)].filter(Boolean).join(' '); }
  }
  globalThis.document = { createElement: tag => new Element(tag) };
  // Node exposes navigator as a getter; define over it for the test.
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Studio mic' }, { kind: 'videoinput', deviceId: 'cam' }] } } });
  return { chatSection: (() => { const section = new Element('section'); const history = new Element('div'); history.className = 'multiplayer-chat-history'; section.append(history); return section; })(), row: new Element('div') };
}
const baseState = (over = {}) => ({ status: 'idle', mic: 'off', deafened: false, playbackBlocked: false, space: null, participantIdentity: null, expiresAt: 0, message: 'Voice off', peers: new Map(), speaking: new Set(), pushToTalk: false, available: true, ...over });
function fakeVoice(state = baseState()) {
  const calls = [];
  return { calls, state, toggleJoin() { calls.push('toggleJoin'); }, toggleMic() { calls.push('toggleMic'); }, setDeafened(value) { calls.push(['deafen', value]); }, unlockAudio() { calls.push('unlock'); }, setPeerMuted(id, value) { calls.push(['mute', id, value]); } };
}

test('join announces state through one status region, mic and deafen use aria-pressed, and joining uses aria-disabled so focus stays put', async () => {
  const { chatSection } = dom();
  const voice = fakeVoice();
  const mounted = [];
  const summaries = [];
  const ui = createVoiceUI({ voice, chatSection, walking: { mountVoice: node => mounted.push(node) }, chatDock: { setVoiceSummary: text => summaries.push(text) } });
  assert.equal(mounted.length, 1);
  assert.equal(ui.elements.status.attributes.role, 'status');
  assert.equal(ui.elements.status.attributes['aria-live'], 'polite');
  assert.equal(chatSection.children[0], ui.elements.dock, 'the dock row sits before the history');
  ui.render(baseState({ status: 'unavailable' }));
  assert.equal(ui.elements.console.hidden, true);
  ui.render(baseState());
  assert.equal(ui.elements.console.hidden, false);
  assert.equal(ui.elements.consoleJoin.text, 'Join voice Y');
  assert.equal(ui.elements.consoleJoin.attributes['aria-keyshortcuts'], 'Y');
  assert.equal(ui.elements.consoleMic.hidden, true);
  ui.render(baseState({ status: 'joining', message: 'Joining voice…' }));
  assert.equal(ui.elements.consoleJoin.attributes['aria-disabled'], 'true');
  assert.equal(ui.elements.consoleJoin.text, 'Leave voice Y');
  assert.equal(ui.elements.status.textContent, 'Joining voice…');
  ui.render(baseState({ status: 'joined', message: 'Voice on · microphone off', speaking: new Set(['alice', 'bob']) }));
  assert.equal(ui.elements.consoleJoin.attributes['aria-disabled'], 'false');
  assert.equal(ui.elements.consoleMic.hidden, false);
  assert.equal(ui.elements.consoleMic.text, 'Unmute M');
  assert.equal(ui.elements.consoleMic.attributes['aria-pressed'], 'false');
  assert.equal(ui.elements.dockDeafen.attributes['aria-pressed'], 'false');
  assert.equal(summaries.at(-1), 'Voice on · 2 talking');
  ui.render(baseState({ status: 'joined', mic: 'on', message: 'Voice on · microphone on' }));
  assert.equal(ui.elements.consoleMic.text, 'Mute M');
  assert.equal(ui.elements.consoleMic.attributes['aria-pressed'], 'true');
  ui.render(baseState({ status: 'joined', deafened: true, message: 'Voice on · deafened' }));
  assert.equal(ui.elements.dockDeafen.attributes['aria-pressed'], 'true');
  assert.equal(ui.elements.dockDeafen.textContent, 'Undeafen');
  assert.equal(ui.elements.consoleMic.attributes['aria-disabled'], 'true', 'no talking while deafened');
  ui.render(baseState({ status: 'joined', playbackBlocked: true }));
  assert.equal(ui.elements.dockUnlock.hidden, false);
  await ui.elements.dockUnlock.click(); await ui.elements.consoleJoin.click(); await ui.elements.dockMic.click(); await ui.elements.dockDeafen.click();
  assert.deepEqual(voice.calls, ['unlock', 'toggleJoin', 'toggleMic', ['deafen', true]]);
  ui.render(baseState({ status: 'joined', pushToTalk: true }));
  assert.equal(ui.elements.consoleMic.text, 'Hold to talk M');
});

test('a roster mute button is labelled with the resident name, follows the peer state and re-labels on rename', async () => {
  const { chatSection, row } = dom();
  const voice = fakeVoice();
  const names = new Map([['bob', { name: 'Bob' }]]);
  const ui = createVoiceUI({ voice, chatSection, players: () => names });
  const button = ui.rosterButton(row, { id: 'bob', name: 'Bob' });
  assert.equal(button.hidden, true, 'hidden until both residents share a room');
  assert.equal(button.attributes['aria-label'], 'Mute voice from Bob');
  ui.render(baseState({ status: 'joined', peers: new Map([['bob', { identity: 'pb', muted: false, speaking: false }]]) }));
  assert.equal(button.hidden, false);
  assert.equal(button.attributes['aria-pressed'], 'false');
  await button.click();
  assert.deepEqual(voice.calls, [['mute', 'bob', true]]);
  names.set('bob', { name: 'Robert' });
  ui.render(baseState({ status: 'joined', peers: new Map([['bob', { identity: 'pb', muted: true, speaking: false }]]) }));
  assert.equal(button.textContent, 'Unmute voice');
  assert.equal(button.attributes['aria-pressed'], 'true');
  assert.equal(button.attributes['aria-label'], 'Unmute voice from Robert');
  assert.equal(button.dataset.label, 'Unmute voice from {name}');
  ui.render(baseState({ status: 'idle' }));
  assert.equal(button.hidden, true);
});

test('keycaps follow the label in the DOM and are announced through aria-keyshortcuts', () => {
  dom();
  const button = globalThis.document.createElement('button');
  labelWithKey(button, 'Join voice', 'Y');
  assert.equal(button.textContent, 'Join voice');
  assert.equal(button.children[0].tagName, 'kbd');
  assert.equal(button.children[0].attributes['aria-hidden'], 'true');
  assert.equal(button.attributes['aria-keyshortcuts'], 'Y');
  labelWithKey(button, 'Join voice');
  assert.equal(button.attributes['aria-keyshortcuts'], undefined);
});

test('the settings pane lists input devices without prompting, and writes push-to-talk and automatic unmute to preferences', async () => {
  dom();
  const storage = new Map();
  const preferences = createVoicePreferences({ storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
  let listed = 0;
  const pane = createVoiceSettings({ preferences, listDevices: async () => { listed++; return navigator.mediaDevices.enumerateDevices(); } });
  await new Promise(resolve => setImmediate(resolve));
  const select = pane.find(node => node.tagName === 'select');
  assert.deepEqual(select.children.map(option => [option.value, option.textContent]), [['', 'Default microphone'], ['mic-1', 'Studio mic']]);
  assert.equal(listed, 1);
  select.value = 'mic-1'; await select.events.change();
  assert.equal(preferences.get().deviceId, 'mic-1');
  const ptt = pane.find(node => node.value === 'ptt');
  ptt.checked = true; await ptt.events.change();
  assert.equal(preferences.get().pushToTalk, true);
  const auto = pane.find(node => node.tagName === 'input' && node.attributes.type === undefined && node.id === 'voice-auto-unmute') ?? pane.find(node => node.id === 'voice-auto-unmute');
  auto.checked = true; await auto.events.change();
  assert.equal(preferences.get().autoUnmute, true);
  assert.equal(pane.find(node => node.tagName === 'summary').textContent, 'Voice chat');
});

test('push to talk on touch transmits only while the mic button is held, never after it lifts (#288)', async () => {
  const { chatSection } = dom();
  const voice = fakeVoice(baseState({ status: 'joined', pushToTalk: true }));
  voice.setTransmit = value => voice.calls.push(['transmit', value]);
  const ui = createVoiceUI({ voice, chatSection });
  ui.render(voice.state);
  const press = (pointerId = 7) => ({ button: 0, pointerId, preventDefault() {} });
  for (const button of [ui.elements.consoleMic, ui.elements.dockMic]) {
    voice.calls.length = 0;
    button.events.pointerdown(press());
    assert.deepEqual(voice.calls, [['transmit', true]], 'pressing starts transmitting');
    button.events.pointerup({ pointerId: 7 });
    await button.events.click({ detail: 1, preventDefault() {} });
    assert.deepEqual(voice.calls, [['transmit', true], ['transmit', false]], 'lifting stops it, and the click that follows never turns the mic on');
    voice.calls.length = 0;
    button.events.pointerdown(press()); button.events.pointercancel({ pointerId: 7 }); button.events.lostpointercapture({ pointerId: 7 });
    assert.deepEqual(voice.calls, [['transmit', true], ['transmit', false]], 'a cancelled hold stops once');
    voice.calls.length = 0;
    button.events.pointerdown({ ...press(), button: 2 });
    assert.deepEqual(voice.calls, [], 'only the main button talks');
  }
  // Keyboard and switch activation (detail 0) still toggle, as before.
  voice.calls.length = 0;
  await ui.elements.consoleMic.events.click({ detail: 0, preventDefault() {} });
  assert.deepEqual(voice.calls, ['toggleMic']);
  // With an open microphone a tap toggles, and a press transmits nothing.
  voice.state = baseState({ status: 'joined' }); ui.render(voice.state); voice.calls.length = 0;
  ui.elements.dockMic.events.pointerdown(press(8)); ui.elements.dockMic.events.pointerup({ pointerId: 8 });
  await ui.elements.dockMic.events.click({ detail: 1, preventDefault() {} });
  assert.deepEqual(voice.calls, ['toggleMic']);
});

test('a second finger on the mic neither restarts nor ends the first finger\'s hold (#288)', () => {
  const { chatSection } = dom();
  const voice = fakeVoice(baseState({ status: 'joined', pushToTalk: true }));
  voice.setTransmit = value => voice.calls.push(['transmit', value]);
  const ui = createVoiceUI({ voice, chatSection });
  ui.render(voice.state);
  for (const button of [ui.elements.consoleMic, ui.elements.dockMic]) {
    // The browser keeps each finger's capture until that finger lifts or is cancelled.
    const captured = new Set();
    button.setPointerCapture = id => captured.add(id); button.hasPointerCapture = id => captured.has(id);
    const press = pointerId => button.events.pointerdown({ button: 0, pointerId, preventDefault() {} });
    const lift = pointerId => { button.events.pointerup({ pointerId }); captured.delete(pointerId); };
    voice.calls.length = 0;
    press(7); press(9); lift(9);
    assert.deepEqual(voice.calls, [['transmit', true]], 'the first finger still talks');
    lift(7);
    assert.deepEqual(voice.calls, [['transmit', true], ['transmit', false]], 'and its lift ends the hold');
    // A hold whose finger left without a word (its capture gone) does not block the next press.
    voice.calls.length = 0;
    press(11); captured.delete(11); press(12); lift(12);
    assert.deepEqual(voice.calls, [['transmit', true], ['transmit', true], ['transmit', false]]);
  }
});
