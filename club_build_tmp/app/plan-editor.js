// CT Club floorplanner (temporary scratch tool, Val 2026-11-04).
// A 2D top-down plan of the club. Drag an asset to move it; the room (3D + walking
// collision) rebuilds on drop. Toggled with the "P" key / the 📐 button.
import { moveFixture } from '../../preview/src/ct-club-plan.js';

const KINDS = {
  'bar-counter': { w: 1.5, l: 20, color: '#c98a3b' },
  'bar-stool': { w: 0.6, l: 0.6, color: '#b87333' },
  'chai-urn': { w: 0.4, l: 0.4, color: '#8a6a2e' },
  'lounge-couch': { w: 2.6, l: 2.2, color: '#9a6bff' },
  'lounge-chair': { w: 0.9, l: 0.9, color: '#b26bff' },
  'lounge-table': { w: 1.0, l: 1.4, color: '#c26bff' },
  'dj-booth': { w: 5.2, l: 1.4, color: '#41c8ff' },
  'speaker-bank': { w: 6.8, l: 4.6, color: '#b44dff' },
  'speaker-stack': { w: 4.2, l: 4.6, color: '#b44dff' },
  'entry-mat': { w: 1.7, l: 1.3, color: '#ffe142' },
  'disco-ball': { w: 1.1, l: 1.1, color: '#41e0ff' },
  'club-strobe': { w: 0.4, l: 0.4, color: '#ffffff' },
  'club-spot-rgb': { w: 0.3, l: 0.3, color: '#ff4d6f' },
};

export function attachPlanPlanner({ room, onApply }) {
  const box = document.getElementById('planner');
  const canvas = document.getElementById('plan-canvas');
  const ctx = canvas.getContext('2d');
  const SCALE = 20, PAD = 14;
  const W = 16 * SCALE + PAD * 2, H = 40 * SCALE + PAD * 2;
  canvas.width = W; canvas.height = H;
  const toPx = (a, d) => [PAD + (a + 8) * SCALE, PAD + d * SCALE];
  const toPlan = (x, y) => [(x - PAD) / SCALE - 8, (y - PAD) / SCALE];
  let dragging = null;   // { entity, size }

  const movable = () => {
    const seen = new Map();
    return room.fixtures.map(fix => {
      const index = seen.get(fix.kind) ?? 0;
      seen.set(fix.kind, index + 1);
      return { fix, index };
    }).filter(e => KINDS[e.fix.kind]);
  };
  const sizeOf = fix => ({ w: fix.w ?? KINDS[fix.kind].w, l: fix.l ?? KINDS[fix.kind].l });

  const draw = () => {
    ctx.fillStyle = '#0a0b10'; ctx.fillRect(0, 0, W, H);
    // room shell
    ctx.strokeStyle = '#3a3d44'; ctx.lineWidth = 2;
    ctx.strokeRect(...toPx(-8, 0), 16 * SCALE, 40 * SCALE);
    // dancefloor
    ctx.fillStyle = 'rgba(65,224,255,.08)';
    ctx.fillRect(...toPx(-6.5, 16), 13 * SCALE, 17 * SCALE);
    // obstacles (walk collision) faintly
    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
    for (const o of room.obstacles) ctx.strokeRect(...toPx(o.a0, o.d0), (o.a1 - o.a0) * SCALE, (o.d1 - o.d0) * SCALE);
    for (const e of movable()) {
      const s = sizeOf(e.fix), [x, y] = toPx(e.fix.a, e.fix.d);
      const isDrag = dragging && dragging.entity === e;
      ctx.fillStyle = KINDS[e.fix.kind].color;
      ctx.globalAlpha = isDrag ? 0.95 : 0.6;
      ctx.fillRect(x - (s.w * SCALE) / 2, y - (s.l * SCALE) / 2, s.w * SCALE, s.l * SCALE);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isDrag ? '#ffffff' : '#00000088'; ctx.lineWidth = isDrag ? 2 : 1;
      ctx.strokeRect(x - (s.w * SCALE) / 2, y - (s.l * SCALE) / 2, s.w * SCALE, s.l * SCALE);
      ctx.fillStyle = '#e8eaf0'; ctx.font = '9px ui-monospace';
      ctx.fillText(e.fix.kind.replace('club-', '').replace('bar-', ''), x - (s.w * SCALE) / 2 + 2, y - (s.l * SCALE) / 2 - 2);
    }
  };

  const hit = (x, y) => {
    const [pa, pd] = toPlan(x, y);
    for (const e of [...movable()].reverse()) {
      const s = sizeOf(e.fix);
      if (Math.abs(pa - e.fix.a) <= s.w / 2 + 0.15 && Math.abs(pd - e.fix.d) <= s.l / 2 + 0.15) return e;
    }
    return null;
  };
  const snap = v => Math.round(v * 2) / 2;

  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const entity = hit(e.clientX - rect.left, e.clientY - rect.top);
    if (!entity) return;
    dragging = { entity, size: sizeOf(entity.fix) };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const [a, d] = toPlan(e.clientX - rect.left, e.clientY - rect.top);
    dragging.entity.fix.a = Math.max(-8, Math.min(8, snap(a)));
    dragging.entity.fix.d = Math.max(0.5, Math.min(39.5, snap(d)));
    draw();
  });
  canvas.addEventListener('pointerup', () => {
    if (!dragging) return;
    const { entity } = dragging;
    moveFixture(room, entity.fix.kind, entity.index, entity.fix.a, entity.fix.d);
    dragging = null;
    draw();
    onApply?.();
  });

  box.style.display = 'none';
  const toggle = () => { box.style.display = box.style.display === 'none' ? 'block' : 'none'; draw(); };
  draw();
  return { toggle, redraw: draw, movable };
}