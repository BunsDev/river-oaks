// Rotates the sign-in art. Stills crossfade every few seconds; a clip plays once
// when its turn comes, then hands on. Later slides load just before they show.
// Reduced motion keeps the first still, and a pause control stops the rotation
// (WCAG 2.2.2). Nothing runs while the tab is hidden or the gate is closed.
export const ROTATION_MS = 8000;
// A clip that never reports `ended` (stalled network, decode error) still moves on.
export const CLIP_LIMIT_MS = 15000;

export const nextSlide = (index, count) => (index + 1) % count;

export function startArtRotation(scene, {
  interval = ROTATION_MS,
  clipLimit = CLIP_LIMIT_MS,
  doc = document,
  reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),
  isOpen = () => true,
} = {}) {
  const slides = [...scene.querySelectorAll('.access-slide')], button = scene.querySelector('.access-art-pause');
  if (slides.length < 2) return { stop() {}, sync() {} };
  let index = Math.max(0, slides.findIndex(slide => slide.hasAttribute('data-active')));
  let timer = 0, clipTimer = 0, paused = false, stopped = false;

  const isClip = slide => slide.tagName === 'VIDEO';
  const load = slide => {
    if (!slide?.dataset.src || slide.getAttribute('src')) return;
    if (isClip(slide)) slide.preload = 'auto';
    slide.setAttribute('src', slide.dataset.src);
  };
  const halt = () => {
    clearTimeout(timer); clearTimeout(clipTimer); timer = clipTimer = 0;
    const slide = slides[index];
    if (isClip(slide)) { slide.onended = null; slide.pause(); }
  };
  const moving = () => !stopped && !paused && !reducedMotion?.matches && !doc.hidden && isOpen();
  const advance = () => show(nextSlide(index, slides.length));

  function show(next) {
    halt();
    const previous = slides[index];
    index = next;
    const slide = slides[index];
    load(slide);
    slide.setAttribute('data-active', '');
    if (previous !== slide) previous.removeAttribute('data-active');
    // Only the visible still is announced; clips stay decorative.
    for (const item of slides) if (!isClip(item)) item.setAttribute('aria-hidden', String(item !== slide));
    schedule();
  }

  function schedule() {
    halt();
    if (!moving()) return;
    // Only a running rotation fetches ahead, so reduced motion never downloads the clip.
    load(slides[nextSlide(index, slides.length)]);
    const slide = slides[index];
    if (!isClip(slide)) { timer = setTimeout(advance, interval); return; }
    slide.onended = advance;
    clipTimer = setTimeout(advance, clipLimit);
    try { slide.currentTime = 0; } catch { /* metadata not loaded yet */ }
    // Autoplay can be refused; the poster then stands in for a still.
    Promise.resolve(slide.play()).catch(() => { slide.onended = null; clearTimeout(clipTimer); timer = setTimeout(advance, interval); });
  }

  const label = () => {
    if (!button) return;
    button.hidden = Boolean(reducedMotion?.matches);
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Play the background art' : 'Pause the background art');
  };
  const onToggle = () => { paused = !paused; label(); schedule(); };
  const onMotion = () => { label(); schedule(); };
  button?.addEventListener('click', onToggle);
  doc.addEventListener('visibilitychange', schedule);
  reducedMotion?.addEventListener?.('change', onMotion);

  label(); schedule();
  return {
    // Re-check after something outside changes (the gate closing or reopening).
    sync: schedule,
    stop() {
      stopped = true; halt();
      button?.removeEventListener('click', onToggle);
      doc.removeEventListener('visibilitychange', schedule);
      reducedMotion?.removeEventListener?.('change', onMotion);
    },
  };
}
