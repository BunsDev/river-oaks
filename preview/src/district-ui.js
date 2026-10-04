const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const category = store => store.category === 'home' ? 'Homes' : ['restaurant', 'ice_cream'].includes(store.category) ? 'Dining' : ['jewelry', 'fashion_accessories'].includes(store.category) ? 'Jewelry & accessories' : ['beauty', 'hairdresser', 'fitness_centre', 'wellness', 'perfumery', 'optician'].includes(store.category) ? 'Beauty & wellness' : 'Shopping & culture';
const presets = { daylight: { hour: 13, weather: 'clear' }, pink: { hour: 17.5, weather: 'clear' }, mist: { hour: 16, weather: 'haze' } };

export function setupDistrictUI({ onArrive, onEnter, onAtmosphere, describeStore }) {
  const $ = selector => document.querySelector(selector);
  let stores = [], filtered = [];
  const select = $('#destination'), search = $('#store-search'), filter = $('#store-category');
  const describe = () => {
    const store = filtered.find(item => item.id === select.value);
    $('#store-name').textContent = store?.name ?? 'No matching destinations';
    $('#store-category-label').textContent = store ? category(store) : 'Try another name or category.';
    $('#visit-destination').textContent = store?.category === 'home' ? 'Arrive outside home →' : 'Arrive at storefront →';
    $('#visit-destination').disabled = !store;
    $('#enter-destination').disabled = !store;
    $('#store-inside').textContent = store ? describeStore?.(store) ?? "" : "";
    $('#store-previous').disabled = $('#store-next').disabled = filtered.length < 2;
    $('#store-step').textContent = store ? `${filtered.indexOf(store) + 1} of ${filtered.length}` : '0 results';
  };
  const render = () => {
    const selected = select.value;
    filtered = stores.filter(store => (!filter.value || category(store) === filter.value) && normalize(store.name).includes(normalize(search.value)));
    select.replaceChildren(...filtered.map(store => {
      const option = document.createElement('option'); option.value = store.id; option.textContent = store.name; return option;
    }));
    if (filtered.some(store => store.id === selected)) select.value = selected;
    select.disabled = !filtered.length;
    $('#store-results').textContent = `${filtered.length} of ${stores.length} destinations`;
    $('#store-clear').hidden = !search.value && !filter.value;
    describe();
  };
  for (const input of [search, filter]) input.addEventListener(input === search ? 'input' : 'change', render);
  $('#store-clear').addEventListener('click', () => { search.value = ''; filter.value = ''; render(); search.focus(); });
  select.addEventListener('change', describe);
  $('#visit-destination').addEventListener('click', () => { const store = filtered.find(item => item.id === select.value); if (store) onArrive(store); });
  $('#enter-destination').addEventListener('click', () => { const store = filtered.find(item => item.id === select.value); if (store) onEnter?.(store); });
  for (const [id, step] of [['store-previous', -1], ['store-next', 1]]) $(`#${id}`).addEventListener('click', () => {
    if (!filtered.length) return;
    const index = filtered.findIndex(store => store.id === select.value);
    const store = filtered[(index + step + filtered.length) % filtered.length];
    select.value = store.id; describe(); onArrive(store);
  });
  document.querySelectorAll('[data-atmosphere]').forEach(button => button.addEventListener('click', () => {
    const preset = presets[button.dataset.atmosphere];
    $('#sun-hour').value = preset.hour; $('#weather').value = preset.weather; onAtmosphere();
  }));
  return {
    setStores(next, initialName) { stores = next; search.value = ''; filter.value = ''; render(); this.select(stores.find(store => store.name === initialName)?.id ?? stores[0]?.id); },
    select(id) { if (!filtered.some(store => store.id === id)) { search.value = ''; filter.value = ''; render(); } select.value = id; describe(); },
    syncAtmosphere() {
      for (const button of document.querySelectorAll('[data-atmosphere]')) {
        const preset = presets[button.dataset.atmosphere];
        button.setAttribute('aria-pressed', String(Number($('#sun-hour').value) === preset.hour && $('#weather').value === preset.weather));
      }
    },
  };
}
