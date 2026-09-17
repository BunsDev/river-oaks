export function setupSidebar() {
  const panel = document.querySelector('#control-panel');
  const trigger = document.querySelector('#panel-toggle');
  const storageKey = 'river-oaks-panel-collapsed';
  let collapsed = false;
  try { collapsed = localStorage.getItem(storageKey) === 'true'; } catch { /* Session controls work without storage. */ }

  const apply = () => {
    // Move focus before hiding the panel so keyboard users never get stranded inside inert content.
    if (collapsed && panel.contains(document.activeElement)) trigger.focus({ preventScroll: true });
    document.body.classList.toggle('panel-collapsed', collapsed);
    panel.inert = collapsed;
    panel.setAttribute('aria-hidden', String(collapsed));
    trigger.setAttribute('aria-expanded', String(!collapsed));
    trigger.setAttribute('aria-label', collapsed ? 'Show controls' : 'Hide controls');
    trigger.title = collapsed ? 'Show controls' : 'Hide controls';
    trigger.querySelector('.trigger-arrow').textContent = collapsed ? '›' : '‹';
  };
  trigger.addEventListener('click', (event) => {
    collapsed = !collapsed;
    try { localStorage.setItem(storageKey, String(collapsed)); } catch { /* Keep the choice for this page session. */ }
    apply();
    if (collapsed && event.detail > 0 && (document.body.classList.contains('flying') || document.body.classList.contains('walking'))) {
      document.querySelector('#canvas-host').focus({ preventScroll: true });
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    collapsed = event.newValue === 'true';
    apply();
  });
  apply();
}
