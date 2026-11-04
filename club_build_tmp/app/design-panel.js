// CT Club design panel (temporary scratch tool, Val 2026-11-04).
// Press `i` in the walk-around build: live inventory with real colour swatches,
// real-time editing, up to 8 colours cycling over a per-item period t, smart
// per-section randomize (sections/rows can be frozen), a color-coding matrix for
// the dancefloor, and numbered design files (light_design_01.json …) saved only
// on demand — autosave of .json files is OFF by default.
import * as THREE from 'three';

const LS_STATE = 'ct-club-design.v2';
const LS_NEXT = 'ct-club-design.next';
const MAX_COLORS = 8;

// Materials the animation tick owns outright. Lasers flash; their color/opacity
// stays tick-driven. (Strobe lenses and RGB spots ARE editable now; the tick
// skips a spot when the user has taken control.)
const TICK_OWNED = new Set(['club-laser', 'club-ball-haze', 'club-chai-steam']);

const FRIENDLY = {
  'club-concrete': 'Floor slab',
  'club-concrete-pillar': 'Pillars (columns ×8)',
  'club-concrete-ceil': 'Ceiling',
  'club-concrete-back': 'Back wall', 'club-concrete-left': 'Left wall (violet-blue)',
  'club-concrete-right': 'Right wall (green-teal)', 'club-concrete-front': 'Front wall + lintel',
  'club-door-glow': 'Door glow', 'club-brass': 'Brass (jambs, rings)', 'club-black': 'Dark surfaces (tiles, mat, mixer)',
  'club-modern-edge-glow': 'Edge glow (mat border)', 'club-steel': 'Steel (columns, legs)',
  'club-tile-edge': 'Dancefloor edge rings', 'club-bar-timber': 'Bar timber (counter, tables, booth)',
  'club-bar-edge-glow': 'Bar edge glow', 'club-bar-back-glow': 'Bar back glow',
  'club-shelf-glass': 'Shelf glass', 'club-bottle-glass': 'Bottle glass',
  'club-copper': 'Chai copper urn', 'club-stool-leather': 'Stool leather',
  'club-seat-edge-glow': 'Seat edge glow', 'club-seat-spill': 'Seat light-spill pads',
  'club-upholstery': 'Upholstery (couches, chairs)', 'club-dj-glow': 'DJ desk glow',
  'club-mixer-glow': 'Mixer channel LEDs', 'club-speaker-grille': 'Speaker grille',
  'club-speaker-cone': 'Speaker cones', 'club-bass-port-glow': 'Bass port glow',
  'club-ball-ring': 'Disco ball ring', 'club-mirror': 'Disco ball mirror',
  'club-outline-yellow': 'Outline yellow (bar, entry, floor grid)',
  'club-outline-green': 'Outline green (stage, speakers)',
  'club-outline-purple': 'Outline purple (lounge seating)',
  'club-strobe-lens': 'Strobe lenses (×4, rare flashes)',
  'club-spot-rgb': 'RGB corner spots (×4)',
  'club-spot-marker': 'Spotlight ceiling markers',
};
// Separate colour sections: FLOOR and PILLARS no longer share a material.
const GROUPS = [
  ['FLOOR', ['club-concrete']],
  ['PILLARS', ['club-concrete-pillar']],
  ['WALLS & SHELL', ['club-concrete-ceil', 'club-concrete-back', 'club-concrete-left', 'club-concrete-right', 'club-concrete-front', 'club-door-glow', 'club-brass', 'club-black', 'club-steel', 'club-modern-edge-glow']],
  ['BAR', ['club-bar-timber', 'club-bar-edge-glow', 'club-bar-back-glow', 'club-shelf-glass', 'club-bottle-glass', 'club-copper', 'club-stool-leather']],
  ['LOUNGE', ['club-seat-edge-glow', 'club-seat-spill', 'club-upholstery']],
  ['DANCEFLOOR', ['tiles', 'club-tile-edge', 'club-ball-ring', 'club-mirror']],
  ['STAGE & SPEAKERS', ['club-dj-glow', 'club-mixer-glow', 'club-speaker-grille', 'club-speaker-cone', 'club-bass-port-glow']],
  ['EFFECTS', ['club-strobe-lens', 'club-spot-rgb', 'club-spot-marker']],
  ['OUTLINES', ['club-outline-yellow', 'club-outline-green', 'club-outline-purple']],
];
const GROUP_OF = {};
for (const [name, ids] of GROUPS) for (const id of ids) GROUP_OF[id] = name;

