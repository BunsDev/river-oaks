// Settings → Account → Support (#292): the published support contact, copied from the
// link the sign-in gate already shows (support-contact.js, `#access-support`). The link
// rules live there, in the sign-in page's own chunk; game code can't import that module
// without the asset gate refusing it before sign-in (scripts/check-access-entry.mjs), so
// this reads the rendered anchor instead. Null when the gate shows no contact.
export function createSupportContact(anchor = document.querySelector?.('#access-support a')) {
  if (!anchor?.href || !anchor.textContent) return null;
  const root = document.createElement('div'); root.className = 'settings-group support-contact';
  const heading = document.createElement('h4'); heading.textContent = 'Support';
  const line = document.createElement('p'); line.textContent = 'Questions, problems or safety concerns: ';
  const link = document.createElement('a'); link.href = anchor.href; link.textContent = anchor.textContent;
  if (anchor.target) { link.target = anchor.target; link.rel = anchor.rel; }
  line.append(link); root.append(heading, line);
  return root;
}
