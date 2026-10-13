// Distance and direction for shared voice, from confirmed town positions. All of
// this is presentation: the server already decided who shares a room.
import { ENCOUNTER_FAR } from './encounter.js';

// Full volume within talking reach; silence beyond VOICE_FAR. Residents past
// VOICE_FAR are unsubscribed, and resubscribed once inside VOICE_RESUBSCRIBE,
// so someone standing at the edge does not flap.
export const VOICE_NEAR = ENCOUNTER_FAR, VOICE_FAR = 25, VOICE_RESUBSCRIBE = 22;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function spatialGain(distance, { near = VOICE_NEAR, far = VOICE_FAR } = {}) {
  if (!Number.isFinite(distance) || distance <= near) return 1;
  if (distance >= far) return 0;
  return clamp(((far - distance) / (far - near)) ** 1.5, 0, 1);
}

// Snapshot positions are [east, north, ground] with altitude; the scene is (x, y, z) = (east, ground + altitude, -north).
export function speakerFromPlayer(player) {
  const [east, north, ground] = player.position;
  return [east, ground + (player.altitude ?? 0), -north];
}
export function listenerFromPose(pose) {
  if (!pose) return null;
  return { position: [...pose.position], yaw: pose.yaw };
}
export function spatialDistance(listener, speaker) {
  return Math.hypot(listener.position[0] - speaker[0], listener.position[1] - speaker[1], listener.position[2] - speaker[2]);
}
// Positive pans right. The walking yaw turns about +y with the camera looking
// down -z at yaw 0 (third-person.js), so a speaker's bearing is atan2(dx, -dz).
export function spatialPan(listener, speaker) {
  const dx = speaker[0] - listener.position[0], dz = speaker[2] - listener.position[2];
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  const bearing = Math.atan2(dx, -dz);
  return clamp(Math.sin(bearing - listener.yaw), -1, 1) * 0.8;
}
export function subscriptionDecision(distance, subscribed) {
  if (!Number.isFinite(distance)) return subscribed;
  return subscribed ? distance < VOICE_FAR : distance < VOICE_RESUBSCRIBE;
}
