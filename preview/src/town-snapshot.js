import { COMMUNITY_SCENARIOS } from './community.js';
import { DEFAULT_WORLD_ID } from './world-contract.js';
import { clockMinute, dangerActive, validateWorldPolicy } from './world-policy.js';

// World rules (#596) are optional for older towns; when present they must be exactly valid,
// and the minute and danger flag must agree with the clock and rule they summarize.
function validWorldPolicy(value, worldId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { minute, active, ...rules } = value;
  const valid = validateWorldPolicy(rules, worldId);
  return Boolean(valid && minute === clockMinute(valid.clock) && active === dangerActive(valid));
}

// Admission requires the player's authoritative pose and the shared world state.
// A malformed update must never unlock a client or replace its last good state.
export function validTownSnapshot(snapshot, previousSelfId = null) {
  const selfId = snapshot?.selfId ?? previousSelfId;
  if (snapshot?.type !== 'snapshot' || typeof selfId !== 'string'
    || !Array.isArray(snapshot.players) || !Array.isArray(snapshot.locals)
    || !snapshot.community || typeof snapshot.community !== 'object'
    || !snapshot.wishes || !Array.isArray(snapshot.wishes.events)
    || Object.hasOwn(snapshot, 'worldPolicy') && !validWorldPolicy(snapshot.worldPolicy, snapshot.worldId ?? DEFAULT_WORLD_ID)) return false;
  const community = snapshot.community;
  if (!Object.hasOwn(COMMUNITY_SCENARIOS, community.scenarioKey)
    || typeof community.status !== 'string' || typeof community.running !== 'boolean'
    || !['elapsed', 'target', 'supported', 'unmet', 'supplies', 'helpBudget'].every(key => Number.isFinite(community[key]))
    || !Array.isArray(community.jobs) || !Array.isArray(community.events)
    || !community.events.every(event => event && typeof event.message === 'string')) return false;
  const self = snapshot.players.find(player => player?.id === selfId);
  return Boolean(self && Array.isArray(self.position) && self.position.length === 3
    && self.position.every(Number.isFinite) && Number.isFinite(self.yaw)
    && Number.isFinite(self.altitude) && self.altitude >= 0
    && snapshot.players.every(player => player && typeof player.id === 'string'
      && (player.buildingId === null && player.levelId === null
        || typeof player.buildingId === 'string' && typeof player.levelId === 'string'
          && player.levelId.startsWith(`${player.buildingId}/l`)))
    && snapshot.locals.every(local => local && typeof local.id === 'string'));
}
