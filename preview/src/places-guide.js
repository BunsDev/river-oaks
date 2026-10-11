import './places-guide.css';

// A dedicated browsing surface; the shared town continues while it is open.
export function createPlacesGuide(host) {
  const groups = [...host.querySelectorAll('.places-group')];
  const status = host.querySelector('#places-status');
  const map = host.querySelector('.world-map');
  const trigger = document.createElement('button');
  trigger.id = 'places-open'; trigger.type = 'button'; trigger.className = 'places-launcher';
  trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', 'places-dialog');
  trigger.innerHTML = '<span><strong>Places & landmarks</strong><small>Find your next stop or save a favourite.</small></span><span aria-hidden="true">↗</span>';
  host.append(trigger);
  const dialog = document.createElement('dialog');
  dialog.id = 'places-dialog'; dialog.className = 'places-guide';
  dialog.setAttribute('aria-labelledby', 'places-guide-title');
  dialog.innerHTML = `<header><div><p class="places-eyebrow">Your district</p><h2 id="places-guide-title">Where to next?</h2></div><button type="button" class="places-close" aria-label="Close travel guide">Close <kbd>Esc</kbd></button></header>
    <div class="places-tabs" role="tablist" aria-label="Travel guide"><button type="button" id="places-tab-destinations" role="tab">Destinations</button><button type="button" id="places-tab-saved" role="tab">Saved places</button></div>
    <div class="places-guide-content"></div><footer><p class="places-live-note">The town stays live while you browse.</p></footer>`;
  const content = dialog.querySelector('.places-guide-content');
  groups.forEach((group, index) => {
    group.open = true; group.id = `places-pane-${index ? 'saved' : 'destinations'}`;
    group.setAttribute('role', 'tabpanel'); group.setAttribute('aria-labelledby', `places-tab-${index ? 'saved' : 'destinations'}`);
    content.append(group);
  });
  const searchLabel = document.createElement('label'); searchLabel.className = 'places-search-label';
  searchLabel.innerHTML = 'Find a place<input id="places-search" type="search" placeholder="Search the district" autocomplete="off">';
  const results = document.createElement('p'); results.id = 'places-results'; results.setAttribute('role', 'status');
  const empty = document.createElement('p'); empty.id = 'places-no-results'; empty.textContent = 'No places found. Try a different name.'; empty.hidden = true;
  groups[0].querySelector('summary').after(searchLabel, results, empty);
  if (map) groups[0].querySelector('summary').after(map);
  dialog.querySelector('footer').prepend(status);
  document.body.append(dialog);
  const search = dialog.querySelector('#places-search'), tabs = [...dialog.querySelectorAll('[role=tab]')];
  let returnFocus = trigger;
  const select = (index, focus = false) => {
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; groups[i].hidden = i !== index; });
    if (focus) tabs[index].focus();
    content.scrollTop = 0;
  };
  const open = (selector = '#places-search') => {
    const target = dialog.querySelector(selector) ?? search;
    select(groups[1].contains(target) ? 1 : 0);
    if (!dialog.open) { returnFocus = document.activeElement; dialog.showModal(); }
    for (let parent = target.parentElement; parent && parent !== dialog; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' });
  };
  const close = () => dialog.close();
  dialog.addEventListener('close', () => {
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
  tabs.forEach((tab, index) => {
    tab.setAttribute('aria-controls', groups[index].id);
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); select(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index, true);
    });
  });
  const refresh = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const rows = [...dialog.querySelectorAll('#places-list li')];
    rows.forEach(row => { row.hidden = !row.querySelector('.place-name').textContent.toLocaleLowerCase().includes(query); });
    const count = rows.filter(row => !row.hidden).length;
    results.textContent = `${count} ${count === 1 ? 'destination' : 'destinations'}`;
    empty.hidden = count > 0;
    tabs[1].textContent = `Saved places · ${dialog.querySelectorAll('#landmarks-list li').length}`;
  };
  search.addEventListener('input', refresh);
  select(0);
  return { refresh, dispose() { host.append(...groups, status); if (map) host.append(map); trigger.remove(); dialog.remove(); } };
}
