import { createDesignerSession } from './designer-protocol.js';

const SETTINGS_KEY = 'river-oaks-studio-designer-v1';
export function mountDesignerPanel(host, { doc, selected, apply, canEdit = () => true, bridge = globalThis.worldDesigner, storage = localStorage }) {
  const panel = document.createElement('aside');
  panel.className = 'studio-designer'; panel.hidden = true; panel.setAttribute('aria-label', 'World Designer');
  panel.innerHTML = `<div class="studio-panel-title"><div><p class="studio-caption">Your world-building partner</p><h2>World Designer</h2></div><button data-close aria-label="Close World Designer">×</button></div>
    <p data-state role="status" aria-live="polite">Choose how you want to design.</p>
    <section data-setup><label>Design partner<select data-path><option value="familiar">Dedicated design familiar</option><option value="general">General design agent</option></select></label>
    <p data-path-note>A dedicated identity for this world, with its own declared design role.</p>
    <label data-name-label>Familiar name<input data-name maxlength="48" value="World Designer"></label>
    <label>Runtime<select data-runtime></select></label><p data-runtime-note></p>
    <details><summary>World Design skill pack</summary><p data-pack></p><ul data-skills></ul><p>Installed skills provide guidance. They do not establish that a design check was performed.</p></details>
    <button data-connect class="studio-primary">Set up and connect</button></section>
    <section data-connected hidden><p data-identity></p><button data-disconnect>Disconnect</button></section>
    <label>Project brief<textarea data-brief rows="3" maxlength="2000" placeholder="Purpose, audience, style, references and constraints"></textarea></label>
    <label>Share with the designer<select data-scope><option value="selection">Selected object only</option><option value="region">Whole region</option></select></label>
    <p data-context class="studio-caption"></p><p class="studio-caption">The brief and chosen scene context are shared when you send. No screenshots or unrelated project memory are attached.</p>
    <label>Design task<textarea data-task rows="3" maxlength="1000" placeholder="Review the arrival and propose clearer wayfinding"></textarea></label>
    <div class="studio-designer-actions"><button data-send class="studio-primary" disabled>Ask designer</button><button data-cancel disabled>Cancel</button></div>
    <p class="studio-caption">Supports buildings, trees, places and arrival. Roads and terrain can be reviewed and preserved.</p>
    <section data-preview hidden><h3>Proposed changes</h3><p data-rationale></p><pre data-diff></pre><p data-evidence></p><div class="studio-designer-actions"><button data-apply class="studio-primary">Apply as one edit</button><button data-reject>Reject</button></div></section>`;
  host.append(panel);
  const $ = query => panel.querySelector(query), session = createDesignerSession(doc);
  let connection = null, busy = false, generation = 0, requestId = null, catalog = null, opener = null;
  const events = new AbortController();
  let settings = { projectId: crypto.randomUUID(), brief: '', name: 'World Designer', mode: 'familiar' };
  try { const saved = JSON.parse(storage.getItem(SETTINGS_KEY)); if (saved && /^[\w-]{1,100}$/.test(saved.projectId) && typeof saved.brief === 'string' && saved.brief.length <= 8000) settings = { projectId: saved.projectId, brief: saved.brief.slice(0, 2000), name: typeof saved.name === 'string' ? saved.name : 'World Designer', mode: saved.mode === 'general' ? 'general' : 'familiar' }; } catch { /* Use a fresh project context; never repair exported region data. */ }
  $('[data-brief]').value = settings.brief; $('[data-name]').value = settings.name; $('[data-path]').value = settings.mode;
  const say = text => { $('[data-state]').textContent = text; };
  function persist() { settings.brief = $('[data-brief]').value; settings.name = $('[data-name]').value; settings.mode = $('[data-path]').value; try { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; } catch { say('Project preferences could not be saved. Your region is unchanged.'); return false; } }
  function render() {
    $('[data-setup]').hidden = Boolean(connection); $('[data-connected]').hidden = !connection;
    $('[data-send]').disabled = !connection || busy || !canEdit(); $('[data-apply]').disabled = !canEdit(); $('[data-cancel]').disabled = !busy;
    $('[data-connect]').disabled = !bridge || busy || !catalog?.runtimes?.length;
    $('[data-path]').disabled = busy; $('[data-runtime]').disabled = busy;
    $('[data-context]').textContent = `${$('[data-scope]').value === 'region' ? `${doc.items.length} objects` : selected() ? `Selected: ${selected()}` : 'No object selected'} · document revision ${doc.revision} · metres`;
    if (connection) $('[data-identity]').textContent = `${connection.name} · ${connection.role} · ${connection.instanceName || 'General agent'} · pack ${connection.packVersion}`;
  }
  function invalidate() { generation++; session.cancel(); $('[data-preview]').hidden = true; if (requestId) void bridge?.cancel({ connectionId: connection?.id, requestId }).catch(() => {}); requestId = null; busy = false; render(); }
  async function load() {
    if (!bridge) { say('Designer connections are available in the Electron desktop editor. Your browser draft remains usable.'); render(); return; }
    try {
      catalog = await bridge.catalog();
      $('[data-pack]').textContent = `Version ${catalog.packVersion}. Available guidance:`;
      $('[data-skills]').replaceChildren(...catalog.skills.map(name => { const li = document.createElement('li'); li.textContent = name; return li; }));
      $('[data-runtime]').replaceChildren(...catalog.runtimes.map(runtime => { const option = document.createElement('option'); option.value = runtime.id; option.textContent = runtime.name; return option; }));
      runtimeNote(); render();
    } catch { say('The desktop designer host is unavailable. Check its local runtime configuration.'); }
  }
  function runtimeNote() { const runtime = catalog?.runtimes?.find(r => r.id === $('[data-runtime]').value); $('[data-runtime-note]').textContent = runtime?.description || 'Configure a runtime in desktop host settings.'; }
  $('[data-runtime]').addEventListener('change', runtimeNote);
  $('[data-path]').addEventListener('change', () => { const familiar = $('[data-path]').value === 'familiar'; $('[data-name-label]').hidden = !familiar; $('[data-path-note]').textContent = familiar ? 'A dedicated identity for this world, with its own declared design role.' : 'The same design skills and editor tools, without a familiar identity or personal memory.'; });
  $('[data-brief]').addEventListener('change', () => { persist(); invalidate(); });
  $('[data-scope]').addEventListener('change', () => { invalidate(); render(); });
  $('[data-connect]').addEventListener('click', async () => {
    invalidate(); if (!persist()) return; busy = true; const token = generation; render(); say('Verifying runtime, identity and installed skills…');
    try {
      const result = await bridge.connect({ mode: $('[data-path]').value, name: $('[data-name]').value, runtimeId: $('[data-runtime]').value, projectId: settings.projectId });
      if (token !== generation) { await bridge.disconnect({ connectionId: result.id }); return; }
      if (result.projectId !== settings.projectId || result.packVersion !== catalog.packVersion || result.packVerified !== true) throw Error('Identity or skill verification did not complete.');
      session.connect(result); connection = result; say('Ready locally. Provider authentication is unverified until a task succeeds.');
    } catch (error) { say(error.message || 'Connection failed. Retry after checking the desktop runtime.'); }
    finally { if (token === generation) { busy = false; render(); } }
  });
  $('[data-disconnect]').addEventListener('click', async () => { const old = connection; invalidate(); session.disconnect(); connection = null; render(); try { await bridge.disconnect({ connectionId: old.id }); say('Disconnected. Context sharing has stopped.'); } catch { say('Disconnected locally; the host could not confirm shutdown.'); } });
  $('[data-send]').addEventListener('click', async () => {
    invalidate(); persist(); const token = generation;
    try {
      const request = session.begin({ brief: $('[data-task]').value, projectBrief: settings.brief, scope: $('[data-scope]').value, selectedIds: selected() ? [selected()] : [] });
      requestId = request.requestId; busy = true; render(); say('Waiting for the designer. Provider usage may be billed by your configured runtime.');
      const response = await bridge.request(request);
      if (token !== generation) return;
      const preview = session.preview(response); $('[data-rationale]').textContent = preview.rationale;
      $('[data-diff]').textContent = preview.changes.map(change => `${change.op.toUpperCase()} ${change.id}\nBefore: ${JSON.stringify(change.before)}\nAfter: ${JSON.stringify(change.after)}`).join('\n\n');
      $('[data-evidence]').textContent = `Reported skills: ${preview.skillsUsed.join(', ') || 'none'}. Assumptions: ${preview.assumptions.join('; ') || 'none reported'}. These are agent reports, not independent checks.`;
      $('[data-preview]').hidden = false; say('Provider responded. Proposal validated; review before applying.');
    } catch (error) { if (token === generation) say(error.message || 'The designer request failed.'); }
    finally { if (token === generation) { busy = false; requestId = null; render(); } }
  });
  $('[data-cancel]').addEventListener('click', () => { invalidate(); say('Canceled. Late responses cannot change this draft.'); });
  $('[data-reject]').addEventListener('click', () => { invalidate(); say('Proposal rejected. Your draft is unchanged.'); });
  $('[data-apply]').addEventListener('click', () => { try { if (!canEdit()) throw Error('Return to the editor before applying changes.'); session.apply(); $('[data-preview]').hidden = true; apply(); say('Applied as one edit. Undo restores the previous region.'); } catch (error) { invalidate(); say(error.message); } });
  const close = () => { panel.hidden = true; opener?.focus(); };
  $('[data-close]').addEventListener('click', close);
  panel.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(); } });
  $('[data-path]').dispatchEvent(new Event('change'));
  render();
  return {
    open(button) { opener = button; panel.hidden = false; $('[data-close]').focus(); render(); if (!catalog) void load(); },
    changed() { invalidate(); },
    refresh() { render(); },
    dispose() { invalidate(); events.abort(); if (connection) void bridge.disconnect({ connectionId: connection.id }).catch(() => {}); panel.remove(); },
  };
}
