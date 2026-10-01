import { JEV_VOICES, isVoiceId, resolveJevVoice } from './jev-voices.js';

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
    // Jev's voice: a list of named voices, or any ElevenLabs voice ID.
    const voiceForm=document.createElement('form');voiceForm.className='jev-voice-selection';
    const options=JEV_VOICES.map(voice=>`<option value="${voice.id}">${voice.name}${voice.note?` · ${voice.note}`:''}</option>`).join('');
    voiceForm.innerHTML=`<label for="elevenlabs-voice">Jev’s voice</label><select id="elevenlabs-voice">${options}<option value="custom">Custom voice ID…</option></select>
      <div class="jev-voice-custom" hidden><label for="elevenlabs-voice-id">Voice ID</label><input id="elevenlabs-voice-id" maxlength="64" pattern="[A-Za-z0-9]{1,64}" autocomplete="off" spellcheck="false" placeholder="From your ElevenLabs voice library"><button type="submit">Use voice</button></div>
      <p id="elevenlabs-voice-status" role="status" aria-live="polite"></p>`;
    panel.querySelector('.rail-disclosure-body').append(voiceForm);
    const select=voiceForm.querySelector('select'),custom=voiceForm.querySelector('.jev-voice-custom'),idInput=custom.querySelector('input'),voiceStatus=voiceForm.querySelector('#elevenlabs-voice-status');
    let selecting=false;
    const choose=async id=>{
      if(selecting||!isVoiceId(id))return;selecting=true;select.disabled=true;
      voiceStatus.textContent='Updating Jev’s voice…';
      try {
        const response=await fetch('/v1/settings/elevenlabs/voice',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice_id:id}),signal:AbortSignal.timeout(5000)});
        if(!response.ok)throw new Error('Voice could not be selected');
        // The PUT answers with the updated settings: confirm from that, so a
        // transient follow-up failure cannot report a change that already took.
        const value=await response.json();
        if(!isVoiceId(value.voice_id))throw new Error('Voice could not be selected');
        panel.showVoice(value.voice_id);
      }catch{voiceStatus.textContent='Could not update the voice. Check the voice ID and bridge.';}finally{selecting=false;select.disabled=false;}
    };
    select.addEventListener('change',()=>{
      custom.hidden=select.value!=='custom';
      if(select.value==='custom'){idInput.focus();return;}
      choose(select.value);
    });
    voiceForm.addEventListener('submit',event=>{
      event.preventDefault();const id=idInput.value.trim();
      if(!isVoiceId(id)){idInput.setCustomValidity('Enter a voice ID of letters and digits only.');idInput.reportValidity();return;}
      choose(id);
    });
    idInput.addEventListener('input',()=>idInput.setCustomValidity(''));
    // The bridge reports the active voice; reflect it without re-sending it.
    panel.showVoice=id=>{
      const voice=resolveJevVoice(id);if(!voice)return;
      select.value=voice.custom?'custom':voice.id;
      // Show the ID field only when the list has no entry for this voice.
      custom.hidden=select.value!=='custom';
      if(!custom.hidden)idInput.value=voice.id;
      voiceStatus.textContent=`Jev speaks as ${voice.custom?`custom voice ${voice.id}`:voice.name}.`;
    };
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
      if(eleven&&value.voice_id)panel.showVoice(value.voice_id);
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
