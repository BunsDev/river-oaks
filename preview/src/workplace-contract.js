// Workplace contract: the shapes a player's companion, its permission grant,
// one bounded task and its private result may take. The server validates every
// request with these functions; the client uses the same ones to render only
// what it can read. Owner, admin and grant-issuer fields never come from a
// request: the service derives them from the authenticated session.

export const WORKPLACE_PROTOCOL = 1;
// First-slice limits (#214 review). Configurable on the service, enforced in code.
export const WORKPLACE_LIMITS = Object.freeze({
  companions: 1, activeTasks: 1, turns: 3, toolCalls: 5, deadlineMs: 120_000,
  artifacts: 3, artifactBytes: 262_144, retentionMs: 30 * 86_400_000, grantMs: 7 * 86_400_000,
  stationLeaseMs: 30 * 60_000, stepLeaseMs: 10_000, attempts: 3, keptTasks: 8, notices: 8,
});
export const TASK_KINDS = Object.freeze(['event_plan']);
export const READ_TOOLS = Object.freeze(['places.list']);
export const TASK_STATES = Object.freeze(['queued', 'running', 'paused', 'completed', 'failed', 'cancelled']);
export const PRESENCE_MODES = Object.freeze(['accompanying', 'stationed', 'offstage']);
// The in-app offer to draft a plan. A neutral prompt, not a story beat: the
// Favor and any cast embodiment stay deferred (#216). Declining costs nothing.
export const OFFER_STATES = Object.freeze(['offered', 'accepted', 'declined', 'deferred', 'plan_ready', 'reviewed']);
export const TASK_STEPS = Object.freeze(['reading_brief', 'checking_places', 'drafting_plan', 'validating']);
export const STATION_IDS = Object.freeze(['station-1', 'station-2']);

const CONTROL = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/u;
export const cleanText = (value, max, {required = false} = {}) => typeof value === 'string' && value === value.trim()
  && [...value].length <= max && !CONTROL.test(value) && (!required || value.length > 0);
export const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const only = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
const fail = reason => ({ok: false, reason});
const textList = (value, maxItems, maxLength) => Array.isArray(value) && value.length <= maxItems && value.every(item => cleanText(item, maxLength, {required: true}));

// A gathering brief: what the player wants, never who they are.
export function validateBrief(input, now = Date.now()) {
  if (!only(input, ['purpose', 'guestOfHonor', 'preferences', 'constraints', 'startsAt', 'guests'])) return fail('invalid_brief');
  const {purpose, guestOfHonor = '', preferences = [], constraints = [], startsAt = null, guests = 6} = input;
  if (!cleanText(purpose, 160, {required: true}) || !cleanText(guestOfHonor, 60) || !textList(preferences, 6, 80) || !textList(constraints, 6, 80)) return fail('invalid_brief');
  if (startsAt !== null && (!Number.isSafeInteger(startsAt) || startsAt < now || startsAt > now + 30 * 86_400_000)) return fail('invalid_brief');
  if (!Number.isSafeInteger(guests) || guests < 2 || guests > 32) return fail('invalid_brief');
  return {ok: true, value: {purpose, guestOfHonor, preferences: [...preferences], constraints: [...constraints], startsAt, guests}};
}

// Each action's body. Unknown actions and fields fail closed.
const BODIES = {
  state: [], companion: ['name'], grant: ['scope'], revoke: ['grantId', 'expectedRevision'],
  offer: ['decision'], submit: ['brief', 'requestId'], pause: ['taskId'], resume: ['taskId'], cancel: ['taskId'], forget: ['taskId'], erase: ['confirm'],
  artifact: ['artifactId'], delete: ['artifactId'], ack: ['noticeId'], presence: ['mode'], occupancy: [],
};
export const WORKPLACE_ACTIONS = Object.freeze(Object.keys(BODIES));
export function validateWorkplaceRequest(action, input, now = Date.now()) {
  if (!Object.hasOwn(BODIES, action)) return fail('unknown_action');
  const data = input ?? {};
  if (!only(data, BODIES[action])) return fail('invalid_request');
  switch (action) {
    case 'companion': return cleanText(data.name, 32, {required: true}) ? {ok: true, value: {name: data.name}} : fail('invalid_request');
    case 'grant': return data.scope === 'event_plan' ? {ok: true, value: {scope: 'event_plan'}} : fail('invalid_request');
    case 'revoke': return validId(data.grantId) && Number.isSafeInteger(data.expectedRevision) && data.expectedRevision > 0
      ? {ok: true, value: {grantId: data.grantId, expectedRevision: data.expectedRevision}} : fail('invalid_request');
    case 'offer': return ['accept', 'decline', 'defer'].includes(data.decision) ? {ok: true, value: {decision: data.decision}} : fail('invalid_request');
    case 'submit': {
      if (!validId(data.requestId)) return fail('invalid_request');
      const brief = validateBrief(data.brief, now);
      return brief.ok ? {ok: true, value: {brief: brief.value, requestId: data.requestId}} : brief;
    }
    case 'pause': case 'resume': case 'cancel': case 'forget': return validId(data.taskId) ? {ok: true, value: {taskId: data.taskId}} : fail('invalid_request');
    case 'artifact': case 'delete': return validId(data.artifactId) ? {ok: true, value: {artifactId: data.artifactId}} : fail('invalid_request');
    case 'ack': return typeof data.noticeId === 'string' && /^(result|failed):[A-Za-z0-9_-]{8,64}$/.test(data.noticeId)
      ? {ok: true, value: {noticeId: data.noticeId}} : fail('invalid_request');
    // Erasing everything needs the exact word, so no stray request can do it.
    case 'erase': return data.confirm === 'erase' ? {ok: true, value: {}} : fail('invalid_request');
    case 'presence': return PRESENCE_MODES.includes(data.mode) ? {ok: true, value: {mode: data.mode}} : fail('invalid_request');
    default: return {ok: true, value: {}};
  }
}

