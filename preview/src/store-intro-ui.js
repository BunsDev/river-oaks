import { createStoreIntroDirector } from './store-intro.js';
import './store-intro.css';

export function createStoreIntros({ camera, host, claim, onHalt, onResume }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'store-intro';
  dialog.setAttribute('aria-labelledby', 'store-intro-title');
  dialog.innerHTML = '<div class="store-intro-caption"><small>RIVER OAKS · FIRST VISIT</small><h2 id="store-intro-title"></h2><p>Welcome inside.</p></div><button type="button">Skip intro <kbd>Esc</kbd></button>';
  document.body.append(dialog);
  const button = dialog.querySelector('button');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const director = createStoreIntroDirector({ camera, claim, getReducedMotion: () => motion.matches,
    onStart(room, reduced) {
      onHalt();
      dialog.querySelector('h2').textContent = room.name;
      button.firstChild.textContent = reduced ? 'Continue ' : 'Skip intro ';
      document.body.classList.add('store-introducing');
      dialog.showModal(); button.focus({ preventScroll: true });
    },
    onEnd() {
      dialog.close(); document.body.classList.remove('store-introducing');
      onHalt(); onResume(); host.focus({ preventScroll: true });
    },
  });
  button.addEventListener('click', director.cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); director.cancel(); });
  // Closing a tab or changing motion preference cancels rather than replaying.
  const hidden = () => { if (document.hidden) director.cancel(); };
  document.addEventListener('visibilitychange', hidden);
  motion.addEventListener('change', director.cancel);
  return { ...director,
    get active() { return director.active; },
    observe(context) { director.observe({ ...context, canPlay: context.canPlay && !document.hidden && !document.querySelector('dialog[open]:not(.store-intro)') }); },
    dispose() { director.reset(); document.removeEventListener('visibilitychange', hidden); motion.removeEventListener('change', director.cancel); dialog.remove(); },
  };
}