// Smart per-section palettes: randomize picks from the section's own family and
// keeps the item's current colour count (so a cycling item stays cycling).
const PALETTES = {
  FLOOR: ['#41454b', '#51565d', '#33373c', '#5a6068'],
  PILLARS: ['#3c4046', '#4a4e56', '#60666f', '#2f3339'],
  'WALLS & SHELL': ['#5c4a41', '#484a67', '#465950', '#5a523b', '#6a5a4a', '#3f4450'],
  BAR: ['#ff8b4d', '#ff9b58', '#c98a3b', '#b87333', '#8a6a2e', '#3f7a4d'],
  LOUNGE: ['#7a4dff', '#a06bff', '#b26bff', '#c26bff', '#d06bff'],
  DANCEFLOOR: ['#41e0ff', '#3dff85', '#ffe142', '#ff2d6f', '#b26bff', '#ffffff'],
  'STAGE & SPEAKERS': ['#41c8ff', '#7020c9', '#b44dff', '#3dff85', '#ff6bd4'],
  EFFECTS: ['#ff4d6f', '#ffd8a8', '#41c8ff', '#41e0ff'],
  OUTLINES: ['#ffe142', '#3dff85', '#b26bff', '#ff6bd4', '#41e0ff'],
  LIGHTS: ['#ffe3bd', '#ffb26b', '#9a6bff', '#6bd4ff', '#e8e8f2', '#ff6bd4', '#41c8ff', '#b44dff'],
  SPOTLIGHTS: ['#ffd9a8', '#ffe3bd', '#e8e8f2', '#6bd4ff', '#fff3c2'],
};

const hexOf = (n, field) => '#' + (field === 'emissive' ? n.emissive : n.color).getHexString();
const setField = (n, field, hex) => (n[field] ?? n.color).set(hex);
const pick = list => list[Math.floor(Math.random() * list.length)];

