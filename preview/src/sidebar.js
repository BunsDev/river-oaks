import { dismissOnOutsideClick } from './modal-dismiss.js';
import { createJevSettings } from './jev-settings.js';
import { createVoiceSettings } from './voice-ui.js';
import { sharedVoicePreferences } from './voice-preferences.js';
import { createAccountDeletionSettings } from './account-deletion.js';
import { createModerationReports } from './moderation-reports.js';
import { createSupportContact } from './settings-support.js';
import { sharedBlockList, createBlockedPlayersSettings } from './player-blocks.js';

// Keep the navigation API shared by Commands and the HUD launchers.
export function setupSidebar() {
  const panel = document.querySelector('#control-panel');
  const trigger = document.querySelector('#panel-toggle');
  let controls = null;
  // A glass lens holding a folded district map: three panels, a walked route and a pin.
  trigger.innerHTML = '<span class="map-lens" aria-hidden="true"><svg viewBox="0 0 24 24">'
    + '<path class="map-lens-paper" d="M3 6.6 8.6 4.6 15.4 6.6 21 4.6V17.4L15.4 19.4 8.6 17.4 3 19.4Z"/>'
    + '<path class="map-lens-fold" d="M8.6 4.6 15.4 6.6V19.4L8.6 17.4Z"/>'
    + '<path class="map-lens-route" d="M5.4 15.6C7.6 13.4 9.6 15.4 11.6 12.8S14.6 9.4 17.2 10.2"/>'
    + '<path class="map-lens-pin" d="M18 3.2a2.7 2.7 0 0 1 2.7 2.7c0 2-2.7 4.6-2.7 4.6s-2.7-2.6-2.7-4.6A2.7 2.7 0 0 1 18 3.2Z"/>'
    + '<circle class="map-lens-pin-eye" cx="18" cy="5.9" r=".95"/></svg></span><span>Map</span><kbd>⌘B</kbd>';
  trigger.querySelector('kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘B' : 'Ctrl B';
  trigger.setAttribute('aria-label', 'Map');
  trigger.setAttribute('aria-controls', 'explore-section');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-keyshortcuts', 'Meta+B Control+B Alt+2');
  trigger.title = 'Open district minimap';
  document.body.classList.add('panel-collapsed', 'game-hud');
  trigger.addEventListener('click', () => controls?.toggle(1));
  return {
    panel, trigger,
    bind(value) { controls = value; },
    setOpen(open, options) { controls?.setOpen(1, open, options); },
    toggle() { controls?.toggle(1, { focus: true }); },
    closeTarget(target) { controls?.closeTarget(target); },
    get expanded() { return controls?.isOpen(1) ?? false; },
  };
}

export function setupSidebarSections({ graphics = null, sidebar } = {}) {
  const panel = sidebar.panel, viewport = document.querySelector('#viewport');
  const people = panel.querySelector('#community-section'), places = panel.querySelector('#explore-section');
  const settings = panel.querySelector('#settings-section');
  const atmosphere = settings.nextElementSibling, about = atmosphere.nextElementSibling;
  const appearance = panel.querySelector('.appearance-control');
  const voiceNodes = ['label[for="community-voice"]', '#community-voice', '#community-voice-status'].map(selector => panel.querySelector(selector));
  const layers = [...settings.children].slice(1);
  const light = [...atmosphere.children].slice(1);
  const evidence = [...about.children].slice(1);
  atmosphere.remove(); about.remove(); settings.replaceChildren();
  panel.querySelector('.identity').hidden = true;
  panel.querySelector('.experience-nav').hidden = true;
  const account = panel.querySelector('#access-tools');
  const connection = panel.querySelector('.panel-footer');
  const more = panel.querySelector('#community-more');
  more.querySelector('summary').textContent = 'Community activities';
  more.classList.add('rail-disclosure');
  for (const selector of ['label[for="community-local"]', '#community-local', '#community-meet']) people.insertBefore(panel.querySelector(selector), more);

  const launch = (id, label, controls) => {
    const button = document.createElement('button'); button.type = 'button'; button.id = id;
    button.className = 'hud-launcher'; button.textContent = label;
    button.setAttribute('aria-controls', controls); viewport.append(button); return button;
  };
  const peopleTrigger = launch('people-toggle', 'People', people.id);
  peopleTrigger.setAttribute('aria-keyshortcuts', 'Alt+1');
  const settingsTrigger = launch('settings-toggle', 'Settings', 'settings-dialog');
  settingsTrigger.setAttribute('aria-haspopup', 'dialog'); settingsTrigger.setAttribute('aria-keyshortcuts', 'Alt+3');
  const sections = [people, places], triggers = [peopleTrigger, sidebar.trigger];
  const compact = matchMedia('(max-width:900px)');
  let lastOpened = 1;
  const focusWorld = () => document.querySelector('#canvas-host').focus({ preventScroll: true });
  const setOpen = (index, open, { focus = false } = {}) => {
    if (open && compact.matches) setOpen(1 - index, false);
    if (open) lastOpened = index;
    const section = sections[index];
    if (!open && section.contains(document.activeElement)) triggers[index].focus({ preventScroll: true });
    section.hidden = !open; section.inert = !open; triggers[index].setAttribute('aria-expanded', String(open));
    if (index === 1) document.body.classList.toggle('panel-collapsed', !open);
    try { localStorage.setItem(`river-oaks-hud-${index}`, String(open)); } catch { /* Session controls remain usable. */ }
    if (open && compact.matches) {
      document.querySelector('#community-close')?.click();
      document.querySelector('.town-chat-dock')?.removeAttribute('open');
      document.querySelector('.visit-tools')?.removeAttribute('open');
    }
    if (focus) (open ? section : document.querySelector('#canvas-host')).focus({ preventScroll: true });
  };
  const initialOpen = sections.map((_, index) => { try { return localStorage.getItem(`river-oaks-hud-${index}`) === 'true'; } catch { return false; } });
  sections.forEach((section, index) => {
    section.classList.add('hud-space'); section.removeAttribute('role');
    const header = document.createElement('header'); header.className = 'hud-space-header';
    const heading = document.createElement('h2'); heading.textContent = index === 0 ? 'People nearby' : 'District map';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', `Close ${index === 0 ? 'People' : 'Map'}`);
    close.addEventListener('click', () => setOpen(index, false)); header.append(heading, close);
    // The glass sheet never scrolls itself: Chrome drops the scrollbar of a scrolling
    // backdrop-filter root for single frames while content under it moves (flicker).
    // Its content lives in a body that scrolls, or that fits without scrolling (the map).
    const body = document.createElement('div'); body.className = 'hud-space-body';
    body.append(...section.childNodes); section.append(header, body);
    if (index === 1) {
      const directory = body.querySelector('#district-directory');
      directory.previousElementSibling.remove();
      const access = document.createElement('details'); access.className = 'storefront-access';
      const summary = document.createElement('summary'); summary.textContent = 'Storefront access';
      access.append(summary, directory); body.append(access);
    }
    panel.append(section); setOpen(index, initialOpen[index]);
  });
  peopleTrigger.addEventListener('click', () => setOpen(0, people.hidden));
  compact.addEventListener('change', event => { if (event.matches && !people.hidden && !places.hidden) setOpen(1 - lastOpened, false); });

  const dialog = document.createElement('dialog'); dialog.id = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = '<header class="settings-header"><div><p>Your experience</p><h2 id="settings-title">Settings</h2></div><button type="button" aria-label="Close settings">Close <kbd>Esc</kbd></button></header><div class="settings-layout"><nav role="tablist" aria-label="Settings categories" aria-orientation="vertical"></nav></div><footer>Changes apply as you choose them.</footer>';
  dialog.querySelector('.settings-layout').append(settings); panel.append(dialog);
  // Each pane opens with what it is for; related rows sit together under a small heading.
  const group = (heading, nodes) => {
    const section = document.createElement('div'); section.className = 'settings-group';
    if (heading) { const title = document.createElement('h4'); title.textContent = heading; section.append(title); }
    section.append(...nodes); return section;
  };
  const studio = layers.find(node => node.querySelector?.('a[href="/studio.html"]'));
  // Hidden unless the server offers in-app deletion (#292); it asks each time Account opens.
  const deletion = createAccountDeletionSettings();
  // Saved player reports, for moderators only (#292); it asks each time Account opens too.
  const reports = createModerationReports();
  // The published support contact (#292), as the sign-in gate shows it; nothing when unset.
  const support = createSupportContact();
  const blocked = createBlockedPlayersSettings({ blocks: sharedBlockList() });
  const groups = [
    ['Appearance', 'Light or dark, or follow your device.', [appearance]],
    ['Graphics', 'Sharper or smoother. Auto adjusts as you play.', graphics ? [graphics] : []],
    ['Audio', 'What you hear in town, and how you talk.', [group(null, voiceNodes), createVoiceSettings({ preferences: sharedVoicePreferences() }), createJevSettings('elevenlabs')]],
    ['World', 'Light, weather and what the district shows.', [group('Light', light), group('Show in the district', layers.filter(node => node !== studio)), ...(studio ? [group('Build', [studio])] : [])]],
    ['Account', 'Invitations, problem reports and signing out.', [account, createJevSettings(), group('Blocked residents', [blocked]), group('World data', [connection]), reports, ...(support ? [support] : []), deletion]],
    ['About', 'Where this district comes from.', evidence],
  ];
  const tabs = [], panes = [];
  const selectSettings = (index, focus = false) => {
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(index === i)); tab.tabIndex = i === index ? 0 : -1; panes[i].hidden = i !== index; });
    if (panes[index].contains(deletion)) { void deletion.refresh(); void reports.refresh(); void blocked.refresh(); }
    // On phones the categories scroll sideways; keep the chosen one in view.
    tabs[index].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (focus) tabs[index].focus();
  };
  // Panes can also arrive later (Controls, once the player exists), placed after a named one.
  const addPane = (label, purpose, nodes, { after = null } = {}) => {
    const index = panes.length, tab = document.createElement('button'); tab.type = 'button'; tab.textContent = label; tab.id = `settings-tab-${index}`;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `settings-pane-${index}`);
    const pane = document.createElement('section'); pane.id = `settings-pane-${index}`; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', tab.id); pane.tabIndex = 0;
    const title = document.createElement('h3'); title.textContent = label;
    const intro = document.createElement('p'); intro.className = 'settings-pane-intro'; intro.id = `settings-intro-${index}`; intro.textContent = purpose;
    pane.setAttribute('aria-describedby', intro.id); pane.append(title, intro, ...nodes);
    const before = after === null ? -1 : tabs.findIndex(item => item.textContent === after) + 1;
    if (before > 0 && before < tabs.length) { tabs[before].before(tab); panes[before].before(pane); tabs.splice(before, 0, tab); panes.splice(before, 0, pane); }
    else { settings.append(pane); dialog.querySelector('nav').append(tab); tabs.push(tab); panes.push(pane); }
    tab.addEventListener('click', () => selectSettings(tabs.indexOf(tab)));
    tab.addEventListener('keydown', event => {
      // Narrow screens lay the categories out in a row, so left and right move too.
      const at = tabs.indexOf(tab), count = tabs.length;
      const next = ['ArrowDown', 'ArrowRight'].includes(event.key) ? (at + 1) % count : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? (at + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null;
      if (next !== null) { event.preventDefault(); selectSettings(next, true); }
    });
    return pane;
  };
  for (const [label, purpose, nodes] of groups) addPane(label, purpose, nodes);
  selectSettings(0);
  let returnFocus = null;
  const openSettings = selector => {
    if (!dialog.open) {
      returnFocus = document.activeElement; dialog.showModal();
      if (deletion.closest('[role="tabpanel"]')?.hidden === false) { void deletion.refresh(); void reports.refresh(); void blocked.refresh(); }
    }
    const target = selector && dialog.querySelector(selector);
    if (target) {
      selectSettings(panes.findIndex(pane => pane.contains(target)));
      for (let node = target.parentElement; node && node !== dialog; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
      target.focus();
    } else tabs.find(tab => tab.getAttribute('aria-selected') === 'true').focus();
  };
  const closeSettings = () => {
    dialog.close();
    (returnFocus?.isConnected && returnFocus.checkVisibility() && !returnFocus.closest('[inert]') ? returnFocus : settingsTrigger).focus({ preventScroll: true });
  };
  dismissOnOutsideClick(dialog, closeSettings);
  settingsTrigger.addEventListener('click', () => openSettings());
  dialog.querySelector('.settings-header button').addEventListener('click', closeSettings);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  const controls = {
    setOpen, isOpen: index => !sections[index].hidden,
    toggle: (index, options) => setOpen(index, sections[index].hidden, options),
    closeTarget(target) { const index = sections.findIndex(section => section.contains(target)); if (index >= 0) { setOpen(index, false); focusWorld(); } },
  };
  sidebar.bind(controls);
  return {
    select(index, focus = false, selector = null) { if (index === 2) openSettings(selector); else setOpen(index, true, { focus }); },
    addSettings(label, purpose, nodes, options) { const pane = addPane(label, purpose, nodes, options); selectSettings(Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'))); return pane; },
    group,
  };
}
