import { COMMUNITY_SCENARIOS, createCommunity, stepCommunity, interactWithLocal, chooseCommunityScenario, snapshotForLocal, applyLocalReaction } from './community.js';
import './community.css';
import { createLocalSpeech } from './speech.js';
import { conversationLine } from './personas.js';

const time = (seconds) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
const terminal = (state) => ['success', 'failed'].includes(state.status);
const text = (element, value) => { if (element.textContent !== value) element.textContent = value; };

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content) element.textContent = content;
  return element;
}

function button(label, id, className = '') {
  const element = node('button', className, label);
  element.type = 'button';
  element.id = id;
  return element;
}

export function createCommunityPanel({ host, onFocus = () => {}, getEconomy = () => null }) {
  let state = null, request = null, requestEpoch = 0, tick = 0, lastPaint = -Infinity, previousFocus = null;
  let message = '', attribution = 'Authored dialogue · local reaction';
  const section = node('section', 'panel-section community-section');
  section.id = 'community-section';
  const heading = node('div', 'section-label', 'People & place');
  heading.append(node('span', '', 'Fictional locals'));
  const intro = node('p', 'community-intro', 'Stop for a conversation. Lend a hand.');
  const voiceLabel = node('label', 'community-label', 'Spoken dialogue'); voiceLabel.htmlFor = 'community-voice';
  const voiceMode = node('select', 'community-select'); voiceMode.id = 'community-voice';
  for (const [value,label] of [['off','Off · captions only'],['kokoro','Kokoro · local neural voices'],['device','Device voices · local only']]) { const option=node('option','',label); option.value=value; voiceMode.append(option); }
  const voiceStatus = node('p','community-voice-status','Muted · no speech is generated'); voiceStatus.id='community-voice-status'; voiceStatus.setAttribute('role','status');
  const speech = createLocalSpeech(status => { voiceStatus.textContent = status; });
  const chooserLabel = node('label', 'community-label', 'Meet a local');
  chooserLabel.htmlFor = 'community-local';
  const chooser = node('select', 'community-select');
  chooser.id = 'community-local';
  const meet = button('Meet a local', 'community-meet', 'community-primary');
  meet.disabled = true;
  const scenarioLabel = node('label', 'community-label', 'Community scenario');
  scenarioLabel.htmlFor = 'community-scenario';
  const scenarioSelect = node('select', 'community-select');
  scenarioSelect.id = 'community-scenario';
  for (const [key, scenario] of Object.entries(COMMUNITY_SCENARIOS)) {
    const option = node('option', '', scenario.title);
    option.value = key;
    scenarioSelect.append(option);
  }
  const description = node('p', 'quiet-note community-description');
  const controls = node('div', 'community-controls');
  const run = button('Begin scenario', 'community-run', 'community-primary');
  const reset = button('Reset', 'community-reset');
  run.disabled = true;
  reset.disabled = true;
  controls.append(run, reset);
  const progress = node('p', 'community-progress');
  progress.id = 'community-progress';
  const resources = node('p', 'community-resources');
  resources.id = 'community-resources';
  const outcome = node('p', 'community-outcome');
  outcome.id = 'community-outcome';
  outcome.setAttribute('role', 'status');
  const clockNote = node('p', 'quiet-note community-disclaimer', 'Fictional people and scenarios. No real needs or outcomes are inferred. 1 second = 1 simulation minute; the clock runs only during a scenario.');
  section.append(heading, intro, chooserLabel, chooser, meet, voiceLabel, voiceMode, voiceStatus, scenarioLabel, scenarioSelect, description, controls, progress, resources, outcome, clockNote);
  host.append(section);

  const dialogue = node('section', 'community-dialogue');
  dialogue.id = 'community-dialogue';
  dialogue.hidden = true;
  dialogue.setAttribute('role', 'dialog');
  dialogue.setAttribute('aria-labelledby', 'community-name');
  const top = node('div', 'community-dialogue-top');
  const identity = node('div');
  const portrayalLabel = node('span', 'community-kicker', 'A fictional encounter');
  identity.append(portrayalLabel);
  const name = node('h2');
  name.id = 'community-name';
  identity.append(name);
  const close = button('×', 'community-close', 'community-close');
  close.setAttribute('aria-label', 'Close conversation');
  top.append(identity, close);
  const role = node('p', 'community-role');
  const dialogueText = node('p', 'community-speech');
  dialogueText.id = 'community-speech';
  dialogueText.setAttribute('role', 'status');
  const source = node('p', 'community-attribution');
  source.id = 'community-attribution';
  const topics = node('div', 'community-topics');
  topics.setAttribute('aria-label', 'Conversation topics');
  const about = button('What brings you here?', 'community-about');
  const district = button('Tell me about the district', 'community-district');
  const story = button('Share a local perspective', 'community-story');
  const replay = button('Replay voice', 'community-replay');
  const biography = node('a','community-biography','Public biography ↗'); biography.target='_blank'; biography.rel='noreferrer'; biography.hidden=true;
  topics.append(about, district, story, replay, biography);
  const needLabel = node('p', 'community-need-label');
  const meter = node('progress', 'community-need');
  meter.max = 100;
  meter.setAttribute('aria-label', 'Unmet need; higher means more urgent');
  const support = node('p', 'community-support');
  support.id = 'community-support';
  const actions = node('div', 'community-dialogue-actions');
  const ask = button('Ask needs', 'community-ask');
  const supply = button('Offer supplies', 'community-supply');
  const dispatch = button('Dispatch help', 'community-dispatch');
  actions.append(ask, supply, dispatch);
  const mission = node('p', 'community-mission');
  mission.id = 'community-mission';
  const next = button('Meet another neighbor →', 'community-next', 'community-next');
  const note = node('p', 'community-dialogue-note', 'Dialogue is authored. Jev can choose an immediate greeting or weather reaction; support outcomes follow local simulation rules.');
  dialogue.append(top, role, dialogueText, source, topics, needLabel, meter, support, actions, mission, next, note);
  (document.querySelector('#viewport') ?? host).append(dialogue);

  const invalidate = () => {
    speech.cancel();
    requestEpoch += 1;
    request?.abort();
    request = null;
  };
  const orderedLocals = () => [...(state?.locals ?? [])].sort((a, b) => Number(b.priority && b.status === 'needs_help') - Number(a.priority && a.status === 'needs_help') || a.id.localeCompare(b.id));
  const rebuildChooser = () => {
    chooser.replaceChildren(...orderedLocals().map((local) => {
      const option = node('option', '', `${local.name} · ${local.anchorName}${local.priority ? ' · request open' : ''}`);
      option.value = local.id;
      return option;
    }));
    if (state.selectedId) chooser.value = state.selectedId;
  };

  const paint = () => {
    if (!state) return;
    const finished = terminal(state);
    const remaining = state.scenario.duration - state.elapsed;
    scenarioSelect.value = state.scenarioKey;
    text(description, state.scenario.description);
    text(run, finished ? 'Scenario ended' : state.running ? 'Pause scenario' : state.elapsed > 0 ? 'Resume scenario' : 'Begin scenario');
    run.disabled = finished || !state.locals.length;
    run.setAttribute('aria-pressed', String(state.running));
    text(progress, `${state.supported} / ${state.target} neighbors supported · ${time(remaining)} sim left`);
    text(resources, `${state.supplies} kits · ${state.helpBudget} volunteer visits left · ${state.jobs.length} en route`);
    const mode = state.storm && state.running ? 'Storm hold: volunteer visits pause; unmet needs still grow.' : state.running ? 'Check needs, then choose how to spend shared resources.' : state.elapsed > 0 ? 'Paused. Needs and volunteer progress are frozen.' : 'Ready when you are. Meet the neighbors before starting.';
    text(outcome, state.result ?? mode);
    outcome.dataset.state = state.status;
    const local = state.locals.find((item) => item.id === state.selectedId);
    if (!local || dialogue.hidden) return;
    const job = state.jobs.find((item) => item.localId === local.id);
    text(name, local.name);
    text(portrayalLabel, local.persona?.portrayal ? local.persona.era === 'historical' ? 'Fictional portrayal · heritage encounter' : 'Fictional portrayal · no endorsement' : 'Fictional River Oaks resident');
    biography.hidden = !local.persona?.source;
    if (local.persona?.source) biography.href=local.persona.source;
    replay.disabled = speech.mode === 'off';
    text(role, `${local.role} · ${local.anchorName}`);
    text(dialogueText, message);
    text(source, attribution);
    text(needLabel, local.status === 'supported' ? 'Supported · request resolved' : local.status === 'unmet' ? 'Support window missed' : local.needKnown ? local.priority ? `${state.scenario.need} · ${Math.round(local.need)} / 100 unmet need` : 'No support request' : 'Ask to learn what would help');
    meter.hidden = !local.needKnown || !local.priority;
    meter.value = local.need;
    meter.dataset.urgency = local.need >= 75 ? 'high' : 'normal';
    const cooldown = Math.max(0, local.cooldownUntil - state.elapsed);
    const progressText = job ? state.storm ? 'Volunteer visit held by the service-economy storm.' : `Volunteer visit ${Math.round(job.progress / job.duration * 100)}% complete. Needs keep growing until arrival.` : local.status === 'supported' ? 'Your support resolved this fictional request.' : finished ? state.result : !state.running ? 'Begin the scenario to offer supplies or dispatch help.' : cooldown > 0 ? `Next supply delivery available in ${time(cooldown)} sim.` : `Supply delivery: ${state.scenario.supplyCost} kits, −${state.scenario.supplyRelief} need. Volunteer visit: 1 visit, about ${time(state.scenario.dispatchSeconds)} sim at baseline staffing.`;
    text(support, progressText);
    ask.disabled = local.needKnown || Boolean(request);
    text(ask, local.needKnown ? 'Needs checked' : 'Ask needs');
    const canSupport = state.running && !finished && local.needKnown && local.priority && local.status === 'needs_help';
    supply.disabled = !canSupport || cooldown > 0 || state.supplies < state.scenario.supplyCost;
    dispatch.disabled = !canSupport || state.helpBudget < 1;
    text(supply, `Offer supplies · ${state.scenario.supplyCost} kits`);
    text(dispatch, job ? 'Help is on the way' : 'Dispatch help · 1 visit');
    text(mission, `${state.scenario.title} · ${state.supported}/${state.target} supported · ${state.supplies} kits · ${state.helpBudget} visits left`);
  };

  const selectLocal = (id) => {
    const local = state?.locals.find((item) => item.id === id);
    if (!local) return false;
    invalidate();
    if (dialogue.hidden) previousFocus = document.activeElement;
    state.selectedId = id;
    chooser.value = id;
    message = conversationLine(local, 'greeting');
    attribution = `Authored dialogue · ${local.source === 'jev' ? 'Jev' : 'local'} reaction`;
    dialogue.hidden = false;
    onFocus(local);
    paint();
    close.focus({ preventScroll: true });
    speech.speak(local, message);
    return true;
  };

  const react = async (id, topic = 'ask') => {
    if (request) return;
    const packet = snapshotForLocal(state, id, topic, ++tick);
    if (!packet) return;
    const controller = new AbortController();
    request = controller;
    const epoch = requestEpoch, currentState = state;
    const context = { generation: state.generation, tick: packet.tick };
    const fallback = { schema_version: 1, tick: packet.tick, latency_ms: 0, decisions: [{ id, action: state.storm ? 'seek_shelter' : 'greet', source: 'local_rules' }] };
    const current = () => epoch === requestEpoch && state === currentState && context.generation === state.generation && state.selectedId === id;
    attribution = 'Authored dialogue · checking immediate reaction…';
    paint();
    let deadline;
    try {
      const response = await Promise.race([
        fetch('/v1/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet), signal: controller.signal }).then((reply) => {
          if (!reply.ok) throw new Error('Reaction unavailable');
          return reply.json();
        }),
        new Promise((_, reject) => { deadline = setTimeout(() => { controller.abort(); reject(new Error('Reaction expired')); }, 1800); }),
      ]);
      if (!current()) return;
      if (!applyLocalReaction(state, id, response, context)) throw new Error('Invalid reaction');
      const local = state.locals.find((item) => item.id === id);
      const label = local.source === 'jev' ? 'Jev reaction' : local.source === 'safety_override' ? 'local safety reaction' : 'local reaction';
      attribution = `Authored dialogue · ${label}: ${local.action.replaceAll('_', ' ')}`;
    } catch {
      if (!current()) return;
      applyLocalReaction(state, id, fallback, context);
      attribution = 'Authored dialogue · local fallback reaction';
    } finally {
      clearTimeout(deadline);
      if (request === controller) request = null;
      if (current()) paint();
    }
  };

  const interact = (action) => {
    if (!state?.selectedId) return;
    const result = interactWithLocal(state, state.selectedId, action);
    message = result.message;
    if (action !== 'ask') attribution = 'Authored dialogue · local support simulation';
    paint();
    speech.speak(state.locals.find(local => local.id === state.selectedId), message);
    if (action === 'ask' && result.ok) react(state.selectedId);
  };
  ask.addEventListener('click', () => interact('ask'));
  about.addEventListener('click', () => {
    const local = state?.locals.find(item => item.id === state.selectedId);
    if (!local || request) return;
    message = conversationLine(local, 'about');
    attribution = 'Authored dialogue · checking immediate reaction…'; paint(); speech.speak(local,message); react(local.id, 'conversation');
  });
  district.addEventListener('click', () => {
    const local = state?.locals.find(item => item.id === state.selectedId);
    if (!local || request) return;
    message = conversationLine(local, 'district');
    attribution = 'Authored dialogue · directory information'; paint(); speech.speak(local,message); react(local.id, 'directions');
  });
  story.addEventListener('click', () => {
    const local=state?.locals.find(item=>item.id===state.selectedId); if(!local || request) return;
    message=conversationLine(local,'story'); attribution='Authored dialogue · in-world perspective'; paint(); speech.speak(local,message); react(local.id,'conversation');
  });
  voiceMode.addEventListener('change', () => { speech.setMode(voiceMode.value); paint(); const local=state?.locals.find(item=>item.id===state.selectedId); if(local) speech.speak(local,message); });
  replay.addEventListener('click', () => { const local=state?.locals.find(item=>item.id===state.selectedId); if(local) speech.speak(local,message); });
  supply.addEventListener('click', () => interact('supply'));
  dispatch.addEventListener('click', () => interact('dispatch'));
  meet.addEventListener('click', () => selectLocal(chooser.value));
  next.addEventListener('click', () => {
    const ordered = orderedLocals();
    const nextLocal = ordered.find((local) => local.id !== state.selectedId && local.priority && local.status === 'needs_help') ?? ordered[(ordered.findIndex((local) => local.id === state.selectedId) + 1) % ordered.length];
    if (nextLocal) selectLocal(nextLocal.id);
  });
  const closeDialogue = () => {
    invalidate();
    dialogue.hidden = true;
    state.selectedId = null;
    if (document.body.classList.contains('walking') || previousFocus?.closest('[inert]')) document.querySelector('#canvas-host')?.focus({ preventScroll: true });
    else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  close.addEventListener('click', closeDialogue);
  dialogue.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); closeDialogue(); }
  });
  run.addEventListener('click', () => {
    if (!state || terminal(state)) return;
    state.running = !state.running;
    paint();
  });
  const resetScenario = (key) => {
    if (!state) return;
    invalidate();
    chooseCommunityScenario(state, key);
    message = 'A new community scenario is ready. Ask what would help before committing support.';
    attribution = 'Authored dialogue · local reaction';
    rebuildChooser();
    paint();
  };
  scenarioSelect.addEventListener('change', () => resetScenario(scenarioSelect.value));
  reset.addEventListener('click', () => resetScenario(state.scenarioKey));
  document.addEventListener('visibilitychange', () => { if (document.hidden) invalidate(); });

  return {
    get state() { return state; },
    get speakingId() { return speech.speakingId; },
    selectLocal,
    setWorld(world) {
      invalidate();
      state = createCommunity(world);
      dialogue.hidden = true;
      meet.disabled = !state.locals.length;
      reset.disabled = !state.locals.length;
      rebuildChooser();
      paint();
    },
    update(delta, now) {
      if (!state || document.hidden) return;
      const previousStatus = state.status;
      stepCommunity(state, delta, getEconomy());
      if (state.status !== previousStatus && terminal(state)) invalidate();
      if (now - lastPaint >= 150) { paint(); lastPaint = now; }
    },
  };
}
