import { isSpaceDocument } from './space-document.js';
import { createDesignerSession, DESIGNER_CAPABILITIES } from './designer-protocol.js';
import { createStudioDocument } from './document.js';

const SETTINGS_KEY = 'river-oaks-studio-agent-v1';
const MAX_MESSAGE = 4000;
const FENCE = /```studio-(edit|next)[^\n]*\n([\s\S]*?)```/g;
const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
const ICONS = {
  sparkle: icon('<path d="M10 3.5c.6 3.6 2.9 5.9 6.5 6.5-3.6.6-5.9 2.9-6.5 6.5-.6-3.6-2.9-5.9-6.5-6.5 3.6-.6 5.9-2.9 6.5-6.5Z"/><path d="M17.5 3v4M15.5 5h4"/>'),
  collapse: icon('<path d="M5 5v14M19 12H9m4-4-4 4 4 4"/>'),
  fresh: icon('<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 15.5h.01M12 15.5h.01M15 15.5h.01"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  send: icon('<path d="M12 19V5m-6 6 6-6 6 6"/>'),
  stop: icon('<rect x="7" y="7" width="10" height="10" rx="1.5"/>'),
  model: icon('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>'),
  chevron: icon('<path d="m8 10 4 4 4-4"/>'),
};

// Splits an agent reply into visible prose, one proposed edit and next-step prompts.
// Unclosed blocks are hidden while a reply is still streaming.
export function parseAgentReply(text, { streaming = false } = {}) {
  let edit = null, editError = null, next = [];
  let body = text.replace(FENCE, (_match, kind, json) => {
    try {
      const value = JSON.parse(json);
      if (kind === 'next' && Array.isArray(value)) next = value.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim().slice(0, 120)).slice(0, 3);
      else if (kind === 'edit' && !edit) edit = value;
    } catch { if (kind === 'edit') editError = 'The agent proposed an edit Studio could not read.'; }
    return '';
  });
  if (streaming) body = body.replace(/```studio-[\s\S]*$/, '');
  return { body: body.trim(), edit, editError, next };
}

// Wraps the agent's operations in the validated designer envelope. A dry run on a
// detached copy derives affected IDs (including new IDs) and declared capabilities.
export function proposalEnvelope(request, edit, doc) {
  if (!edit || typeof edit !== 'object' || Array.isArray(edit) || !Array.isArray(edit.operations)) throw Error('The proposed edit has no operations.');
  const ids = new Set(), capabilities = new Set();
  const dry = createStudioDocument(doc.value);
  for (const op of edit.operations) {
    capabilities.add(`objects.${op?.op}`);
    try {
      if (op?.op === 'add') ids.add(dry.insert(op.type, op.patch));
      else if (op?.op === 'update') { dry.update(op.id, op.patch); ids.add(op.id); }
      else if (op?.op === 'remove') { dry.remove(op.id); ids.add(op.id); }
    } catch { if (typeof op?.id === 'string') ids.add(op.id); }
  }
  return { protocol: request.protocol, requestId: request.requestId, connectionId: request.connectionId, projectId: request.projectId,
    baseRevision: request.baseRevision, baseHash: request.baseHash, packVersion: request.packVersion,
    rationale: typeof edit.rationale === 'string' && edit.rationale.trim() ? edit.rationale.slice(0, 4000) : 'Agent proposal',
    assumptions: [], skillsUsed: [], requiredCapabilities: [...capabilities].filter(cap => DESIGNER_CAPABILITIES.includes(cap)),
    affectedIds: [...ids], operations: edit.operations };
}

export function describeChange(change) {
  const item = change.after ?? change.before, where = item ? ` at ${item.east}, ${item.north} m` : '';
  if (change.op === 'add') return `Add ${item.type} ${change.id}${where}`;
  if (change.op === 'remove') return `Remove ${change.id}`;
  const keys = Object.keys(change.after).filter(key => change.after[key] !== change.before[key]);
  return `Change ${change.id}: ${keys.map(key => `${key} ${change.before[key]} → ${change.after[key]}`).join(', ')}`;
}

export function starterPrompts(doc) {
  if(isSpaceDocument(doc.value))return ['Make the lighting warmer','Refine the furniture layout and keep doorways clear','Give the selected furnishing a walnut finish'];
  const items = doc.items, count = type => items.filter(item => item.type === type).length;
  return [
    count('building') ? 'Review building scale and spacing' : 'Add a landmark building near the arrival',
    count('tree') < 4 ? 'Plant trees along Main Walk' : 'Review planting rhythm and clear routes',
    'Check the arrival and wayfinding',
  ];
}

// Renders a small, safe subset of Markdown with text nodes only.
function renderProse(target, text) {
  target.replaceChildren();
  let list = null;
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (!line.trim()) { list = null; continue; }
    const block = document.createElement(bullet ? 'li' : 'p');
    for (const [index, part] of (bullet ? bullet[1] : line).split(/(`[^`]+`|\*\*[^*]+\*\*)/).entries()) {
      if (!part) continue;
      if (index % 2) { const node = document.createElement(part.startsWith('`') ? 'code' : 'strong'); node.textContent = part.replace(/^(`|\*\*)|(`|\*\*)$/g, ''); block.append(node); }
      else block.append(part);
    }
    if (bullet) { if (!list) { list = document.createElement('ul'); target.append(list); } list.append(block); }
    else { list = null; target.append(block); }
  }
}

