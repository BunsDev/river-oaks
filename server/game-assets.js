// Vite's access entry and preload helper must load before sign-in. Every other
// executable/style chunk and world data requires server-side approval.
export const protectedGameAsset=pathname=>pathname.startsWith('/data/')
  || pathname.startsWith('/assets/') && /\.(?:js|css)$/.test(pathname)
    && !/^\/assets\/(?:index|preload-helper)-[^/]+\.(?:js|css)$/.test(pathname);
