// Published support contact (#292, App Review guideline 1.2). VITE_SUPPORT_CONTACT is
// set at build time: an email address or an https link. Anything else, including no value
// or an address at a reserved example domain, shows nothing, so the page never shows a
// placeholder. Plain ASCII addresses and named hosts only: no mailto fields, direction
// overrides, trailing dots or bare IP addresses.
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

// Settings → Account → Support. Null when nothing is configured.
export function createSupportContact(value) {
  const link = supportLink(value);
  if (!link) return null;
  const root = document.createElement('div'); root.className = 'settings-group support-contact';
  const heading = document.createElement('h4'); heading.textContent = 'Support';
  const line = document.createElement('p'); line.textContent = 'Questions, problems or safety concerns: ';
  const anchor = document.createElement('a'); anchor.href = link.href; anchor.textContent = link.text;
  if (link.href.startsWith('https:')) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  line.append(anchor); root.append(heading, line);
  return root;
}
