import { COMMUNITY_SCENARIOS } from './community.js';

// Admission requires the player's authoritative pose and the shared world state.
// A malformed update must never unlock a client or replace its last good state.
export function validTownSnapshot(snapshot, previousSelfId = null) {
  const selfId = snapshot?.selfId ?? previousSelfId;
  if (snapshot?.type !== 'snapshot' || typeof selfId !== 'string'
    || !Array.isArray(snapshot.players) || !Array.isArray(snapshot.locals)
    || !snapshot.community || typeof snapshot.community !== 'object'
    || !snapshot.wishes || !Array.isArray(snapshot.wishes.events)) return false;
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
    && snapshot.players.every(player => player && typeof player.id === 'string')
    && snapshot.locals.every(local => local && typeof local.id === 'string'));
}
