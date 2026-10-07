import { createWishPanel } from './wishes-ui.js';
import { nearbyPeople } from './nearby-people.js';
import { COMMUNITY_SCENARIOS } from './community.js';
import { createStoreEncounters } from './store-encounters.js';
import './community.css';
import './community-dialogue.css';
import { supportAvailability } from './community-presentation.js';
import { createLocalSpeech } from './speech.js';
import { prepareSpeechAvatar } from './speech-avatar.js';
import { conversationLine } from './personas.js';
import { remainingVisitDistance } from './volunteer-visits.js';

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

export function createCommunityPanel({ host, onFocus = () => {}, getVisitor = () => null, getRoomId = () => null, getPersona = () => null, getMultiplayer = () => null, onWish = () => {}, getPortrait = null }) {
  // Show a resident's rendered portrait on an element once it is ready; the
  // element keeps its drawn placeholder (or initials) until then.
  const showPortrait = (element, id) => {
    if (!getPortrait || element.dataset.portraitFor === id) return;
    element.dataset.portraitFor = id;
    element.classList.remove('has-portrait');element.style.removeProperty('--portrait');
    Promise.resolve(getPortrait(id)).then(url => {
      if (element.dataset.portraitFor !== id) return;
      if (!url) { delete element.dataset.portraitFor; return; }
      element.style.setProperty('--portrait', `url("${url}")`);element.classList.add('has-portrait');
    });
  };
  let state = null, lastPaint = -Infinity, previousFocus = null;
  let residentsById = new Map(), physicalVisits = false;
  const connected = () => Boolean(getMultiplayer()?.connected);
  let message = '', attribution = 'Authored dialogue · local reaction', currentTopic = null;
  let dialogueVoiceStatus = null;
  let selecting = false, selectionEpoch = 0, actionPending = false;
  const section = node('section', 'panel-section community-section');
  section.id = 'community-section';
  section.tabIndex = -1; section.setAttribute('aria-label', 'People and community scenarios');
  const heading = node('div', 'section-label', 'People nearby');
  heading.append(node('span', '', 'Fictional locals'));
  const intro = node('p', 'community-intro', 'Say hello, ask about the district, or share a story.');
  const lifeStatus=node('p','quiet-note','Residents are getting ready.');lifeStatus.id='community-life-status';
  const voiceLabel = node('label', 'community-label', 'Spoken dialogue'); voiceLabel.htmlFor = 'community-voice';
  const voiceMode = node('select', 'community-select'); voiceMode.id = 'community-voice';
  for (const [value,label] of [['off','Off · captions only'],['elevenlabs','Jev · ElevenLabs / residents · local'],['kokoro','Kokoro · local neural voices'],['device','Device voices · local only']]) { const option=node('option','',label); option.value=value; voiceMode.append(option); }
  const voiceStatus = node('p','community-voice-status','Muted · no speech is generated'); voiceStatus.id='community-voice-status'; voiceStatus.setAttribute('role','status');
  const speech = createLocalSpeech(status => {
    text(voiceStatus, status);
    if (dialogueVoiceStatus) text(dialogueVoiceStatus, status);
  }, {prepare:prepareSpeechAvatar});
  const nearbyList = node('div', 'nearby-people'); nearbyList.id = 'nearby-people';
  const nearbyRows = new Map();
  const nearbyEmpty = node('p', 'quiet-note', 'Walk toward a café or storefront to meet someone.');
  // People in the visitor's own space: the street, or the boutique they are standing in (same rule as the HUD).
  const sameSpace = local => (local.storeId ?? null) === (getRoomId() ?? null);
  // Try each nearby person in turn: the nearest may have no clear place to meet.
  const meetNearby = async () => {
    for (const item of nearbyPeople((state?.locals ?? []).filter(sameSpace), getVisitor(), 40, Infinity)) {
      if (await selectLocal(item.local.id)) return true;
    }
    return false;
  };
  const chooserLabel = node('label', 'community-label', 'Meet a local');
  chooserLabel.htmlFor = 'community-local';
  const chooser = node('select', 'community-select');
  chooser.id = 'community-local';
  const meet = button('Meet a local', 'community-meet', 'community-primary');
  meet.disabled = true;
  const scenarioTitle = node('h4', 'community-label', 'Community scenario');
  scenarioTitle.id = 'community-scenario';
  const description = node('p', 'quiet-note community-description');
  const controls = node('div', 'community-controls');
  const run = button('Begin scenario', 'community-run', 'community-primary');
  run.disabled = true;
  controls.append(run);
  const progress = node('p', 'community-progress');
  progress.id = 'community-progress';
  const objectiveMeter = node('progress', 'scenario-meter'); objectiveMeter.id = 'community-objective'; objectiveMeter.setAttribute('aria-label', 'Neighbors supported');
  const nextRequest = button('Find an open request', 'community-next-request');
  nextRequest.addEventListener('click', () => { const local = state?.locals.find(local => local.priority && local.status === 'needs_help' && !state.jobs.some(job => job.localId === local.id)); if (local) selectLocal(local.id); });
  const resources = node('p', 'community-resources');
  resources.id = 'community-resources';
  const visits=node('div','community-visits');visits.id='community-visits';
  const visitNotice=node('p','quiet-note');visitNotice.id='community-visit-notice';visitNotice.setAttribute('role','status');
  const outcome = node('p', 'community-outcome');
  outcome.id = 'community-outcome';
  outcome.setAttribute('role', 'status');
  const clockNote = node('p', 'quiet-note community-disclaimer', 'Fictional people and scenarios. No real needs or outcomes are inferred. 1 second = 1 simulation minute; the clock runs only during a scenario.');
  const more = node('details', 'community-more'); more.id = 'community-more';
  more.append(node('summary', '', 'More people & community activities'));
  more.append(chooserLabel, chooser, meet, lifeStatus, voiceLabel, voiceMode, voiceStatus, scenarioTitle, description, controls, progress, objectiveMeter, nextRequest, resources, visits, visitNotice, outcome, clockNote);
  section.append(heading, intro, nearbyList, nearbyEmpty, more);
  host.append(section);

  const dialogue = node('section', 'community-dialogue');
  dialogue.id = 'community-dialogue';
  dialogue.hidden = true;
  // This is a non-modal conversation panel: the scenario controls remain usable.
  dialogue.setAttribute('role', 'dialog');
  dialogue.setAttribute('aria-modal', 'false');
  dialogue.setAttribute('aria-labelledby', 'community-name');
  const top = node('header', 'community-dialogue-top');
  const avatar = node('span', 'community-avatar');
  avatar.setAttribute('aria-hidden', 'true');
  const identity = node('div', 'community-identity');
  const portrayalLabel = node('span', 'community-kicker', 'A fictional encounter');
  const name = node('h2'); name.id = 'community-name';
  const role = node('p', 'community-role');
  identity.append(portrayalLabel, name, role);
  const close = button('×', 'community-close', 'community-close');
  close.setAttribute('aria-label', 'Close conversation');
  top.append(avatar, identity, close);

  const body = node('div', 'community-dialogue-body');
  body.tabIndex = 0;
  body.setAttribute('role', 'region');
  body.setAttribute('aria-label', 'Conversation and support');
  const conversation = node('section', 'community-dialogue-card community-conversation');
  const conversationHeading = node('h3', 'community-card-heading', 'Conversation');
  conversationHeading.id = 'community-conversation-heading';
  conversation.setAttribute('aria-labelledby', conversationHeading.id);
  const dialogueText = node('p', 'community-speech');
  dialogueText.id = 'community-speech';
  dialogueText.setAttribute('role', 'status');
  const source = node('p', 'community-attribution'); source.id = 'community-attribution';
  const topics = node('div', 'community-topics');
  topics.setAttribute('role', 'group');
  topics.setAttribute('aria-label', 'Conversation topics');
  const about = button('What brings you here?', 'community-about');
  const district = button('About the district', 'community-district');
  const story = button('A local perspective', 'community-story');
  topics.append(about, district, story);
  const biography = node('a', 'community-biography', 'Read the public biography ↗');
  biography.target = '_blank'; biography.rel = 'noreferrer'; biography.hidden = true;
  const audio = node('details', 'community-audio');
  const audioSummary = node('summary', '', 'Voice · Off');
  const audioControls = node('div', 'community-audio-controls');
  const dialogueVoiceLabel = node('label', '', 'Spoken dialogue'); dialogueVoiceLabel.htmlFor = 'community-dialogue-voice';
  const dialogueVoice = voiceMode.cloneNode(true); dialogueVoice.id = 'community-dialogue-voice';
  const replay = button('Replay voice', 'community-replay');
  replay.setAttribute('aria-describedby', 'community-dialogue-voice-status');
  dialogueVoiceStatus = node('p', 'community-voice-status', 'Voice is off. Choose a voice to listen.');
  dialogueVoiceStatus.id = 'community-dialogue-voice-status';
  dialogueVoiceStatus.setAttribute('role', 'status');
  audioControls.append(dialogueVoiceLabel, dialogueVoice, replay, dialogueVoiceStatus);
  audio.append(audioSummary, audioControls);
  conversation.append(conversationHeading, dialogueText, source, topics, biography, audio);

  const supportCard = node('section', 'community-dialogue-card community-support-card');
  const supportHeading = node('div', 'community-card-top');
  const supportTitle = node('h3', 'community-card-heading', 'Help this neighbor'); supportTitle.id = 'community-support-heading';
  supportCard.setAttribute('aria-labelledby', supportTitle.id);
  supportCard.tabIndex = -1;
  const supportStatus = node('span', 'community-status'); supportStatus.id = 'community-support-status';
  supportHeading.append(supportTitle, supportStatus);
  const needLabel = node('p', 'community-need-label');
  const meter = node('progress', 'community-need');
  meter.max = 100; meter.setAttribute('aria-label', 'Unmet need; higher means more urgent');
  const support = node('p', 'community-support'); support.id = 'community-support';
  const primaryActions = node('div', 'community-primary-actions');
  const ask = button('Ask what would help', 'community-ask', 'community-primary');
  const startScenario = button('Start scenario', 'community-dialogue-run');
  primaryActions.append(ask, startScenario);
  const actions = node('div', 'community-dialogue-actions');
  const supply = button('', 'community-supply');
  const supplyTitle = node('strong', '', 'Offer supplies');
  const supplyCost = node('span', 'community-action-cost');
  supply.append(supplyTitle, supplyCost);
  const dispatch = button('', 'community-dispatch');
  const dispatchTitle = node('strong', '', 'Send a volunteer');
  const dispatchCost = node('span', 'community-action-cost', '1 visit · resolves the request');
  dispatch.append(dispatchTitle, dispatchCost);
  const supplyReason = node('p', 'community-action-reason'); supplyReason.id = 'community-supply-reason';
  const dispatchReason = node('p', 'community-action-reason'); dispatchReason.id = 'community-dispatch-reason';
  const supplyAction = node('div', 'community-action'), dispatchAction = node('div', 'community-action');
  supply.setAttribute('aria-describedby', supplyReason.id);
  dispatch.setAttribute('aria-describedby', dispatchReason.id);
  supplyAction.append(supply, supplyReason); dispatchAction.append(dispatch, dispatchReason);
  actions.append(supplyAction, dispatchAction);
  supportCard.append(supportHeading, needLabel, meter, support, primaryActions, actions);

  const mission = node('section', 'community-dialogue-card community-mission'); mission.id = 'community-mission';
  const missionHeading = node('div', 'community-card-top');
  const missionTitle = node('h3', 'community-card-heading'); missionTitle.id = 'community-mission-heading';
  mission.setAttribute('aria-labelledby', missionTitle.id);
  const missionStatus = node('span', 'community-status'); missionHeading.append(missionTitle, missionStatus);
  const missionProgress = node('p', 'community-mission-progress');
  const missionMeter = node('progress', 'community-mission-meter'); missionMeter.setAttribute('aria-label', 'Neighbors supported');
  const missionResources = node('dl', 'community-mission-resources');
  const resource = (label) => {
    const item = node('div'), value = node('dd'), title = node('dt', '', label);
    item.append(title, value); missionResources.append(item); return value;
  };
  const kits = resource('Supply kits'), visitBudget = resource('Visits left'), missionTime = resource('Sim time left');
  mission.append(missionHeading, missionProgress, missionMeter, missionResources);
  const provenance = node('details', 'community-provenance');
  provenance.append(node('summary', '', 'How this encounter works'));
  const note = node('p', 'community-dialogue-note', 'These residents and support requests are fictional. Dialogue is authored. Jev can choose an immediate greeting or weather reaction; support outcomes are confirmed by the shared town. One real second equals one simulation minute.');
  provenance.append(note);
  const activities = node('details', 'community-activities');
  activities.id = 'community-activities';
  activities.append(node('summary', '', 'Community activities'), supportCard, mission);
  const wishPanel = createWishPanel({
    onGrant: kind => handleWish(kind), onUndo: () => handleWish(null), onSelect: id => selectLocal(id),
  });
  section.append(wishPanel.journal);
  body.append(conversation, wishPanel.card, activities, provenance);
  const footer = node('footer', 'community-dialogue-footer');
  const next = button('Meet another neighbor →', 'community-next', 'community-next');
  footer.append(next);
  dialogue.append(top, body, footer);
  (document.querySelector('#viewport') ?? host).append(dialogue);

  const encounterNotice = node('p', 'encounter-notice');
  encounterNotice.id = 'community-encounter-notice';
  encounterNotice.setAttribute('role', 'status');
  (document.querySelector('#viewport') ?? host).append(encounterNotice);
  let noticeTimer = null;
  const notify = message => {
    clearTimeout(noticeTimer);
    text(encounterNotice, message);
    if (message) noticeTimer = setTimeout(() => text(encounterNotice, ''), 8000);
  };

  const invalidate = () => speech.cancel();
  const visitRows=new Map();
  const visitDescription=job=>{
    if(!state.running) return 'Scenario paused';
    if(state.storm || job.phase==='storm_hold') return 'Storm hold · waiting for conditions to clear';
    if(job.phase==='assisting') return `Helping on site · ${Math.round(job.progress/job.duration*100)}%`;
    if(job.phase==='traveling') return `Walking to the neighbor · ${Math.ceil(remainingVisitDistance(state,job) ?? 0)} m left`;
    return job.helperId?'Finding a walkable approach':'Waiting for an available volunteer';
  };
  const paintVisits=()=>{
    const jobs=state.physicalVisits?state.jobs:[];
    for(const [id,row] of visitRows) if(!jobs.some(job=>job.id===id)) {row.element.remove();visitRows.delete(id);}
    for(const job of jobs) {
      const helper=state.locals.find(local=>local.id===job.helperId),recipient=state.locals.find(local=>local.id===job.localId);
      if(!visitRows.has(job.id)) {
        const element=node('div','community-visit'),title=node('strong'),status=node('p'),find=button('Find volunteer →',`find-${job.id}`);
        find.addEventListener('click',async()=>{
          const current=state.jobs.find(current=>current.id===job.id),local=state.locals.find(local=>local.id===current?.helperId);
          if(!connected() || !local) return;
          // Ask for the placement before closing anything, so a refusal keeps the open conversation.
          try { if(await onFocus(local)===false) {notify(`There isn't a clear place to reach ${local.name} right now.`);return;} }
          catch(error) {notify(error.message || 'This neighbor could not be reached.');return;}
          if(!dialogue.hidden) closeDialogue();
          document.querySelector('#canvas-host')?.focus({preventScroll:true});
        });
        element.append(title,status,find);visits.append(element);visitRows.set(job.id,{element,title,status,find});
      }
      const row=visitRows.get(job.id);row.element.dataset.phase=job.phase;row.element.dataset.helper=job.helperId ?? '';
      text(row.title,`${helper?.name ?? 'Volunteer'} → ${recipient.name}`);text(row.status,visitDescription(job));row.find.disabled=!helper;
    }
    visits.hidden=!jobs.length;
    visits.dataset.jobs=JSON.stringify(jobs.map(job=>({id:job.id,localId:job.localId,helperId:job.helperId,phase:job.phase,progress:job.progress,duration:job.duration,distance:remainingVisitDistance(state,job)})));
    const returned=state.events.findLast(event=>event.message.startsWith('No walkable volunteer route'));
    text(visitNotice,returned?.message ?? '');visitNotice.hidden=!returned;
  };
  const orderedLocals = () => [...(state?.locals ?? [])].sort((a, b) => Number(b.priority && b.status === 'needs_help') - Number(a.priority && a.status === 'needs_help') || a.id.localeCompare(b.id));
  const rebuildChooser = () => {
    chooser.replaceChildren(...orderedLocals().map((local) => {
      const option = node('option', '', `${local.name} · ${local.anchorName}${local.priority && local.status === 'needs_help' ? ' · request open' : ''}`);
      option.value = local.id;
      return option;
    }));
    if (state.selectedId) chooser.value = state.selectedId;
  };

  const paint = () => {
    if (!state) return;
    const online = connected();
    meet.disabled = !online || !state.locals.length;
    const nearby = nearbyPeople(state.locals.filter(sameSpace), getVisitor());
    const focusedNearby = nearbyList.contains(document.activeElement) ? document.activeElement : null;
    nearbyEmpty.hidden = nearby.length > 0;
    const currentIds = new Set(nearby.map(item => item.local.id));
    for (const [id, row] of nearbyRows) if (!currentIds.has(id)) { row.remove(); nearbyRows.delete(id); }
    for (const [index, { local, distance }] of nearby.entries()) {
      let row = nearbyRows.get(local.id);
      if (!row) {
        row = button('', `nearby-${local.id}`, 'nearby-person');
        row.append(node('strong'), node('span'), node('small'));
        row.addEventListener('click', () => selectLocal(local.id));
        nearbyRows.set(local.id, row);
      }
      text(row.children[0], local.name);
      text(row.children[1], `${local.role} · ${Math.round(distance)} m away`);
      text(row.children[2], 'Say hello →');
      showPortrait(row, local.id);
      if (nearbyList.children[index] !== row) nearbyList.insertBefore(row, nearbyList.children[index] ?? null);
    }
    if (focusedNearby && document.activeElement !== focusedNearby) {
      (focusedNearby.isConnected ? focusedNearby : document.querySelector('#canvas-host'))?.focus({ preventScroll: true });
    }
    const residents=state.locals.map(local=>({id:local.id,position:local.position,speed:local.life?.speed ?? 0,distance:local.life?.distance ?? 0,status:local.life?.status ?? 'resting',action:local.life?.action ?? local.action,source:local.life?.source ?? local.source,visitId:local.life?.visitId ?? null}));
    for(const option of chooser.options) {
      const local=state.locals.find(local=>local.id===option.value);
      if(local) text(option,`${local.name} · ${local.anchorName}${local.priority && local.status === 'needs_help' ? ' · request open' : ''}`);
    }
    lifeStatus.dataset.residents=JSON.stringify(residents);
    const walking=residents.filter(local=>local.speed>0).length,covered=residents.filter(local=>local.status==='sheltered').length;
    text(lifeStatus,`${walking} walking · ${covered} under cover · shared town`);
    const finished = terminal(state);
    const remaining = state.scenario.duration - state.elapsed;
    text(scenarioTitle, state.scenario.title);
    text(description, state.scenario.description);
    text(run, finished ? 'Scenario ended' : state.running ? 'Pause scenario' : state.elapsed > 0 ? 'Resume scenario' : 'Begin scenario');
    run.disabled = !online || finished || !state.locals.length || actionPending;
    run.setAttribute('aria-pressed', String(state.running));
    text(progress, `${state.supported} / ${state.target} neighbors supported · ${time(remaining)} sim left`);
    objectiveMeter.max = state.target; objectiveMeter.value = state.supported;
    nextRequest.disabled = !online || finished || !state.locals.some(local => local.priority && local.status === 'needs_help' && !state.jobs.some(job => job.localId === local.id));
    text(resources, `${state.supplies} kits · ${state.helpBudget} volunteer visits left · ${state.jobs.length} active visits`);
    paintVisits();
    const mode = state.storm && state.running ? 'Storm hold: volunteer visits pause; unmet needs still grow.' : state.running ? 'Check needs, then choose how to spend shared resources.' : state.elapsed > 0 ? 'Paused. Needs and volunteer progress are frozen.' : 'Ready when you are. Meet the neighbors before starting.';
    text(outcome, state.result ?? mode);
    outcome.dataset.state = state.status;
    const local = state.locals.find((item) => item.id === state.selectedId);
    const sharedPlayer=getMultiplayer()?.snapshot?.players?.find(player=>player.id===getMultiplayer()?.identity?.id);
    wishPanel.update(state, local, getPersona(), online && Boolean(sharedPlayer?.canGrantWishes));
    if (!local || dialogue.hidden) return;
    const job = state.jobs.find((item) => item.localId === local.id);
    text(name, local.name);
    text(avatar, local.name.split(/\s+/).map(part => part[0]).slice(0, 2).join(''));
    showPortrait(avatar, local.id);
    text(about, local.persona?.work ? 'About your work' : 'What brings you here?');
    text(story, local.persona?.work ? 'A detail from your work' : 'A local perspective');
    for (const [topic, control] of [['about', about], ['district', district], ['story', story]]) {
      control.setAttribute('aria-disabled', 'false');
      control.setAttribute('aria-pressed', String(currentTopic === topic));
    }
    topics.setAttribute('aria-busy', 'false');
    dialogueVoice.value = speech.mode;
    text(audioSummary, `Voice · ${speech.mode === 'off' ? 'Off' : speech.mode === 'device' ? 'Device voices' : speech.mode === 'elevenlabs' ? 'Jev · ElevenLabs' : 'Local neural voice'}`);
    text(portrayalLabel, local.persona?.portrayal ? local.persona.era === 'historical' ? 'Fictional portrayal · heritage encounter' : 'Fictional portrayal · no endorsement' : 'Fictional River Oaks resident');
    biography.hidden = !local.persona?.source;
    if (local.persona?.source) { biography.href=local.persona.source; biography.title=local.persona.fact; biography.setAttribute('aria-label',`Public biography of ${local.name}`); }
    replay.disabled = speech.mode === 'off';
    if (speech.mode === 'off') text(dialogueVoiceStatus, 'Voice is off. Choose a voice to listen.');
    const helping=state.jobs.find(job=>job.helperId===local.id);
    text(role, `${helping ? `Volunteering for ${state.locals.find(person=>person.id===helping.localId).name}` : local.role} · ${local.species ? `${local.species} · ` : ''}${local.anchorName}`);
    text(dialogueText, message);
    text(source, attribution);
    text(needLabel, local.status === 'supported' ? 'Supported · request resolved' : local.status === 'unmet' ? 'Support window missed' : local.needKnown ? local.priority ? `${state.scenario.need} · ${Math.round(local.need)} / 100 unmet need` : 'No support request' : 'Ask to learn what would help');
    meter.hidden = !local.needKnown || !local.priority;
    meter.value = local.need;
    meter.dataset.urgency = local.need >= 75 ? 'high' : 'normal';
    const status = local.status === 'supported' ? 'Resolved' : local.status === 'unmet' ? 'Window missed' : !local.needKnown ? 'Not checked' : job ? 'Visit assigned' : local.priority ? 'Needs support' : 'No request';
    text(supportStatus, status);
    supportStatus.dataset.state = local.needKnown ? local.status : 'unknown';
    const progressText = job ? state.physicalVisits ? `${visitDescription(job)}. Needs grow until support is complete.` : `Volunteer visit ${Math.round(job.progress / job.duration * 100)}% complete.` : local.status === 'supported' ? 'Your support resolved this fictional request.' : finished ? state.result : !local.needKnown ? 'Start by asking what would help. Checking needs does not spend any resources.' : !local.priority ? 'This neighbor has what they need. Meet another neighbor to find an open request.' : !state.running ? 'Start or resume the scenario to commit support. Resources are shared across neighbors.' : 'Supplies reduce need now. A volunteer resolves the request after arriving and helping.';
    text(support, progressText);
    ask.disabled = !online || local.needKnown || actionPending;
    ask.hidden = local.needKnown;
    startScenario.hidden = state.running || finished;
    startScenario.disabled = !online || actionPending;
    text(startScenario, state.elapsed > 0 ? 'Resume scenario' : 'Start scenario');
    startScenario.classList.toggle('community-primary', local.needKnown && local.priority && local.status === 'needs_help');
    const availability = supportAvailability(state, local);
    supply.disabled = !online || availability.supply !== null || actionPending;
    dispatch.disabled = !online || availability.dispatch !== null || actionPending;
    text(supplyCost, `${state.scenario.supplyCost} kits · reduces need by ${state.scenario.supplyRelief}`);
    text(dispatchTitle, job ? 'Visit assigned' : 'Send a volunteer');
    text(supplyReason, availability.supply ?? 'Available now');
    text(dispatchReason, availability.dispatch ?? 'Available now');
    text(missionTitle, state.scenario.title);
    text(missionStatus, finished ? state.status === 'success' ? 'Complete' : 'Ended' : state.running ? 'Running' : state.elapsed > 0 ? 'Paused' : 'Not started');
    missionStatus.dataset.state = finished ? state.status : state.running ? 'running' : 'paused';
    text(missionProgress, `${state.supported} / ${state.target} neighbors supported`);
    missionMeter.max = Math.max(1, state.target); missionMeter.value = state.supported;
    text(kits, String(state.supplies)); text(visitBudget, String(state.helpBudget)); text(missionTime, time(remaining));
  };

  const sharedCommand = async command => {
    if (!connected()) return {ok:false,message:'Reconnect before taking an action.'};
    try {
      const result = await getMultiplayer().command(command);
      if (!result.ok) notify(result.message || 'The town could not confirm this action.');
      return result;
    } catch(error) {
      const message = error.message || 'The town could not confirm this action.';
      notify(message); return {ok:false,message};
    }
  };
  const handleWish = async kind => {
    if (!state || dialogue.hidden || !connected()) return { ok: false };
    const currentState=state;
    const local = state.locals.find(person => person.id === state.selectedId);
    if (!local) return { ok: false };
    invalidate();
    const result = await sharedCommand(kind ? {type:'wish',localId:local.id,kind} : {type:'undoWish',localId:local.id});
    if (state !== currentState || state.selectedId !== local.id || dialogue.hidden) return result;
    if (result.ok) {
      message = result.message; attribution = 'Shared town magic'; currentTopic = null;
      onWish(); paint(); speech.speak(local, message);
    }
    return result;
  };

  // Travel and focus must be confirmed before opening a conversation.
  const selectLocal = (id) => {
    const local = state?.locals.find((item) => item.id === id);
    if (!connected() || !local || selecting) return false;
    return selectShared(local, id);
  };
  const selectShared = async (local, id) => {
    const currentState = state, epoch = selectionEpoch;
    selecting = true;
    try {
      if (await onFocus(local) === false) {
        notify(`There isn't a clear place to meet ${local.name} right now. Try another neighbor.`);
        return false;
      }
      if (!connected() || state !== currentState || epoch !== selectionEpoch) return false;
      if (!(await sharedCommand({type:'focus',localId:id})).ok) return false;
      if (!connected() || state !== currentState || epoch !== selectionEpoch) return false;
    } catch(error) {notify(error.message || 'This neighbor could not be reached.');return false;}
    finally {selecting = false;}
    return openConversation(local, id);
  };
  const openConversation = (local, id) => {
    notify('');
    invalidate();
    if (dialogue.hidden) previousFocus = document.activeElement;
    state.selectedId = id;
    chooser.value = id;
    currentTopic = null;
    message = local.wish?.message ?? conversationLine(local, 'greeting');
    attribution = `Authored dialogue · ${local.source === 'jev' ? 'Jev' : 'local'} reaction`;
    dialogue.hidden = false;
    body.scrollTop = 0;
    paint();
    close.focus({ preventScroll: true });
    speech.speak(local, message);
    return true;
  };

  const interact = async (action) => {
    if (!connected() || !state?.selectedId || actionPending) return;
    const activeControl = document.activeElement;
    const moveFocus = action === 'ask' && activeControl === ask;
    const localId = state.selectedId, currentState = state;
    actionPending = true; paint();
    const result = await sharedCommand({type:'support',localId,action});
    actionPending = false;
    if (state !== currentState || state.selectedId !== localId) {paint();return;}
    currentTopic = null;
    message = result.message;
    attribution = 'Authored dialogue · shared community support';
    paint();
    speech.speak(state.locals.find(local => local.id === state.selectedId), message);
    if (moveFocus && ask.hidden) (startScenario.hidden ? supply.disabled ? next : supply : startScenario).focus({ preventScroll: true });
    else if ([supply, dispatch].includes(activeControl) && activeControl.disabled) supportCard.focus({ preventScroll: true });
  };
  ask.addEventListener('click', () => interact('ask'));
  about.addEventListener('click', () => {
    const local = state?.locals.find(item => item.id === state.selectedId);
    if (!local || !connected()) return;
    currentTopic = 'about';
    message = conversationLine(local, 'about');
    attribution = 'Authored dialogue · shared town'; paint(); speech.speak(local,message);
  });
  district.addEventListener('click', () => {
    const local = state?.locals.find(item => item.id === state.selectedId);
    if (!local || !connected()) return;
    currentTopic = 'district';
    message = conversationLine(local, 'district');
    attribution = 'Authored dialogue · directory information'; paint(); speech.speak(local,message);
  });
  story.addEventListener('click', () => {
    const local=state?.locals.find(item=>item.id===state.selectedId); if(!local || !connected()) return;
    currentTopic = 'story';
    message=conversationLine(local,'story'); attribution='Authored dialogue · in-world perspective'; paint(); speech.speak(local,message);
  });
  const changeVoice = value => {
    voiceMode.value = value; dialogueVoice.value = value;
    speech.setMode(value); paint();
    const local = state?.locals.find(item => item.id === state.selectedId);
    if (local) speech.speak(local, message);
  };
  window.addEventListener('jevvoiceconfigured', () => changeVoice('elevenlabs'));
  voiceMode.addEventListener('change', () => changeVoice(voiceMode.value));
  dialogueVoice.addEventListener('change', () => changeVoice(dialogueVoice.value));
  replay.addEventListener('click', () => { const local=state?.locals.find(item=>item.id===state.selectedId); if(local) speech.speak(local,message); });
  supply.addEventListener('click', () => interact('supply'));
  dispatch.addEventListener('click', () => interact('dispatch'));
  meet.addEventListener('click', () => selectLocal(chooser.value));
  // People already met or refused this conversation are skipped, so "another neighbor"
  // walks the district instead of bouncing between the two nearest.
  const offered = new Set();
  const nextNeighbor = async () => {
    if (!state?.locals.length) return false;
    if (state.selectedId) offered.add(state.selectedId);
    const ordered = orderedLocals(), start = ordered.findIndex(local => local.id === state.selectedId);
    const rotated = [...ordered.slice(start + 1), ...ordered.slice(0, start + 1)];
    const candidates = () => [...nearbyPeople(state.locals.filter(sameSpace), getVisitor(), 40, Infinity).map(item => item.local), ...rotated.filter(sameSpace)]
      .filter((local, index, list) => local.id !== state.selectedId && !offered.has(local.id) && list.indexOf(local) === index);
    let pool = candidates();
    if (!pool.length) { offered.clear(); if (state.selectedId) offered.add(state.selectedId); pool = candidates(); }
    for (const local of pool) { offered.add(local.id); if (await selectLocal(local.id)) return true; }
    notify('Nobody nearby has a clear place to meet right now. Walk a little further and try again.');
    return false;
  };
  next.addEventListener('click', nextNeighbor);
  const closeDialogue = () => {
    selectionEpoch++;
    if (connected()) sharedCommand({type:'focus',localId:null});
    invalidate();
    dialogue.hidden = true;
    if (state) state.selectedId = null;
    offered.clear();
    notify('');
    if (document.body.classList.contains('walking') || previousFocus?.closest('[inert]')) document.querySelector('#canvas-host')?.focus({ preventScroll: true });
    else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  close.addEventListener('click', closeDialogue);
  dialogue.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDialogue(); }
  });
  const toggleScenario = async () => {
    if (!connected() || !state || terminal(state) || actionPending) return;
    actionPending = true;paint();
    await sharedCommand({type:'scenario',action:state.running?'pause':'start'});
    actionPending = false;
    paint();
  };
  run.addEventListener('click', toggleScenario);
  startScenario.addEventListener('click', async () => {
    await toggleScenario();
    (ask.hidden ? supply.disabled ? next : supply : ask).focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) invalidate(); });

  return {
    get state() { return state; },
    refresh: () => paint(),
    get speakingId() { return speech.speakingId; },
    updateSpeech: speech.update,
    selectLocal,
    meetNearby,
    setWorld(world, rooms = []) {
      selectionEpoch++;
      invalidate();
      residentsById = new Map(createStoreEncounters(rooms, {sharedPopulation:true}).map(local => [local.id, local]));
      physicalVisits = world?.scene === 'district';
      state = null;
      dialogue.hidden = true;
      offered.clear();
      notify('');
      meet.disabled = run.disabled = true;
      chooser.replaceChildren();
      nearbyList.replaceChildren();
      nearbyRows.clear();
    },
    applyRemote(snapshot) {
      if (!connected() || !snapshot?.community || !Array.isArray(snapshot.locals)) return;
      state ??= {selectedId:null,locals:[],wishes:{events:[]},physicalVisits};
      const selectedId = state.selectedId;
      const previousEvent = JSON.stringify(state.wishes.events.at(-1));
      Object.assign(state, structuredClone(snapshot.community), {selectedId});
      state.scenario = COMMUNITY_SCENARIOS[state.scenarioKey] ?? state.scenario;
      if (snapshot.wishes) state.wishes = structuredClone(snapshot.wishes);
      const byId = new Map(state.locals.map(local => [local.id,local]));
      state.locals = snapshot.locals.filter(remote => remote.indoor).map(remote => {
        const local = byId.get(remote.id) ?? structuredClone(residentsById.get(remote.id) ?? {id:remote.id,role:'Neighbor'});
        Object.assign(local, structuredClone(remote), {persona:local.persona});
        if (remote.wish === null) delete local.wish;
        if (remote.wishDisruption === null) delete local.wishDisruption;
        byId.set(remote.id, local);
        return local;
      });
      if (selectedId && !state.locals.some(local => local.id === selectedId)) closeDialogue();
      if (chooser.options.length !== state.locals.length || state.locals.some(local => !Array.from(chooser.options).some(option => option.value === local.id))) rebuildChooser();
      const event = state.wishes.events.at(-1);
      if (event && JSON.stringify(event) !== previousEvent) {
        notify(event.message);
        const selected = byId.get(selectedId);
        if (selected?.wish && event.localId === selectedId) {
          message = selected.wish.message; attribution = 'Jevica’s magic · shared town';
        }
      }
      paint();
    },
    update(delta, now) {
      if (!state || document.hidden) return;
      if (now - lastPaint >= 150) { paint(); lastPaint = now; }
    },
  };
}
