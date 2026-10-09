import { buildDebugReport, canCaptureScreenshot, captureScreenshot, reportMarkdown } from './debug-report.js';
import './debug-report.css';

// "Report a problem": describe what happened, see exactly what is included, then
// copy it, download it, or (when signed in) send it to the team.
let dialog = null, inbox = null;

const element = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };
const download = (name, text, type = 'application/json') => {
  const url = URL.createObjectURL(new Blob([text], { type })), link = element('a', { href: url, download: name });
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const fileName = report => `typesafe-place-report-${report.createdAt.replace(/[:.]/g, '-')}.json`;

function createDialog() {
  const status = element('p', { className: 'report-status', role: 'status' });
  const description = element('textarea', { id: 'report-description', maxLength: 2000, rows: 4, placeholder: 'For example: after stepping into Dior the screen went black and the controls stopped responding.' });
  const screenshot = element('input', { type: 'checkbox', id: 'report-screenshot' });
  const preview = element('pre', { className: 'report-preview', tabIndex: 0 });
  const details = element('details', { className: 'report-details' }, element('summary', {}, 'Preview everything in this report'), preview);
  const send = element('button', { type: 'button', className: 'report-primary', id: 'report-send' }, 'Send report');
  const copy = element('button', { type: 'button', id: 'report-copy' }, 'Copy');
  const save = element('button', { type: 'button', id: 'report-download' }, 'Download');
  const close = element('button', { type: 'button', className: 'report-close', id: 'report-close', ariaLabel: 'Close' }, '×');
  const node = element('dialog', { className: 'report-dialog', id: 'report-dialog' },
    element('div', { className: 'report-head' }, element('h2', { id: 'report-title' }, 'Report a problem'), close),
    element('p', { className: 'report-intro' }, 'Tell us what went wrong. The report adds what we need to fix it: your browser, device and graphics card, how smoothly the game was running, where you were, and recent errors. It never includes your messages, email address, password or sign-in details.'),
    element('label', { htmlFor: 'report-description', className: 'report-label' }, 'What happened, and what did you expect?'), description,
    element('label', { className: 'report-check' }, screenshot, ' Include a picture of the game view'),
    details,
    element('div', { className: 'report-actions' }, send, copy, save), status);
  node.setAttribute('aria-labelledby', 'report-title');
  document.body.append(node);
  const state = { getSession: () => ({}), opener: null, busy: false };
  const say = (text, tone = '') => { status.textContent = text; status.dataset.tone = tone; };
  const current = async () => buildDebugReport({ description: description.value.trim(), screenshot: screenshot.checked ? await captureScreenshot().catch(() => null) : null });
  const refresh = async () => { const report = await buildDebugReport({ description: description.value.trim() }); preview.textContent = JSON.stringify(report, null, 2); };
  details.addEventListener('toggle', () => { if (details.open) void refresh(); });
  const guard = action => async () => {
    if (state.busy) return;
    state.busy = true; node.setAttribute('aria-busy', 'true');
    try { await action(); } catch (error) { say(`Something went wrong preparing the report: ${error.message}`, 'error'); } finally { state.busy = false; node.removeAttribute('aria-busy'); }
  };
  copy.addEventListener('click', guard(async () => {
    const report = await current(), text = reportMarkdown(report);
    try { await navigator.clipboard.writeText(text); say(`Copied. Paste it into a message to the team${report.screenshot ? '; the picture is only in the download' : ''}.`, 'ok'); }
    catch { preview.textContent = text; details.open = true; say('Copying was blocked. The report is shown below: select it and copy it by hand.', 'error'); }
  }));
  save.addEventListener('click', guard(async () => { const report = await current(); download(fileName(report), JSON.stringify(report, null, 2)); say('Downloaded. Attach the file when you contact the team.', 'ok'); }));
  send.addEventListener('click', guard(async () => {
    const { csrfToken } = state.getSession();
    say('Sending…');
    let report = await current(), response = await post(report, csrfToken);
    // A picture that pushes the report over the limit is dropped rather than losing the report.
    if (response.status === 413 && report.screenshot) { report = { ...report, screenshot: null }; response = await post(report, csrfToken); }
    const body = await response.json().catch(() => ({}));
    if (response.ok) say(`Sent. Thank you! Your reference is ${String(body.id).slice(0, 8)}.`, 'ok');
    else if (response.status === 429) say(body.error ?? 'Please wait a few minutes before sending another report.', 'error');
    else if (response.status === 401) say('Sign in to send a report, or copy or download it instead.', 'error');
    else say('The report could not be sent. Copy or download it instead, then share it with the team.', 'error');
  }));
  close.addEventListener('click', () => node.close());
  node.addEventListener('close', () => { if (state.opener?.isConnected) state.opener.focus(); });
  return { node, state, description, screenshot, send, details, say };
}
const post = (report, csrfToken) => fetch('/api/debug-reports', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken ?? '' }, body: JSON.stringify(report) });

