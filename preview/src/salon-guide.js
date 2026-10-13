// The Salon Guide on screen: an illustrated book of how to play each plaza table game.
// Every game sheet gets a "How to play" button (attachGuide), and Play & rides an entry
// (createGuideEntry). The book is one modal dialog on <body>, outside the sheets, so
// its keys never reach a sheet or the world and the regulars' redraws never take its
// focus. A game the player has not read yet shows a gold mark on its button.
import './salon-guide.css';
import { dismissOnOutsideClick } from './modal-dismiss.js';
import { GUIDE, WIDE_FIGURES, chapterOf, createGuideMemory, figureMarkup, guideGame, guideStep, iconMarkup } from './salon-guide-content.js';

const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const memory = createGuideMemory(), buttons = new Set();
let book = null;

function createBook() {
  const dialog = document.createElement('dialog');
  dialog.className = 'salon-guide'; dialog.dataset.guideDialog = '';
  dialog.setAttribute('aria-labelledby', 'salon-guide-title');
  dialog.innerHTML = `<div class="salon-guide-frame">
    <header class="salon-guide-masthead"><p class="salon-guide-eyebrow">River Oaks · The Plaza Salon</p><h2 id="salon-guide-title">The Salon Guide</h2>
      <p class="salon-guide-rule" aria-hidden="true"><span>✦</span></p>
      <button type="button" class="salon-guide-close" data-guide-close aria-label="Close the guide">×</button></header>
    <div class="salon-guide-body">
      <div class="salon-guide-index" role="tablist" aria-label="Games" aria-orientation="vertical">${GUIDE.map(game => `<button type="button" role="tab" id="salon-guide-tab-${game.id}" data-guide-game="${game.id}" aria-controls="salon-guide-page" aria-label="${escape(game.name)}"><span class="salon-medallion">${iconMarkup(game.id)}</span><span class="salon-guide-tab-text"><strong>${escape(game.name)}</strong><small>${escape(game.place)}</small></span></button>`).join('')}</div>
      <article class="salon-guide-page" id="salon-guide-page" role="tabpanel" tabindex="-1"></article>
    </div>
    <footer class="salon-guide-footer"><button type="button" class="salon-guide-previous" data-guide-step="previous"><span aria-hidden="true">‹</span> Previous</button>
      <ol class="salon-guide-dots" aria-hidden="true"></ol>
      <button type="button" class="salon-guide-next" data-guide-step="next"></button></footer>
    <p class="salon-guide-status" aria-live="polite"></p>
  </div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector), tabs = [...dialog.querySelectorAll('[data-guide-game]')];
  let state = { game: 0, page: 0 }, opener = null;

  function render({ announce = true } = {}) {
    const game = GUIDE[state.game], page = game.pages[state.page], last = state.page === game.pages.length - 1;
    tabs.forEach((tab, index) => { const selected = index === state.game; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
    // On a phone the index is one scrolling row: bring the chosen game to its middle (scrolling only the row).
    const index = $('.salon-guide-index');
    if (index.scrollWidth > index.clientWidth + 1) {
      const row = index.getBoundingClientRect(), chosen = tabs[state.game].getBoundingClientRect();
      index.scrollLeft += (chosen.left + chosen.width / 2) - (row.left + row.width / 2);
    }
    const sheet = $('.salon-guide-page');
    sheet.setAttribute('aria-labelledby', `salon-guide-tab-${game.id}`);
    sheet.dataset.guideGame = game.id; sheet.dataset.guidePage = String(state.page);
    sheet.innerHTML = `<p class="salon-guide-chapter">${escape(game.name)} · ${chapterOf(state.page)}</p><h3>${escape(page.title)}</h3>
      <div class="salon-guide-spread"${WIDE_FIGURES.has(page.figure.kind) ? ' data-guide-wide' : ''}><figure class="salon-guide-figure">${figureMarkup(page.figure, game)}</figure>
      <div class="salon-guide-text">${page.text.map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}</div></div>`;
    sheet.classList.remove('salon-guide-turn'); void sheet.offsetWidth; sheet.classList.add('salon-guide-turn');
    $('.salon-guide-dots').innerHTML = game.pages.map((_, index) => `<li${index === state.page ? ' data-current' : ''}></li>`).join('');
    $('.salon-guide-previous').disabled = state.game === 0 && state.page === 0;
    const following = GUIDE[state.game + 1], next = $('.salon-guide-next');
    next.dataset.guideStep = last && !following ? 'close' : 'next';
    next.innerHTML = !last ? 'Next <span aria-hidden="true">›</span>' : following ? `${escape(following.name)} <span aria-hidden="true">›</span>` : 'Back to the table';
    if (announce) $('.salon-guide-status').textContent = `${game.name}, page ${state.page + 1} of ${game.pages.length}: ${page.title}`;
    memory.add(game.id); for (const refresh of buttons) refresh();
  }
  const go = action => { state = guideStep(state, action); render(); };

  dialog.addEventListener('click', event => {
    const tab = event.target.closest('[data-guide-game]'), step = event.target.closest('[data-guide-step]');
    if (tab) go({ type: 'game', game: tabs.indexOf(tab) });
    else if (step?.dataset.guideStep === 'close' || event.target.closest('[data-guide-close]')) dialog.close();
    else if (step) go({ type: step.dataset.guideStep });
  });
  // A click pressed and released outside the book's frame closes it; a drag out does not.
  dismissOnOutsideClick(dialog, () => dialog.close(), dialog.querySelector('.salon-guide-frame'));
  // Keys stay in the book: the sheets and the world listen further out.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    const onTab = event.target.closest?.('[data-guide-game]');
    if (onTab && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      go({ type: 'game', game: (state.game + (event.key === 'ArrowDown' ? 1 : GUIDE.length - 1)) % GUIDE.length });
      tabs[state.game].focus();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); go({ type: event.key === 'ArrowRight' ? 'next' : 'previous' }); if (onTab) tabs[state.game].focus(); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); go({ type: 'page', page: event.key === 'Home' ? 0 : Infinity }); }
  });
  dialog.addEventListener('close', () => {
    const back = opener; opener = null;
    if (back?.isConnected && back.checkVisibility?.({ visibilityProperty: true }) !== false) back.focus({ preventScroll: true });
  });
  return {
    open(id = null, from = null) {
      const index = GUIDE.findIndex(game => game.id === id);
      if (index >= 0) state = { game: index, page: 0 };
      opener = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      render({ announce: false });
      if (!dialog.open) dialog.showModal();
      tabs[state.game].focus({ preventScroll: true });
    },
    dialog,
  };
}

export function openGuide(id = null, opener = null) { book ??= createBook(); book.open(id, opener); }

// Adds "How to play" to a game sheet's header, before its close button. `gameId` is
// the game's id, or a function returning it for a sheet that switches games.
export function attachGuide(panel, gameId) {
  const header = panel.querySelector('.table-game-header');
  if (!header) return null;
  const idOf = typeof gameId === 'function' ? gameId : () => gameId;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'salon-guide-open'; button.dataset.guideOpen = '';
  button.innerHTML = '<span class="salon-guide-open-mark" aria-hidden="true">?</span><span class="salon-guide-open-label" aria-hidden="true"><span class="salon-guide-open-new">New here? </span>How to play</span>';
  const refresh = () => {
    const game = guideGame(idOf());
    button.hidden = !game;
    if (!game) return;
    button.dataset.guideFor = game.id;
    button.setAttribute('aria-label', `How to play ${game.name}`);
    button.toggleAttribute('data-guide-new', !memory.has(game.id));
  };
  button.addEventListener('click', () => openGuide(idOf(), button));
  header.insertBefore(button, header.querySelector('.table-game-close'));
  buttons.add(refresh); refresh();
  // A sheet that switches games (chess, checkers, Connect Four) says so on data-game.
  new MutationObserver(refresh).observe(panel, { attributes: true, attributeFilter: ['data-game'] });
  return button;
}

// The guide's place in Play & rides, beside Photo mode.
export function createGuideEntry() {
  const section = document.createElement('section');
  section.className = 'salon-guide-entry';
  section.innerHTML = '<button type="button" class="salon-guide-entry-open" data-guide-entry>Game guide <span aria-hidden="true">↗</span></button><p>How to play the plaza\'s table games.</p>';
  section.querySelector('button').addEventListener('click', event => openGuide(null, event.currentTarget));
  return section;
}