export function attachDesignPanel({ root }) {
  const seen = new Map();
  const materials = [];
  root.traverse(n => {
    const list = [].concat(n.material ?? []);
    for (const mat of list) if (!seen.has(mat.name)) { seen.set(mat.name, mat); materials.push(mat); }
  });
  const lights = root.userData?.lights?.list ?? [];
  const spotlights = root.userData?.spotlights?.list ?? [];
  const outlines = root.children.filter(c => c.isLineSegments && /^club-outlines:/.test(c.name)).map(c => ({ name: c.name, mat: c.material }));
  const tiles = root.userData?.tiles ?? null;

  const items = [];
  const newItem = (id, label, group, kind, ref, field, color) => {
    const item = {
      id, label, group, kind, ref, field, locked: false,
      colors: Array(MAX_COLORS).fill(null), cycle: false, cycleSeconds: 8, colorIndex: 0,
    };
    item.colors[0] = color;
    items.push(item);
    return item;
  };
  for (const mat of materials) {
    if (TICK_OWNED.has(mat.name)) continue;
    if (!GROUP_OF[mat.name]) continue;               // unknown materials stay off-screen
    const field = mat.isMeshStandardMaterial && mat.emissive && mat.emissive.getHex() !== 0 ? 'emissive' : 'color';
    newItem(mat.name, FRIENDLY[mat.name] ?? mat.name, GROUP_OF[mat.name], 'material', mat, field, hexOf(mat, field));
  }
  for (const light of lights) {
    newItem(light.name, `Ambient: ${light.userData.zone}`, 'LIGHTS', 'light', light, 'color', '#' + light.color.getHexString());
  }
  for (const spot of spotlights) {
    const item = newItem(spot.name, `Spot: ${spot.userData.index + 1} (${spot.name.replace('light.spot.', '')})`, 'SPOTLIGHTS', 'spotlight', spot, 'color', '#' + spot.color.getHexString());
    item.intensity = spot.intensity;
  }
  for (const line of outlines) {
    const key = line.name.replace('club-outlines:', 'club-outline-');
    newItem(line.name, FRIENDLY[key] ?? line.name, 'OUTLINES', 'outline', line.mat, 'color', '#' + line.mat.color.getHexString());
  }
  const tilesItem = tiles ? newItem('tiles', 'Dancefloor tiles (13×17 matrix)', 'DANCEFLOOR', 'tiles', tiles, 'color', null) : null;
  if (tilesItem) tilesItem.colors[0] = tiles.matrix[6][8] ?? '#41e0ff';
  const byId = new Map(items.map(it => [it.id, it]));

  const sectionFrozen = new Map();
  const tileLocks = tiles ? Array.from({ length: tiles.rows }, () => Array(tiles.cols).fill(false)) : null;

  const apply = item => {
    const hex = item.colors[item.colors.findIndex(c => c != null)] ?? '#000000';
    if (item.kind === 'material' || item.kind === 'outline') setField(item.ref, item.field, hex);
    else if (item.kind === 'light' || item.kind === 'spotlight') {
      item.ref.color.set(hex);
      if (typeof item.intensity === 'number' && Number.isFinite(item.intensity)) item.ref.intensity = item.intensity;
    } else if (item.kind === 'tiles' && tiles) tiles.setAll(hex);
  };
  const applyTilesFromMatrix = () => { if (!tiles) return; for (let r = 0; r < tiles.rows; r++) for (let c = 0; c < tiles.cols; c++) tiles.set(r, c, tiles.matrix[r][c]); };
  const serialise = () => ({
    schemaVersion: 2, room: 'ct-club', generatedAt: new Date().toISOString(),
    autoExport: localStorage.getItem('ct-club-design.auto') === 'on',
    sections: [...sectionFrozen].map(([id, frozen]) => ({ id, frozen })),
    colorLock: [...colorLock].map(([id, on]) => ({ id, on })),
    intensityLocked,
    tiles: tiles ? { matrix: tiles.matrix.map(r => [...r]), locks: tileLocks ? tileLocks.map(r => [...r]) : null } : null,
    items: items.map(it => ({
      id: it.id, label: it.label,
      colors: it.colors.filter(Boolean),
      cycle: it.cycle, cycleSeconds: it.cycleSeconds, locked: it.locked,
      ...(it.kind === 'light' || it.kind === 'spotlight' ? { intensity: it.ref.intensity } : {}),
    })),
  });
  let loadTimer = -1;
  const saveNow = () => { try { localStorage.setItem(LS_STATE, JSON.stringify(serialise())); } catch { } };
  const scheduleSave = () => { clearTimeout(loadTimer); loadTimer = setTimeout(saveNow, 350); };
  const applyAll = () => { for (const it of items) apply(it); };
  const changed = () => { applyAll(); scheduleSave(); };

  let restored = null;
  try { restored = JSON.parse(localStorage.getItem(LS_STATE) ?? 'null'); } catch { restored = null; }
  if (restored?.items) {
    for (const saved of restored.items) {
      const it = byId.get(saved.id);
      if (!it) continue;
      it.colors.fill(null);
      if (Array.isArray(saved.colors)) for (let i = 0; i < Math.min(MAX_COLORS, saved.colors.length); i++) it.colors[i] = saved.colors[i];
      it.cycle = Boolean(saved.cycle);
      if (saved.cycleSeconds != null) it.cycleSeconds = saved.cycleSeconds;
      it.locked = Boolean(saved.locked);
      if (saved.intensity != null && (it.kind === 'light' || it.kind === 'spotlight')) { it.intensity = saved.intensity; it.ref.intensity = saved.intensity; }
      if (it.kind === 'tiles' && tiles && Array.isArray(saved.colors)) tiles.setAll(saved.colors[0] ?? '#41e0ff');
    }
    if (Array.isArray(restored.sections)) for (const s of restored.sections) sectionFrozen.set(s.id, Boolean(s.frozen));
    if (Array.isArray(restored.colorLock)) for (const c of restored.colorLock) colorLock.set(c.id, Boolean(c.on));
    if (typeof restored.intensityLocked === 'boolean') intensityLocked = restored.intensityLocked;
    if (restored.tiles?.matrix && tiles) {
      for (let r = 0; r < tiles.rows; r++) for (let c = 0; c < tiles.cols; c++) {
        if (restored.tiles.matrix[r]?.[c]) tiles.matrix[r][c] = restored.tiles.matrix[r][c];
      }
      applyTilesFromMatrix();
    }
    if (restored.tiles?.locks && tileLocks) for (let r = 0; r < tiles.rows; r++) for (let c = 0; c < tiles.cols; c++) tileLocks[r][c] = Boolean(restored.tiles.locks[r]?.[c]);
  }
  if (restored) applyAll();

  // colour cycling: lerp c0→c1→…→c{n-1}→c0 over cycleSeconds; tiles shift as a floor.
  const lerp = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  const cycle = nowSeconds => {
    for (const it of items) {
      const hexes = it.colors.filter(Boolean);
      if (!it.cycle || hexes.length < 2 || !(it.cycleSeconds > 0)) continue;
      const t = (nowSeconds % it.cycleSeconds) / it.cycleSeconds;
      const pos = t * hexes.length;
      const i0 = Math.floor(pos) % hexes.length, i1 = (i0 + 1) % hexes.length;
      const color = lerp(hexes[i0], hexes[i1], pos % 1);
      if (it.kind === 'material' || it.kind === 'outline') setField(it.ref, it.field, '#' + color.getHexString());
      else if (it.kind === 'light' || it.kind === 'spotlight') it.ref.color.copy(color);
      else if (it.kind === 'tiles' && tiles) tiles.setAll('#' + color.getHexString());
    }
  };

  // smart per-section randomize: skips frozen sections and locked rows; picks from
  // the section's palette; keeps each set item's colour count (cycling stays cycling).
  const randomizeItem = it => {
    if (it.locked || sectionFrozen.get(it.group)) return;
    if (it.kind === 'tiles' && tiles && tileLocks) {
      for (let r = 0; r < tiles.rows; r++) for (let c = 0; c < tiles.cols; c++) {
        if (!tileLocks[r][c]) tiles.set(r, c, pick(PALETTES.DANCEFLOOR));
        else tiles.matrix[r][c] = tiles.getHex ? tiles.getHex(r, c) : tiles.matrix[r][c];
      }
      return;
    }
    const palette = PALETTES[it.group] ?? PALETTES.LIGHTS;
    const count = it.cycle ? Math.max(2, it.colors.filter(Boolean).length) : 1;
    it.colors.fill(null);
    for (let i = 0; i < Math.min(count, 8); i++) it.colors[i] = pick(palette);
  };
  const randomizeSection = name => { for (const it of items) if (it.group === name) randomizeItem(it); applyAll(); changed(); };
  const randomizeAll = () => { for (const it of items) randomizeItem(it); applyAll(); changed(); };

  // ---- v3 tools: cycling, colour counts, locks, intensity -----------------------
  const colorLock = new Map();        // section -> its colours are frozen from randomize
  let intensityLocked = false;        // light intensities are frozen from randomize/±
  const randomizable = it => !it.locked && !sectionFrozen.get(it.group);
  const colorRandomizable = it => randomizable(it) && !colorLock.get(it.group);

  const cycleAll = on => { for (const it of items) if (it.kind !== 'tiles') it.cycle = Boolean(on); applyAll(); changed(); };
  const randomizeColorCount = () => {
    for (const it of items) {
      if (!colorRandomizable(it) || !it.cycle) continue;
      const count = 2 + Math.floor(Math.random() * 7);            // 2..8 colours
      const palette = PALETTES[it.group] ?? PALETTES.LIGHTS;
      it.colors.fill(null);
      for (let i = 0; i < count; i++) it.colors[i] = pick(palette);
    }
    applyAll(); changed();
  };
  const setColorCount = n => {
    const count = Math.max(1, Math.min(8, Math.round(Number(n) || 8)));
    for (const it of items) {
      if (!colorRandomizable(it)) continue;
      const palette = PALETTES[it.group] ?? PALETTES.LIGHTS;
      const next = it.colors.filter(Boolean);
      while (next.length < count) next.push(pick(palette));
      next.length = count;
      it.colors.fill(null);
      next.forEach((c, i) => { it.colors[i] = c; });
      it.cycle = count > 1;
    }
    applyAll(); changed();
  };
  const randomizeCycleColors = () => {
    for (const it of items) {
      if (!colorRandomizable(it)) continue;
      const hexes = it.colors.filter(Boolean);
      if (it.cycle && hexes.length > 1) {
        const palette = PALETTES[it.group] ?? PALETTES.LIGHTS;
        hexes.forEach((_, i) => { it.colors[i] = pick(palette); });
      }
    }
    applyAll(); changed();
  };
  const randomizeLocks = () => {
    for (const it of items) it.locked = Math.random() < 0.3;
    sectionFrozen.clear();
    for (const name of new Set(items.map(it => it.group))) if (Math.random() < 0.25) sectionFrozen.set(name, true);
    colorLock.clear();
    for (const name of new Set(items.map(it => it.group))) if (Math.random() < 0.2) colorLock.set(name, true);
    intensityLocked = Math.random() < 0.3;
    applyAll(); changed();
  };
  const unlockAll = () => { for (const it of items) it.locked = false; sectionFrozen.clear(); colorLock.clear(); intensityLocked = false; applyAll(); changed(); };
  const lightItems = () => items.filter(it => it.kind === 'light' || it.kind === 'spotlight');
  const setIntensity = (it, v, overrideLock = false) => {
    if (!overrideLock && (it.locked || sectionFrozen.get(it.group) || intensityLocked)) return;
    it.intensity = Math.max(0, Number(v) || 0);
    it.ref.intensity = it.intensity;
  };
  const randomizeIntensity = () => { for (const it of lightItems()) setIntensity(it, 0.3 + Math.random() * 2.7); applyAll(); changed(); };
  const bumpIntensity = delta => { for (const it of lightItems()) setIntensity(it, it.ref.intensity + delta); applyAll(); changed(); };
  const setIntensityAll = v => { for (const it of lightItems()) setIntensity(it, v); applyAll(); changed(); };
  const toggleIntensityLock = on => { intensityLocked = Boolean(on); changed(); };
  const isIntensityLocked = () => intensityLocked;

  return {
    items, byId, applyAll, saveNow, cycle, changed, serialise, sectionFrozen, colorLock, tileLocks, tiles,
    randomizeSection, randomizeAll, tilesItem,
    cycleAll, randomizeColorCount, setColorCount, randomizeCycleColors, randomizeLocks, unlockAll,
    randomizeIntensity, bumpIntensity, setIntensityAll, toggleIntensityLock, intensityLocked: isIntensityLocked,
  };
}