export function openReportDialog({ getSession = () => ({}) } = {}) {
  dialog ??= createDialog();
  const { node, state, screenshot, send, details, say } = dialog, session = getSession();
  state.getSession = getSession; state.opener = document.activeElement;
  send.hidden = !session.signedIn || !session.csrfToken;
  screenshot.disabled = !canCaptureScreenshot(); if (screenshot.disabled) screenshot.checked = false;
  details.open = false; say(session.signedIn ? '' : 'Signed out: copy or download the report and share it with the team.');
  if (!node.open) node.showModal();
  dialog.description.focus();
  return node;
}

// Admins: the reports players have sent, newest first, each downloadable.
export async function openReportInbox() {
  if (!inbox) {
    const list = element('div', { className: 'report-list' }), status = element('p', { className: 'report-status', role: 'status' });
    const close = element('button', { type: 'button', className: 'report-close', ariaLabel: 'Close' }, '×');
    const node = element('dialog', { className: 'report-dialog report-inbox', id: 'report-inbox' },
      element('div', { className: 'report-head' }, element('h2', { id: 'report-inbox-title' }, 'Problem reports'), close), status, list);
    node.setAttribute('aria-labelledby', 'report-inbox-title');
    close.addEventListener('click', () => node.close());
    document.body.append(node);
    inbox = { node, list, status };
  }
  const { node, list, status } = inbox;
  list.replaceChildren(); status.textContent = 'Loading reports…';
  if (!node.open) node.showModal();
  try {
    const response = await fetch('/api/debug-reports', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 403 ? 'Only admins can read reports.' : `Reports are unavailable (${response.status}).`);
    const { reports } = await response.json();
    status.textContent = reports.length ? `${reports.length} report${reports.length === 1 ? '' : 's'}, newest first. Reports are kept for 30 days.` : 'No reports yet.';
    for (const report of reports) {
      const get = element('button', { type: 'button' }, 'Download');
      get.addEventListener('click', async () => {
        const result = await fetch(`/api/debug-reports/get?id=${encodeURIComponent(report.id)}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!result.ok) { status.textContent = 'That report could not be downloaded.'; return; }
        download(`typesafe-place-report-${report.id}.json`, JSON.stringify(await result.json(), null, 2));
      });
      list.append(element('article', { className: 'report-item' },
        element('header', {}, element('strong', {}, report.reporter?.name ?? 'Player'), element('time', { dateTime: report.receivedAt }, new Date(report.receivedAt).toLocaleString())),
        element('p', {}, report.description || 'No description.'),
        element('p', { className: 'report-meta' }, [`${report.version} · ${String(report.commit).slice(0, 8)}`, report.path, report.browser, `${report.errors} error${report.errors === 1 ? '' : 's'}`, report.screenshot ? 'picture' : ''].filter(Boolean).join(' · ')),
        report.firstError ? element('p', { className: 'report-error' }, report.firstError) : '', get));
    }
  } catch (error) { status.textContent = error.message; }
  return node;
}
