// The existing graphics governor publishes effective quality here. Avatar
// subscribers own their asynchronous upgrades and unregister on disposal.
let current = {mode:'auto', scale:1, occlusion:true};
const listeners = new Set();
export const characterQualitySnapshot = () => ({...current});
export function publishCharacterQuality({mode, scale, occlusion}) {
  current = {mode, scale, occlusion};
  for (const listener of listeners) listener({...current});
}
export function subscribeCharacterQuality(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
