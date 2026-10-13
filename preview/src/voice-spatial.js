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
// The walking pose is the eye; residents are placed at their feet, so measure
// the listener at the feet too (ground plus altitude) when the pose says where they are.
export function listenerFromPose(pose) {
  if (!pose) return null;
  const feet = Number.isFinite(pose.ground) ? pose.ground + (pose.altitude ?? 0) : pose.position[1];
  return { position: [pose.position[0], feet, pose.position[2]], yaw: pose.yaw };
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

// One resident's voice as a small Web Audio graph: source → gain → pan →
// output. Chromium decodes a remote WebRTC track only while a media element
// holds it, so the track stays attached to a muted element that never plays.
// Gain starts at silence until the first position arrives.
export function createPeerGraph(context, track) {
  const element = track.attach?.() ?? null;
  if (element) { element.muted = true; element.volume = 0; }
  const stream = track.mediaStream ?? (track.mediaStreamTrack ? new MediaStream([track.mediaStreamTrack]) : null);
  if (!stream) throw new Error('Voice track has no stream');
  const source = context.createMediaStreamSource(stream);
  const gain = context.createGain(); gain.gain.value = 0;
  const panner = context.createStereoPanner?.() ?? null;
  source.connect(gain);
  if (panner) { gain.connect(panner); panner.connect(context.destination); } else gain.connect(context.destination);
  let disposed = false;
  const ramp = (param, value) => { if (typeof param.setTargetAtTime === 'function') param.setTargetAtTime(value, context.currentTime, 0.08); else param.value = value; };
  return {
    get gain() { return gain.gain.value; },
    update(level, pan = 0) { if (disposed) return; ramp(gain.gain, clamp(level, 0, 1)); if (panner) ramp(panner.pan, clamp(pan, -1, 1)); },
    dispose() {
      if (disposed) return; disposed = true;
      for (const node of [source, gain, panner]) { try { node?.disconnect(); } catch { /* already detached */ } }
      if (element) { try { track.detach?.(element); } catch { /* element may be gone */ } element.srcObject = null; }
    },
  };
}