// The saved result. Structured, inert text only; renderers never parse HTML.
export function validateEventPlan(plan) {
  if (!only(plan, ['kind', 'title', 'options', 'recommendation', 'agenda', 'considerations', 'questions', 'draft', 'sources'])) return false;
  if (plan.kind !== 'event_plan' || !cleanText(plan.title, 80, {required: true})) return false;
  if (!Array.isArray(plan.options) || plan.options.length < 1 || plan.options.length > 3) return false;
  for (const option of plan.options) if (!only(option, ['placeId', 'placeName', 'why']) || !/^(arrival|spot:[\w.:-]{1,80})$/.test(option.placeId)
    || !cleanText(option.placeName, 40, {required: true}) || !cleanText(option.why, 200, {required: true})) return false;
  if (!plan.options.some(option => option.placeId === plan.recommendation?.placeId)) return false;
  if (!only(plan.recommendation, ['placeId', 'reason']) || !cleanText(plan.recommendation.reason, 240, {required: true})) return false;
  if (!textList(plan.agenda, 6, 120) || !textList(plan.considerations, 6, 160) || !textList(plan.questions, 4, 160)) return false;
  const draft = plan.draft;
  if (!only(draft, ['title', 'description', 'placeId', 'startsAt', 'endsAt', 'capacity']) || !cleanText(draft.title, 64, {required: true})
    || typeof draft.description !== 'string' || [...draft.description].length > 400 || draft.placeId !== plan.recommendation.placeId
    || !(draft.startsAt === null || Number.isSafeInteger(draft.startsAt)) || !(draft.endsAt === null || Number.isSafeInteger(draft.endsAt))
    || (draft.startsAt !== null && (draft.endsAt === null || draft.endsAt - draft.startsAt < 900_000 || draft.endsAt - draft.startsAt > 8 * 3_600_000))
    || !Number.isSafeInteger(draft.capacity) || draft.capacity < 2 || draft.capacity > 32) return false;
  if (!Array.isArray(plan.sources) || plan.sources.length > 8 || !plan.sources.every(source => only(source, ['tool', 'id'])
    && READ_TOOLS.includes(source.tool) && cleanText(source.id, 90, {required: true}))) return false;
  return new TextEncoder().encode(JSON.stringify(plan)).length <= WORKPLACE_LIMITS.artifactBytes;
}

// Presence, task state and connection health stay separate. The animation
// can show "working" only while the service records a running task; an idle
// companion never implies progress, and a stale connection reads as not working.
export function companionPresentation(presence, task, health = 'ok') {
  if (!presence || presence.mode === 'offstage') return {pose: 'offstage', label: 'Away from the studio', working: false};
  const seated = presence.mode === 'stationed' && Boolean(presence.stationId);
  if (health !== 'ok') return {pose: seated ? 'seated-idle' : 'standing', label: 'Connection lost — progress unknown', working: false};
  if (task?.status === 'running') return {pose: seated ? 'seated-working' : 'standing-working', label: 'Working on your plan', working: true};
  if (task?.status === 'completed') return {pose: seated ? 'seated-waiting' : 'standing', label: 'Plan ready for your review', working: false};
  if (task?.status === 'paused') return {pose: seated ? 'seated-idle' : 'standing', label: 'Paused', working: false};
  if (task?.status === 'failed' || task?.status === 'cancelled') return {pose: seated ? 'seated-idle' : 'standing', label: task.status === 'failed' ? 'Stopped: the task failed' : 'Stopped', working: false};
  if (task?.status === 'queued') return {pose: seated ? 'seated-idle' : 'standing', label: 'Waiting to start', working: false};
  return {pose: seated ? 'seated-idle' : 'standing', label: seated ? 'At a workstation' : 'With you', working: false};
}
