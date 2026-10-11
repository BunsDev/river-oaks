// Your companion: the accessible, draft-only workplace panel (#220). Every
// control here works from the keyboard, touch and a screen reader; walking
// to the studio is never required. It reads only the owner's authorized
// projection, renders the saved plan as plain text, and publishes nothing.
import { companionPresentation, TASK_STEPS } from './workplace-contract.js';
import './workplace.css';

const node = (tag, text, className) => { const item = document.createElement(tag);if (text) item.textContent = text;if (className) item.className = className;return item; };
const STEP_LABELS = {reading_brief: 'Reading your brief', checking_places: 'Checking public meeting places', drafting_plan: 'Drafting options', validating: 'Checking the plan'};
const REASONS = {grant_revoked: 'Stopped because you revoked permission.', grant_expired: 'Stopped because the permission expired.', access_revoked: 'Stopped because this account can no longer use the town.', owner_cancelled: 'You cancelled it.', deadline: 'It ran out of time.',
  worker_lost: 'The service lost track of it, so it stopped safely.', budget_exceeded: 'It hit its limit.', artifact_limit: 'You have three saved plans; delete one first.',
  no_venues: 'No public meeting places were available.', invalid_artifact: 'The result failed its checks, so nothing was saved.'};
const date = value => new Date(value).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
const list = (value = '') => value.split(',').map(item => item.trim()).filter(Boolean);

