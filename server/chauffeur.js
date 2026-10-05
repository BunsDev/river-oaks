import policy from '../src/river_oaks/chauffeur-policy.json' with { type: 'json' };
import { isJevicaAdmin } from './admin.js';
import { timingSafeEqual } from 'node:crypto';

const number = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
export function chauffeurChoices(packet) {
  if (!packet || packet.schema_version !== 1 || !Number.isSafeInteger(packet.tick) || packet.tick < 0
    || !Number.isSafeInteger(packet.generation) || packet.generation < 0 || !['rolls', 'motorcycle'].includes(packet.vehicle)
    || !number(packet.speed, 0, 20) || !number(packet.remaining_m, 0, 100000) || !number(packet.turn_radians, -3.142, 3.142)
    || typeof packet.road_clear !== 'boolean' || (packet.rear_clear !== undefined && typeof packet.rear_clear !== 'boolean')
    || (packet.recovery !== undefined && typeof packet.recovery !== 'boolean') || !Array.isArray(packet.candidates)
    || packet.candidates.length < 1 || packet.candidates.length > 10) throw new Error('Invalid request');
  const allowed = new Set(['stop', 'brake']);
  if (packet.remaining_m < 2) allowed.add('park');
  else {
    allowed.add('yield');
    if (packet.road_clear && !packet.recovery) {
      allowed.add('slow');
      if (packet.turn_radians > .12) allowed.add('turn_left');
      if (packet.turn_radians < -.12) allowed.add('turn_right');
      if (Math.abs(packet.turn_radians) < .35 && packet.remaining_m > 10) allowed.add('cruise');
      if (Math.abs(packet.turn_radians) < .15 && packet.remaining_m > 20 && packet.speed < 4) allowed.add('accelerate');
    }
    if (packet.recovery && packet.rear_clear && packet.speed < .5) allowed.add('reverse');
  }
  const seen = new Set(), candidates = {};
  for (const c of packet.candidates) {
    if (!c || !Object.hasOwn(policy.thresholds, c.id) || c.id !== c.action || seen.has(c.id)
      || typeof c.label !== 'string' || c.label.length > 100) throw new Error('Invalid request');
    seen.add(c.id);
    if (allowed.has(c.id)) candidates[c.id] = { id: c.id, action: c.action, label: c.label };
  }
  return candidates;
}

export function createChauffeurRoute({ auth, security, waitlist, origin, apiKey, model = 'jev-1.13.0', fetcher = fetch, isAdmin = isJevicaAdmin }) {
  return async (req, res) => {
    if (new URL(req.url, origin).pathname !== '/api/chauffeur') return false;
    if (req.method !== 'POST') { json(res, 405, { error: 'Use POST.' }); return true; }
    const user = await auth.authenticate(req);
    if (!user) { json(res, 401, { error: 'Sign in to drive.' }); return true; }
    const csrf = req.headers['x-csrf-token'];
    if (!isAdmin(user.userId) || await security.isBanned(user.userId) || !await waitlist.isApproved(user.userId)
      || req.headers.origin !== origin || typeof csrf !== 'string' || typeof user.csrfToken !== 'string'
      || Buffer.byteLength(csrf) !== Buffer.byteLength(user.csrfToken) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(user.csrfToken))) {
      json(res, 403, { error: 'Driving requires an approved owner session and security token.' }); return true;
    }
    if (!await security.allow('chauffeur', user.userId, 40, 60_000)) { json(res, 429, { error: 'Please wait before another driving decision.' }); return true; }
    let packet, candidates;
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 4096) throw new Error('Too large'); chunks.push(chunk); }
      packet = JSON.parse(Buffer.concat(chunks)); candidates = chauffeurChoices(packet);
    } catch { json(res, 400, { error: 'Invalid driving request.' }); return true; }
    const result = { schema_version: 1, tick: packet.tick, generation: packet.generation, candidate_id: null, source: 'unavailable', reason: 'not_configured', confidence: null };
    if (apiKey && Object.keys(candidates).length) {
      try {
        const response = await fetcher('https://api.typesafe.ai/v1/systemone', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(1200),
          body: JSON.stringify({ model, state: { vehicle: packet.vehicle, speed: packet.speed, remaining_m: packet.remaining_m, turn_radians: packet.turn_radians, road_clear: packet.road_clear, rear_clear: packet.rear_clear ?? false, recovery: packet.recovery ?? false, candidates },
            questions: { next_action: { type: 'choice', instructions: policy.instructions, criteria: candidates } } }),
        });
        if (!response.ok) throw new Error('Provider unavailable');
        const payload = await response.json(), answer = payload?.answers?.next_action, probabilities = answer?.probabilities;
        if (payload.model !== model || answer?.type !== 'choice' || !Object.hasOwn(candidates, answer.choice)
          || !number(answer.confidence, 0, 1) || !probabilities || Array.isArray(probabilities)
          || Object.keys(probabilities).length !== Object.keys(candidates).length
          || Object.keys(probabilities).some(key => !Object.hasOwn(candidates, key) || !number(probabilities[key], 0, 1))
          || Math.abs(Object.values(probabilities).reduce((sum, p) => sum + p, 0) - 1) > Math.min(.05, Object.keys(candidates).length * .005) + 1e-9
          || probabilities[answer.choice] < Math.max(...Object.values(probabilities))) throw new Error('Invalid answer');
        const accepted = answer.confidence >= policy.thresholds[answer.choice];
        Object.assign(result, { source: accepted ? 'jev' : 'uncertain', reason: accepted ? 'accepted' : 'low_confidence', candidate_id: accepted ? answer.choice : null, confidence: answer.confidence });
      } catch { result.reason = 'provider_unavailable'; }
    }
    json(res, 200, result); return true;
  };
}
