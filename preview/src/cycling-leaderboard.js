// The cycling leaderboard: a glass sheet in the Play dock listing the top riders
// by lifetime miles with your own rank, read from the town's leaderboard route.
// It fetches when opened and refreshes while open, so a rider watches their own
// row climb after stepping off. Rows are keyed by rank so a refresh only edits
// text. The rack prompt borrows `mine()` for the lifetime figure.

const REFRESH_MS = 30000;

export const formatMiles = miles => `${(Math.round(miles * 10) / 10).toFixed(1)} mi`;

export function createCyclingLeaderboard({ fetcher = (path, options) => fetch(path, options), refreshMs = REFRESH_MS } = {}) {
  const panel = document.createElement('details'); panel.className = 'cycling-board'; panel.id = 'cycling-board';
  panel.innerHTML = `<summary><span>Cycling</span><small class="cycling-board-mine" hidden></small></summary>
    <div class="cycling-board-sheet">
      <p class="cycling-board-eyebrow">Plaza bike rack · lifetime miles</p>
      <ol class="cycling-board-list" aria-label="Cycling leaderboard"></ol>
      <p class="cycling-board-empty" hidden>No miles yet. Take a bike at the plaza rack.</p>
      <p class="cycling-board-status" role="status" aria-live="polite" hidden></p>
      <p class="cycling-board-footer" hidden></p>
    </div>`;
  const list = panel.querySelector('.cycling-board-list'), empty = panel.querySelector('.cycling-board-empty'), status = panel.querySelector('.cycling-board-status'),
    footer = panel.querySelector('.cycling-board-footer'), mineBadge = panel.querySelector('.cycling-board-mine');
  const rows = new Map();
  let board = null, timer = null, loading = null;
  const render = () => {
    const top = board?.top ?? [];
    for (const [rank, row] of rows) if (rank > top.length) { row.remove(); rows.delete(rank); }
    for (const [index, entry] of top.entries()) {
      let row = rows.get(entry.rank);
      if (!row) {
        row = document.createElement('li'); row.className = 'cycling-board-row';
        row.append(document.createElement('span'), document.createElement('strong'), document.createElement('span'));
        rows.set(entry.rank, row);
      }
      row.children[0].textContent = `#${entry.rank}`; row.children[1].textContent = entry.name; row.children[2].textContent = formatMiles(entry.miles);
      const mine = board.me?.rank === entry.rank && board.me?.miles === entry.miles && board.meName === entry.name;
      row.classList.toggle('cycling-board-row-mine', mine);
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
    }
    empty.hidden = top.length > 0;
    const me = board?.me ?? null;
    footer.hidden = !me || top.some(entry => entry.rank === me.rank);
    if (!footer.hidden) footer.textContent = `You: #${me.rank} · ${formatMiles(me.miles)}`;
    mineBadge.hidden = !me; if (me) mineBadge.textContent = formatMiles(me.miles);
  };
  const load = async () => {
    if (loading) return loading;
    loading = (async () => {
      try {
        const response = await fetcher('/api/cycling/leaderboard', { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('Leaderboard unavailable');
        board = await response.json(); status.hidden = true; render();
      } catch { status.textContent = 'Leaderboard unavailable'; status.hidden = false; }
      finally { loading = null; }
    })();
    return loading;
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  panel.addEventListener('toggle', () => {
    stop();
    if (panel.open) { void load(); timer = setInterval(() => { void load(); }, refreshMs); }
  });
  return {
    panel,
    // The viewer's own lifetime miles, when the board has been read; null before.
    mine: () => board?.me ? board.me.miles : null,
    // Who the viewer is on the board (the roster name), for the highlighted row.
    setName(name) { if (board) board.meName = name; else board = { top: [], me: null, meName: name }; render(); },
    refresh: load,
    debug: () => ({ open: panel.open, rows: [...list.children].map(row => row.textContent), me: board?.me ?? null, footer: footer.hidden ? null : footer.textContent, status: status.hidden ? null : status.textContent }),
    dispose() { stop(); panel.remove(); },
  };
}
