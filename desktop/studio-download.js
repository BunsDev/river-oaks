// Studio exports are local region documents, bounded by the region-v1 contract.
// The initiator must match too: a blob URL alone cannot identify its frame.
export function studioDownloadAllowed({ url, initiator, filename, mime, bytes, userGesture }, gameOrigin) {
  try {
    return Boolean(userGesture) && initiator === gameOrigin
      && new URL(url).protocol === 'blob:' && new URL(url).origin === gameOrigin
      && filename === 'world-studio-region.json' && mime === 'application/json'
      && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 128 * 1024;
  } catch { return false; }
}
