import { createJevSettings } from './jev-settings.js';

// Keep the navigation API shared by Commands and the HUD launchers.
export function setupSidebar() {
  const panel = document.querySelector('#control-panel');
  const trigger = document.querySelector('#panel-toggle');
  let controls = null;
  trigger.innerHTML = '<span aria-hidden="true">⌖</span><span>Places</span><kbd>⌘B</kbd>';
  trigger.querySelector('kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘B' : 'Ctrl B';
  trigger.setAttribute('aria-label', 'Places');
  trigger.setAttribute('aria-controls', 'explore-section');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-keyshortcuts', 'Meta+B Control+B Alt+2');
  trigger.title = 'Find a place';
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
    const heading = document.createElement('h2'); heading.textContent = index === 0 ? 'People nearby' : 'Explore the district';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', `Close ${index === 0 ? 'People' : 'Places'}`);
    close.addEventListener('click', () => setOpen(index, false)); header.append(heading, close); section.prepend(header);
    if (index === 1) {
      const directory = section.querySelector('#district-directory');
      directory.previousElementSibling.remove();
      header.after(directory);
    }
    panel.append(section); setOpen(index, initialOpen[index]);
  });
  peopleTrigger.addEventListener('click', () => setOpen(0, people.hidden));
  compact.addEventListener('change', event => { if (event.matches && !people.hidden && !places.hidden) setOpen(1 - lastOpened, false); });

  const dialog = document.createElement('dialog'); dialog.id = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = '<header class="settings-header"><div><p>Your experience</p><h2 id="settings-title">Settings</h2></div><button type="button" aria-label="Close settings">Close <kbd>Esc</kbd></button></header><div class="settings-layout"><nav role="tablist" aria-label="Settings categories" aria-orientation="vertical"></nav></div><footer>Changes apply as you choose them.</footer>';
  dialog.querySelector('.settings-layout').append(settings); panel.append(dialog);
  const groups = [
    ['Appearance', [appearance]], ['Graphics', graphics ? [graphics] : []],
    ['Audio', [...voiceNodes, createJevSettings('elevenlabs')]],
    ['World', [...light, ...layers]],
    ['Account', [account, createJevSettings(), connection]],
    ['About', evidence],
  ];
  const tabs = [], panes = [];
  const selectSettings = (index, focus = false) => {
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(index === i)); tab.tabIndex = i === index ? 0 : -1; panes[i].hidden = i !== index; });
    if (focus) tabs[index].focus();
  };
  groups.forEach(([label, nodes], index) => {
    const tab = document.createElement('button'); tab.type = 'button'; tab.textContent = label; tab.id = `settings-tab-${index}`;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `settings-pane-${index}`);
    const pane = document.createElement('section'); pane.id = `settings-pane-${index}`; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', tab.id); pane.tabIndex = 0;
    const title = document.createElement('h3'); title.textContent = label; pane.append(title, ...nodes); settings.append(pane);
    dialog.querySelector('nav').append(tab); tabs.push(tab); panes.push(pane);
    tab.addEventListener('click', () => selectSettings(index));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'ArrowDown' ? (index + 1) % groups.length : event.key === 'ArrowUp' ? (index + groups.length - 1) % groups.length : event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : null;
      if (next !== null) { event.preventDefault(); selectSettings(next, true); }
    });
  });
  selectSettings(0);
  let returnFocus = null;
  const openSettings = selector => {
    if (!dialog.open) { returnFocus = document.activeElement; dialog.showModal(); }
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
  return { select(index, focus = false, selector = null) { if (index === 2) openSettings(selector); else setOpen(index, true, { focus }); } };
}
