import './bird-cams-ui.css';

// The dock card lists the birds and what each is watching; the ride bar
// shows while you see through one, with takeover, next bird and land.
export function createBirdCamsUI(birds) {
  const panel = document.createElement('section'); panel.className = 'bird-cams'; panel.setAttribute('aria-label', 'Bird cams');
  panel.innerHTML = `<h2>Bird cams</h2><p>Jev flies these birds over the neighbourhood, circling whatever is happening. Ride along, or take the controls.</p><div class="bird-cams-list" id="bird-cams-list"></div>`;
  const list = panel.querySelector('#bird-cams-list');
  const bar = document.createElement('div'); bar.className = 'bird-ride'; bar.hidden = true; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Riding with a bird');
  bar.innerHTML = `<div class="bird-ride-text"><strong id="bird-ride-name"></strong><span id="bird-ride-status" aria-live="polite"></span></div>
    <div class="bird-ride-actions"><button type="button" id="bird-ride-control">Take the controls</button><button type="button" id="bird-ride-next">Next bird</button><button type="button" id="bird-ride-land">Land</button></div>
    <p class="bird-ride-keys" id="bird-ride-keys"></p>`;
  document.body.append(bar);
  bar.querySelector('#bird-ride-control').addEventListener('click', () => birds.toggleControl());
  bar.querySelector('#bird-ride-next').addEventListener('click', () => birds.next());
  bar.querySelector('#bird-ride-land').addEventListener('click', () => birds.land());
  let signature = '';
  function render(state) {
    const key = JSON.stringify([state.riding, state.birds.map(bird => [bird.id, bird.mode, bird.watching])]);
    if (key === signature) return; signature = key;
    list.replaceChildren(...state.birds.map(bird => {
      const row = document.createElement('div'); row.className = 'bird-cams-row'; row.dataset.bird = bird.id;
      const text = document.createElement('span'); text.innerHTML = '<strong></strong><small></small>';
      text.querySelector('strong').textContent = bird.name;
      text.querySelector('small').textContent = bird.mode === 'manual' ? 'Flown by hand' : bird.watching ? `Jev is watching ${bird.watching}` : 'Jev is flying';
      const button = document.createElement('button'); button.type = 'button';
      const mine = state.riding?.id === bird.id;
      button.textContent = mine ? 'Riding' : 'Ride along'; button.disabled = mine; button.setAttribute('aria-label', `Ride along with the ${bird.name.toLowerCase()}`);
      button.addEventListener('click', () => birds.ride(bird.id));
      row.append(text, button); return row;
    }));
    bar.hidden = !state.riding; document.body.classList.toggle('bird-riding', Boolean(state.riding));
    if (state.riding) {
      const manual = state.riding.mode === 'manual';
      bar.querySelector('#bird-ride-name').textContent = `Through the ${state.riding.name.toLowerCase()}'s eyes`;
      bar.querySelector('#bird-ride-status').textContent = manual ? 'You are flying' : state.riding.watching ? `Jev is flying · watching ${state.riding.watching}` : 'Jev is flying';
      bar.querySelector('#bird-ride-control').textContent = manual ? 'Give back to Jev (T)' : 'Take the controls (T)';
      bar.querySelector('#bird-ride-keys').textContent = manual ? 'W/S speed · A/D turn · Space climb · C dive · drag to look · N next bird · Esc land' : 'Any flight key takes over · drag to look · N next bird · Esc land';
    }
  }
  birds.onChange(render); render(birds.state);
  return { panel, bar, dispose() { panel.remove(); bar.remove(); document.body.classList.remove('bird-riding'); } };
}
