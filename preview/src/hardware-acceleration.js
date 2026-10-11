// Browser settings are not exposed to websites. Only known software renderer
// names are evidence; masked/missing driver information says nothing either way.
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software (?:rasterizer|renderer)|microsoft basic render driver|\bwarp\b|gdi generic/i;

export function usesSoftwareRendering(gl) {
  if (!gl) return false;
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info && SOFTWARE_RENDERER.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '')) return true;
  } catch { /* Privacy restrictions may block the optional driver query. */ }
  try { return SOFTWARE_RENDERER.test(gl.getParameter(gl.RENDERER) ?? ''); }
  catch { return false; /* A lost context must not break startup. */ }
}

export function warnIfSoftwareRendering({ gl, viewport, focusTarget }) {
  if (!usesSoftwareRendering(gl)) return;
  const notice = document.createElement('aside');
  notice.className = 'hardware-acceleration-warning';
  notice.setAttribute('aria-label', 'Graphics performance warning');
  const message = document.createElement('div');
  message.setAttribute('role', 'status');
  const title = document.createElement('strong');
  title.textContent = 'Hardware acceleration is unavailable';
  const detail = document.createElement('p');
  detail.textContent = 'River Oaks is using software rendering, which can make the world slow or choppy. Enable hardware or graphics acceleration in your browser settings, then restart your browser. If it is already enabled, check your graphics driver or try another browser.';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss graphics performance warning');
  dismiss.addEventListener('click', () => {
    const hadFocus = notice.contains(document.activeElement);
    notice.remove();
    if (hadFocus) focusTarget?.focus({ preventScroll: true });
  });
  // Mount the empty live region before filling it; never steal focus on arrival.
  notice.append(message, dismiss);
  viewport.append(notice);
  message.append(title, detail);
}
