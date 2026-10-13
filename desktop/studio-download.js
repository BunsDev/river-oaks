// Studio exports are bounded local region or furnished-space JSON documents.
// The initiator must match too: a blob URL alone cannot identify its frame.
export function studioDownloadAllowed({ url, initiator, filename, mime, bytes, userGesture }, gameOrigin) {
  try {
    return Boolean(userGesture) && initiator === gameOrigin
      && new URL(url).protocol === 'blob:' && new URL(url).origin === gameOrigin
      && ['world-studio-region.json','world-studio-space.json'].includes(filename) && mime === 'application/json'
      && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 128 * 1024;
  } catch { return false; }
}
