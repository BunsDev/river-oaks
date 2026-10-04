import { blankRegion, buildingFits, editableRegion, insideRegion, mapPoint, nextRegionId, regionPoint, spawnClear, terrainIndex, REGION_DRAFT_STORAGE_KEY, REGION_MAP_SIZE } from './region-draft.js';
import './region-editor.css';

const SVG = 'http://www.w3.org/2000/svg';
const limits = { roads: 64, buildings: 80, trees: 256, places: 64 };
const labels = { select: 'Select', terrain: 'Terrain', road: 'Road', building: 'Building', tree: 'Tree', place: 'Place', spawn: 'Arrival' };
const slug = value => typeof value === 'string' && value.length <= 48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const copy = value => structuredClone(value);
const svgNode = (tag, attributes = {}, text = '') => {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
};

export function createRegionEditor({ onChange = () => {} } = {}) {
  const dialog = document.createElement('dialog'); dialog.className = 'region-editor';
  dialog.setAttribute('aria-label', 'Design a region');
  dialog.innerHTML = `<div class="region-editor-shell">
    <header><div><span class="region-editor-kicker">World studio</span><h2>Design a region</h2><p>Shape a local world before Jevica publishes it.</p></div><button type="button" data-action="close" aria-label="Close region editor">×</button></header>
    <div class="region-editor-main"><div class="region-editor-canvas"><div class="region-editor-tools" role="toolbar" aria-label="Region tools"></div><p class="region-editor-hint"></p>
      <svg class="region-editor-map" viewBox="0 0 600 600" preserveAspectRatio="none" role="img" aria-label="Top-down region map"></svg>
      <p class="region-editor-coordinates"></p></div>
      <aside class="region-editor-inspector"><h3>Place precisely</h3><div class="region-editor-position"><label>East (m)<input type="number" step=".1" value="0" data-coordinate="east"></label><label>North (m)<input type="number" step=".1" value="0" data-coordinate="north"></label><button type="button" data-action="place-coordinate">Use coordinates</button></div>
        <h3>Selected item</h3><label class="region-editor-choose-label">Choose an item<select class="region-editor-chooser"></select></label><div class="region-editor-fields"></div><button type="button" data-action="delete" hidden>Remove selected item</button></aside></div>
    <footer><p class="region-editor-status" role="status" aria-live="polite"></p><div><button type="button" data-action="new">New blank</button><button type="button" data-action="export">Download JSON</button><button type="button" data-action="done">Use this region</button></div></footer>
  </div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const map = $('.region-editor-map'), tools = $('.region-editor-tools'), fields = $('.region-editor-fields');
  const hint = $('.region-editor-hint'), status = $('.region-editor-status'), coordinates = $('.region-editor-coordinates');
  const deleteButton = $('[data-action="delete"]'), chooser = $('.region-editor-chooser');
  const eastInput = $('[data-coordinate="east"]'), northInput = $('[data-coordinate="north"]');
  let region = null, selected = null, tool = 'select', roadStart = null, roadInProgress = null, storageKey = REGION_DRAFT_STORAGE_KEY;
  const say = message => { status.textContent = message; };
  const saved = key => {
    try { const raw = localStorage.getItem(key); const value = raw && JSON.parse(raw); return editableRegion(value) ? value : null; }
    catch { return null; }
  };
  const persist = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(region)); }
    catch { say('Draft is in this tab only. Download the JSON to keep it.'); }
    onChange(copy(region));
  };
  const selectTool = next => {
    tool = next; roadStart = null; roadInProgress = null;
    for (const button of tools.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    hint.textContent = tool === 'road' ? 'Click two points for a new road, then click to add more. Choose Select to finish.'
      : tool === 'terrain' ? 'Click a grid sample, then set its height.'
        : tool === 'select' ? 'Click an item to edit it. Click the map with a tool to add to your region.'
          : `Click the map to set ${labels[tool].toLowerCase()}.`;
  };
  for (const [id, label] of Object.entries(labels)) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.tool = id; button.textContent = label;
    button.addEventListener('click', () => selectTool(id)); tools.append(button);
  }

  const itemForSelection = () => selected?.type === 'terrain' ? null
    : selected?.type === 'spawn' ? region.spawn
      : region?.[selected?.type]?.find(item => item.id === selected.id) ?? null;
  const changed = (message = 'Draft saved on this device.') => { persist(); render(); say(message); };
  const field = (label, value, apply, { type = 'text', min, max, step = 'any', options } = {}) => {
    const wrapper = document.createElement('label'); wrapper.textContent = label;
    const input = document.createElement(options ? 'select' : 'input'); input.className = 'region-editor-field';
    if (options) for (const option of options) input.add(new Option(typeof option === 'string' ? option : option.label,
      typeof option === 'string' ? option : option.value));
    else { input.type = type; if (type === 'number') { input.step = step; if (min !== undefined) input.min = min; if (max !== undefined) input.max = max; } }
    input.value = String(value); wrapper.append(input);
    input.addEventListener('change', () => {
      const next = type === 'number' ? Number(input.value) : input.value.trim();
      if (type === 'number' && (input.value.trim() === '' || !Number.isFinite(next) || min !== undefined && next < Number(min) || max !== undefined && next > Number(max))) {
        input.value = String(value); say(`${label} is outside the allowed range.`); return;
      }
      if (apply(next) === false) { input.value = String(value); return; }
      changed();
    });
    fields.append(wrapper); return input;
  };
  const nameField = item => field('Name', item.name, next => {
    if (!next || [...next].length > 64) { say('Names must contain 1–64 characters.'); return false; }
    item.name = next;
  });
  const idField = item => field('ID', item.id, next => {
    if (!slug(next) || [...region.roads, ...region.buildings, ...region.trees, ...region.places].some(other => other !== item && other.id === next)) {
      say('Use a unique lowercase slug for the ID.'); return false;
    }
    const previous = item.id; item.id = next; selected.id = next;
    if (roadInProgress === previous) roadInProgress = next;
  });
  const positionFields = (value, set) => {
    for (const [index, label] of ['East (m)', 'North (m)'].entries()) field(label, value[index], next => {
      const point = [...value]; point[index] = next;
      if (!insideRegion(region, point)) { say('Keep the point at least 1 m inside the boundary.'); return false; }
      return set(point);
    }, { type: 'number', step: '.1', min: region.bounds_m[index], max: region.bounds_m[index + 2] });
  };
  function renderInspector() {
    fields.replaceChildren(); deleteButton.hidden = true;
    if (!selected) { const text = document.createElement('p'); text.textContent = 'Choose a tool or select something on the map.'; fields.append(text); return; }
    if (selected.type === 'terrain') {
      const { width, height } = region.terrain, index = selected.index;
      const heading = document.createElement('p'); heading.textContent = `Terrain sample ${index % width + 1}, ${Math.floor(index / width) + 1} of ${width} × ${height}`; fields.append(heading);
      field('Height (m)', region.terrain.heights_m[index], next => { region.terrain.heights_m[index] = next; }, { type: 'number', min: -50, max: 500, step: '.1' });
      return;
    }
    if (selected.type === 'spawn') { positionFields(region.spawn, next => {
      const previous = region.spawn; region.spawn = next;
      if (!spawnClear(region)) { region.spawn = previous; say('The arrival point needs clear space outside buildings.'); return false; }
    }); return; }
    const item = itemForSelection(); if (!item) { selected = null; renderInspector(); return; }
    idField(item);
    if (selected.type === 'roads' || selected.type === 'places') nameField(item);
    if (selected.type === 'roads') {
      field('Kind', item.kind, next => { item.kind = next; item.width_m = next === 'footway' ? 4 : 8.4; }, { options: ['footway', 'residential'] });
      field('Width (m)', item.width_m, next => { item.width_m = next; }, { type: 'number', min: item.kind === 'footway' ? 2 : 6, max: item.kind === 'footway' ? 8 : 16, step: '.1' });
      const index = clamp(selected.point ?? 0, 0, item.points.length - 1); selected.point = index;
      field('Road point', index + 1, next => { selected.point = Number(next) - 1; }, { options: item.points.map((_, position) => String(position + 1)) });
      positionFields(item.points[index], next => { item.points[index] = next; });
      const removePoint = document.createElement('button'); removePoint.type = 'button'; removePoint.textContent = 'Remove road point'; removePoint.disabled = item.points.length <= 2;
      removePoint.addEventListener('click', () => { item.points.splice(index, 1); selected.point = 0; changed(); }); fields.append(removePoint);
    } else {
      const key = selected.type === 'buildings' ? 'center' : 'position';
      positionFields(item[key], next => {
        const previous = item[key]; item[key] = next;
        if (selected.type === 'buildings' && (!buildingFits(region, item) || !spawnClear(region))) {
          item[key] = previous; say('Keep the whole building inside the boundary and clear of arrival.'); return false;
        }
      });
      if (selected.type === 'places') { /* Places need only a name and position. */ }
      if (selected.type === 'trees') {
        field('Height (m)', item.height_m, next => { item.height_m = next; }, { type: 'number', min: 2, max: 35, step: '.1' });
        field('Crown radius (m)', item.crown_radius_m, next => { item.crown_radius_m = next; }, { type: 'number', min: .5, max: 10, step: '.1' });
      }
      if (selected.type === 'buildings') {
        const changeBuilding = mutate => {
          const previous = { size: [...item.size], yaw_deg: item.yaw_deg }; mutate();
          if (!buildingFits(region, item) || !spawnClear(region) || item.interior && (item.size[0] < 6 || item.size[1] < 6)) {
            item.size = previous.size; item.yaw_deg = previous.yaw_deg;
            say('Keep the building in bounds and at least 6 × 6 m for a walk-in interior.'); return false;
          }
        };
        field('Kind', item.kind, next => { if (next !== item.kind) delete item.interior; item.kind = next; }, { options: ['retail', 'residential', 'parking'] });
        for (const [index, label, min, max] of [[0, 'Width (m)', 4, 80], [1, 'Depth (m)', 4, 80], [2, 'Height (m)', 5.5, 50]])
          field(label, item.size[index], next => changeBuilding(() => { item.size[index] = next; }), { type: 'number', min, max, step: '.1' });
        field('Rotation (°)', item.yaw_deg, next => changeBuilding(() => { item.yaw_deg = next; }), { type: 'number', min: -180, max: 180, step: '1' });
        if (item.kind !== 'parking') {
          field('Walk-in space', item.interior?.category ?? '', next => {
            if (!next) { delete item.interior; return; }
            if (!item.interior && region.buildings.filter(building => building.interior).length >= 8) {
              say('A region can have up to eight walk-in interiors.'); return false;
            }
            if (item.size[0] < 6 || item.size[1] < 6) { say('Make this building at least 6 × 6 m first.'); return false; }
            item.interior = { name: item.interior?.name ?? `${item.kind === 'residential' ? 'Home' : 'Venue'} ${item.id}`, category: next, entrance: item.interior?.entrance ?? 'south' };
          }, { options: item.kind === 'residential' ? [{ value: '', label: 'Exterior only' }, { value: 'home', label: 'Furnished home lounge' }]
            : [{ value: '', label: 'Exterior only' }, { value: 'art', label: 'Gallery' },
              { value: 'clothes', label: 'Fashion boutique' }, { value: 'restaurant', label: 'Café or dining' },
              { value: 'wellness', label: 'Wellness studio' }] });
          if (item.interior) {
            field('Interior name', item.interior.name, next => {
              if (!next || [...next].length > 64 || /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(next)) {
                say('Interior names must contain 1–64 visible characters.'); return false;
              }
              item.interior.name = next;
            });
            field('Entrance face', item.interior.entrance, next => { item.interior.entrance = next; },
              { options: [{ value: 'south', label: 'South face (rotates with building)' },
                { value: 'east', label: 'East face (rotates with building)' },
                { value: 'north', label: 'North face (rotates with building)' },
                { value: 'west', label: 'West face (rotates with building)' }] });
          }
        }
      }
    }
    deleteButton.hidden = false;
    deleteButton.disabled = selected.type === 'roads' && region.roads.length <= 1 || selected.type === 'places' && region.places.length <= 4;
  }

  function renderChooser() {
    chooser.replaceChildren(new Option('Choose on the map', ''));
    chooser.add(new Option('Arrival', 'spawn'));
    for (const [type, heading] of [['roads', 'Roads'], ['buildings', 'Buildings'], ['trees', 'Trees'], ['places', 'Places']]) {
      const group = document.createElement('optgroup'); group.label = heading;
      for (const item of region[type]) group.append(new Option(item.name ?? item.id, `${type}:${item.id}`));
      chooser.append(group);
    }
    chooser.value = selected?.type === 'spawn' ? 'spawn' : selected?.id ? `${selected.type}:${selected.id}` : '';
  }
  chooser.addEventListener('change', () => {
    const [type, id] = chooser.value.split(':');
    selected = chooser.value ? type === 'spawn' ? { type: 'spawn' } : { type, id, point: 0 } : null;
    selectTool('select'); render();
  });

  const plot = (type, item, shape) => {
    shape.dataset.type = type; shape.dataset.id = item.id;
    shape.classList.add('region-map-item');
    if (selected?.type === type && selected.id === item.id) shape.classList.add('selected');
    map.append(shape);
  };
  function render() {
    if (!region) return;
    map.replaceChildren();
    const { width, height, heights_m } = region.terrain;
    const cellW = REGION_MAP_SIZE / width, cellH = REGION_MAP_SIZE / height;
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
      const index = (height - row - 1) * width + column, elevation = heights_m[index];
      const light = clamp(76 - elevation * 1.6, 32, 86);
      map.append(svgNode('rect', { x: column * cellW, y: row * cellH, width: cellW + .1, height: cellH + .1,
        fill: elevation < 0 ? `hsl(196 38% ${clamp(72 + elevation, 42, 82)}%)` : `hsl(81 25% ${light}%)` }));
    }
    for (const road of region.roads) {
      const points = road.points.map(point => mapPoint(region, point).join(',')).join(' ');
      const line = svgNode('polyline', { points, fill: 'none', stroke: road.kind === 'footway' ? '#efe4ca' : '#938d87',
        'stroke-width': road.width_m / (region.bounds_m[2] - region.bounds_m[0]) * REGION_MAP_SIZE, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      plot('roads', road, line);
      if (selected?.type === 'roads' && selected.id === road.id) road.points.forEach((point, index) => {
        const [cx, cy] = mapPoint(region, point), marker = svgNode('circle', { cx, cy, r: 6, fill: '#fff', stroke: '#624361', 'stroke-width': 2 });
        marker.dataset.type = 'roads'; marker.dataset.id = road.id; marker.dataset.point = index; map.append(marker);
      });
    }
    for (const building of region.buildings) {
      const [cx, cy] = mapPoint(region, building.center);
      const w = building.size[0] / (region.bounds_m[2] - region.bounds_m[0]) * REGION_MAP_SIZE;
      const h = building.size[1] / (region.bounds_m[3] - region.bounds_m[1]) * REGION_MAP_SIZE;
      plot('buildings', building, svgNode('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h,
        transform: `rotate(${-building.yaw_deg} ${cx} ${cy})`, rx: 3 }));
    }
    for (const tree of region.trees) {
      const [cx, cy] = mapPoint(region, tree.position);
      plot('trees', tree, svgNode('circle', { cx, cy, r: Math.max(5, tree.crown_radius_m / (region.bounds_m[2] - region.bounds_m[0]) * REGION_MAP_SIZE) }));
    }
    for (const place of region.places) {
      const [cx, cy] = mapPoint(region, place.position);
      plot('places', place, svgNode('circle', { cx, cy, r: 8 }));
      const label = svgNode('text', { x: cx + 11, y: cy - 8 }, place.name); label.classList.add('region-map-label'); map.append(label);
    }
    const [sx, sy] = mapPoint(region, region.spawn);
    const spawn = svgNode('g', { transform: `translate(${sx} ${sy})` }); spawn.dataset.type = 'spawn';
    spawn.append(svgNode('circle', { cx: 0, cy: 0, r: 12 }), svgNode('path', { d: 'M-6 0H6M0-6V6' })); map.append(spawn);
    if (roadStart) { const [cx, cy] = mapPoint(region, roadStart); map.append(svgNode('circle', { cx, cy, r: 6, fill: '#b04d88' })); }
    coordinates.textContent = `Boundary ${region.bounds_m.join(', ')} m · ${region.buildings.length} buildings · ${region.trees.length} trees · ${region.places.length} places`;
    renderChooser();
    renderInspector();
  }

  map.addEventListener('click', event => {
    if (!region) return;
    const rect = map.getBoundingClientRect();
    const point = regionPoint(region, [(event.clientX - rect.left) / rect.width * REGION_MAP_SIZE,
      (event.clientY - rect.top) / rect.height * REGION_MAP_SIZE]);
    eastInput.value = String(point[0]); northInput.value = String(point[1]);
    if (tool === 'select') {
      const target = event.target.closest('[data-type]');
      selected = target ? { type: target.dataset.type, id: target.dataset.id, point: target.dataset.point === undefined ? 0 : Number(target.dataset.point) } : null;
      render(); return;
    }
    if (!insideRegion(region, point)) { say('Choose a point at least 1 m inside the boundary.'); return; }
    if (tool === 'terrain') selected = { type: 'terrain', index: terrainIndex(region, point) };
    else if (tool === 'spawn') {
      const previous = region.spawn; region.spawn = point;
      if (!spawnClear(region)) { region.spawn = previous; say('The arrival point needs clear space outside buildings.'); return; }
      selected = { type: 'spawn' };
    }
    else if (tool === 'road') {
      if (roadInProgress) {
        const road = region.roads.find(item => item.id === roadInProgress);
        if (road.points.length >= 128) { say('A road can have at most 128 points.'); return; }
        if (Math.hypot(point[0] - road.points.at(-1)[0], point[1] - road.points.at(-1)[1]) < .2) return;
        road.points.push(point); selected = { type: 'roads', id: road.id, point: road.points.length - 1 };
      } else if (roadStart) {
        if (region.roads.length >= limits.roads) { say('This region has the maximum number of roads.'); return; }
        if (Math.hypot(point[0] - roadStart[0], point[1] - roadStart[1]) < .2) { say('Place the second road point farther away.'); return; }
        const road = { id: nextRegionId(region, 'road'), name: 'New Road', kind: 'footway', width_m: 4, points: [roadStart, point] };
        region.roads.push(road); roadInProgress = road.id; roadStart = null; selected = { type: 'roads', id: road.id, point: 1 };
      } else { roadStart = point; render(); say('Choose the second road point.'); return; }
    } else {
      const collection = { building: 'buildings', tree: 'trees', place: 'places' }[tool];
      if (region[collection].length >= limits[collection]) { say(`This region has the maximum number of ${collection}.`); return; }
      const item = tool === 'building' ? { id: nextRegionId(region, 'building'), center: point, size: [12, 12, 9], yaw_deg: 0, kind: 'residential' }
        : tool === 'tree' ? { id: nextRegionId(region, 'tree'), position: point, height_m: 9, crown_radius_m: 3 }
          : { id: nextRegionId(region, 'place'), name: 'New Place', position: point };
      if (tool === 'building' && !buildingFits(region, item)) { say('Keep the whole building inside the boundary.'); return; }
      region[collection].push(item); selected = { type: collection, id: item.id };
      if (tool === 'building' && !spawnClear(region)) { region[collection].pop(); selected = null; say('Keep arrival clear of buildings.'); return; }
    }
    changed();
  });
  $('[data-action="place-coordinate"]').addEventListener('click', () => {
    if (!region || tool === 'select') { say('Choose a map tool first.'); return; }
    const point = [Number(eastInput.value), Number(northInput.value)];
    if (!point.every(Number.isFinite) || !insideRegion(region, point)) { say('Choose a point at least 1 m inside the boundary.'); return; }
    const [x, y] = mapPoint(region, point), rect = map.getBoundingClientRect();
    map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + x / REGION_MAP_SIZE * rect.width,
      clientY: rect.top + y / REGION_MAP_SIZE * rect.height }));
  });
  deleteButton.addEventListener('click', () => {
    if (!selected || !region[selected.type] || deleteButton.disabled) return;
    if (roadInProgress === selected.id) roadInProgress = null;
    region[selected.type] = region[selected.type].filter(item => item.id !== selected.id);
    selected = null; changed();
  });
  $('[data-action="close"]').addEventListener('click', () => dialog.close());
  $('[data-action="done"]').addEventListener('click', () => { persist(); dialog.close(); });
  $('[data-action="new"]').addEventListener('click', () => {
    if (region && !window.confirm('Replace this local draft with a blank region? Download its JSON first if you want to keep it.')) return;
    region = blankRegion(); selected = null; selectTool('select'); changed('Blank region ready to design.');
  });
  $('[data-action="export"]').addEventListener('click', () => {
    if (!region) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(region, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'creator-region.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); say('Region JSON downloaded.');
  });
  const open = (key = REGION_DRAFT_STORAGE_KEY) => {
    if(storageKey!==key){storageKey=key;region=null;}
    region ??= saved(storageKey) ?? blankRegion(); selected = null; selectTool('select'); render();
    if (!dialog.open) dialog.showModal(); onChange(copy(region));
    say(storageKey===REGION_DRAFT_STORAGE_KEY?'Draft saved on this device. The world is fixed when published.'
      :'Draft saved on this device. Save the revision to sync it across devices.');
  };
  return {
    open,
    async loadFile(file) {
      if (!file || file.size > 128 * 1024) throw new Error('Region package must be at most 128 KB.');
      let next;
      try { next = JSON.parse(await file.text()); } catch { throw new Error('Region package must be valid JSON.'); }
      if (!editableRegion(next)) throw new Error('Region package does not have an editable v1 layout.');
      this.loadRegion(next);
      say('Imported region ready to edit.');
    },
    loadRegion(value, key = REGION_DRAFT_STORAGE_KEY) {
      if (!editableRegion(value)) throw new Error('Region package does not have an editable v1 layout.');
      storageKey=key;region=copy(value);selected=null;roadStart=null;roadInProgress=null;persist();open(key);
    },
    getRegion() { return region ? copy(region) : null; },
    draftFor(key = REGION_DRAFT_STORAGE_KEY) { return storageKey===key&&region ? copy(region) : saved(key); },
    hasDraft(key = REGION_DRAFT_STORAGE_KEY) { return Boolean(this.draftFor(key)); },
    clearDraft(key) {
      try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
      if(storageKey===key)region=null;
    },
    dispose() { dialog.close(); dialog.remove(); },
  };
}
