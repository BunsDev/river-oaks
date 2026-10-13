import { dismissOnOutsideClick } from './modal-dismiss.js';
import './places-guide.css';
import { STORE_CATEGORIES } from './store-categories.js';

// Filters: everything, or one store category (arrival and spots without a
// store appear under All).
const FILTERS = [['', 'All'], ...STORE_CATEGORIES];

// A dedicated browsing surface; the shared town continues while it is open.
export function createPlacesGuide(host) {
  const groups = [...host.querySelectorAll('.places-group')];
  const status = host.querySelector('#places-status');
  const map = host.querySelector('.world-map');
  const trigger = document.createElement('button');
  trigger.id = 'places-open'; trigger.type = 'button'; trigger.className = 'places-launcher';
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', 'places-dialog');
  trigger.innerHTML = '<span class="places-launcher-copy"><strong>Explore destinations</strong><small>Search, save and go anywhere in the district</small></span><span class="places-launcher-arrow" aria-hidden="true"></span>';
  host.append(trigger);
  const launcherMeta = trigger.querySelector('small');
  const dialog = document.createElement('dialog');
  dialog.id = 'places-dialog'; dialog.className = 'places-guide';
  dialog.setAttribute('aria-labelledby', 'places-guide-title');
  dialog.innerHTML = `<header><div><p class="places-eyebrow">River Oaks · District atlas</p><h2 id="places-guide-title">Find your next stop</h2></div><button type="button" class="places-close" aria-label="Close map" title="Close (Esc)"><span aria-hidden="true"></span></button></header>
    <div class="places-atlas-layout"><div class="places-map-stage"></div><div class="places-browser">
    <div class="places-tabs" role="tablist" aria-label="Map destinations"><button type="button" id="places-tab-destinations" role="tab">Destinations <span class="places-tab-count"></span></button><button type="button" id="places-tab-saved" role="tab">Saved places <span class="places-tab-count"></span></button></div>
    <div class="places-guide-content"></div></div></div><footer><p class="places-live-note">Select a destination on the map or search by name.</p></footer>`;
  const content = dialog.querySelector('.places-guide-content');
  groups.forEach((group, index) => {
    group.open = true; group.id = `places-pane-${index ? 'saved' : 'destinations'}`;
    group.setAttribute('role', 'tabpanel'); group.setAttribute('aria-labelledby', `places-tab-${index ? 'saved' : 'destinations'}`);
    content.append(group);
  });
  const searchLabel = document.createElement('label'); searchLabel.className = 'places-search-label';
  searchLabel.innerHTML = '<span class="sr-only">Find a place</span><span class="places-search-icon" aria-hidden="true"></span><input id="places-search" type="search" placeholder="Search the district" autocomplete="off">';
  const filters = document.createElement('div'); filters.className = 'places-filters'; filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', 'Show destinations');
  const results = document.createElement('p'); results.id = 'places-results'; results.setAttribute('role', 'status');
  const empty = document.createElement('div'); empty.id = 'places-no-results'; empty.hidden = true;
  empty.innerHTML = '<p>No places found. Try a different name.</p><button type="button">Show all places</button>';
  groups[0].querySelector('summary').after(searchLabel, filters, results, empty);
  const mapStage = dialog.querySelector('.places-map-stage');
  dialog.querySelector('footer').prepend(status);
  document.body.append(dialog);
  const search = dialog.querySelector('#places-search'), tabs = [...dialog.querySelectorAll('[role=tab]')];
  let returnFocus = trigger, category = '';
  const select = (index, focus = false) => {
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; groups[i].hidden = i !== index; });
    if (focus) tabs[index].focus();
    content.scrollTop = 0;
  };
  const open = (selector = '#places-search') => {
    if (!dialog.open) returnFocus = document.activeElement;
    if (map) { map.open = true; mapStage.append(map); }
    const target = dialog.querySelector(selector) ?? search;
    select(groups[1].contains(target) ? 1 : 0);
    if (!dialog.open) dialog.showModal();
    for (let parent = target.parentElement; parent && parent !== dialog; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' });
  };
  const close = () => dialog.close();
  dismissOnOutsideClick(dialog, close);
  dialog.addEventListener('close', () => {
    if (map) host.querySelector('#places-here').after(map);
    const target = returnFocus?.isConnected && returnFocus.checkVisibility() && !returnFocus.closest('[inert]') ? returnFocus : trigger;
    target.focus({ preventScroll: true });
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close(); }
  });
  dialog.addEventListener('places-open', event => open(event.detail?.selector));
  dialog.querySelector('.places-close').addEventListener('click', close);
  trigger.addEventListener('click', () => open());
  const expandMap = event => {
    if (dialog.open || event.isComposing || !event.target.closest('.world-map-surface')) return;
    if (event.type === 'keydown' && !['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (event.type === 'keydown') event.preventDefault();
    open('.world-map-surface');
  };
  map?.addEventListener('click', expandMap);
  map?.addEventListener('keydown', expandMap);
  tabs.forEach((tab, index) => {
    tab.setAttribute('aria-controls', groups[index].id);
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); select(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index, true);
    });
  });
  // One chip per category the world actually has, each with its live count.
  const renderFilters = rows => {
    const counts = new Map(FILTERS.map(([value]) => [value, value ? rows.filter(row => row.dataset.category === value).length : rows.length]));
    if (category && !counts.get(category)) category = '';
    filters.replaceChildren(...FILTERS.filter(([value]) => !value || counts.get(value)).map(([value, label]) => {
      const chip = document.createElement('button'); chip.type = 'button'; chip.dataset.category = value;
      chip.setAttribute('aria-pressed', String(category === value));
      chip.innerHTML = '<span></span><span class="places-filter-count"></span>';
      chip.firstChild.textContent = label; chip.lastChild.textContent = String(counts.get(value));
      return chip;
    }));
    filters.hidden = filters.children.length < 3;
  };
  filters.addEventListener('click', event => {
    const chip = event.target.closest('button[data-category]');
    if (!chip) return;
    // Re-rendering replaces the chips; keep focus on the one just chosen.
    category = chip.dataset.category; refresh(); filters.querySelector(`[data-category="${category}"]`)?.focus();
  });
  empty.querySelector('button').addEventListener('click', () => { search.value = ''; category = ''; refresh(); search.focus(); });
  const refresh = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const rows = [...dialog.querySelectorAll('#places-list li')];
    renderFilters(rows);
    rows.forEach(row => { row.hidden = (category && row.dataset.category !== category) || !row.querySelector('.place-name').textContent.toLocaleLowerCase().includes(query); });
    const count = rows.filter(row => !row.hidden).length, noun = n => `${n} ${n === 1 ? 'destination' : 'destinations'}`;
    results.textContent = count === rows.length ? noun(count) : `${count} of ${noun(rows.length)}`;
    empty.hidden = count > 0;
    search.placeholder = rows.length ? `Search ${rows.length} places` : 'Search the district';
    const saved = dialog.querySelectorAll('#landmarks-list li').length;
    tabs[0].querySelector('.places-tab-count').textContent = String(rows.length);
    tabs[1].querySelector('.places-tab-count').textContent = String(saved);
    launcherMeta.textContent = rows.length ? `${rows.length} places${saved ? ` · ${saved} saved` : ''} · search, save and go` : 'Search, save and go anywhere in the district';
  };
  search.addEventListener('input', refresh);
  select(0);
  return { refresh, dispose() { map?.removeEventListener('click', expandMap); map?.removeEventListener('keydown', expandMap); host.append(...groups, status); if (map) host.append(map); trigger.remove(); dialog.remove(); } };
}
