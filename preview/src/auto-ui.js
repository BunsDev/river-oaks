import { createAutoVisitor } from './auto-visitor.js';
import { createNavigationService } from './navigation-service.js';
import './auto.css';

export function createAutoControls({ walking, community, getWorld, getStorm }) {
  const panel = document.createElement('section');
  panel.className = 'auto-controls'; panel.setAttribute('aria-label', 'Autonomous visit');
  const button = document.createElement('button'); button.id = 'auto-toggle';
  button.textContent = 'Start Jev auto visit'; button.setAttribute('aria-pressed', 'false');
  const status = document.createElement('p'); status.id = 'auto-status'; status.setAttribute('role', 'status');
  status.textContent = 'Explore and help neighbors · you can take over anytime';
  panel.append(button, status); document.querySelector('#viewport').append(panel);
  let navigation, world;
  const controller = createAutoVisitor({
    getWorld, getState: () => community.state, getPosition: () => walking.getPosition(), getStorm,
    route: (from, to) => navigation?.route(from, to) ?? Promise.resolve(null),
    steer: (point, delta) => walking.steerTo(point, delta), halt: () => walking.haltAuto(),
    interact: (id, action) => community.autoInteract(id, action),
    onStatus(value) {
      button.textContent = value.enabled ? 'Stop auto visit' : 'Start Jev auto visit';
      button.setAttribute('aria-pressed', String(value.enabled));
      status.textContent = value.phase==='waiting'&&value.reason!=='model_wait'
        ? value.reason==='not_configured'?'Connect Jev in Settings to begin a guided visit.'
          :'Jev is taking a moment. You can explore freely or stop the visit.'
        : `${value.source === 'jev' ? 'Jev · ' : ''}${value.label}`;
      panel.dataset.active=String(value.enabled);
      panel.dataset.state = JSON.stringify(value);
    },
  });
  button.addEventListener('click', event => {
    if (controller.status.enabled) controller.stop();
    else {
      if (world !== getWorld()) { navigation?.dispose(); world = getWorld(); navigation = createNavigationService(world, { interiors: true, allowRoads: true }); }
      controller.start();
    }
    if(event.detail>0)document.querySelector('#canvas-host').focus({preventScroll:true});
  });
  const stop = () => { if (controller.status.enabled) controller.stop('You took over · auto off'); };
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  document.addEventListener('keydown', event => { if (event.code === 'Escape') stop(); }, true);
  // Reading the rail does not take over the visit. Actions that move the visitor
  // or reset the scenario cancel synchronously before their handlers run.
  document.addEventListener('click', event => {
    if (event.target.closest('#community-run, #community-reset, #visit-destination, #enter-destination, #store-previous, #store-next, #reload')) stop();
  }, true);
  document.addEventListener('change', event => { if (event.target.id === 'community-scenario') stop(); }, true);
  return {
    stop,
    update(delta) {
      if (world && world !== getWorld()) { stop(); navigation?.dispose(); navigation = null; world = null; }
      if (document.hidden || !walking.active || !document.querySelector('#community-dialogue')?.hidden) { stop(); return; }
      controller.update(delta);
    },
  };
}
