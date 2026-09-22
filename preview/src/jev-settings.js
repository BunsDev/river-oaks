export function createJevSettings() {
  const panel = document.createElement('details');
  panel.className = 'rail-disclosure jev-settings';
  panel.innerHTML = `<summary>Jev API key</summary>
    <div class="rail-disclosure-body">
      <p>Use your own key for resident reactions and auto visits. The override lasts until the local bridge restarts.</p>
      <form>
        <label for="jev-api-key">Manual API key override</label>
        <input id="jev-api-key" name="api_key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="4096" required aria-describedby="jev-key-help">
        <p id="jev-key-help">Kept in the bridge’s memory. Not saved in this browser.</p>
        <div class="jev-key-actions"><button type="submit">Use key</button><button type="button" id="jev-key-reset">Use server key</button></div>
      </form>
      <p id="jev-key-status" role="status" aria-live="polite">Checking key settings…</p>
    </div>`;
  const form = panel.querySelector('form'), input = panel.querySelector('input');
  const save = panel.querySelector('[type=submit]'), reset = panel.querySelector('#jev-key-reset');
  const status = panel.querySelector('#jev-key-status');
  let source = 'none', busy = false;
  const setBusy = value => { busy = value; save.disabled = value; reset.disabled = value; };
  const request = async (method = 'GET', key) => {
    if (busy) return;
    setBusy(true);
    status.textContent = method === 'GET' ? 'Checking key settings…' : 'Updating key settings…';
    try {
      const response = await fetch('/v1/settings/jev', {
        method, cache: 'no-store', signal: AbortSignal.timeout(5000),
        ...(method === 'PUT' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: key }) } : {}),
      });
      if (!response.ok) throw new Error(response.status === 400 ? 'invalid_key' : 'bridge_unavailable');
      const value = await response.json();
      if (!['manual', 'server', 'none'].includes(value.source)) throw new Error('bridge_unavailable');
      source = value.source;
      status.textContent = source === 'manual' ? 'Manual key configured. Jev validates it on the next request.'
        : source === 'server' ? 'Using the server’s configured key.' : 'No key configured. Add a key to enable Jev.';
    } catch (error) {
      status.textContent = error.message === 'invalid_key' ? 'Enter a valid API key without spaces.'
        : 'Could not reach the decision bridge. Start it and try again.';
    } finally { setBusy(false); }
  };
  input.addEventListener('input', () => input.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    const key = input.value.trim();
    if (!/^[!-~]{1,4096}$/.test(key)) {
      input.setCustomValidity('Enter an API key without spaces.'); input.reportValidity(); return;
    }
    input.value = '';
    request('PUT', key);
  });
  reset.addEventListener('click', () => { input.value = ''; request('DELETE'); });
  request();
  return panel;
}
