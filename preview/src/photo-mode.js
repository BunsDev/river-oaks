import { createPhotoCamera, photoCrop } from './photo-camera.js';
import { QUALITY_MODES } from './render-quality.js';
import './photo-mode.css';

const looks = { natural: 'none', warm: 'sepia(.18) saturate(1.15)', mono: 'grayscale(1) contrast(1.08)' };

export function createPhotoMode({ camera, canvas, host, canOpen = () => true, onOpen = () => {}, getQuality = () => null }) {
  const framing = createPhotoCamera(camera);
  const panel = document.createElement('section'); panel.className = 'photo-tools';
  panel.innerHTML = '<button type="button" class="photo-open">Photo mode <span aria-hidden="true">↗</span></button><p>Frame a moment. Make it yours.</p>';
  const trigger = panel.querySelector('button'); trigger.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog'); dialog.className = 'photo-mode'; dialog.setAttribute('aria-labelledby', 'photo-title');
  dialog.innerHTML = `<div class="photo-frame" aria-hidden="true"><div class="photo-grid"></div></div>
    <header class="photo-header"><div><small>RIVER OAKS · CAMERA</small><h2 id="photo-title">A moment worth keeping</h2></div><button type="button" class="photo-close" aria-label="Close photo mode">Close <kbd>Esc</kbd></button></header>
    <section class="photo-controls" id="photo-composition" aria-label="Photo composition">
      <div class="photo-options"><label>Format<select name="format"><option value="original">Original</option><option value="1">Square · 1:1</option><option value="0.8">Portrait · 4:5</option><option value="0.5625">Story · 9:16</option><option value="1.777777778">Cinema · 16:9</option></select></label>
      <label>Look<select name="look"><option value="natural">Natural</option><option value="warm">Warm film</option><option value="mono">Black & white</option></select></label>
      <label class="photo-grid-label"><input type="checkbox" name="grid" checked> Grid</label></div>
      <p class="photo-output"></p><p class="photo-quality"></p>
      <div class="photo-sliders">${[['yaw','Pan',-180,180,1,0],['pitch','Tilt',-70,70,1,0],['roll','Roll',-30,30,1,0],['dolly','Move lens',-4,4,.1,0],['fov','Field of view',20,90,1,42]].map(([name,label,min,max,step,value]) => `<label for="photo-${name}"><span>${label} <output for="photo-${name}"></output></span><input id="photo-${name}" name="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`).join('')}</div>
      <div class="photo-actions"><button type="button" class="photo-toggle" aria-expanded="true" aria-controls="photo-composition">Hide controls</button><button type="button" class="photo-view" hidden>View last photo</button><button type="button" class="photo-reset">Reset framing</button><button type="button" class="photo-capture">Take photo</button></div>
      <p class="photo-hint">Only the world is photographed. The town keeps moving.</p>
    </section>
    <section class="photo-result" hidden aria-label="Your photo"><img alt="Your composed River Oaks photograph"><div class="photo-actions"><button type="button" class="photo-retake">Back to camera</button><button type="button" class="photo-discard">Discard photo</button><a class="photo-download">Download PNG</a><button type="button" class="photo-share">Share photo</button></div></section>
    <p class="photo-status" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const get = selector => dialog.querySelector(selector);
  const controls = get('.photo-controls'), result = get('.photo-result'), frame = get('.photo-frame'), status = get('.photo-status');
  const capture = get('.photo-capture'), share = get('.photo-share'), download = get('.photo-download');
  let pending = false, busy = false, generation = 0, url = null, file = null, returnFocus = null, previousFilter = '', initialFov = camera.fov, captureTimer = null, photoSummary = '', metadataKey = '';
  const ratio = () => get('[name=format]').value === 'original' ? canvas.width / canvas.height : Number(get('[name=format]').value);
  const release = () => { get('.photo-view').hidden = true; photoSummary = ''; if (url) URL.revokeObjectURL(url); url = null; file = null; download.removeAttribute('href'); get('img').removeAttribute('src'); };
  const values = () => {
    for (const input of dialog.querySelectorAll('input[type=range]')) {
      const value = input.name === 'dolly' ? `${Number(input.value).toFixed(1)} m` : `${input.value}°`;
      get(`output[for=${input.id}]`).textContent = value;
      input.setAttribute('aria-valuetext', value);
    }
  };
  const metadata = () => {
    if (!dialog.open) return;
    const quality = getQuality();
    const key = [canvas.width, canvas.height, ratio(), quality?.mode, quality?.scale, quality?.occlusion].join(':');
    if (key === metadataKey) return;
    metadataKey = key;
    const crop = photoCrop(canvas.width, canvas.height, ratio());
    get('.photo-output').textContent = `Next photo: ${crop.outputWidth} × ${crop.outputHeight} px · PNG (max 2048 px)`;
    get('.photo-quality').textContent = quality ? `${QUALITY_MODES[quality.mode]?.label ?? 'Current'} graphics · Scene resolution ${Math.round(quality.scale * 100)}% · Ambient occlusion ${quality.occlusion ? 'on' : 'off'}. For full detail: Settings → Graphics → Sharpest.` : 'Photos use current graphics quality. Settings → Graphics → Sharpest gives full scene detail.';
  };
  const showPhoto = () => {
    generation++; clearTimeout(captureTimer); pending = false; busy = false; capture.disabled = false; share.disabled = false;
    controls.hidden = true; frame.hidden = true; result.hidden = false;
    status.textContent = photoSummary; download.focus();
  };
  const compose = () => {
    generation++; clearTimeout(captureTimer); pending = false; busy = false; capture.disabled = false; share.disabled = false;
    result.hidden = true; controls.hidden = false; frame.hidden = false;
    status.textContent = file ? 'Your last photo is kept until you discard it or successfully take another.' : '';
    capture.focus();
  };
  const layout = () => {
    if (!dialog.open) return;
    metadata();
    const bounds = host.getBoundingClientRect(), crop = photoCrop(bounds.width, bounds.height, ratio());
    Object.assign(frame.style, { left: `${bounds.left + crop.x}px`, top: `${bounds.top + crop.y}px`, width: `${crop.width}px`, height: `${crop.height}px` });
  };
  const reset = () => {
    framing.reset();
    for (const name of ['yaw','pitch','roll','dolly']) get(`[name=${name}]`).value = 0;
    get('[name=fov]').value = initialFov; values();
  };
  const open = () => {
    if (dialog.open || !canOpen() || document.querySelector('dialog[open]')) return;
    returnFocus = document.activeElement; previousFilter = canvas.style.filter;
    onOpen(); initialFov = camera.fov; framing.open(); reset();
    controls.hidden = false; result.hidden = true; frame.hidden = false; status.textContent = '';
    document.body.classList.add('photographing'); dialog.showModal();
    canvas.style.filter = looks[get('[name=look]').value]; layout();
    if (file) showPhoto(); else capture.focus();
  };
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => {
    generation++; clearTimeout(captureTimer); pending = false; busy = false; capture.disabled = false; share.disabled = false; framing.close();
    canvas.style.filter = previousFilter; document.body.classList.remove('photographing');
    (returnFocus?.isConnected && returnFocus.checkVisibility() ? returnFocus : host).focus({ preventScroll: true });
  });
  trigger.addEventListener('click', open);
  get('.photo-close').addEventListener('click', close);
  get('.photo-reset').addEventListener('click', reset);
  get('.photo-toggle').addEventListener('click', event => {
    const compact = controls.classList.toggle('compact');
    event.currentTarget.textContent = compact ? 'Show controls' : 'Hide controls';
    event.currentTarget.setAttribute('aria-expanded', String(!compact));
  });
  for (const input of dialog.querySelectorAll('input[type=range]')) input.addEventListener('input', () => { framing.set({ [input.name]: Number(input.value) }); values(); });
  get('[name=format]').addEventListener('change', layout);
  get('[name=look]').addEventListener('change', event => { canvas.style.filter = looks[event.target.value]; });
  get('[name=grid]').addEventListener('change', event => { get('.photo-grid').hidden = !event.target.checked; });
  capture.addEventListener('click', () => {
    if (busy) return;
    busy = true; pending = true; capture.disabled = true; status.textContent = 'Taking your photo…';
    const token = ++generation;
    captureTimer = setTimeout(() => {
      if (token !== generation) return;
      generation++; pending = false; busy = false; capture.disabled = false;
      status.textContent = 'The frame was not ready. Try again when the scene is visible.';
    }, 10000);
  });
  get('.photo-retake').addEventListener('click', compose);
  get('.photo-view').addEventListener('click', showPhoto);
  get('.photo-discard').addEventListener('click', () => { release(); compose(); });
  share.addEventListener('click', async () => {
    if (!file) return;
    const token = generation; share.disabled = true;
    try { await navigator.share({ files: [file], title: 'A moment in River Oaks' }); if (token === generation) status.textContent = 'Photo shared.'; }
    catch (error) { if (token === generation) status.textContent = error.name === 'AbortError' ? 'Sharing cancelled. Your photo is still here.' : 'Sharing is unavailable. Download the photo to share it.'; }
    finally { if (token === generation) share.disabled = false; }
  });
  const observer = new ResizeObserver(layout); observer.observe(host);
  window.addEventListener('resize', layout);
  return {
    panel, open, get active() { return dialog.open; },
    update() { trigger.disabled = !canOpen(); if (dialog.open && !canOpen()) close(); framing.update(); metadata(); },
    // Called immediately after the composer's final draw: no preserveDrawingBuffer
    // overhead, no blank next-frame readback, and no DOM/chat/HUD in the PNG.
    afterRender() {
      if (!pending || !dialog.open) return;
      pending = false; const token = generation;
      const fail = () => { if (token !== generation) return; clearTimeout(captureTimer); busy = false; capture.disabled = false; status.textContent = 'Could not take this photo. Try again after the scene loads.'; };
      try {
        const crop = photoCrop(canvas.width, canvas.height, ratio());
        const output = document.createElement('canvas'); output.width = crop.outputWidth; output.height = crop.outputHeight;
        const context = output.getContext('2d'); context.filter = looks[get('[name=look]').value];
        context.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height);
        context.filter = 'none';
        const font = Math.max(8, Math.round(output.width / 100)), padding = font * .6;
        const credit = 'River Oaks · © OpenStreetMap contributors';
        context.font = `${font}px sans-serif`;
        const creditWidth = context.measureText(credit).width;
        context.fillStyle = '#0009'; context.fillRect(output.width - creditWidth - padding * 3, output.height - font - padding * 3, creditWidth + padding * 2, font + padding * 2);
        context.fillStyle = '#fff'; context.fillText(credit, output.width - creditWidth - padding * 2, output.height - padding * 2);
        output.toBlob(blob => {
          if (token !== generation || !dialog.open) return;
          clearTimeout(captureTimer);
          if (!blob) { fail(); return; }
          const nextFile = new File([blob], `river-oaks-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, { type: 'image/png' });
          const nextUrl = URL.createObjectURL(nextFile);
          release(); file = nextFile; url = nextUrl; get('.photo-view').hidden = false; get('img').src = url; download.href = url; download.download = file.name;
          try { share.hidden = !navigator.canShare?.({ files: [file] }); } catch { share.hidden = true; }
          share.disabled = false;
          controls.hidden = true; frame.hidden = true; result.hidden = false; busy = false; capture.disabled = false;
          photoSummary = `${output.width} × ${output.height} · PNG${share.hidden ? ' · Download to share anywhere.' : ''}`;
          showPhoto();
        }, 'image/png');
      } catch { fail(); }
    },
  };
}
