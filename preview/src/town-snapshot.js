import { COMMUNITY_SCENARIOS } from './community.js';
import { DEFAULT_WORLD_ID } from './world-contract.js';
import { clockMinute, dangerActive, validateWorldPolicy } from './world-policy.js';

// World rules (#596) are optional for older towns; when present they must be exactly valid,
// and the minute and danger flag must agree with the clock and rule they summarize.
// The first criminal action (#597): rivals' public health and players' wanted stars. Optional
// for older towns; exact when present, so the HUD never shows a hit the town did not make.
const MAX_STARS = 5;
function validCrime(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.targets) || !Array.isArray(value.wanted)) return false;
  return value.targets.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.appearance === 'string'
    && Array.isArray(item.position) && item.position.length === 3 && item.position.every(Number.isFinite) && Number.isFinite(item.yaw)
    && Number.isSafeInteger(item.maxHealth) && item.maxHealth > 0 && Number.isSafeInteger(item.health) && item.health >= 0 && item.health <= item.maxHealth
    && typeof item.incapacitated === 'boolean' && typeof item.staggered === 'boolean' && (!item.incapacitated || item.health === 0))
    && value.wanted.every(entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'
      && Number.isSafeInteger(entry[1]) && entry[1] >= 1 && entry[1] <= MAX_STARS);
}
function validPolice(value, players) {
  if (!value || !Array.isArray(value.eligible) || value.eligible.length>32 || new Set(value.eligible).size!==value.eligible.length
    || value.eligible.some(id=>!players.some(player=>player.id===id)) || !Array.isArray(value.units) || value.units.length > 6 || !Array.isArray(value.surrendered)
    || value.surrendered.length > 32 || new Set(value.surrendered).size !== value.surrendered.length
    || value.surrendered.some(id => !players.some(player => player.id === id))
    || new Set(value.units.map(unit => unit?.id)).size !== value.units.length) return false;
  return value.units.every(unit => unit && /^police:[0-5]$/.test(unit.id) && Array.isArray(unit.position)
    && unit.position.length === 3 && unit.position.every(Number.isFinite) && Number.isFinite(unit.yaw)
    && ['pursue','search','arrest','return'].includes(unit.state)
    && (unit.state === 'return' ? unit.targetId === null : typeof unit.targetId === 'string' && unit.targetId.length > 0));
}
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
    || Object.hasOwn(snapshot, 'worldPolicy') && !validWorldPolicy(snapshot.worldPolicy, snapshot.worldId ?? DEFAULT_WORLD_ID)
    || Object.hasOwn(snapshot, 'crime') && !validCrime(snapshot.crime)
    || Object.hasOwn(snapshot, 'police') && !validPolice(snapshot.police, snapshot.players)) return false;
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
