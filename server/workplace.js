// Workplace domain: one companion, one scoped grant, one bounded fixture task
// and its private result per owner, plus exclusive workstation reservations.
// Every change is a compare-and-set on a versioned document, so a stale or
// duplicate runner loses its write instead of finishing a job twice. Work
// advances in short atomic steps on the service (never in the render loop or
// the world tick); a timer or the owner's next read can drive the next step.
import { createHash, randomUUID } from 'node:crypto';
import { WORKPLACE_LIMITS, WORKPLACE_PROTOCOL, STATION_IDS, TASK_STEPS, cleanText, validateEventPlan } from '../preview/src/workplace-contract.js';

const ACTIVE = new Set(['queued', 'running', 'paused']);
const id = createId => createId().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const clip = (value, max) => [...String(value)].slice(0, max).join('').trim();
const empty = () => ({companion: null, grant: null, offer: {state: 'offered', updatedAt: 0}, tasks: [], artifacts: [], notices: [], requests: []});

export function createMemoryWorkplaceStore() {
  const records = new Map();
  return {
    async load(key) { const record = records.get(key); return record ? {revision: record.revision, value: JSON.parse(record.doc)} : {revision: 0, value: null}; },
    async save(key, expectedRevision, value) {
      if ((records.get(key)?.revision ?? 0) !== expectedRevision) return false;
      records.set(key, {revision: expectedRevision + 1, doc: JSON.stringify(value)});return true;
    },
  };
}

const SAVE = `
local revision = tonumber(redis.call('HGET', KEYS[1], 'revision') or '0')
if revision ~= tonumber(ARGV[1]) then return 0 end
redis.call('HSET', KEYS[1], 'revision', revision + 1, 'doc', ARGV[2])
return 1
`;
export function createRedisWorkplaceStore({redis, prefix}) {
  if (!redis?.eval || typeof prefix !== 'string' || !/^\{[^{}]+\}$/.test(prefix)) throw new Error('Invalid workplace storage');
  const full = key => `${prefix}:workplace:v1:${key}`;
  return {
    async load(key) {
      const [revision, doc] = await redis.hmget(full(key), 'revision', 'doc');
      return doc ? {revision: Number(revision), value: JSON.parse(doc)} : {revision: 0, value: null};
    },
    async save(key, expectedRevision, value) { return await redis.eval(SAVE, 1, full(key), expectedRevision, JSON.stringify(value)) === 1; },
  };
}

// The deterministic fixture adapter. It reads only the public places captured
// when the task was admitted and writes nothing anywhere.
export function fixtureEventPlan(brief, places) {
  const words = [brief.purpose, ...brief.preferences].join(' ').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2);
  const scored = places.filter(place => place.kind === 'spot' || place.kind === 'arrival')
    .map(place => ({place, score: words.filter(word => place.name.toLowerCase().includes(word)).length + (place.kind === 'spot' ? 0.5 : 0)}))
    .sort((a, b) => b.score - a.score || a.place.id.localeCompare(b.place.id)).slice(0, 3);
  if (!scored.length) return null;
  const top = scored[0];
  const quiet = [...brief.preferences, ...brief.constraints].some(item => /quiet|calm|small|garden/i.test(item));
  const options = scored.map(({place, score}) => ({placeId: place.id, placeName: place.name,
    why: score >= 1 ? `Its name matches what you asked for.` : place.kind === 'arrival' ? 'Everyone already knows the way here.' : 'An outdoor meeting point near the shops.'}));
  const questions = [];
  if (!brief.guestOfHonor) questions.push('Who is this gathering for?');
  else if (!brief.preferences.length) questions.push(`What does ${clip(brief.guestOfHonor, 60)} enjoy? Nobody has asked yet.`);
  questions.push('Who should be invited? This plan does not invite anyone.');
  if (brief.startsAt === null) questions.push('When should it start?');
  const title = clip(brief.purpose, 64);
  return {
    kind: 'event_plan', title: clip(`Gathering plan: ${brief.purpose}`, 80), options,
    recommendation: {placeId: top.place.id, reason: top.score >= 1 ? `${top.place.name} fits the words in your brief best.` : `${top.place.name} is the clearest open meeting point; nothing in the brief favoured another.`},
    agenda: ['Arrive and settle in (15 minutes)', clip(brief.purpose, 120), 'Open time to talk', brief.guestOfHonor ? clip(`Thank ${brief.guestOfHonor}`, 120) : 'Close with thanks'],
    considerations: ['Meeting points are outdoors; travelling there never enters a private home.',
      `Room for ${brief.guests} including the host; gatherings allow 2 to 32.`,
      ...(quiet ? ['Keep a quiet corner for anyone who needs a break.'] : []),
      ...brief.constraints.slice(0, 3).map(item => clip(`Respect: ${item}`, 160))],
    questions: questions.slice(0, 4),
    draft: {title, description: clip(`${brief.purpose}${brief.guestOfHonor ? ` for ${brief.guestOfHonor}` : ''}.`, 400), placeId: top.place.id,
      startsAt: brief.startsAt, endsAt: brief.startsAt === null ? null : brief.startsAt + 2 * 3_600_000, capacity: brief.guests},
    sources: options.map(option => ({tool: 'places.list', id: option.placeId})),
  };
}

