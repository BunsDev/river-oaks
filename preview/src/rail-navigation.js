import { railShortcut } from './keyboard-input.js';
import { matchCommands } from './command-search.js';

export function setupRailNavigation({ sidebar, getSections, getDock, getClearView, getPhotoMode }) {
  const host = document.querySelector('#canvas-host');
  const mac = /Mac|iPhone|iPad/.test(navigator.platform), primary = mac ? '⌘' : 'Ctrl+';
  const dialog = document.createElement('dialog'); dialog.className = 'rail-commands';
  dialog.setAttribute('aria-labelledby', 'rail-commands-title');
  dialog.innerHTML = `<header><h2 id="rail-commands-title">Commands & keyboard</h2><button type="button" class="commands-close" aria-label="Close commands">Close <kbd>Esc</kbd></button></header>
    <label for="rail-command-search">Find a control or activity</label><input id="rail-command-search" type="search" autocomplete="off" placeholder="Try places, chat, rides…">
    <p class="commands-count" role="status"></p><div class="commands-results" role="group" aria-label="Available commands"></div>
    <details class="commands-reference"><summary>Gameplay keys & navigation</summary><p></p><small>Gameplay keys work with the world focused. Tab and Shift+Tab navigate controls; Alt+1 opens People, Alt+2 opens Places, and Alt+3 opens Settings. Up and Down select settings categories. Shortcuts leave typing and modal dialogs alone.</small></details>`;
  document.body.append(dialog);
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'commands-toggle';
  trigger.innerHTML = '<span>Commands</span><kbd>?</kbd>'; trigger.title = `Commands & keyboard (${primary}K or ?)`;
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-keyshortcuts', 'Meta+K Control+K');
  document.querySelector('#viewport').append(trigger);
  const search = dialog.querySelector('input'), results = dialog.querySelector('.commands-results');
  let returnFocus = null;
  const focusWorld = () => host.focus({ preventScroll: true });
  const visibleTarget = selector => {
    const target = document.querySelector(selector);
    if (!target || target.disabled) return null;
    for (let node = target; node && node !== document.body; node = node.parentElement) {
      if (node.hidden && node.getAttribute('role') !== 'tabpanel' && !node.classList.contains('hud-space')) return null;
    }
    return target;
  };
  const openTab = (index, selector = null) => {
    getClearView()?.set(false); getSections()?.select(index, true, selector);
    const target = selector && document.querySelector(selector);
    if (!target) return;
    for (let node = target.parentElement; node && node !== sidebar.panel; node = node.parentElement) {
      if (node.tagName === 'DETAILS') node.open = true;
    }
    target.scrollIntoView({ block: 'nearest', behavior: 'instant' }); target.focus({ preventScroll: true });
  };
  const showPlay = selector => {
    if (document.querySelector('#people-toggle')?.getAttribute('aria-expanded') === 'true') document.querySelector('#people-toggle').click();
    if (matchMedia('(max-width:1200px)').matches && document.querySelector('#community-dialogue')?.hidden === false) document.querySelector('#community-close')?.click();
    getClearView()?.set(false);
    if (matchMedia('(max-width:1100px)').matches) sidebar.setOpen(false);
    const dock = getDock(); dock?.setOpen(true, { focus: true }); if (selector) dock?.jump(selector);
  };
  const actions = () => [
    { label: 'Places · show or hide destinations', keys: `${primary}B`, terms: 'sidebar left rail', toggle: true, run: () => { getClearView()?.set(false); sidebar.toggle(); } },
    { id: 'activities', label: 'Activities · show or hide controls', keys: `${primary}Shift+B`, terms: 'play right rail dock', toggle: true, run: () => {
      const dock = getDock(); if (!dock) return;
      if (dock.element.open && dock.element.checkVisibility({ visibilityProperty: true })) { dock.setOpen(false); focusWorld(); } else showPlay();
    } },
    ...['People · nearby and chat', 'Explore · places and landmarks', 'Settings'].map((label, index) => ({ label, keys: `Alt+${index + 1}`, run: () => openTab(index) })),
    { label: 'Search destinations', keys: '/', selector: '#store-search', run: () => openTab(1, '#store-search') },
    { label: 'World map', selector: '.world-map-surface', run: () => openTab(1, '.world-map-surface') },
    { label: 'Save a landmark', selector: '#landmark-name', run: () => openTab(1, '#landmark-name') },
    { label: 'Browse shared worlds', selector: '.world-portal-list a', run: () => openTab(1, '.world-portal-list a') },
    { label: 'Events & gatherings', selector: '.world-events-filters select', run: () => openTab(1, '.world-events-filters select') },
    { label: 'Town chat', selector: '.multiplayer-chat-form input', run: () => { getClearView()?.set(false); document.querySelector('#community-close')?.click(); document.querySelector('.town-chat-dock').open = true; document.querySelector('.multiplayer-chat-form input').focus(); } },
    { label: 'Character · appearance and abilities', selector: 'input[name=player-character]:checked', run: () => showPlay('.player-controls') },
    { label: 'Camera · Photo mode', enabled: () => Boolean(getPhotoMode?.()), run: () => getPhotoMode().open() },
    { label: 'Rides · driving and camera', selector: '#player-camera', run: () => showPlay('.player-settings') },
    { label: 'Bird cams', selector: '.bird-cams', run: () => showPlay('.bird-cams') },
    { label: 'Build & decorate', selector: '#build-mode', run: () => showPlay('.shared-build-controls') },
    { label: 'Graphics quality', selector: '[data-quality=auto]', run: () => openTab(2, '[data-quality=auto]') },
    { label: 'Light & atmosphere', selector: '#sun-hour', run: () => openTab(2, '#sun-hour') },
    { label: getClearView()?.active ? 'Show controls' : 'Clear view', keys: 'H', enabled: () => getClearView() && (document.body.classList.contains('walking') || getClearView().active), run: () => getClearView()?.set(!getClearView()?.active) },
    { label: 'Report a problem', terms: 'bug debug feedback issue broken crash error help support', run: () => window.dispatchEvent(new CustomEvent('river-oaks:report-problem')) },
    { label: 'Return to world', run: () => {
      if (document.querySelector('#community-dialogue')?.hidden === false) document.querySelector('#community-close')?.click();
      sidebar.setOpen(false); getDock()?.setOpen(false); focusWorld();
    } },
  ].filter(action => (!action.selector || visibleTarget(action.selector)) && (!action.enabled || action.enabled()) && (action.id !== 'activities' || getDock()));
  const close = (restore = true) => {
    dialog.close();
    if (restore) (returnFocus?.isConnected && returnFocus !== document.body && returnFocus.checkVisibility({ visibilityProperty: true }) && !returnFocus.closest('[inert]') ? returnFocus : host).focus({ preventScroll: true });
  };
  const render = () => {
    const filtered = matchCommands(actions(), search.value);
    results.replaceChildren(...filtered.map(action => {
      const button = document.createElement('button'); button.type = 'button';
      const label = document.createElement('span'); label.textContent = action.label; button.append(label);
      if (action.keys) { const kbd = document.createElement('kbd'); kbd.textContent = action.keys; button.append(kbd); }
      button.addEventListener('click', () => {
        if (action.selector && !visibleTarget(action.selector)) { render(); return; }
        close(false); action.run();
      }); return button;
    }));
    dialog.querySelector('.commands-count').textContent = filtered.length ? `${filtered.length} commands` : 'No matching commands. Try places, character, or settings.';
    dialog.querySelector('.commands-reference p').textContent = document.body.classList.contains('bird-riding')
      ? 'Bird ride: T take / give controls · N next bird · WASD steer · Space climb · C dive · Esc land'
      : document.querySelector('#build-mode[aria-pressed=true]')
        ? 'Builder: R rotate · Shift+R reverse · Enter place · Esc finish'
        : 'WASD walk · arrows turn · Shift brisk walk · E talk · F enter / leave · Z sit / stand / water · B flight · Space rise · C lower · J companion · P beast movement · V camera';
  };
  const open = ({ help = false } = {}) => { returnFocus = document.activeElement; search.value = ''; dialog.querySelector('.commands-reference').open = help; render(); dialog.showModal(); search.focus(); };
  trigger.addEventListener('click', () => open());
  dialog.querySelector('.commands-close').addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  search.addEventListener('input', render);
  const menuKey = event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button,input,summary')].filter(node => node.checkVisibility({ visibilityProperty: true }));
      if (!dialog.contains(document.activeElement) || (event.shiftKey ? document.activeElement === focusable[0] : document.activeElement === focusable.at(-1))) {
        event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus();
      }
      return;
    }
    const buttons = [...results.querySelectorAll('button')], current = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault(); buttons[next]?.focus();
    } else if (event.key === 'Enter' && document.activeElement === search) { event.preventDefault(); buttons[0]?.click(); }
  };
  // Registered before gameplay listeners. Modifier chords cannot bubble into B flight,
  // and Escape from a rail/menu cannot accidentally stop a bird ride or builder.
  document.addEventListener('keydown', event => {
    if (dialog.open) {
      menuKey(event); event.stopImmediatePropagation();
      return;
    }
    if (document.querySelector('.app-shell[inert]') || [...document.querySelectorAll('[aria-modal=true],dialog[open]')].some(node => node !== dialog && node.checkVisibility())) return;
    if (event.key === 'Escape' && event.repeat) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.key === 'Escape' && !event.isComposing) {
      const dock = getDock();
      if (sidebar.panel.contains(event.target) || dock?.element.contains(event.target)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (sidebar.panel.contains(event.target)) sidebar.closeTarget(event.target); else dock.setOpen(false);
        focusWorld(); return;
      }
    }
    if (event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')) return;
    const action = railShortcut(event); if (!action) return;
    event.preventDefault(); event.stopImmediatePropagation(); if (event.repeat) return;
    if (action === 'commands') open({ help: event.key === '?' });
    else if (action === 'rail') { getClearView()?.set(false); sidebar.toggle(); }
    else if (action === 'play') actions().find(item => item.id === 'activities')?.run();
    else if (action.startsWith('tab-')) openTab(Number(action.slice(-1)));
    else if (action === 'search' && visibleTarget('#store-search')) openTab(1, '#store-search');
  }, true);
}
