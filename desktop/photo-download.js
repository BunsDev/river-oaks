// The game can export locally rendered photos, not arbitrary network downloads.
// Initiator origin matters: a blob URL and a whole-tab URL alone do not identify
// the frame that initiated a download.
export function photoDownloadAllowed({ url, initiator, filename, mime, bytes, userGesture }, gameOrigin) {
  try {
    return Boolean(userGesture) && initiator === gameOrigin
      && new URL(url).protocol === 'blob:' && new URL(url).origin === gameOrigin
      && mime === 'image/png'
      && /^river-oaks-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.png$/.test(filename)
      && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 20 * 1024 * 1024;
  } catch { return false; }
}
