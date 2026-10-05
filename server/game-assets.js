// The path a request will actually be served from. The CDN and the Node server
// both decode percent escapes and read a backslash as a slash, so
// "/%64ata/x.json", "/data%2Fx.json" and "/data\x.json" all name /data/x.json.
// Letter case is folded because a case-insensitive disk serves /DATA/x.json
// too. Returns null for a spelling that cannot be classified: a malformed
// escape, a NUL, or an escape that survives one decode.
export function canonicalAssetPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('%')) return null;
  const segments = [];
  for (const segment of decoded.replaceAll('\\', '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop(); else segments.push(segment);
  }
  return `/${segments.join('/')}`.toLowerCase();
}

// Vite's access entry and preload helper must load before sign-in. Every other
// executable/style chunk and world data requires server-side approval. A path
// that cannot be classified is treated as gated.
export const protectedGameAsset = pathname => {
  const path = canonicalAssetPath(pathname);
  return path === null || path.startsWith('/data/')
    || path.startsWith('/assets/') && /\.(?:js|css)$/.test(path)
      && !/^\/assets\/(?:index|preload-helper)-[^/]+\.(?:js|css)$/.test(path);
};