export function mountDesignPanel(infoEl, api) {
  const { items, byId } = api;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nextNumber = () => {
    const n = parseInt(localStorage.getItem('ct-club-design.next') ?? '1', 10);
    return { n, name: `light_design_${String(n).padStart(2, '0')}.json` };
  };
  // Autosave of .json design files is OFF by default — changes never write files
  // unless the box below is ticked. localStorage keeps the working design.
  let autoExport = localStorage.getItem('ct-club-design.auto') === 'on';

  infoEl.innerHTML = `
    <h1>CT CLUB — design panel</h1>
    <div class="dp-actions">
      <button id="dp-rnd-all" title="randomize every unfrozen/unlocked section">🔀 randomize all</button>
      <button id="dp-save">💾 save as <span id="dp-name">light_design_01.json</span></button>
      <label class="dp-toggle" title="off by default; on writes light_design_01.json, 02… on every change"><input type="checkbox" id="dp-auto"${autoExport ? ' checked' : ''}> auto .json on change</label>
      <label class="dp-toggle"><input type="file" id="dp-file" accept=".json"> load design</label>
    </div>
    <div class="dp-tools">
      <div class="dp-tool"><b>CYCLE</b>
        <button class="dp-tool-btn" id="dp-cyc-on" title="turn cycling ON for every item">on all</button>
        <button class="dp-tool-btn" id="dp-cyc-off" title="turn cycling OFF (solid) for every item">solid all</button></div>
      <div class="dp-tool"><b>COLOR COUNT</b>
        <button class="dp-tool-btn" id="dp-rnd-count" title="randomize how many colours each cycled item uses (2–8)">🎲 amount</button>
        <input type="number" class="dp-num" id="dp-count" value="8" min="1" max="8" title="amount of cycle colours">
        <button class="dp-tool-btn" id="dp-set-count" title="set the amount of cycle colours to the value for all items">set</button>
        <button class="dp-tool-btn" id="dp-rnd-cycl" title="randomize the cycling colours (own palette per section)">🎲 cycle colors</button></div>
      <div class="dp-tool"><b>LOCKS</b>
        <button class="dp-tool-btn" id="dp-rnd-locks" title="randomize which sections are frozen and which rows are locked">🎲 lock area</button>
        <button class="dp-tool-btn" id="dp-unlock" title="unfreeze sections and unlock every row">unlock</button></div>
      <div class="dp-tool"><b>INTENSITY (all lights)</b>
        <button class="dp-tool-btn" id="dp-int-lock" title="lock all light intensities">🔒</button>
        <button class="dp-tool-btn" id="dp-rnd-int" title="randomize all light intensities">🎲</button>
        <button class="dp-tool-btn" id="dp-int-up" title="raise all light intensities">+0.2</button>
        <button class="dp-tool-btn" id="dp-int-down" title="lower all light intensities">−0.2</button>
        <input type="number" class="dp-num" id="dp-int-set" value="1.2" min="0" step="0.1" title="intensity value">
        <button class="dp-tool-btn" id="dp-int-apply" title="set all light intensities to the value">set</button></div>
    </div>
    <div id="dp-groups"></div>
    <h2>Randomize & matrix</h2>
    <ul>
    <li>Every section has its own <b>🎲</b> — only that section randomizes (own palette).</li>
    <li>Section <b>🔒</b> freezes it; per-row <b>🔒</b> locks just that item/column.</li>
    <li>Dancefloor is a <b>13×17 matrix</b>: click a tile to paint, right-click to lock it.</li>
    <li>Lights carry intensity boxes. Everything applies live and is kept locally.</li></ul>`;
  document.querySelector('#dp-name').textContent = nextNumber().name;

  const row = it => {
    const slots = [...Array(8)].map((_, i) =>
      `<input type="color" class="dp-slot${it.colors[i] == null ? ' dp-void' : ''}" data-id="${esc(it.id)}" data-i="${i}" value="${it.colors[i] ?? '#000000'}" title="${esc(it.label)} — colour ${i + 1}">`).join('');
    const int = it.kind === 'light' || it.kind === 'spotlight'
      ? `<input type="number" class="dp-int" data-id="${esc(it.id)}" value="${it.ref.intensity.toFixed(2)}" min="0" step="0.05" title="intensity"${api.intensityLocked() ? ' disabled' : ''}>`
      : '';
    return `<div class="dp-row${it.locked ? ' dp-locked' : ''}">
      <button class="dp-lock" data-id="${esc(it.id)}" title="${it.locked ? 'unlock this column' : 'lock this column from randomize'}">${it.locked ? '🔒' : '🔓'}</button>
      <input type="color" class="dp-main" data-id="${esc(it.id)}" value="${it.colors[0] ?? '#000000'}" title="colour now (live)">
      <span class="dp-sw" style="background:${it.colors[0] ?? '#000'}"></span>
      <span class="dp-name" title="${esc(it.label)}">${esc(it.label)}</span>
      <input type="number" class="dp-t" data-id="${esc(it.id)}" value="${it.cycleSeconds}" min="0.1" step="0.5" title="t = full cycle period (s)">
      <label class="dp-cyc"><input type="checkbox" class="dp-cycle" data-id="${esc(it.id)}"${it.cycle ? ' checked' : ''}> cycle</label>
      <span class="dp-slots">${slots}</span>${int}</div>`;
  };
  const tileGrid = () => {
    if (!api.tiles || !api.tileLocks) return '';
    const cells = [];
    for (let r = 0; r < api.tiles.rows; r++) for (let c = 0; c < api.tiles.cols; c++) {
      cells.push(`<span class="dp-tile${api.tileLocks[r][c] ? ' dp-locked' : ''}" data-r="${r}" data-c="${c}" style="background:${api.tiles.matrix[r][c]}" title="row ${r}, col ${c} — click paints, right-click locks"></span>`);
    }
    return `<div class="dp-tiles">
      <input type="color" class="dp-tilepick" value="${api.tilesItem?.colors[0] ?? '#41e0ff'}" title="paint colour for the matrix">
      <span class="dp-tiles-note">tile: click paints · right-click locks</span>
      <div class="dp-tilegrid">${cells.join('')}</div></div>`;
  };
  const render = () => {
    const groupsEl = infoEl.querySelector('#dp-groups');
    const groupOrder = ['FLOOR', 'PILLARS', 'WALLS & SHELL', 'BAR', 'LOUNGE', 'DANCEFLOOR', 'STAGE & SPEAKERS', 'EFFECTS', 'OUTLINES', 'LIGHTS', 'SPOTLIGHTS'];
    const grouped = new Map();
    for (const it of items) { if (!grouped.has(it.group)) grouped.set(it.group, []); grouped.get(it.group).push(it); }
    const parts = [];
    for (const name of groupOrder) {
      const groupItems = grouped.get(name) ?? [];
      if (!groupItems.length) continue;
      const lockedCount = groupItems.filter(it => it.locked).length;
      const frozen = api.sectionFrozen.get(name);
      parts.push(`<h2>
        <button class="dp-sec-rnd" data-sec="${esc(name)}" title="randomize ${name} only">🎲</button>
        <button class="dp-sec-lock" data-sec="${esc(name)}" title="freeze/unfreeze ${name} from randomize">${frozen ? '🔒' : '🔓'}</button>
        <button class="dp-sec-col" data-sec="${esc(name)}" title="lock/unlock the cycling colours of ${name}">${api.colorLock.get(name) ? '🎨' : '🖌️'}</button>
        ${name}<span class="dp-sec-count"> — ${groupItems.length - lockedCount}/${groupItems.length}${frozen ? ' · frozen' : ''}${api.colorLock.get(name) ? ' · colors locked' : ''}</span></h2>`);
      for (const it of groupItems) {
        parts.push(row(it));
        if (it.kind === 'tiles') parts.push(tileGrid());
      }
    }
    groupsEl.innerHTML = parts.join('');
    bind(groupsEl);
    infoEl.querySelector('#dp-int-lock').textContent = api.intensityLocked() ? '🔒' : '🔓';
  };

  const bind = groupsEl => {
    groupsEl.querySelectorAll('[data-id]').forEach(input => {
      const it = byId.get(input.dataset.id);
      if (!it) return;
      if (input.type === 'color') {
        input.addEventListener('input', () => {
          it.colors[Number(input.dataset.i ?? 0)] = input.value;
          it.colorIndex = Number(input.dataset.i ?? 0);
          api.applyAll(); api.changed();
          render();
        });
      } else if (input.classList.contains('dp-t')) {
        input.addEventListener('change', () => { it.cycleSeconds = Math.max(0.1, Number(input.value) || 8); api.changed(); render(); });
      } else if (input.classList.contains('dp-cycle')) {
        input.addEventListener('change', () => { it.cycle = input.checked; api.applyAll(); api.changed(); render(); });
      } else if (input.classList.contains('dp-int')) {
        input.addEventListener('change', () => { it.intensity = Math.max(0, Number(input.value) || 0); api.applyAll(); api.changed(); });
      }
    });
    groupsEl.querySelectorAll('.dp-lock').forEach(btn => btn.addEventListener('click', () => {
      const it = byId.get(btn.dataset.id);
      if (!it) return;
      it.locked = !it.locked; api.changed(); render();
    }));
    groupsEl.querySelectorAll('.dp-sec-rnd').forEach(btn => btn.addEventListener('click', () => {
      api.randomizeSection(btn.dataset.sec); render();
    }));
    groupsEl.querySelectorAll('.dp-sec-lock').forEach(btn => btn.addEventListener('click', () => {
      const name = btn.dataset.sec;
      api.sectionFrozen.set(name, !api.sectionFrozen.get(name));
      api.changed(); render();
    }));
    groupsEl.querySelectorAll('.dp-sec-col').forEach(btn => btn.addEventListener('click', () => {
      const name = btn.dataset.sec;
      api.colorLock.set(name, !api.colorLock.get(name));
      api.changed(); render();
    }));
    groupsEl.querySelectorAll('.dp-tile').forEach(cell => {
      cell.addEventListener('click', () => {
        const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
        const picker = groupsEl.querySelector('.dp-tilepick');
        api.tiles.set(r, c, picker ? picker.value : api.tilesItem.colors[0]);
        if (api.tilesItem) api.tilesItem.colors[0] = api.tiles.matrix[r][c];
        api.changed(); render();
      });
      cell.addEventListener('contextmenu', e => {
        e.preventDefault();
        const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
        api.tileLocks[r][c] = !api.tileLocks[r][c];
        api.changed(); render();
      });
    });
    groupsEl.querySelector('.dp-tilepick')?.addEventListener('input', () => {
      if (api.tilesItem) api.tilesItem.colors[0] = groupsEl.querySelector('.dp-tilepick').value;
    });
  };

  const download = name => {
    const blob = new Blob([JSON.stringify(api.serialise(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  infoEl.querySelector('#dp-rnd-all').addEventListener('click', () => { api.randomizeAll(); render(); });
  infoEl.querySelector('#dp-save').addEventListener('click', () => {
    const { n, name } = nextNumber();
    download(name);
    localStorage.setItem('ct-club-design.next', String(n + 1));
    infoEl.querySelector('#dp-name').textContent = nextNumber().name;
  });
  infoEl.querySelector('#dp-auto').addEventListener('change', e => {
    autoExport = e.target.checked;
    localStorage.setItem('ct-club-design.auto', autoExport ? 'on' : 'off');
  });
  infoEl.querySelector('#dp-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      for (const saved of data.items ?? []) {
        const it = byId.get(saved.id);
        if (!it) continue;
        it.colors.fill(null);
        if (Array.isArray(saved.colors)) for (let i = 0; i < Math.min(8, saved.colors.length); i++) it.colors[i] = saved.colors[i];
        it.cycle = Boolean(saved.cycle);
        if (saved.cycleSeconds != null) it.cycleSeconds = saved.cycleSeconds;
        it.locked = Boolean(saved.locked);
        if (saved.intensity != null && (it.kind === 'light' || it.kind === 'spotlight')) it.ref.intensity = saved.intensity;
      }
      if (data.tiles?.matrix && api.tiles) {
        for (let r = 0; r < api.tiles.rows; r++) for (let c = 0; c < api.tiles.cols; c++) {
          if (data.tiles.matrix[r]?.[c]) api.tiles.set(r, c, data.tiles.matrix[r][c]);
        }
      }
      api.applyAll(); api.changed(); render();
    } catch (error) { console.warn('design load failed', error); }
  });

  render();
  // Toolbar: cycling, colour count, lock area, intensity (all lights).
  infoEl.querySelector('#dp-cyc-on').addEventListener('click', () => { api.cycleAll(true); render(); });
  infoEl.querySelector('#dp-cyc-off').addEventListener('click', () => { api.cycleAll(false); render(); });
  infoEl.querySelector('#dp-rnd-count').addEventListener('click', () => { api.randomizeColorCount(); render(); });
  infoEl.querySelector('#dp-set-count').addEventListener('click', () => { api.setColorCount(infoEl.querySelector('#dp-count').value); render(); });
  infoEl.querySelector('#dp-rnd-cycl').addEventListener('click', () => { api.randomizeCycleColors(); render(); });
  infoEl.querySelector('#dp-rnd-locks').addEventListener('click', () => { api.randomizeLocks(); render(); });
  infoEl.querySelector('#dp-unlock').addEventListener('click', () => { api.unlockAll(); render(); });
  infoEl.querySelector('#dp-int-lock').addEventListener('click', () => { api.toggleIntensityLock(!api.intensityLocked()); render(); });
  infoEl.querySelector('#dp-rnd-int').addEventListener('click', () => { api.randomizeIntensity(); render(); });
  infoEl.querySelector('#dp-int-up').addEventListener('click', () => { api.bumpIntensity(0.2); render(); });
  infoEl.querySelector('#dp-int-down').addEventListener('click', () => { api.bumpIntensity(-0.2); render(); });
  infoEl.querySelector('#dp-int-apply').addEventListener('click', () => { api.setIntensityAll(infoEl.querySelector('#dp-int-set').value); render(); });
  // Drive the per-item colour cycles (and animated floors) from the frame loop.
  const loop = now => { requestAnimationFrame(loop); api.cycle(now / 1000); };
  requestAnimationFrame(loop);

  return { refresh: render, items };
}