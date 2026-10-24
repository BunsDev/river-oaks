import { inBayouHeights } from '../../shared/bayou-heights-layout.js';

// Crossing the Lantern Footbridge names the place you arrive in, both ways. The
// Commons Lantern Walk names the District/Commons crossing (lantern-walk.js).
export function createHeightsArrival({ getLayout, getPose }) {
  let wasInside = null;
  function notice(text) {
    const element = document.querySelector('#walking-notice');
    if (!element) return;
    clearTimeout(element._timer); element.textContent = text; element.hidden = false;
    element._timer = setTimeout(() => { element.hidden = true; }, 4200);
  }
  return {
    update() {
      const layout = getLayout(), pose = getPose?.();
      if (!layout?.heights || !pose) { wasInside = null; return; }
      const inside = inBayouHeights(layout, pose.position[0]);
      if (inside === wasInside) return;
      if (inside) notice('Bayou Heights · Heights Green, the icehouse patio and Nineteenth & Yale');
      else if (wasInside) notice('Bayou Market Commons · Market Street and the Bayou Lantern');
      wasInside = inside;
    },
    debug: () => ({ inside: wasInside }),
  };
}
