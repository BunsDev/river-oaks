export function createJevSettings(provider = 'jev') {
  const eleven = provider === 'elevenlabs';
  const name = eleven ? 'ElevenLabs' : 'Jev';
  const panel = document.createElement('details');
  panel.className = 'rail-disclosure jev-settings';
  panel.innerHTML = `<summary>${name} API key</summary>
    <div class="rail-disclosure-body">
      <p>${eleven ? "Jev speaks with your selected ElevenLabs voice. Only his dialogue text is sent to ElevenLabs." : "Use your own key for resident reactions and auto visits."} The override lasts until the local bridge restarts.</p>
      <form>
        <label for="${provider}-api-key">Manual API key override</label>
        <input id="${provider}-api-key" name="api_key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="4096" required aria-describedby="${provider}-key-help">
        <p id="${provider}-key-help">Kept in the bridge’s memory. Not saved in this browser.</p>
        <div class="jev-key-actions"><button type="submit">Use key</button><button type="button" id="jev-key-reset">Use server key</button></div>
      </form>
      <p id="jev-key-status" role="status" aria-live="polite">Checking key settings…</p>
    </div>`;
  if (eleven) panel.querySelectorAll('[id]').forEach(node => { if (node.id.startsWith('jev-key-')) node.id = node.id.replace('jev-', 'elevenlabs-'); });
  if (eleven) {
    const voiceForm=document.createElement('form');voiceForm.className='jev-voice-selection';
    voiceForm.innerHTML='<label for="elevenlabs-voice-id">Jev’s voice ID</label><input id="elevenlabs-voice-id" value="s3TPKV1kjDlVtZbl4Ksh" maxlength="64" pattern="[A-Za-z0-9]{1,64}" required autocomplete="off" spellcheck="false"><button type="submit">Use voice</button>';
    panel.querySelector('.rail-disclosure-body').append(voiceForm);
    voiceForm.addEventListener('submit',async event=>{
      event.preventDefault();const button=voiceForm.querySelector('button');button.disabled=true;
      try {
        const response=await fetch('/v1/settings/elevenlabs/voice',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice_id:voiceForm.querySelector('input').value.trim()}),signal:AbortSignal.timeout(5000)});
        if(!response.ok)throw new Error('Voice could not be selected');
        await request();
      }catch{status.textContent='Could not update the voice. Check the voice ID and bridge.';}finally{button.disabled=false;}
    });
  }
  const form = panel.querySelector('form'), input = panel.querySelector('input');
  const save = panel.querySelector('[type=submit]'), reset = panel.querySelector(`[id$="key-reset"]`);
  const status = panel.querySelector(`[id$="key-status"]`);
  let source = 'none', busy = false;
  const setBusy = value => { busy = value; save.disabled = value; reset.disabled = value; };
  const request = async (method = 'GET', key) => {
    if (busy) return;
    setBusy(true);
    status.textContent = method === 'GET' ? 'Checking key settings…' : 'Updating key settings…';
    try {
      const response = await fetch(`/v1/settings/${provider}`, {
        method, cache: 'no-store', signal: AbortSignal.timeout(5000),
        ...(method === 'PUT' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: key }) } : {}),
      });
      if (!response.ok) throw new Error(response.status === 400 ? 'invalid_key' : 'bridge_unavailable');
      const value = await response.json();
      if (!['manual', 'server', 'none'].includes(value.source)) throw new Error('bridge_unavailable');
      source = value.source;
      if(eleven&&value.voice_id)panel.querySelector('#elevenlabs-voice-id').value=value.voice_id;
      if (eleven && value.configured) window.dispatchEvent(new Event('jevvoiceconfigured'));
      status.textContent = source === 'manual' ? `Manual key configured. ${name} validates it on the next request.`
        : source === 'server' ? 'Using the server’s configured key.' : `No key configured. Add a key to enable ${name}.`;
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
