// The leaderboards: a glass sheet in the Play dock listing the top players on
// one board (cycling, walking, hours played, or a vehicle's miles; see
// leaderboard-boards.js) with your own rank, read from the town's leaderboard
// route. It opens on Cycling, fetches when opened or switched, and refreshes
// while open, so a rider watches their own row climb after stepping off. Rows
// are keyed by rank so a refresh only edits text. The server marks the
// viewer's own row (`you`), so the highlight never depends on matching names.
// The rack prompt borrows `mine()` for the lifetime cycling figure.
import { BOARDS, formatBoardValue } from './leaderboard-boards.js';

const REFRESH_MS = 30000;

export const formatMiles = miles => formatBoardValue('cycling', miles);

// What the sheet shows for one board's reply: rows with the viewer's own marked
// from the server's `you` flag, the empty state, a footer when the viewer ranks
// below the list, and the summary badge. Null page: nothing read yet.
export function boardView(board, page) {
  const top = page?.top ?? [], me = page?.me ?? null;
  return {
    rows: top.map(entry => ({ rank: entry.rank, name: entry.name, value: formatBoardValue(board.id, entry.value), mine: entry.you === true })),
    empty: Boolean(page) && top.length === 0,
    footer: me && !top.some(entry => entry.you === true) ? `You: #${me.rank} · ${formatBoardValue(board.id, me.value)}` : null,
    badge: me ? formatBoardValue(board.id, me.value) : null,
  };
}

export function createCyclingLeaderboard({ fetcher = (path, options) => fetch(path, options), refreshMs = REFRESH_MS } = {}) {
  const panel = document.createElement('details'); panel.className = 'cycling-board'; panel.id = 'cycling-board';
  panel.innerHTML = `<summary><span>Leaderboards</span><small class="cycling-board-mine" hidden></small></summary>
    <div class="cycling-board-sheet">
      <label class="cycling-board-picker"><span>Board</span><select class="cycling-board-select"></select></label>
      <p class="cycling-board-eyebrow"></p>
      <ol class="cycling-board-list"></ol>
      <p class="cycling-board-empty" hidden></p>
      <p class="cycling-board-status" role="status" aria-live="polite" hidden></p>
      <p class="cycling-board-footer" hidden></p>
    </div>`;
  const list = panel.querySelector('.cycling-board-list'), empty = panel.querySelector('.cycling-board-empty'), status = panel.querySelector('.cycling-board-status'),
    footer = panel.querySelector('.cycling-board-footer'), mineBadge = panel.querySelector('.cycling-board-mine'), eyebrow = panel.querySelector('.cycling-board-eyebrow'),
    select = panel.querySelector('.cycling-board-select');
  for (const board of BOARDS) select.append(new Option(board.label, board.id));
  const rows = new Map();
  let current = BOARDS[0], page = null, cyclingMine = null, timer = null, loading = null, generation = 0;
  const describe = () => {
    eyebrow.textContent = current.eyebrow; empty.textContent = current.empty;
    list.setAttribute('aria-label', `${current.label} leaderboard`);
  };
  const render = () => {
    const view = boardView(current, page);
    for (const [rank, row] of rows) if (rank > view.rows.length) { row.remove(); rows.delete(rank); }
    for (const [index, entry] of view.rows.entries()) {
      let row = rows.get(entry.rank);
      if (!row) {
        row = document.createElement('li'); row.className = 'cycling-board-row';
        row.append(document.createElement('span'), document.createElement('strong'), document.createElement('span'));
        rows.set(entry.rank, row);
      }
      row.children[0].textContent = `#${entry.rank}`; row.children[1].textContent = entry.name; row.children[2].textContent = entry.value;
      row.classList.toggle('cycling-board-row-mine', entry.mine);
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
    }
    empty.hidden = !view.empty;
    footer.hidden = view.footer === null; if (view.footer !== null) footer.textContent = view.footer;
    mineBadge.hidden = view.badge === null; if (view.badge !== null) mineBadge.textContent = view.badge;
  };
  const load = async () => {
    if (loading) return loading;
    const board = current, ticket = ++generation;
    const pending = (async () => {
      try {
        const response = await fetcher(`/api/leaderboards/${board.id}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('Leaderboard unavailable');
        const value = await response.json();
        if (board.id === 'cycling') cyclingMine = value.me ? value.me.value : null;
        // A reply for a board the viewer has since switched away from is dropped.
        if (ticket !== generation || board !== current) return;
        page = value; status.hidden = true; render();
      } catch { if (ticket === generation) { status.textContent = 'Leaderboard unavailable'; status.hidden = false; } }
      finally { if (loading === pending) loading = null; }
    })();
    loading = pending;
    return pending;
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const start = () => { stop(); if (panel.open) { void load(); timer = setInterval(() => { void load(); }, refreshMs); } };
  const show = id => {
    const board = BOARDS.find(item => item.id === id);
    if (!board || board === current) return;
    current = board; select.value = board.id; page = null; loading = null;
    for (const row of rows.values()) row.remove();
    rows.clear(); describe(); render(); start();
  };
  select.addEventListener('change', () => show(select.value));
  panel.addEventListener('toggle', start);
  describe();
  return {
    panel,
    // The viewer's own lifetime cycling miles, once the cycling board has been read; null before.
    mine: () => cyclingMine,
    show,
    refresh: load,
    debug: () => ({ open: panel.open, board: current.id, loaded: page !== null, rows: [...list.children].map(row => row.textContent), me: page?.me ?? null, footer: footer.hidden ? null : footer.textContent, status: status.hidden ? null : status.textContent }),
    dispose() { stop(); panel.remove(); },
  };
}
