import * as THREE from 'three';
import { createFlightEnvironment, createFlightState, requestRoofLevel, requestStreetLevel, setFlightMode, stepFlight } from './flight.js';

function cockpit() {
  const group = new THREE.Group();
  const ceramic = new THREE.MeshPhysicalMaterial({ color: '#e5e9dd', metalness: 0.36, roughness: 0.21, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  const graphite = new THREE.MeshStandardMaterial({ color: '#17252d', metalness: 0.65, roughness: 0.29 });
  const grip = new THREE.MeshStandardMaterial({ color: '#111919', roughness: 0.87 });
  const glow = new THREE.MeshBasicMaterial({ color: '#89ffe2', toneMapped: false });
  const brass = new THREE.MeshStandardMaterial({ color: '#c1a778', metalness: 0.85, roughness: 0.24 });
  const part = (geometry, material, position, scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position);
    mesh.scale.fromArray(scale);
    group.add(mesh);
    return mesh;
  };
  // Rounded front fairing, twin hover nacelles, and swept handlebars visible from the saddle.
  part(new THREE.SphereGeometry(1, 32, 20), ceramic, [0, -1.16, -1.72], [0.61, 0.61, 1.05]);
  part(new THREE.SphereGeometry(1, 24, 16), graphite, [0, -0.94, -1.20], [0.40, 0.30, 0.67]);
  const dashboard = part(new THREE.BoxGeometry(0.5, 0.045, 0.29), graphite, [0, -0.69, -1.49]);
  dashboard.rotation.x = 0.35;
  const display = part(new THREE.PlaneGeometry(0.35, 0.16), glow, [0, -0.666, -1.48]);
  display.rotation.x = -Math.PI / 2 + 0.35;
  for (const side of [-1, 1]) {
    part(new THREE.SphereGeometry(1, 24, 16), ceramic, [side * 0.87, -1.05, -2.02], [0.23, 0.24, 0.72]);
    const rim = part(new THREE.TorusGeometry(0.205, 0.024, 8, 32), glow, [side * 0.87, -1.04, -1.53]);
    rim.rotation.x = -0.12;
    const handle = part(new THREE.CylinderGeometry(0.052, 0.052, 0.95, 12), graphite, [side * 0.54, -0.57, -1.06]);
    handle.rotation.z = side * Math.PI * 0.43;
    const handgrip = part(new THREE.CylinderGeometry(0.071, 0.071, 0.31, 16), grip, [side * 0.98, -0.49, -1.06]);
    handgrip.rotation.z = Math.PI / 2;
    for (let rib = 0; rib < 7; rib++) {
      const ring = part(new THREE.TorusGeometry(0.071, 0.005, 4, 12), graphite, [side * (0.86 + rib * 0.04), -0.49, -1.06]);
      ring.rotation.y = Math.PI / 2;
    }
    const collar = part(new THREE.CylinderGeometry(0.083, 0.083, 0.065, 16), brass, [side * 0.81, -0.49, -1.06]);
    collar.rotation.z = Math.PI / 2;
    part(new THREE.SphereGeometry(0.032, 12, 8), glow, [side * 0.72, -0.47, -1.10]);
  }
  const windshield = part(new THREE.SphereGeometry(1, 32, 20, 0.15, Math.PI - 0.3, 0.18, 0.98), new THREE.MeshPhysicalMaterial({ color: '#91d9d0', transparent: true, opacity: 0.11, metalness: 0.1, roughness: 0.06, side: THREE.DoubleSide, depthWrite: false }), [0, -1.10, -2.05], [0.8, 0.92, 0.65]);
  windshield.rotation.x = -0.18;
  const light = new THREE.PointLight('#aeffea', 3, 4, 2);
  light.position.set(0, -0.2, -0.7);
  group.add(light);
  group.visible = false;
  return group;
}

export function createHoverMoped({ camera, scene, host, reducedMotion, onExit }) {
  const $ = (selector) => document.querySelector(selector);
  const model = cockpit();
  camera.add(model);
  scene.add(camera);
  const keys = new Set();
  let environment, state, route, active = false, lastHud = 0;
  const clearInput = () => { keys.clear(); document.querySelectorAll('[data-flight-key]').forEach((button) => button.classList.remove('held')); };
  const manual = () => { setFlightMode(state, 'manual', environment); state.paused = false; updateButtons(); };
  const updateButtons = () => {
    const modes = { tour: 'Assisted tour', manual: 'Manual flight', street: state.assist?.phase === 'approach' ? 'Approaching street' : 'Descending to street', rise: 'Rising above roofs' };
    $('#flight-mode').textContent = modes[state.mode];
    $('#flight-autopilot').textContent = state.mode === 'tour' ? 'Take control' : 'Start tour';
    $('#flight-autopilot').setAttribute('aria-pressed', String(state.mode === 'tour'));
    $('#flight-pause').textContent = state.paused ? 'Resume ride' : 'Hover / pause';
    $('#flight-pause').setAttribute('aria-pressed', String(state.paused));
    $('#flight-street')?.setAttribute('aria-pressed', String(state.mode === 'street'));
    $('#flight-rise')?.setAttribute('aria-pressed', String(state.mode === 'rise'));
  };
  const assist = (request) => {
    if (!active) return;
    clearInput();
    request(state, environment);
    state.paused = false;
    updateButtons();
    host.focus({ preventScroll: true });
  };
  const toggleMode = () => {
    if (!active) return;
    clearInput();
    setFlightMode(state, state.mode === 'tour' ? 'manual' : 'tour', environment);
    state.paused = false;
    updateButtons();
    host.focus({ preventScroll: true });
  };
  const togglePause = () => {
    if (!active) return;
    state.paused = !state.paused;
    clearInput();
    updateButtons();
  };
  $('#flight-autopilot').addEventListener('click', toggleMode);
  $('#flight-pause').addEventListener('click', togglePause);
  $('#flight-exit').addEventListener('click', onExit);
  $('#flight-street')?.addEventListener('click', () => assist(requestStreetLevel));
  $('#flight-rise')?.addEventListener('click', () => assist(requestRoofLevel));
  const flightKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  window.addEventListener('keydown', (event) => {
    if (!active) return;
    if (event.code === 'Escape') { onExit(); return; }
    if (event.target.closest('button,input,select,textarea') || event.target.isContentEditable) return;
    if (event.code === 'KeyP' && !event.repeat) { toggleMode(); event.preventDefault(); }
    if (event.code === 'KeyH' && !event.repeat) { togglePause(); event.preventDefault(); }
    if (event.code === 'KeyF' && !event.repeat) { assist(requestStreetLevel); event.preventDefault(); }
    if (event.code === 'KeyR' && !event.repeat) { assist(requestRoofLevel); event.preventDefault(); }
    if (!flightKeys.has(event.code)) return;
    event.preventDefault();
    manual();
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', clearInput);
  document.querySelectorAll('[data-flight-key]').forEach((button) => {
    const release = () => { keys.delete(button.dataset.flightKey); button.classList.remove('held'); };
    button.addEventListener('pointerdown', (event) => {
      if (!active) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      manual();
      keys.add(button.dataset.flightKey);
      button.classList.add('held');
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    // Native keyboard activation provides a short step for users who prefer the visible controls.
    button.addEventListener('click', (event) => {
      if (event.detail !== 0 || !active) return;
      manual();
      keys.add(button.dataset.flightKey);
      setTimeout(release, 180);
    });
  });
  const placeCamera = () => {
    camera.position.fromArray(state.position);
    if (!reducedMotion && !state.paused) camera.position.y += Math.sin(state.elapsed * 1.7) * 0.10;
    camera.rotation.set(-0.14, state.yaw, reducedMotion ? 0 : state.bank * 0.38, 'YXZ');
    model.rotation.z = reducedMotion ? 0 : state.bank * 0.5;
  };
  return {
    get active() { return active; },
    getPosition() { return state ? [state.position[0], -state.position[2], state.position[1]] : null; },
    enter(world) {
      environment = createFlightEnvironment(world);
      state = createFlightState(environment, reducedMotion);
      active = true;
      model.visible = true;
      camera.fov = 64;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      const geometry = new THREE.BufferGeometry().setFromPoints(environment.curve.getSpacedPoints(384));
      route = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: '#8fffe4', transparent: true, opacity: 0.45, dashSize: 14, gapSize: 13 }));
      route.computeLineDistances();
      scene.add(route);
      document.body.classList.add('flying');
      $('#flight-hud').hidden = false;
      $('#selection').hidden = true;
      updateButtons();
      placeCamera();
      host.focus({ preventScroll: true });
    },
    exit() {
      if (!active) return;
      active = false;
      clearInput();
      scene.remove(route);
      route.geometry.dispose();
      route.material.dispose();
      model.visible = false;
      camera.fov = 42;
      camera.near = 0.5;
      camera.updateProjectionMatrix();
      camera.rotation.z = 0;
      document.body.classList.remove('flying');
      $('#flight-hud').hidden = true;
    },
    update(delta, now) {
      if (!active) return;
      const pressed = (...codes) => codes.some((code) => keys.has(code));
      if (!document.hidden) stepFlight(state, environment, {
        throttle: Number(pressed('KeyW', 'ArrowUp')) - Number(pressed('KeyS', 'ArrowDown')),
        steer: Number(pressed('KeyD', 'ArrowRight')) - Number(pressed('KeyA', 'ArrowLeft')),
        lift: Number(pressed('KeyE')) - Number(pressed('KeyQ')),
        boost: pressed('Space'),
      }, delta);
      placeCamera();
      if (now - lastHud < 100) return;
      lastHud = now;
      updateButtons();
      $('#flight-speed').textContent = String(Math.round((state.paused ? 0 : state.speed) * 3.6)).padStart(2, '0');
      $('#flight-altitude').textContent = String(Math.round(state.position[1] - environment.groundAt(state.position[0], state.position[2])));
      const heading = ((-state.yaw * 180 / Math.PI) % 360 + 360) % 360;
      $('#flight-heading').textContent = `${String(Math.round(heading) % 360).padStart(3, '0')}°`;
      $('#flight-progress').style.width = `${state.progress * 100}%`;
      $('#flight-location').textContent = `E ${state.position[0].toFixed(0)} · N ${(-state.position[2]).toFixed(0)} m`;
      $('#compass-arrow').style.transform = `rotate(${-heading}deg)`;
    },
  };
}
