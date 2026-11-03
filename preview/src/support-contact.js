// Published support contact (#292, App Review guideline 1.2). VITE_SUPPORT_CONTACT is
// set at build time: an email address or an https link. Anything else, including no value
// or an address at a reserved example domain, shows nothing, so the page never shows a
// placeholder. Plain ASCII addresses and named hosts only: no mailto fields, direction
// overrides, trailing dots or bare IP addresses.
//
// This module belongs to the sign-in page (access-entry.js) only: a module shared with
// game code is split into a chunk the asset gate refuses before sign-in
// (scripts/check-access-entry.mjs). Settings → Account → Support (settings-support.js)
// copies the link from the gate's node instead of importing these rules.
const RESERVED = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;
const HOST = /^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/;
const EMAIL = /^[A-Za-z0-9._+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/;

export function supportLink(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 254) return null;
  if (EMAIL.test(text)) return RESERVED.test(text.split('@')[1]) ? null : { href: `mailto:${text}`, text };
  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || !HOST.test(url.hostname) || RESERVED.test(url.hostname)) return null;
  return { href: url.href, text: `${url.host}${url.pathname === '/' ? '' : url.pathname}` };
}

export const SUPPORT_LEAD = 'Questions, problems or safety concerns: ';
// The contact under the sign-in and waitlist gate (preview/src/access-entry.js), so a
// visitor who is signed out, waiting, refused or banned can reach someone before they
// are ever in the world. Null when nothing is configured.
export function createGateSupport(value) {
  const link = supportLink(value);
  if (!link) return null;
  const line = document.createElement('p'); line.className = 'access-support'; line.id = 'access-support';
  line.textContent = SUPPORT_LEAD;
  const anchor = document.createElement('a'); anchor.href = link.href; anchor.textContent = link.text;
  if (link.href.startsWith('https:')) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  line.append(anchor);
  return line;
}
