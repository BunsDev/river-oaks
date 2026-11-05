// CT Club world planner (temporary scratch tool, Val 2026-11-04).
// Mount "screens" on ANY surface (walls, columns, bar, DJ, speaker faces, table
// tops…) flush to its plane, facing its normal — every surface is a physical wall.
// Toggled with the "W" key / the 📺 button.
import { addScreen, removeScreen } from '../../preview/src/ct-club-plan.js';
import { surfaceReference, surfaceMount } from './coordinates.js';

let SCALE = 12;    // px per metre on a surface strip (capped so big walls stay small)
const pad = 14;

export function attachWorldPlanner({ room, onApply }) {
  const box = document.getElementById('world');
  const canvas = document.getElementById('world-canvas');
  const ctx = canvas.getContext('2d');
  let surfaceName = 'wall back';
  let selected = null;
  let dragging = null;

  const surfaces = () => surfaceReference(room);
  const current = () => surfaces().find(s => s.name === surfaceName) || surfaces()[0];
  const isTop = s => Math.abs(s.normal[1]) >= 0.5;
  const strip = s => { const [w, h, d] = s.size, [nx, ny, nz] = s.normal; if (isTop(s)) return { across: w, height: d }; return { across: Math.abs(nx) > 0.5 ? d : w, height: h }; };
  const setCanvas = () => {
    const { across, height } = strip(current());
    SCALE = Math.max(5, Math.min(12, (360 - pad * 2) / Math.max(across, 0.1), (260 - pad * 2) / Math.max(height, 0.1)));
    canvas.width = across * SCALE + pad * 2; canvas.height = height * SCALE + pad * 2;
  };
  const toPx = (u, v) => { const { across, height } = strip(current()); return [pad + u * across * SCALE, pad + (1 - v) * height * SCALE]; };
  const toUV = (x, y) => { const { across, height } = strip(current()); return [(x - pad) / SCALE / across, 1 - (y - pad) / SCALE / height]; };

  const draw = () => {
    const s = current(), top = isTop(s), { across, height } = strip(s);
    ctx.fillStyle = '#0a0b10'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1c1f26'; ctx.fillRect(pad, pad, across * SCALE, height * SCALE);
    ctx.strokeStyle = '#3a3d44'; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, across * SCALE, height * SCALE);
    ctx.fillStyle = '#70758a'; ctx.font = '10px ui-monospace';
    ctx.fillText(s.name + (top ? ' (top)' : ''), pad, pad - 4);
    for (const scr of room.screens) {
      if (scr.surface !== surfaceName) continue;
      const [x, y] = toPx(scr.u ?? 0.5, scr.v ?? 0.5);
      const isSel = selected === scr.id;
      ctx.fillStyle = isSel ? '#ff8b4d' : '#7ee0ff';
      ctx.globalAlpha = isSel ? 0.95 : 0.75;
      ctx.fillRect(x - (scr.w / 2) * SCALE, y - (scr.h / 2) * SCALE, scr.w * SCALE, scr.h * SCALE);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isSel ? '#ffffff' : '#0c0e13'; ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(x - (scr.w / 2) * SCALE, y - (scr.h / 2) * SCALE, scr.w * SCALE, scr.h * SCALE);
      ctx.fillStyle = '#0c0e13'; ctx.font = '8px ui-monospace';
      ctx.fillText(scr.id.replace('screen-', 'S'), x - (scr.w / 2) * SCALE + 2, y - (scr.h / 2) * SCALE + 10);
    }
  };

  const hit = (x, y) => {
    for (const scr of room.screens) {
      if (scr.surface !== surfaceName) continue;
      const [sx, sy] = toPx(scr.u ?? 0.5, scr.v ?? 0.5);
      if (x >= sx - (scr.w / 2) * SCALE && x <= sx + (scr.w / 2) * SCALE && y >= sy - (scr.h / 2) * SCALE && y <= sy + (scr.h / 2) * SCALE) return scr;
    }
    return null;
  };
  const snap = v => Math.max(0, Math.min(1, Math.round(v * 10) / 10));
  const remount = scr => { const m = surfaceMount(current(), scr.u ?? 0.5, scr.v ?? 0.5, 0.03); scr.x = m.x; scr.y = m.y; scr.z = m.z; scr.nx = m.nx; scr.ny = m.ny; scr.nz = m.nz; };

  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const [u, v] = toUV(e.clientX - rect.left, e.clientY - rect.top);
    const scr = hit(e.clientX - rect.left, e.clientY - rect.top);
    if (!scr) { selected = null; draw(); updateEditor(); return; }
    selected = scr.id;
    dragging = { scr, offU: u - scr.u, offV: v - scr.v };
    canvas.setPointerCapture(e.pointerId);
    draw(); updateEditor();
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const [u, v] = toUV(e.clientX - rect.left, e.clientY - rect.top);
    const scr = dragging.scr;
    scr.u = snap(u - dragging.offU); scr.v = snap(v - dragging.offV);
    remount(scr);
    draw();
  });
  canvas.addEventListener('pointerup', () => { if (dragging) { dragging = null; onApply?.(); } });

  const updateEditor = () => {
    const s = room.screens.find(x => x.id === selected);
    const html = document.getElementById('screen-html');
    if (html) html.value = s ? s.html : '';
    const btn = document.getElementById('screen-remove');
    if (btn) btn.disabled = !s;
  };

  const addViz = (kind, style) => {
    const m = surfaceMount(current(), 0.5, 0.5, 0.03);
    const s = addScreen(room, { x: m.x, y: m.y, z: m.z, nx: m.nx, ny: m.ny, nz: m.nz, w: 2.4, h: 1.35, viz: kind, vizStyle: style, html: style || kind, surface: surfaceName });
    s.u = 0.5; s.v = 0.5;
    selected = s.id; draw(); updateEditor(); onApply?.();
  };
  const vizStyle = () => document.getElementById('screen-viz-style')?.value || 'bars';

  const bind = () => {
    const select = document.getElementById('surface-select');
    if (select) {
      select.innerHTML = surfaces().map(s => `<option value="${s.name}">${s.name}</option>`).join('');
      select.value = surfaceName;
      select.addEventListener('change', () => { surfaceName = select.value; selected = null; setCanvas(); draw(); updateEditor(); });
    }
    document.getElementById('screen-add')?.addEventListener('click', () => {
      const m = surfaceMount(current(), 0.5, 0.5, 0.03);
      const s = addScreen(room, { x: m.x, y: m.y, z: m.z, nx: m.nx, ny: m.ny, nz: m.nz, w: 2.0, h: 1.1, html: '<div class="ct-screen"><b>CT CLUB</b></div>', surface: surfaceName });
      s.u = 0.5; s.v = 0.5;
      selected = s.id; draw(); updateEditor(); onApply?.();
    });
    document.getElementById('screen-eq')?.addEventListener('click', () => addViz('eq', vizStyle()));
    document.getElementById('screen-wave')?.addEventListener('click', () => addViz('wave', 'wave'));
    document.getElementById('screen-remove')?.addEventListener('click', () => {
      if (selected) { removeScreen(room, selected); selected = null; draw(); updateEditor(); onApply?.(); }
    });
    document.getElementById('screen-apply')?.addEventListener('click', () => {
      const s = room.screens.find(x => x.id === selected);
      if (s) { s.html = document.getElementById('screen-html').value; onApply?.(); }
    });
  };

  box.style.display = 'none';
  setCanvas(); draw(); bind();
  const toggle = () => { box.style.display = box.style.display === 'none' ? 'block' : 'none'; setCanvas(); draw(); };
  return { toggle, redraw: draw, setSurface: n => { surfaceName = n; setCanvas(); draw(); }, surfaces: () => surfaces() };
}
