import { realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';

export async function resolveAsset(root, input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'app:' || url.host !== 'game') return null;
    const path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const base = await realpath(root);
    const file = await realpath(resolve(base, `.${path}`));
    const child = relative(base, file);
    if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) return null;
    return (await stat(file)).isFile() ? file : null;
  } catch { return null; }
}

export function navigationAllowed(input, entry) {
  try {
    const url = new URL(input), base = new URL(entry);
    return url.protocol === base.protocol && url.host === base.host && !url.username && !url.password;
  } catch { return false; }
}

export function windowBounds(saved, displays) {
  const primary = displays[0] ?? { width: 1280, height: 800 };
  const fallback = { width: Math.min(1280, primary.width), height: Math.min(800, primary.height) };
  const { x, y, width, height } = saved ?? {};
  if (![x, y, width, height].every(Number.isFinite) || width < 800 || height < 600) return fallback;
  const display = displays.find(d => x >= d.x && y >= d.y && x + width <= d.x + d.width && y + height <= d.y + d.height);
  return display ? { x, y, width, height } : fallback;
}