export function createWorkplaceUI({panel, request, connected}) {
  const section = node('section', null, 'workplace');section.setAttribute('aria-labelledby', 'workplace-title');
  const title = node('h3', 'Your companion');title.id = 'workplace-title';
  const note = node('p', 'Test feature: a practice companion that drafts plans. Nothing is published or sent.', 'workplace-note');
  const live = node('div', null, 'workplace-live');
  const status = node('p', null, 'workplace-status');status.setAttribute('role', 'status');
  // The brief form persists across refreshes so typing is never interrupted.
  const brief = node('form', null, 'workplace-brief');brief.hidden = true;brief.setAttribute('aria-labelledby', 'workplace-brief-title');
  const briefTitle = node('h4', 'What should the plan be for?');briefTitle.id = 'workplace-brief-title';
  const field = (label, name, attributes = {}) => {
    const wrap = node('label', null, 'workplace-field'), input = node('input');
    Object.assign(input, {name, autocomplete: 'off', ...attributes});wrap.append(node('span', label), input);return [wrap, input];
  };
  const [purposeField, purpose] = field('Purpose', 'purpose', {required: true, maxLength: 160, placeholder: 'A small welcome for a new neighbour'});
  const [honorField, honor] = field('Guest of honor (optional)', 'guestOfHonor', {maxLength: 60});
  const [likesField, likes] = field('What they enjoy (optional, comma separated)', 'preferences', {maxLength: 400});
  const [limitsField, limits] = field('Anything to respect (optional, comma separated)', 'constraints', {maxLength: 400});
  const [guestsField, guests] = field('People including you', 'guests', {type: 'number', min: 2, max: 32, value: 6, inputMode: 'numeric'});
  const submit = node('button', 'Ask for a draft plan');submit.type = 'submit';
  brief.append(briefTitle, purposeField, honorField, likesField, limitsField, guestsField, submit);
  const plan = node('article', null, 'workplace-plan');plan.hidden = true;plan.tabIndex = -1;plan.setAttribute('aria-labelledby', 'workplace-plan-title');
  section.append(title, note, live, brief, plan, status);
  const anchor = panel.querySelector('.multiplayer-groups') ?? panel.querySelector('.multiplayer-social');
  if (anchor) anchor.after(section);else panel.append(section);
  let state = null, timer = null, disposed = false, busy = false, rendered = '', opened = null;
  const say = message => { status.textContent = message; };
  async function act(action, data, success) {
    if (busy) { say('Still saving your last change. Try again in a moment.');return null; }
    busy = true;say('');
    // Release before re-rendering, so the next control a player reaches works at once.
    try { const result = await request(action, data);busy = false;if (result.state) apply(result.state);if (success) say(success);return result; }
    catch (error) { busy = false;say(error.message);return null; }
    finally { busy = false;schedule(); }
  }
  const button = (caption, onClick, key, label) => { const control = node('button', caption);control.type = 'button';control.dataset.focusKey = key;if (label) control.setAttribute('aria-label', label);control.addEventListener('click', onClick);return control; };
  function render() {
    const focusKey = live.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    const parts = [];
    if (!state.companion) {
      const form = node('form', null, 'workplace-create');
      const [nameField, name] = field('Name your companion', 'name', {required: true, maxLength: 32});
      const create = node('button', 'Bring a companion');create.type = 'submit';create.dataset.focusKey = 'create';
      form.append(nameField, create);
      form.addEventListener('submit', event => { event.preventDefault();void act('companion', {name: name.value.trim()}, `${name.value.trim()} is with you.`); });
      parts.push(node('p', 'A companion can draft a plan while you explore. It works only with the permission you give it.'), form);
    } else {
      const task = state.tasks.at(-1) ?? null, active = task && ['queued', 'running', 'paused'].includes(task.status);
      // A deleted draft is no longer waiting for review.
      const kept = task?.status !== 'completed' || state.artifacts.some(artifact => artifact.id === task.artifactId);
      const presentation = companionPresentation(state.companion.presence, kept ? task : null);
      const who = node('div', null, 'workplace-who');
      who.append(node('strong', state.companion.name), node('span', ` · ${presentation.label}`));
      const where = node('div', null, 'workplace-actions');where.setAttribute('role', 'group');where.setAttribute('aria-label', 'Where your companion is');
      const mode = state.companion.presence.mode;
      if (mode !== 'stationed') where.append(button('Go to a desk', () => void act('presence', {mode: 'stationed'}, 'Your companion took a desk in the studio.'), 'stationed'));
      if (mode !== 'accompanying') where.append(button('Walk with me', () => void act('presence', {mode: 'accompanying'}, 'Your companion is with you.'), 'accompanying'));
      if (mode !== 'offstage') where.append(button('Take a break', () => void act('presence', {mode: 'offstage'}, 'Your companion stepped away. Any draft keeps going without you.'), 'offstage'));
      parts.push(who, where);
      // The offer is a choice; declining or "not tonight" costs nothing.
      const offer = state.offer.state;
      if (['offered', 'declined', 'deferred'].includes(offer)) {
        const card = node('div', null, 'workplace-card');card.setAttribute('role', 'group');card.setAttribute('aria-label', 'Planning offer');
        card.append(node('p', offer === 'offered' ? 'A neighbour could use help planning a small gathering. Want your companion to draft a plan? You decide what happens with it.'
          : offer === 'deferred' ? 'Not tonight. The offer stays open whenever you want it.' : 'You said no thanks. You can still change your mind.'));
        const choices = node('div', null, 'workplace-actions');
        choices.append(button('Help with a plan', () => void act('offer', {decision: 'accept'}, 'Thanks. Give permission and a brief below.'), 'accept'));
        if (offer === 'offered') choices.append(button('Not tonight', () => void act('offer', {decision: 'defer'}, 'No problem.'), 'defer'), button('No thanks', () => void act('offer', {decision: 'decline'}, 'Understood.'), 'decline'));
        card.append(choices);parts.push(card);
      }
      // Plain-language permission card: exactly what this grant can do.
      const permission = node('div', null, 'workplace-card');permission.setAttribute('role', 'group');permission.setAttribute('aria-label', 'Permission');
      const terms = node('ul', null, 'workplace-terms');
      for (const line of ['Can read: public meeting places in this world and the brief you write.', 'Can write: a private draft only you can see.', 'Cannot: publish, invite, message anyone or spend money.'])
        terms.append(node('li', line));
      permission.append(node('h4', 'Permission'), terms);
      if (state.grant?.active) {
        permission.append(node('p', `Allowed until ${date(state.grant.expiresAt)}.`),
          button('Revoke permission', () => void act('revoke', {grantId: state.grant.id, expectedRevision: state.grant.revision}, 'Permission revoked. Any running draft stopped.'), 'revoke'));
      } else permission.append(button('Allow drafting for 7 days', () => void act('grant', {scope: 'event_plan'}, 'Drafting allowed.'), 'grant'));
      parts.push(permission);
      if (task) {
        const card = node('div', null, 'workplace-card');card.setAttribute('role', 'group');card.setAttribute('aria-label', 'Current task');
        const stepIndex = task.checkpoints.length;
        const line = task.status === 'running' ? `Step ${Math.min(stepIndex + 1, TASK_STEPS.length)} of ${TASK_STEPS.length}: ${STEP_LABELS[TASK_STEPS[Math.min(stepIndex, TASK_STEPS.length - 1)]]}.`
          : task.status === 'queued' ? 'Waiting to start.' : task.status === 'paused' ? 'Paused. Nothing is happening until you resume.'
          : task.status === 'completed' ? (kept ? 'Finished. The draft is saved below.' : 'Finished. You deleted this draft.') : `${task.status === 'failed' ? 'Failed' : 'Stopped'}. ${REASONS[task.reason] ?? ''}`;
        card.append(node('h4', `Draft: ${task.brief.purpose}`), node('p', line));
        const controls = node('div', null, 'workplace-actions');
        if (['queued', 'running'].includes(task.status)) controls.append(button('Pause', () => void act('pause', {taskId: task.id}, 'Paused.'), 'pause'));
        if (task.status === 'paused') controls.append(button('Resume', () => void act('resume', {taskId: task.id}, 'Resumed.'), 'resume'));
        if (active) controls.append(button('Cancel', () => void act('cancel', {taskId: task.id}, 'Cancelled. Nothing was saved.'), 'cancel'));
        if (controls.children.length) card.append(controls);
        parts.push(card);
      }
      brief.hidden = !(state.grant?.active && !active);
      if (state.artifacts.length) {
        const saved = node('div', null, 'workplace-card');saved.setAttribute('role', 'group');saved.setAttribute('aria-label', 'Saved drafts');
        saved.append(node('h4', 'Saved drafts'), node('p', `Private to you. Kept ${state.limits.retentionDays} days unless you delete them.`, 'workplace-note'));
        for (const artifact of state.artifacts) {
          const row = node('div', null, 'workplace-row');
          row.append(node('span', `${artifact.title} · ${date(artifact.createdAt)}`),
            button('Open', () => void open(artifact.id), `open-${artifact.id}`, `Open ${artifact.title}`),
            button('Delete', () => void act('delete', {artifactId: artifact.id}, 'Draft deleted.').then(result => { if (result && opened === artifact.id) closePlan(); }), `delete-${artifact.id}`, `Delete ${artifact.title}`));
          saved.append(row);
        }
        parts.push(saved);
      }
    }
    live.replaceChildren(...parts);
    if (focusKey) live.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({preventScroll: true});
  }
  function apply(next) {
    const before = state;state = next;
    // One announcement per outcome; the server deduplicates notices too.
    for (const notice of next.notices) if (!before?.notices.some(item => item.id === notice.id))
      say(notice.kind === 'result_ready' ? 'Your draft plan is ready to review.' : 'Your companion stopped a task. Details are below.');
    const serialized = JSON.stringify(next);if (serialized === rendered) return;rendered = serialized;render();
  }
  function closePlan() { plan.hidden = true;plan.replaceChildren();opened = null; }
  async function open(artifactId) {
    const result = await act('artifact', {artifactId});if (!result?.artifact) return;
    const {plan: draft, receipt} = result.artifact;opened = artifactId;
    const section = (heading, items) => { const block = node('section');const list = node('ul');for (const item of items) list.append(node('li', item));block.append(node('h5', heading), list);return block; };
    const heading = node('h4', draft.title);heading.id = 'workplace-plan-title';
    const recommended = draft.options.find(option => option.placeId === draft.recommendation.placeId);
    plan.replaceChildren(heading, node('p', 'Draft only. Nothing has been published and nobody has been invited.', 'workplace-note'),
      node('p', `Suggested: ${recommended.placeName}. ${draft.recommendation.reason}`),
      section('Options', draft.options.map(option => `${option.placeName}: ${option.why}`)),
      section('Agenda', draft.agenda), section('Worth considering', draft.considerations), section('Still needs your decision', draft.questions),
      section('What actually ran', [`${receipt.steps.length} steps, ${receipt.turns} turns, ${receipt.toolCalls} read of public places.`, `External writes: ${receipt.externalWrites}. Paid calls: ${receipt.paidCalls}.`, `Finished ${date(receipt.finishedAt)}.`]),
      button('Close draft', () => { closePlan();live.querySelector(`[data-focus-key="open-${CSS.escape(artifactId)}"]`)?.focus(); }, 'close-plan'));
    plan.hidden = false;plan.focus();
    const notice = state.notices.find(item => item.taskId === result.artifact.taskId && item.kind === 'result_ready');
    if (notice) void act('ack', {noticeId: notice.id});
  }
  brief.addEventListener('submit', event => {
    event.preventDefault();
    const data = {purpose: purpose.value.trim(), guestOfHonor: honor.value.trim(), preferences: list(likes.value), constraints: list(limits.value), guests: Number(guests.value)};
    void act('submit', {brief: data, requestId: crypto.randomUUID().replaceAll('-', '')}, 'Your companion started a draft. You can explore while it works.').then(result => { if (result) brief.reset(); });
  });
  function schedule() {
    clearTimeout(timer);if (disposed) return;
    const running = state?.tasks.some(task => ['queued', 'running'].includes(task.status));
    timer = setTimeout(() => void refresh(), running ? 2000 : 15000);
  }
  async function refresh() {
    if (disposed || busy) return schedule();
    if (!connected() || document.visibilityState === 'hidden') return schedule();
    try { const result = await request('state');if (!disposed && result.state) apply(result.state); }
    catch { /* The next refresh retries; the panel keeps its last known state. */ }
    schedule();
  }
  return {refresh, dispose() { disposed = true;clearTimeout(timer);section.remove(); }};
}