export function mountAgentChat(host, { doc, selected, apply, canEdit = () => true, bridge = globalThis.studioAgent, storage = localStorage }) {
  const root = document.createElement('div');
  root.className = 'studio-agent'; root.dataset.open = 'false';
  root.innerHTML = `<form class="studio-agent-pill" data-agent-pill><input data-agent-pill-input maxlength="${MAX_MESSAGE}" placeholder="Describe the scene you imagine…" aria-label="Ask the World Studio agent"><button class="studio-agent-go" aria-label="Open agent chat">${ICONS.sparkle}</button></form>
    <section class="studio-agent-panel" aria-label="World Studio agent" hidden>
      <div class="studio-agent-grip" aria-hidden="true"></div>
      <header class="studio-agent-head"><button type="button" class="studio-agent-icon" data-agent-collapse aria-label="Collapse agent chat" title="Collapse">${ICONS.collapse}</button><h2>TypeSafe River Oaks</h2><button type="button" class="studio-agent-icon" data-agent-fresh aria-label="New chat" title="New chat">${ICONS.fresh}</button></header>
      <div class="studio-agent-log" data-agent-log role="log" aria-live="polite"></div>
      <div class="studio-agent-suggest" data-agent-suggest><p>Suggest next steps</p><ul data-agent-suggestions></ul></div>
      <form class="studio-agent-composer" data-agent-composer>
        <textarea data-agent-input rows="1" maxlength="${MAX_MESSAGE}" placeholder="Ask Agent" aria-label="Message the World Studio agent"></textarea>
        <div class="studio-agent-row">
          <div class="studio-agent-menu-wrap"><button type="button" class="studio-agent-icon" data-agent-plus aria-label="Scene context" aria-expanded="false" title="Scene context">${ICONS.plus}</button>
            <div class="studio-agent-menu" data-agent-menu role="menu" hidden><p>Share with the agent</p><label><input type="radio" name="studio-agent-scope" value="region" checked> Whole scene</label><label><input type="radio" name="studio-agent-scope" value="selection"> Selected object only</label><p data-agent-context-note></p></div></div>
          <label class="studio-agent-select"><span class="studio-agent-model-icon">${ICONS.model}</span><select data-agent-model aria-label="Agent model"></select>${ICONS.chevron}</label>
          <label class="studio-agent-select studio-agent-mode"><select data-agent-edit-mode aria-label="Edit mode"><option value="ask">Ask mode</option><option value="allow">Allow mode</option></select>${ICONS.chevron}</label>
          <button class="studio-agent-send" data-agent-send aria-label="Send">${ICONS.send}</button>
        </div>
      </form>
    </section>`;
  host.append(root);
  const $ = query => root.querySelector(query);
  const panel = $('.studio-agent-panel'), log = $('[data-agent-log]'), input = $('[data-agent-input]');
  let catalog = null, chatId = crypto.randomUUID(), running = null, pending = [], suggestions = null, disposed = false;
  let settings = { model: 'claude:claude-opus-5-5', mode: 'ask' };
  try { const saved = JSON.parse(storage.getItem(SETTINGS_KEY)); if (typeof saved?.model === 'string') settings.model = saved.model; if (['ask','allow'].includes(saved?.mode)) settings.mode = saved.mode; } catch { /* Defaults are fine. */ }
  $('[data-agent-edit-mode]').value = settings.mode;
  const persist = () => { settings = { model: $('[data-agent-model]').value, mode: $('[data-agent-edit-mode]').value }; try { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Preferences are optional. */ } };
  const unsubscribe = bridge?.onDelta?.(({ requestId, text }) => { if (running?.requestId === requestId) { running.text += text; running.draw(); } });

  function scope() { return root.querySelector('input[name=studio-agent-scope]:checked').value; }
  function context() {
    const id = selected(), region = doc.value;
    if (scope() === 'selection' && id) return { documentType: isSpaceDocument(region)?'studio-space':'region', units: 'metres', revision: doc.revision, bounds_m: region.bounds_m, selectedId: id, objects: doc.items.filter(item => item.id === id) };
    // Editable objects plus read-only roads; terrain heights and parcels stay out of the prompt.
    return { documentType: isSpaceDocument(region)?'studio-space':'region', units: 'metres', revision: doc.revision, bounds_m: region.bounds_m, selectedId: id ?? null, objects: doc.items,
      roads: (region.roads??[]).map(({ id: roadId, name, kind, width_m, points }) => ({ id: roadId, name, kind, width_m, points })) };
  }
  function render() {
    const choice = $('[data-agent-model]').value, [providerId] = choice.split(':'), provider = catalog?.providers.find(p => p.id === providerId);
    const ready = Boolean(bridge && provider?.available);
    $('[data-agent-send]').innerHTML = running ? ICONS.stop : ICONS.send;
    $('[data-agent-send]').setAttribute('aria-label', running ? 'Stop the reply' : 'Send');
    $('[data-agent-send]').disabled = !running && (!ready || !input.value.trim());
    $('[data-agent-model]').disabled = Boolean(running) || !catalog; $('[data-agent-edit-mode]').disabled = Boolean(running);
    $('[data-agent-context-note]').textContent = scope() === 'selection' ? (selected() ? `Sharing ${selected()} only.` : 'Select an object before sending.') : `Sharing ${doc.items.length} objects at revision ${doc.revision}.`;
    const items = suggestions ?? starterPrompts(doc);
    $('[data-agent-suggest]').hidden = Boolean(running) || !items.length;
    $('[data-agent-suggestions]').replaceChildren(...items.map(text => {
      const li = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.innerHTML = '<span aria-hidden="true">↳</span>'; button.append(text);
      button.disabled = !ready; button.addEventListener('click', () => send(text)); li.append(button); return li;
    }));
    for (const card of pending) card.refresh();
  }
  function note(text) { const p = document.createElement('p'); p.className = 'studio-agent-note'; p.textContent = text; log.append(p); log.scrollTop = log.scrollHeight; }
  function bubble(role) {
    const node = document.createElement('div'); node.className = `studio-agent-msg studio-agent-${role}`; log.append(node); return node;
  }
  function proposalCard(target, request, session, edit, editError) {
    const card = document.createElement('div'); card.className = 'studio-agent-edit'; target.after(card);
    const title = document.createElement('p'), list = document.createElement('ul'), status = document.createElement('p'), actions = document.createElement('div');
    title.className = 'studio-agent-edit-title'; status.className = 'studio-agent-edit-status'; actions.className = 'studio-agent-edit-actions';
    const applyButton = document.createElement('button'), dismiss = document.createElement('button');
    applyButton.type = dismiss.type = 'button'; applyButton.className = 'studio-agent-apply'; applyButton.textContent = 'Apply as one edit'; dismiss.textContent = 'Dismiss';
    actions.append(applyButton, dismiss); card.append(title, list, status, actions);
    let state = 'pending', appliedRevision = null;
    const entry = { refresh() {
      applyButton.hidden = dismiss.hidden = state !== 'pending';
      applyButton.disabled = !canEdit() || doc.revision !== request.baseRevision;
      if (state === 'pending' && doc.revision !== request.baseRevision) status.textContent = 'The region changed since this proposal. Ask again for a fresh one.';
      else if (state === 'pending' && !canEdit()) status.textContent = 'Return to the editor to apply.';
      else if (state === 'pending') status.textContent = 'Validated against this draft. Nothing changes until you apply.';
    } };
    const finish = text => { state = 'done'; status.textContent = text; pending = pending.filter(item => item !== entry); entry.refresh(); };
    let preview = null;
    try {
      if (editError) throw Error(editError);
      preview = session.preview(proposalEnvelope(request, edit, doc));
      title.textContent = `Proposed edit · ${preview.changes.length} change${preview.changes.length === 1 ? '' : 's'}`;
      list.replaceChildren(...preview.changes.map(change => { const li = document.createElement('li'); li.textContent = describeChange(change); return li; }));
    } catch (error) { title.textContent = 'Proposed edit not applied'; finish(error.message); return; }
    const commit = automatic => {
      try {
        if (!canEdit()) throw Error('Return to the editor before applying changes.');
        session.apply(); appliedRevision = doc.revision; apply();
        finish(automatic ? 'Applied automatically as one edit (Allow mode).' : 'Applied as one edit.');
        const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = 'Undo'; actions.append(undo); undo.hidden = false;
        undo.addEventListener('click', () => { if (doc.revision !== appliedRevision) { status.textContent = 'Later edits exist; use the editor Undo instead.'; return; } doc.undo(); apply(); undo.remove(); status.textContent = 'Undone. Your region is back to how it was.'; });
      } catch (error) { finish(error.message); }
    };
    applyButton.addEventListener('click', () => commit(false));
    dismiss.addEventListener('click', () => { session.cancel(); finish('Dismissed. Your region is unchanged.'); });
    pending.push(entry); entry.refresh();
    if ($('[data-agent-edit-mode]').value === 'allow') commit(true);
  }
  async function send(text) {
    text = (text ?? input.value).trim();
    if (!text || running || !bridge) return;
    if (text.length > MAX_MESSAGE) { note(`Keep messages under ${MAX_MESSAGE} characters.`); return; }
    open(); input.value = ''; autosize(); suggestions = [];
    const [providerId, ...rest] = $('[data-agent-model]').value.split(':'), modelId = rest.join(':');
    renderProse(bubble('user'), text);
    const reply = bubble('agent'); reply.classList.add('studio-agent-streaming');
    const session = createDesignerSession(doc);
    session.connect({ id: chatId, projectId: 'studio-agent', packVersion: 'agent-chat-1', capabilities: DESIGNER_CAPABILITIES });
    let request;
    try { request = session.begin({ brief: text.slice(0,1000), scope: scope()==='selection'?'selection':'region', selectedIds: selected()?[selected()]:[] }); }
    catch(error){reply.remove();note(error.message);render();return;}
    const requestId = crypto.randomUUID();
    running = { requestId, cancel:()=>session.cancel(), reply, text: '', draw() { renderProse(reply, parseAgentReply(this.text, { streaming: true }).body || '…'); log.scrollTop = log.scrollHeight; } };
    running.draw(); render();
    try {
      const result = await bridge.send({ chatId, requestId, providerId, modelId, mode: $('[data-agent-edit-mode]').value, message: text, context: context() });
      if (disposed || running?.requestId !== requestId) return;
      const parsed = parseAgentReply(result.text);
      renderProse(reply, parsed.body || (parsed.edit ? 'Here is a proposed edit.' : '…'));
      suggestions = parsed.next;
      if (parsed.edit || parsed.editError) proposalCard(reply, request, session, parsed.edit, parsed.editError);
    } catch (error) {
      if (disposed || running?.requestId !== requestId) return;
      if (!running.text) reply.remove(); else renderProse(reply, parseAgentReply(running.text, { streaming: true }).body);
      note(String(error?.message || 'The agent could not answer.').replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      suggestions = null;
    } finally {
      if (running?.requestId === requestId) { running = null; reply.classList.remove('studio-agent-streaming'); }
      if (!disposed) { render(); log.scrollTop = log.scrollHeight; }
    }
  }
  function autosize() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; }
  function open() {
    if (root.dataset.open === 'true') return;
    root.dataset.open = 'true'; panel.hidden = false; $('[data-agent-pill]').hidden = true; render(); input.focus();
  }
  function collapse() {
    root.dataset.open = 'false'; panel.hidden = true; $('[data-agent-pill]').hidden = false; $('[data-agent-menu]').hidden = true; $('[data-agent-plus]').setAttribute('aria-expanded', 'false'); $('[data-agent-pill-input]').focus();
  }
  async function load() {
    if (!bridge) { root.querySelector('.studio-agent-select').hidden = true; note('Agent chat runs in the TypeSafe Place desktop app, where it connects to your Claude or Codex CLI. Your draft stays editable here.'); render(); return; }
    try {
      catalog = await bridge.catalog();
      $('[data-agent-model]').replaceChildren(...catalog.providers.map(provider => {
        const group = document.createElement('optgroup'); group.label = provider.available ? `${provider.name} CLI` : `${provider.name} CLI (not found)`;
        group.append(...provider.models.map(model => { const option = document.createElement('option'); option.value = `${provider.id}:${model.id}`; option.textContent = model.label; option.disabled = !provider.available; return option; }));
        return group;
      }));
      const options = [...$('[data-agent-model]').options];
      $('[data-agent-model]').value = options.find(option => option.value === settings.model && !option.disabled)?.value ?? options.find(option => !option.disabled)?.value ?? '';
      if (!catalog.providers.some(provider => provider.available)) note('Neither the Claude nor the Codex CLI was found on this device. Install one and sign in, then reopen Studio.');
    } catch { note('The desktop agent host is unavailable. Restart the app to retry.'); }
    render();
  }
  $('[data-agent-pill]').addEventListener('submit', event => { event.preventDefault(); const text = $('[data-agent-pill-input]').value.trim(); $('[data-agent-pill-input]').value = ''; open(); if (text) void send(text); });
  $('[data-agent-composer]').addEventListener('submit', event => {
    event.preventDefault();
    if (running) {
      const stopped=running;stopped.cancel();running=null;suggestions=null;
      stopped.reply.classList.remove('studio-agent-streaming');
      renderProse(stopped.reply,parseAgentReply(stopped.text,{streaming:true}).body || 'Reply stopped.');
      render();void bridge.cancel({chatId,requestId:stopped.requestId}).catch(()=>{});return;
    }
    void send();
  });
  input.addEventListener('input', () => { autosize(); render(); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('[data-agent-composer]').requestSubmit(); } });
  $('[data-agent-collapse]').addEventListener('click', collapse);
  $('[data-agent-fresh]').addEventListener('click', () => {
    if (running) {running.cancel();void bridge?.cancel({ chatId, requestId: running.requestId }).catch(() => {});}
    void bridge?.reset({ chatId }).catch(() => {});
    chatId = crypto.randomUUID(); running = null; pending = []; suggestions = null; log.replaceChildren(); render(); input.focus();
  });
  $('[data-agent-plus]').addEventListener('click', () => { const menu = $('[data-agent-menu]'); menu.hidden = !menu.hidden; $('[data-agent-plus]').setAttribute('aria-expanded', String(!menu.hidden)); render(); });
  $('[data-agent-menu]').addEventListener('change', render);
  $('[data-agent-model]').addEventListener('change', () => { persist(); render(); });
  $('[data-agent-edit-mode]').addEventListener('change', persist);
  // Keep editor shortcuts (W/E/R/F/Delete) out of the chat; Escape collapses it.
  root.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); if (!$('[data-agent-menu]').hidden) { $('[data-agent-menu]').hidden = true; $('[data-agent-plus]').focus(); } else if (root.dataset.open === 'true') collapse(); }
  });
  void load();
  return {
    open,
    refresh: render,
    dispose() {
      disposed = true; unsubscribe?.();
      if (running) {running.cancel();void bridge?.cancel({ chatId, requestId: running.requestId }).catch(() => {});}
      void bridge?.reset({ chatId }).catch(() => {}); root.remove();
    },
  };
}
