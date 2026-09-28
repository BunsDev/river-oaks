import { createJevSettings } from './jev-settings.js';

export function setupSidebar() {
  const panel = document.querySelector('#control-panel');
  const trigger = document.querySelector('#panel-toggle');
  const storageKey = 'river-oaks-panel-collapsed';
  let collapsed = true;
  try { collapsed = localStorage.getItem(storageKey) !== 'false'; } catch { /* Session controls work without storage. */ }

  const apply = () => {
    // Move focus before hiding the panel so keyboard users never get stranded inside inert content.
    if (collapsed && panel.contains(document.activeElement)) trigger.focus({ preventScroll: true });
    document.body.classList.toggle('panel-collapsed', collapsed);
    panel.inert = collapsed;
    panel.setAttribute('aria-hidden', String(collapsed));
    trigger.setAttribute('aria-expanded', String(!collapsed));
    trigger.setAttribute('aria-label', collapsed ? 'Explore River Oaks' : 'Close exploration panel');
    trigger.title = collapsed ? 'People, places & settings' : 'Close exploration panel';
    trigger.querySelector('.trigger-arrow').textContent = collapsed ? '›' : '‹';
    trigger.querySelector('.trigger-label').textContent = collapsed ? 'Explore' : 'Close';
  };
  trigger.addEventListener('click', (event) => {
    collapsed = !collapsed;
    try { localStorage.setItem(storageKey, String(collapsed)); } catch { /* Keep the choice for this page session. */ }
    apply();
    if (collapsed && event.detail > 0 && document.body.classList.contains('walking')) {
      document.querySelector('#canvas-host').focus({ preventScroll: true });
    }
  });
  panel.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||collapsed)return;
    event.preventDefault();event.stopPropagation();collapsed=true;
    try { localStorage.setItem(storageKey,'true'); } catch { /* Session controls remain available. */ }
    apply();
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    collapsed = event.newValue === 'true';
    apply();
  });
  apply();
}

// One task at a time. Secondary controls stay in labeled disclosures rather
// than competing with the nearby people and destination actions.
export function setupSidebarSections({ graphics = null } = {}) {
  const panel = document.querySelector('#control-panel');
  const people = panel.querySelector('#community-section');
  const places = panel.querySelector('#explore-section');
  const settings = panel.querySelector('#settings-section');
  const atmosphere = settings.nextElementSibling, about = atmosphere.nextElementSibling;
  const disclosure = (title, nodes, open = false) => {
    const details = document.createElement('details'); details.className = 'rail-disclosure'; details.open = open;
    const summary = document.createElement('summary'); summary.textContent = title;
    const content = document.createElement('div'); content.className = 'rail-disclosure-body';
    content.append(...nodes); details.append(summary, content); return details;
  };
  const layers = disclosure('Visible layers', [...settings.children].slice(1));
  settings.replaceChildren();
  const heading = document.createElement('h2'); heading.className = 'section-label'; heading.textContent = 'Make it yours';
  const atmosphereChildren = [...atmosphere.children].slice(1);
  const aboutDetails = disclosure('About this district', [...about.children].slice(1));
  const appearance = panel.querySelector('.appearance-control');
  const voice = ['#community-voice', '#community-voice-status', '#community-life', '#community-life-status'];
  const voiceLabel = panel.querySelector('label[for="community-voice"]');
  settings.append(heading, ...atmosphereChildren, appearance, ...(graphics ? [graphics] : []),
    createJevSettings(), createJevSettings('elevenlabs'), disclosure('Voices & resident walks', [voiceLabel, ...voice.map(id => panel.querySelector(id))]), layers, aboutDetails);
  atmosphere.remove(); about.remove();
  const more = panel.querySelector('#community-more');
  more.querySelector('summary').textContent = 'Help neighbors';
  more.classList.add('rail-disclosure');
  const chooser = panel.querySelector('#community-local'), meet = panel.querySelector('#community-meet');
  people.insertBefore(panel.querySelector('label[for="community-local"]'), more);
  people.insertBefore(chooser, more); people.insertBefore(meet, more);
  panel.querySelector('.identity .preview-label').textContent = 'Your neighborhood, at your pace.';
  const nav = panel.querySelector('.experience-nav'); nav.setAttribute('role','tablist'); nav.setAttribute('aria-label','District controls');
  const buttons = [...nav.querySelectorAll('[data-section]')];
  const sections = [people, places, settings], labels = ['People', 'Places', 'Settings'];
  const select = (index, focus = false) => {
    buttons.forEach((button,i) => {
      button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1;
      sections[i].hidden = i !== index;
    });
    panel.querySelector('.panel-scroll').scrollTop = 0;
    if (focus) buttons[index].focus({preventScroll:true});
  };
  buttons.forEach((button,index) => {
    button.textContent = labels[index]; button.id = `rail-tab-${index}`; button.setAttribute('role','tab');
    button.setAttribute('aria-controls',sections[index].id); button.dataset.tone = ['people','places','scene'][index];
    sections[index].setAttribute('role','tabpanel'); sections[index].setAttribute('aria-labelledby',button.id);
    sections[index].dataset.tone = button.dataset.tone;
    button.addEventListener('click',()=>select(index));
    button.addEventListener('keydown',event=>{
      const target = event.key === 'ArrowRight' ? (index+1)%3 : event.key === 'ArrowLeft' ? (index+2)%3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
      if (target !== null) {event.preventDefault();select(target,true);}
    });
  });
  select(0);
}