export function createWorkplace({store = createMemoryWorkplaceStore(), now = Date.now, createId = randomUUID, limits = {}, stepMs = 1500,
  schedule = (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref?.(); return timer; }, cancel = clearTimeout} = {}) {
  const limit = {...WORKPLACE_LIMITS, ...limits};
  const ownerKey = userId => `owner:${sha256(userId)}`;
  const timers = new Map();let closed = false;
  async function mutate(key, change, initial = empty) {
    for (let tries = 0; tries < 8; tries++) {
      const {revision, value} = await store.load(key);
      const doc = value ?? initial();
      const result = change(doc);
      if (!result?.write) return result?.value;
      if (await store.save(key, revision, doc)) return result.value;
    }
    return {ok: false, reason: 'workplace_busy'};
  }
  const grantActive = (doc, t) => Boolean(doc.grant && !doc.grant.revokedAt && doc.grant.expiresAt > t);
  const activeTask = doc => doc.tasks.find(task => ACTIVE.has(task.status));
  const finish = (task, status, t, reason = null) => Object.assign(task, {status, reason, updatedAt: t, finishedAt: t, nextAt: null});
  const notify = (doc, noticeId, taskId, kind, t) => {
    // One notice per outcome: a replayed step finds it already present.
    if (doc.notices.some(notice => notice.id === noticeId)) return;
    doc.notices.push({id: noticeId, taskId, kind, createdAt: t, readAt: null});
    doc.notices = doc.notices.slice(-limit.notices);
  };
  function tidy(doc, t) {
    let changed = false;
    const kept = doc.artifacts.filter(artifact => artifact.expiresAt > t);
    if (kept.length !== doc.artifacts.length) {doc.artifacts = kept;changed = true;}
    const finished = doc.tasks.filter(task => !ACTIVE.has(task.status));
    if (finished.length > limit.keptTasks) {
      const drop = new Set(finished.slice(0, finished.length - limit.keptTasks).map(task => task.id));
      doc.tasks = doc.tasks.filter(task => !drop.has(task.id));changed = true;
    }
    return changed;
  }
  // One atomic step of the active task. Returns how long until the next step.
  function step(doc, t) {
    const task = activeTask(doc);
    if (!task || task.status === 'paused') return {write: false, value: {waitMs: null}};
    const authority = grantActive(doc, t) && doc.grant.id === task.grantId && doc.grant.revision === task.grantRevision;
    if (!authority) {finish(task, 'cancelled', t, 'grant_revoked');return {write: true, value: {waitMs: null}};}
    if (task.status === 'queued') {
      Object.assign(task, {status: 'running', startedAt: t, deadline: t + limit.deadlineMs, nextAt: t + stepMs, updatedAt: t, fence: task.fence + 1});
      return {write: true, value: {waitMs: stepMs}};
    }
    if (t > task.deadline) {finish(task, 'failed', t, 'deadline');notify(doc, `failed:${task.id}`, task.id, 'failed', t);return {write: true, value: {waitMs: null}};}
    if (t < task.nextAt) return {write: false, value: {waitMs: task.nextAt - t}};
    // A step left unclaimed past its lease means the runner was lost. Recover
    // from the last checkpoint a bounded number of times, then fail closed.
    if (t - task.nextAt > limit.stepLeaseMs && ++task.attempts > limit.attempts) {
      finish(task, 'failed', t, 'worker_lost');notify(doc, `failed:${task.id}`, task.id, 'failed', t);return {write: true, value: {waitMs: null}};
    }
    const name = TASK_STEPS[task.checkpoints.length];
    if (name === 'checking_places') task.toolCalls += 1;else task.turns += 1;
    if (task.turns > limit.turns || task.toolCalls > limit.toolCalls) {finish(task, 'failed', t, 'budget_exceeded');notify(doc, `failed:${task.id}`, task.id, 'failed', t);return {write: true, value: {waitMs: null}};}
    task.checkpoints.push({step: name, at: t});task.updatedAt = t;task.fence += 1;
    if (name !== 'validating') {task.nextAt = t + stepMs;return {write: true, value: {waitMs: stepMs}};}
    const plan = fixtureEventPlan(task.brief, task.context.places);
    const bytes = plan ? new TextEncoder().encode(JSON.stringify(plan)).length : 0;
    if (!plan || !validateEventPlan(plan)) {finish(task, 'failed', t, plan ? 'invalid_artifact' : 'no_venues');notify(doc, `failed:${task.id}`, task.id, 'failed', t);return {write: true, value: {waitMs: null}};}
    if (doc.artifacts.length >= limit.artifacts || bytes > limit.artifactBytes) {finish(task, 'failed', t, 'artifact_limit');notify(doc, `failed:${task.id}`, task.id, 'failed', t);return {write: true, value: {waitMs: null}};}
    const artifactId = id(createId);
    const receipt = {taskId: task.id, adapter: 'fixture.event_plan@1', fence: task.fence, grantId: task.grantId, grantRevision: task.grantRevision,
      worldId: task.context.worldId, attempts: task.attempts, steps: task.checkpoints.map(checkpoint => checkpoint.step), turns: task.turns, toolCalls: task.toolCalls,
      tools: ['places.list'], externalWrites: 0, paidCalls: 0, startedAt: task.startedAt, finishedAt: t,
      briefSha256: sha256(JSON.stringify(task.brief)), planSha256: sha256(JSON.stringify(plan))};
    doc.artifacts.push({id: artifactId, taskId: task.id, createdAt: t, expiresAt: t + limit.retentionMs, bytes, plan, receipt});
    finish(task, 'completed', t);task.artifactId = artifactId;
    notify(doc, `result:${task.id}`, task.id, 'result_ready', t);
    if (doc.offer.state === 'accepted') doc.offer = {state: 'plan_ready', updatedAt: t};
    return {write: true, value: {waitMs: null}};
  }
  async function advance(userId) {
    return mutate(ownerKey(userId), doc => step(doc, now()));
  }
  // A long-lived service drives steps with a timer; a serverless request
  // drives them on the owner's next read. Either way each step is atomic.
  function drive(userId, delay = 0) {
    if (closed || timers.has(userId)) return;
    timers.set(userId, schedule(async () => {
      timers.delete(userId);
      try { const result = await advance(userId);if (result?.waitMs != null) drive(userId, result.waitMs); }
      catch { /* The next read retries. */ }
    }, delay));
  }
  async function stations() { return mutate('stations', doc => ({write: false, value: doc}), () => ({stations: {}})); }
  // Exclusive reservation: the first owner to save wins; leases expire.
  async function reserve(userId, companionId, t) {
    return mutate('stations', doc => {
      const mine = Object.entries(doc.stations).find(([, held]) => held.ownerId === userId && held.until > t);
      if (mine) {mine[1].until = t + limit.stationLeaseMs;return {write: true, value: mine[0]};}
      const free = STATION_IDS.find(station => !(doc.stations[station]?.until > t));
      if (!free) return {write: false, value: null};
      doc.stations[free] = {ownerId: userId, companionId, until: t + limit.stationLeaseMs};
      return {write: true, value: free};
    }, () => ({stations: {}}));
  }
  async function release(userId) {
    return mutate('stations', doc => {
      const held = Object.keys(doc.stations).filter(station => doc.stations[station].ownerId === userId);
      for (const station of held) delete doc.stations[station];
      return {write: held.length > 0, value: true};
    }, () => ({stations: {}}));
  }
  const taskView = task => ({id: task.id, kind: task.kind, status: task.status, reason: task.reason, brief: task.brief,
    step: task.checkpoints.at(-1)?.step ?? null, checkpoints: task.checkpoints, attempts: task.attempts, turns: task.turns, toolCalls: task.toolCalls,
    createdAt: task.createdAt, startedAt: task.startedAt, finishedAt: task.finishedAt, artifactId: task.artifactId});
  function view(doc, t, stationHeld) {
    const presence = doc.companion ? {...doc.companion.presence} : null;
    if (presence?.mode === 'stationed' && !stationHeld) Object.assign(presence, {mode: 'accompanying', stationId: null});
    return {protocol: WORKPLACE_PROTOCOL,
      companion: doc.companion ? {id: doc.companion.id, name: doc.companion.name, connection: 'fixture', presence} : null,
      grant: doc.grant ? {id: doc.grant.id, revision: doc.grant.revision, scope: doc.grant.scope, reads: ['public places in this world'], writes: [],
        expiresAt: doc.grant.expiresAt, revokedAt: doc.grant.revokedAt, active: grantActive(doc, t)} : null,
      offer: doc.offer, tasks: doc.tasks.map(taskView),
      artifacts: doc.artifacts.map(({id: artifactId, taskId, createdAt, expiresAt, bytes, plan}) => ({id: artifactId, taskId, title: plan.title, createdAt, expiresAt, bytes})),
      notices: doc.notices.filter(notice => !notice.readAt), limits: {artifacts: limit.artifacts, retentionDays: Math.round(limit.retentionMs / 86_400_000)}};
  }
  async function readState(userId) {
    const t = now();
    // Drive a due step first so a serverless deployment still makes progress.
    const advanced = await advance(userId);
    const result = await mutate(ownerKey(userId), doc => ({write: tidy(doc, t), value: doc}));
    const doc = result.companion !== undefined ? result : empty();
    let held = null;
    if (doc.companion?.presence.mode === 'stationed') {
      const map = (await stations()).stations;
      held = map[doc.companion.presence.stationId]?.ownerId === userId && map[doc.companion.presence.stationId].until > t ? doc.companion.presence.stationId : null;
      if (held) await reserve(userId, doc.companion.id, t);
    }
    if (advanced?.waitMs != null) drive(userId, advanced.waitMs);
    return view(doc, t, held);
  }
  const ok = async userId => ({ok: true, state: await readState(userId)});
  const owner = (actor, change) => mutate(ownerKey(actor.userId), doc => change(doc, now()));
  return {
    advance, state: async actor => ok(actor.userId),
    async companion(actor, {name}) {
      const result = await owner(actor, (doc, t) => {
        if (doc.companion) return {write: false, value: {ok: false, reason: 'companion_limit'}};
        doc.companion = {id: id(createId), name, createdAt: t, presence: {mode: 'accompanying', stationId: null}};
        return {write: true, value: {ok: true}};
      });
      return result.ok ? ok(actor.userId) : result;
    },
    async grant(actor, {scope}) {
      const result = await owner(actor, (doc, t) => {
        if (!doc.companion) return {write: false, value: {ok: false, reason: 'companion_required'}};
        if (grantActive(doc, t)) return {write: false, value: {ok: false, reason: 'grant_active'}};
        doc.grant = {id: id(createId), revision: (doc.grant?.revision ?? 0) + 1, scope, issuedAt: t, expiresAt: t + limit.grantMs, revokedAt: null};
        return {write: true, value: {ok: true}};
      });
      return result.ok ? ok(actor.userId) : result;
    },
    async revoke(actor, {grantId, expectedRevision}) {
      const result = await owner(actor, (doc, t) => {
        if (!doc.grant || doc.grant.id !== grantId) return {write: false, value: {ok: false, reason: 'grant_missing'}};
        if (doc.grant.revision !== expectedRevision) return {write: false, value: {ok: false, reason: 'grant_stale'}};
        if (doc.grant.revokedAt) return {write: false, value: {ok: true}};
        // A new revision invalidates every queued, paused or running step at once.
        Object.assign(doc.grant, {revokedAt: t, revision: doc.grant.revision + 1});
        for (const task of doc.tasks) if (ACTIVE.has(task.status)) finish(task, 'cancelled', t, 'grant_revoked');
        return {write: true, value: {ok: true}};
      });
      return result.ok ? ok(actor.userId) : result;
    },
    async offer(actor, {decision}) {
      const result = await owner(actor, (doc, t) => {
        if (['plan_ready', 'reviewed'].includes(doc.offer.state)) return {write: false, value: {ok: false, reason: 'offer_settled'}};
        doc.offer = {state: {accept: 'accepted', decline: 'declined', defer: 'deferred'}[decision], updatedAt: t};
        return {write: true, value: {ok: true}};
      });
      return result.ok ? ok(actor.userId) : result;
    },
    async submit(actor, {brief, requestId}, context) {
      const places = (Array.isArray(context?.places) ? context.places : []).filter(place => ['spot', 'arrival'].includes(place.kind)
        && /^(arrival|spot:[\w.:-]{1,80})$/.test(place.id) && cleanText(place.name, 40, {required: true})).slice(0, 40)
        .map(place => ({id: place.id, name: place.name, kind: place.kind}));
      const result = await owner(actor, (doc, t) => {
        const repeat = doc.requests.find(request => request.requestId === requestId);
        if (repeat) return {write: false, value: {ok: true, taskId: repeat.taskId}};
        if (!doc.companion) return {write: false, value: {ok: false, reason: 'companion_required'}};
        if (!grantActive(doc, t) || doc.grant.scope !== 'event_plan') return {write: false, value: {ok: false, reason: 'grant_required'}};
        if (doc.tasks.filter(task => ACTIVE.has(task.status)).length >= limit.activeTasks) return {write: false, value: {ok: false, reason: 'task_active'}};
        if (doc.artifacts.length >= limit.artifacts) return {write: false, value: {ok: false, reason: 'artifact_limit'}};
        const taskId = id(createId);
        doc.tasks.push({id: taskId, kind: 'event_plan', status: 'queued', reason: null, brief, context: {worldId: context.worldId, places},
          grantId: doc.grant.id, grantRevision: doc.grant.revision, fence: 0, attempts: 0, turns: 0, toolCalls: 0, checkpoints: [],
          createdAt: t, updatedAt: t, startedAt: null, finishedAt: null, deadline: null, nextAt: null, artifactId: null});
        doc.requests = [...doc.requests, {requestId, taskId}].slice(-limit.keptTasks);
        return {write: true, value: {ok: true, taskId, companionId: doc.companion.id, accompanying: doc.companion.presence.mode === 'accompanying'}};
      });
      if (!result.ok) return result;
      // Attendance is optional: with no free station the companion works beside the player.
      if (result.accompanying) {
        const station = await reserve(actor.userId, result.companionId, now());
        if (station) await owner(actor, doc => {
          if (!doc.companion || doc.companion.presence.mode !== 'accompanying') return {write: false};
          doc.companion.presence = {mode: 'stationed', stationId: station};return {write: true};
        });
      }
      drive(actor.userId);
      return {...await ok(actor.userId), taskId: result.taskId};
    },
    async pause(actor, {taskId}) { return control(actor, taskId, task => ['queued', 'running'].includes(task.status), (task, t) => Object.assign(task, {pausedFrom: task.status, status: 'paused', pausedAt: t, updatedAt: t})); },
    async resume(actor, {taskId}) {
      const result = await control(actor, taskId, task => task.status === 'paused', (task, t) => {
        Object.assign(task, {status: task.pausedFrom ?? 'queued', updatedAt: t, nextAt: t});
        if (task.deadline) task.deadline += t - task.pausedAt;
      });
      if (result.ok) drive(actor.userId);
      return result;
    },
    async cancel(actor, {taskId}) { return control(actor, taskId, task => ACTIVE.has(task.status), (task, t) => finish(task, 'cancelled', t, 'owner_cancelled')); },
    async artifact(actor, {artifactId}) {
      const t = now();
      const doc = await owner(actor, doc => ({write: false, value: doc}));
      const artifact = doc.artifacts?.find(item => item.id === artifactId && item.expiresAt > t);
      return artifact ? {ok: true, artifact: {id: artifact.id, taskId: artifact.taskId, createdAt: artifact.createdAt, expiresAt: artifact.expiresAt, plan: artifact.plan, receipt: artifact.receipt}}
        : {ok: false, reason: 'artifact_missing'};
    },
    async delete(actor, {artifactId}) {
      const result = await owner(actor, doc => {
        const artifact = doc.artifacts.find(item => item.id === artifactId);
        if (!artifact) return {write: false, value: {ok: false, reason: 'artifact_missing'}};
        doc.artifacts = doc.artifacts.filter(item => item.id !== artifactId);
        doc.notices = doc.notices.filter(notice => notice.taskId !== artifact.taskId);
        return {write: true, value: {ok: true}};
      });
      return result.ok ? ok(actor.userId) : result;
    },
    async ack(actor, {noticeId}) {
      const result = await owner(actor, (doc, t) => {
        const notice = doc.notices.find(item => item.id === noticeId);
        if (!notice) return {write: false, value: {ok: false, reason: 'notice_missing'}};
        if (notice.readAt) return {write: false, value: {ok: true}};
        notice.readAt = t;
        // The story moves on only after a verified saved plan has been opened.
        if (notice.kind === 'result_ready' && doc.offer.state === 'plan_ready' && doc.artifacts.some(item => item.taskId === notice.taskId)) doc.offer = {state: 'reviewed', updatedAt: t};
        return {write: true, value: {ok: true}};
      });
      return result.ok ? ok(actor.userId) : result;
    },
    async presence(actor, {mode}) {
      const t = now();
      const doc = await owner(actor, doc => ({write: false, value: doc}));
      if (!doc.companion) return {ok: false, reason: 'companion_required'};
      let stationId = null;
      if (mode === 'stationed') {
        stationId = await reserve(actor.userId, doc.companion.id, t);
        if (!stationId) return {ok: false, reason: 'stations_full'};
      } else await release(actor.userId);
      const result = await owner(actor, doc => {
        if (!doc.companion) return {write: false, value: {ok: false, reason: 'companion_required'}};
        doc.companion.presence = {mode, stationId};return {write: true, value: {ok: true}};
      });
      return result.ok ? ok(actor.userId) : result;
    },
    // The public projection: whether a station is taken, never by whom or for what.
    async occupancy(actor) {
      const t = now(), map = (await stations()).stations;
      return {ok: true, stations: STATION_IDS.map(station => {
        const held = map[station]?.until > t ? map[station] : null;
        return {id: station, occupied: Boolean(held), mine: held?.ownerId === actor.userId};
      })};
    },
    close() { closed = true;for (const timer of timers.values()) cancel(timer);timers.clear(); },
  };
  async function control(actor, taskId, allowed, change) {
    const result = await owner(actor, (doc, t) => {
      const task = doc.tasks.find(item => item.id === taskId);
      if (!task) return {write: false, value: {ok: false, reason: 'task_missing'}};
      if (!allowed(task)) return {write: false, value: {ok: false, reason: 'task_state'}};
      change(task, t);return {write: true, value: {ok: true}};
    });
    return result.ok ? ok(actor.userId) : result;
  }
}
