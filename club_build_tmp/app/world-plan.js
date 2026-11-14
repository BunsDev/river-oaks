// CT Club world planner (temporary scratch tool, Val 2026-11-04).
// Places "screens" on the four walls (like the floor planner but for walls) and
// edits the HTML/CSS/JS each screen displays. Toggled with the "W" key / 📺 button.
import { SCREEN_WALLS, addScreen, moveScreen, removeScreen } from '../../preview/src/ct-club-plan.js';

const SCALE = 14;    // px per metre on a wall strip
const pad = 14;

export function attachWorldPlanner({ room, onApply }) {
  const box = document.getElementById('world');
  const canvas = document.getElementById('world-canvas');
  const ctx = canvas.getContext('2d');
  let wall = 'back';
  let selected = null;
  let dragging = null;

  const span = () => SCREEN_WALLS[wall].span;
  const setCanvas = () => { canvas.width = (span()[1] - span()[0]) * SCALE + pad * 2; canvas.height = 6 * SCALE + pad * 2; };
  const toPx = (u, y) => [pad + (u - span()[0]) * SCALE, pad + (6 - y) * SCALE];
  const toUY = (x, y) => [span()[0] + (x - pad) / SCALE, 6 - (y - pad) / SCALE];

  const draw = () => {
    ctx.fillStyle = '#0a0b10'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // wall face
    ctx.fillStyle = '#1c1f26'; ctx.fillRect(pad, pad, (span()[1] - span()[0]) * SCALE, 6 * SCALE);
    ctx.strokeStyle = '#3a3d44'; ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, (span()[1] - span()[0]) * SCALE, 6 * SCALE);
    // door gap on the front wall
    if (wall === 'front') {
      ctx.fillStyle = '#0a0b10';
      ctx.fillRect(...toPx(-1.15, 6), 2.3 * SCALE, 6 * SCALE);
      ctx.strokeStyle = '#c92a4f'; ctx.strokeRect(...toPx(-1.15, 6), 2.3 * SCALE, 6 * SCALE);
    }
    for (const s of room.screens) {
      if (s.wall !== wall) continue;
      const [x, y] = toPx(s.u - s.w / 2, s.y + s.h / 2);
      const isSel = selected === s.id;
      ctx.fillStyle = isSel ? '#ff8b4d' : '#7ee0ff';
      ctx.globalAlpha = isSel ? 0.95 : 0.75;
      ctx.fillRect(x, y, s.w * SCALE, s.h * SCALE);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isSel ? '#ffffff' : '#0c0e13'; ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(x, y, s.w * SCALE, s.h * SCALE);
      ctx.fillStyle = '#0c0e13'; ctx.font = '8px ui-monospace';
      ctx.fillText(s.id.replace('screen-', 'S'), x + 2, y + 10);
    }
  };

  const hit = (x, y) => {
    for (const s of room.screens) {
      if (s.wall !== wall) continue;
      const [sx, sy] = toPx(s.u - s.w / 2, s.y + s.h / 2);
      if (x >= sx && x <= sx + s.w * SCALE && y >= sy && y <= sy + s.h * SCALE) return s;
    }
    return null;
  };
  const snap = v => Math.round(v * 2) / 2;

  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const [u, y] = toUY(e.clientX - rect.left, e.clientY - rect.top);
    const s = hit(e.clientX - rect.left, e.clientY - rect.top);
    if (!s) { selected = null; draw(); updateEditor(); return; }
    selected = s.id;
    dragging = { s, offU: u - s.u, offY: y - s.y };
    canvas.setPointerCapture(e.pointerId);
    draw(); updateEditor();
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const [u, y] = toUY(e.clientX - rect.left, e.clientY - rect.top);
    moveScreen(room, dragging.s.id, snap(u - dragging.offU), snap(y - dragging.offY));
    draw();
  });
  canvas.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = null;
    onApply?.();
  });

  const updateEditor = () => {
    const s = room.screens.find(x => x.id === selected);
    const html = document.getElementById('screen-html');
    if (html) html.value = s ? s.html : '';
    const btn = document.getElementById('screen-remove');
    if (btn) btn.disabled = !s;
  };

  const bind = () => {
    for (const btn of document.querySelectorAll('.world-tab')) btn.addEventListener('click', () => { wall = btn.dataset.wall; selected = null; setCanvas(); draw(); updateEditor(); });
    document.getElementById('screen-add')?.addEventListener('click', () => {
      const s = addScreen(room, { wall, u: 0, y: 2.4, w: 2.4, h: 1.35, html: '<div class="ct-screen"><b>CT CLUB</b></div>' });
      selected = s.id; draw(); updateEditor(); onApply?.();
    });
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
  return { toggle, redraw: draw, setWall: w => { wall = w; setCanvas(); draw(); }, screens: () => room.screens };
}