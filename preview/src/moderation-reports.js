// Settings → Account → Reports, for moderators only (#292, App Review guideline 1.2):
// what residents reported, open reports first and newest first, with what each carries
// (the quoted text and the reported account's last chat lines), when it should be
// answered by, a ban for the reported account and a Close for a report dealt with. The
// server decides who is a moderator and enforces every ban; this list only asks and shows.
const LIST_PATH = '/api/moderation/reports', BAN_PATH = '/api/moderation/ban', CLOSE_PATH = '/api/moderation/reports/close';
const REASONS = { disruption: 'disruptive', harassment: 'harassment', cheating: 'cheating' };
const UNAVAILABLE = 'Reports are unavailable right now.', NOT_CHANGED = 'The ban didn’t change. Try again.', NOT_CLOSED = 'The report didn’t close. Try again.';
// Server answers that are sentences are shown; codes such as waitlist_approval_required aren't.
const sentence = text => typeof text === 'string' && /\s/.test(text) && /[.!?]$/.test(text);

// Hidden until refresh() hears that the signed-in account moderates; refresh() runs
// whenever the Account pane opens.
export function createModerationReports({ fetcher = (...args) => fetch(...args), locale } = {}) {
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const root = make('div', 'settings-group moderation-reports'); root.hidden = true;
  const heading = make('h4', null, 'Reports');
  const help = make('p', 'moderation-reports-help', 'What residents reported, open reports first. A ban signs the account out of the town and keeps it out until you lift it; close a report once it’s dealt with.');
  const status = make('p', 'moderation-reports-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.tabIndex = -1;
  const list = make('ol', 'moderation-reports-list'); list.setAttribute('aria-label', 'Reports, newest first');
  root.append(heading, help, status, list);
  // Asking for the session first refreshes an expired access token, as the rest of the client does.
  const signedIn = async () => { const value = await (await fetcher('/auth/session', { credentials: 'same-origin', cache: 'no-store' })).json(); return value?.authenticated ? value : null; };
  const when = at => { try { return new Date(at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return at; } };

  // `known`: the last answer said this account moderates, so a failure since is theirs.
  // `shown`: the reports in the list now; `failing`: the failure it shows, if any.
  let asked = 0, self = null, busy = false, known = false, shown = [], failing = null;
  // Every action button in the list, so a ban in flight can hold them all.
  const buttons = new Set();
  const hold = held => { for (const button of buttons) button.disabled = held; };
  const draw = reports => { shown = reports; buttons.clear(); list.replaceChildren(...reports.map(row)); };
  const setBan = async (account, banned) => {
    if (busy) return;
    busy = true; hold(true);
    let message = NOT_CHANGED, changed = false;
    try {
      const session = await signedIn();
      if (!session) message = 'Sign in again to change a ban.';
      else {
        const response = await fetcher(BAN_PATH, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ userId: account.id, banned }) });
        const value = await response.json().catch(() => ({}));
        if (response.ok) { message = banned ? `${account.name} is banned.` : `${account.name}’s ban is lifted.`; changed = true; }
        else if (sentence(value?.error)) message = value.error;
      }
    } catch { /* NOT_CHANGED: no answer, or one that isn't JSON */ }
    busy = false;
    // The list shows this change at once, held until it reloads. If the reload fails, or a
    // newer one takes over and fails, the change stays, under both messages. The buttons
    // work again unless another ban started meanwhile.
    if (changed) { draw(shown.map(item => item.reported.id === account.id ? { ...item, reported: { ...item.reported, banned } } : item)); hold(true); }
    const failure = changed ? await refresh() : null;
    hold(busy);
    status.textContent = failure ? `${message} ${failure}` : message;
    // A refresh can hide the group (the session ended); focus then stays in the pane.
    (root.hidden ? root.closest?.('[role="tabpanel"]') : status)?.focus?.();
  };
  // Closes a report the moderator has dealt with; the list reloads to show it closed.
  const close = async item => {
    if (busy) return;
    busy = true; hold(true);
    let message = NOT_CLOSED, changed = false;
    try {
      const session = await signedIn();
      if (!session) message = 'Sign in again to close a report.';
      else {
        const response = await fetcher(CLOSE_PATH, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ id: item.id }) });
        const value = await response.json().catch(() => ({}));
        if (response.ok) { message = 'Report closed.'; changed = true; }
        else if (sentence(value?.error)) message = value.error;
      }
    } catch { /* NOT_CLOSED */ }
    busy = false;
    if (changed) { draw(shown.map(report => report.id === item.id ? { ...report, closed: { at: new Date().toISOString(), by: 'you' }, overdue: false } : report)); hold(true); }
    const failure = changed ? await refresh() : null;
    hold(busy);
    status.textContent = failure ? `${message} ${failure}` : message;
    (root.hidden ? root.closest?.('[role="tabpanel"]') : status)?.focus?.();
  };
  const stamp = at => { const time = make('time', null, when(at)); time.setAttribute('datetime', at); return time; };
  const row = item => {
    const node = make('li', `moderation-report${item.closed ? ' moderation-report-closed' : item.overdue ? ' moderation-report-overdue' : ''}`);
    const summary = make('p', 'moderation-report-summary', `${item.reported.name}: ${REASONS[item.reason] ?? item.reason}${item.reported.banned ? ' (banned)' : ''}`);
    const meta = make('p', 'moderation-report-meta', `Reported by ${item.reporter.name}, `);
    meta.append(stamp(item.at));
    // When it should be answered by, or who closed it and when.
    if (item.closed) { meta.append(make('span', null, `. Closed by ${item.closed.by}, `), stamp(item.closed.at)); }
    else if (item.respondBy) { meta.append(make('span', null, item.overdue ? '. Overdue, was due ' : '. Respond by '), stamp(item.respondBy)); }
    // What the report carries: the quoted text, then the reported account's last chat lines.
    const content = make('div', 'moderation-report-content');
    if (item.content?.quoted) content.append(make('blockquote', 'moderation-report-quote', item.content.quoted));
    if (item.content?.chat?.length) {
      const lines = make('ul', 'moderation-report-chat'); lines.setAttribute('aria-label', `${item.reported.name}’s last messages`);
      for (const line of item.content.chat) lines.append(make('li', null, line.text));
      content.append(lines);
    }
    const actions = make('div', 'moderation-report-actions');
    const button = (text, onClick, className = 'moderation-report-action') => {
      const node = make('button', className, text); node.type = 'button'; node.disabled = busy; node.addEventListener('click', onClick); buttons.add(node); return node;
    };
    const closing = () => item.id && !item.closed ? [button('Close report', () => close(item))] : [];
    const idle = () => {
      if (item.reported.id === self) return actions.replaceChildren(...closing());
      if (item.reported.banned) return actions.replaceChildren(button(`Lift ${item.reported.name}’s ban`, () => setBan(item.reported, false)), ...closing());
      // The server refuses to ban a moderator, a waitlist admin or an owner.
      if (item.reported.staff) return actions.replaceChildren(...closing());
      const start = button(`Ban ${item.reported.name}…`, () => {
        const confirm = button(`Ban ${item.reported.name}`, () => setBan(item.reported, true), 'moderation-report-action moderation-report-confirm');
        actions.replaceChildren(confirm, button('Cancel', () => { idle(); actions.children[0]?.focus?.(); }));
        confirm.focus?.();
      });
      actions.replaceChildren(start, ...closing());
    };
    idle();
    node.append(summary, meta, content, actions);
    return node;
  };
  // Answers the failure the group shows once it's done, if any.
  async function refresh() {
    const mine = ++asked;
    let session = null, response = null, value = null, threw = false;
    try {
      session = await signedIn();
      if (session) { response = await fetcher(LIST_PATH, { credentials: 'same-origin', cache: 'no-store' }); value = await response.json().catch(() => null); }
    } catch { threw = true; }
    if (mine !== asked) return failing;
    self = session?.user?.id ?? null;
    if (response?.ok && value?.moderator === true && Array.isArray(value.reports)) {
      known = true; root.hidden = false; failing = null;
      draw(value.reports);
      status.textContent = value.reports.length ? '' : 'No reports yet.';
      return null;
    }
    // Rate limits and outages answer before the route knows who is asking, so a failure
    // is shown only when the route says it is a moderator's, or this account just was one.
    // The last list stays under it.
    const failed = (threw || (session && response && !response.ok && response.status !== 401 && response.status !== 403)) && (value?.moderator === true || known);
    if (failed) { root.hidden = false; failing = status.textContent = value?.moderator === true && sentence(value.error) ? value.error : UNAVAILABLE; return failing; }
    known = false; root.hidden = true; status.textContent = ''; failing = null; draw([]);
    return null;
  }
  return Object.assign(root, { refresh });
}
