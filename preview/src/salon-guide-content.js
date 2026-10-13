// The Salon Guide's content: how to play each plaza table game, as pages of text and
// illustrations (SVG strings), plus moving through the book and remembering which
// guides a player has read. Pure, so node tests check it against the rules modules;
// salon-guide.js puts it on screen.
const SALON_SEAT = 'Two chess tables stand in the plaza salon, one by Dior and one by Toulouse. Walk to a chair and press Z to sit, then X (Play a table game) to open the board beside you.';
const SALON_SHEET = 'Play the plaza regular and choose your side, or Pass and play to share the board with a friend. Take back returns you to your own turn; New game starts afresh. Each table keeps one game of each kind, so you can switch and come back.';
const BOARD_KEYS = [[['Z'], 'Sit down or stand up'], [['X'], 'Open the board, or put it away'], [['←', '↑', '→', '↓'], 'Move across the board'], [['Enter'], 'Choose the square'], [['Esc'], 'Put the board away; your game waits']];
const CAFE_KEYS = [[['Z'], 'Sit down or stand up'], [['X'], 'Open the table, or put it away'], [['←', '→'], 'Move along your hand'], [['Enter'], 'Choose the tile or card'], [['Esc'], 'Put the table away']];

// Every game: an id (the sheet's), a name, where it is, and its pages. A page has a
// chapter title, paragraphs, and a figure: { kind, ...options } drawn by figureMarkup.
export const GUIDE = [
  { id: 'chess', name: 'Chess', place: 'The salon chess tables', pages: [
    { title: 'Taking a seat', text: [SALON_SEAT, `Choose Chess at the top of the sheet. ${SALON_SHEET}`], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Checkmate the other king: attack it so that no move can save it.', 'A game is drawn by stalemate (no legal move, but not in check), by the same position three times, by fifty moves each without a capture or a pawn move, or when neither side has enough to mate.'], figure: { kind: 'chess-mate' } },
    { title: 'A turn', text: ['White moves first, then the sides take turns. Choose a piece to see its moves marked, then choose a marked square.', 'Castling, en passant and promotion are all played. A pawn that reaches the far rank asks which piece it becomes.'], figure: { kind: 'chess-knight' } },
    { title: 'At the table', text: ['The move list keeps the game in notation, and the table\'s own pieces follow every move.'], figure: { kind: 'keys', keys: BOARD_KEYS } },
  ] },
  { id: 'checkers', name: 'Checkers', place: 'The salon chess tables', pages: [
    { title: 'Taking a seat', text: [SALON_SEAT, `Choose Checkers at the top of the sheet. ${SALON_SHEET}`], figure: { kind: 'emblem' } },
    { title: 'Moving and jumping', text: ['American checkers: dark moves first, and only the dark squares are played. Take every piece of your opponent\'s, or leave them no move, to win.', 'A man steps one square diagonally forward. Jump a neighbouring piece by hopping to the empty square beyond it, and that piece is taken. Captures are compulsory, and a jumping piece finishes its whole sequence.'], figure: { kind: 'checkers-jump' } },
    { title: 'Crowning', text: ['A man that reaches the far row is crowned a king, and its move ends there, even in the middle of a jump.', 'A king steps or jumps one square along any diagonal. Forty moves each with no capture and no man moving is a draw.'], figure: { kind: 'checkers-crown' } },
    { title: 'At the table', text: ['The move list keeps every move and jump, and the table\'s own pieces follow the game.'], figure: { kind: 'keys', keys: BOARD_KEYS } },
  ] },
  { id: 'connectFour', name: 'Connect Four', place: 'The salon chess tables', pages: [
    { title: 'Taking a seat', text: [SALON_SEAT, `Choose Connect Four at the top of the sheet, and a standing frame rises on the table. ${SALON_SHEET}`], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Line up four of your discs before your opponent does: across, up, or along either diagonal. The winning four are lit.', 'A full board without four in a row is a draw.'], figure: { kind: 'four-win' } },
    { title: 'A turn', text: ['Red moves first. Choose a column, anywhere in it, and your disc falls to the lowest open slot. While it is your turn, each column\'s landing slot is marked.', 'The centre column joins the most lines, so it is worth claiming early.'], figure: { kind: 'four-drop' } },
    { title: 'At the table', text: ['The table\'s frame follows every disc, with the columns running from the first player\'s left.'], figure: { kind: 'keys', keys: BOARD_KEYS } },
  ] },
  { id: 'reversi', name: 'Reversi', place: 'The salon chess tables', pages: [
    { title: 'Taking a seat', text: [SALON_SEAT, `Choose Reversi at the top of the sheet, and the table's discs come out on the board. ${SALON_SHEET}`], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Finish with more discs of your colour than your opponent. Black moves first, from the four discs in the centre.', 'The game ends when neither side can move, usually when the board is full. The status keeps the count as you play.'], figure: { kind: 'reversi-start' } },
    { title: 'A turn', text: ['Place a disc so that it outflanks: a straight line of your opponent\'s discs, across, up or along a diagonal, closed at the far end by one of yours.', 'Every outflanked line turns to your colour at once. Only squares that outflank are marked, and one click places the disc.'], figure: { kind: 'reversi-flip' } },
    { title: 'Passing and corners', text: ['With no square that outflanks, you pass and your opponent moves again.', 'A corner can never be turned back, so corners are worth a great deal, and the squares beside an empty corner tend to give it away.'], figure: { kind: 'reversi-corner' } },
    { title: 'At the table', text: ['The table\'s own discs follow every move, and Take back returns you to your own turn, past any pass.'], figure: { kind: 'keys', keys: BOARD_KEYS } },
  ] },
  { id: 'morris', name: "Nine men's morris", place: 'The salon chess tables', pages: [
    { title: 'Taking a seat', text: [SALON_SEAT, `Choose Morris at the top of the sheet, and a walnut morris board is laid over the chess squares. ${SALON_SHEET}`], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Three of your pieces in a row along a line is a mill, and every mill you make takes one of your opponent\'s pieces.', 'Leave your opponent with two pieces, or with no move at all, to win. White begins.'], figure: { kind: 'morris-mill' } },
    { title: 'Placing, then moving', text: ['Each side has nine pieces. In turn, place one on any empty point with a single click, until all eighteen are down.', 'Then choose a piece and move it along a line to the next point, if it is empty.'], figure: { kind: 'morris-move' } },
    { title: 'Taking and flying', text: ['When you make a mill, the pieces you may take are marked: never one standing in a mill, unless every piece does.', 'A side down to three pieces may fly: move a piece to any empty point. Fifty moves each without a mill, or one position three times, is a draw.'], figure: { kind: 'morris-take' } },
    { title: 'At the table', text: ['The arrow keys step only between points. The table\'s morris board follows every move.'], figure: { kind: 'keys', keys: BOARD_KEYS } },
  ] },
  { id: 'dominoes', name: 'Dominoes', place: 'The round café table', pages: [
    { title: 'Taking a seat', text: ['The round café table stands in the plaza. Press Z to sit, then X (Play dominoes) to open the table. The sheet switches between Dominoes, Hearts and Spades, and X reopens whichever you played last.', 'You play the plaza regulars: choose 2 players or 4.'], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['A match to 100 points, with a double-six set of 28 tiles. Win a round by playing your last tile, and score the pips left in every other hand.', 'The holder of the highest double leads it. Then each play matches a tile\'s end to an open end of the line.'], figure: { kind: 'dominoes-line' } },
    { title: 'Draw or block', text: ['With two players it is the draw game: seven tiles each, and when nothing fits you draw from the boneyard.', 'With four it is the block game: seven each and no boneyard, so you pass. When nobody can play, the round is blocked and the lightest hand wins it.'], figure: { kind: 'dominoes-modes' } },
    { title: 'At the table', text: ['The regulars see only what a player at the table could, and on the round table only your own tiles show their pips.'], figure: { kind: 'keys', keys: CAFE_KEYS } },
  ] },
  { id: 'hearts', name: 'Hearts', place: 'The round café table', pages: [
    { title: 'Taking a seat', text: ['At the round café table, press Z to sit and X to open the table, then choose Hearts at the top of the sheet.', 'You play three plaza regulars, thirteen cards each.'], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Take as few points as you can. Each heart scores 1 and the queen of spades 13.', 'When someone reaches 100, the lowest score wins. Take all 26 points in a hand and you shoot the moon: you score nothing, and everyone else 26.'], figure: { kind: 'hearts-points' } },
    { title: 'Passing', text: ['Before each hand, pass three cards: to the left, then the right, then across. Every fourth hand you keep them.', 'The 2♣ leads the first trick, and nobody may play points on it unless their hand holds nothing else.'], figure: { kind: 'hearts-pass' } },
    { title: 'Tricks', text: ['Follow the suit that was led when you can. The highest card of that suit takes the trick and leads the next.', 'Hearts may not be led until one has been played, unless your hand holds only hearts.'], figure: { kind: 'hearts-trick' } },
    { title: 'At the table', text: ['The table shows each trick face up before each player, with the hands and the won tricks face down.'], figure: { kind: 'keys', keys: CAFE_KEYS } },
  ] },
  { id: 'spades', name: 'Spades', place: 'The round café table', pages: [
    { title: 'Taking a seat', text: ['At the round café table, press Z to sit and X to open the table, then choose Spades at the top of the sheet.', 'You and the regular across are partners against the regulars on your left and right, thirteen cards each.'], figure: { kind: 'emblem' } },
    { title: 'Bidding', text: ['Each player bids the tricks they expect to take, starting left of the dealer; the dealer moves each hand. A bid of nil promises none.', 'Partners add their bids: making it scores 10 a trick bid, and each trick over is a bag worth 1.'], figure: { kind: 'spades-bids' } },
    { title: 'Tricks', text: ['Follow the suit led when you can. Spades are trumps: the highest spade takes the trick, or else the highest card of the suit led.', 'Spades may not be led until one has been played, unless your hand holds only spades.'], figure: { kind: 'spades-trump' } },
    { title: 'Scoring', text: ['Short of the bid, a partnership loses 10 a trick bid. A nil scores 100 if its bidder takes no trick and loses 100 if they take any.', 'Every tenth bag costs 100. The first partnership to 500 wins; falling to -200 loses.'], figure: { kind: 'spades-score' } },
    { title: 'At the table', text: ['The table shows each trick face up before each player, with the hands and the won tricks face down.'], figure: { kind: 'keys', keys: CAFE_KEYS } },
  ] },
  { id: 'backgammon', name: 'Backgammon', place: 'The grove\'s walnut table', pages: [
    { title: 'Taking a seat', text: ['A walnut backgammon table stands in the grove\'s middle square, with two armchairs. Press Z to sit, then X (Play backgammon) to open the board.', 'Play the plaza regular as white or black, or Pass and play.'], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Bring all fifteen of your checkers into your home board, then bear them off. The first to bear off all fifteen wins.', 'A win scores 1. A gammon scores 2 (the loser has borne none off), and a backgammon 3 (none off, and a checker still on the bar or in the winner\'s home board).'], figure: { kind: 'emblem' } },
    { title: 'A turn', text: ['Each turn brings two dice, and you move one checker by each; doubles give four moves. Use both dice when you can, and the higher one when only one can be played.', 'Choose a checker, then its point. Undo takes back moves within your turn.'], figure: { kind: 'backgammon-opening' } },
    { title: 'Hitting and bearing off', text: ['A point held by two or more of your opponent\'s checkers is closed to you. A lone checker, a blot, is hit and goes to the bar, and a checker on the bar must enter before any other move.', 'Once all fifteen are home, bear off by the exact number, or from your highest point by a higher one: choose the checker, then the tray.'], figure: { kind: 'backgammon-hit' } },
    { title: 'At the table', text: ['The table\'s own checkers follow the game.'], figure: { kind: 'keys', keys: [[['Z'], 'Sit down or stand up'], [['X'], 'Open the board, or put it away'], [['Tab'], 'Move between checkers and points'], [['Enter'], 'Choose the checker or point'], [['Esc'], 'Put the board away']] } },
  ] },
  { id: 'mancala', name: 'Mancala', place: 'The small grove table', pages: [
    { title: 'Taking a seat', text: ['A small round table stands in the middle of the grove, with a carved mancala board and two chairs. Press Z to sit, then X (Play mancala).', 'Play the plaza regular, moving first or second, or Pass and play with a friend.'], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Each side has six pits of four seeds and a store at its right-hand end. Gather more seeds in your store than your opponent does.', 'The game ends when either side runs out of seeds; each player then banks what is left on their own side.'], figure: { kind: 'mancala-board' } },
    { title: 'Sowing', text: ['Choose one of your pits: its seeds are sown one by one, counter-clockwise, into the following pits and your store, never your opponent\'s.', 'If the last seed lands in your store, you move again.'], figure: { kind: 'mancala-sow' } },
    { title: 'Capturing', text: ['If the last seed lands in an empty pit on your side and the pit opposite holds seeds, you capture both into your store.'], figure: { kind: 'mancala-capture' } },
    { title: 'At the table', text: ['The table\'s glass beads follow the game.'], figure: { kind: 'keys', keys: [[['Z'], 'Sit down or stand up'], [['X'], 'Open the board, or put it away'], [['←', '→'], 'Move between your pits'], [['Enter'], 'Sow the pit'], [['Esc'], 'Put the board away']] } },
  ] },
  { id: 'jenga', name: 'Jenga', place: 'The curved bench\'s drum', pages: [
    { title: 'Taking a seat', text: ['The curved bench faces a travertine drum with a Jenga tower on it. Sit on any of its three places (Z), then press X (Play Jenga).', 'Play two plaza regulars, or Pass and play with a friend.'], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Pull a block from below the top and it goes on top by itself, finishing the top level before a new one starts.', 'Whoever topples the tower takes the tally mark; New tower stands it up again.'], figure: { kind: 'jenga-tower' } },
    { title: 'A steady hand', text: ['Choose a block and a marker sweeps along the meter. Stop it inside the green (Pull, Space or Enter) and the block slides out.', 'The green narrows as the tower grows taller and weaker and as the level carries more. A middle block of a full level is loosest.'], figure: { kind: 'jenga-meter' } },
    { title: 'What brings it down', text: ['Never the top level, nor the one under it until the top is finished, nor a level\'s last block.', 'A level left on a single edge block cannot carry the tower: pulling its neighbour brings it down, however steady the hand.'], figure: { kind: 'jenga-edge' } },
    { title: 'At the table', text: ['The drum\'s tower follows the game, and scatters over the drum and the paving when it falls.'], figure: { kind: 'keys', keys: [[['Z'], 'Sit down or stand up'], [['X'], 'Open the tower, or put it away'], [['↑', '↓', '←', '→'], 'Move between blocks'], [['Enter'], 'Choose a block'], [['Space'], 'Pull: stop the meter'], [['Esc'], 'Put the tower away']] } },
  ] },
  { id: 'winePong', name: 'Wine pong', place: 'The long table by the café', pages: [
    { title: 'Taking a seat', text: ['A long linen-topped table stands between the café and the planters. Walk up to either end and press X (Play wine pong); there is no chair, you play standing.', 'Play a plaza regular at the far end, or Pass and play with a friend.'], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Each side has six wine glasses racked three, two, one at its own end. Sink all six of the far glasses to win.', 'Each turn is two throws, then the far end throws.'], figure: { kind: 'pong-racks' } },
    { title: 'A throw', text: ['A reticle sweeps across the far rack: stop it for the aim. It then sweeps along that line: stop it again for the power, and the ball flies.', 'The close-up beside the table shows the far glasses large, so you can time the reticle over one.'], figure: { kind: 'pong-throw' } },
    { title: 'In, rim and bounce', text: ['A ball can drop straight in, catch a rim and rattle in or spin out, or land on the table and bounce into a glass. Anything else is a miss.', 'A sunk glass leaves the table.'], figure: { kind: 'pong-outcomes' } },
    { title: 'At the table', text: ['The real table\'s glasses follow the game, and the ball flies over it.'], figure: { kind: 'keys', keys: [[['X'], 'Open the table, or put it away'], [['Space', 'Enter'], 'Stop the reticle: aim, then throw'], [['Tab'], 'Move between the buttons'], [['Esc'], 'Put the table away']] } },
  ] },
  { id: 'go', name: 'Go', place: 'The small grove table', pages: [
    { title: 'Taking a seat', text: ['At the small grove table, press Z to sit and X to open the board, then choose Go at the top of the sheet.', 'Play the plaza regular as black or white, or Pass and play with a friend. Black moves first.'], figure: { kind: 'emblem' } },
    { title: 'The aim', text: ['Take turns placing a stone on an empty point. Surround more of the board than your opponent: at the end, your stones and the empty points only you surround both count.', 'White gets 7.5 points of komi for moving second, so there are no ties.'], figure: { kind: 'go-territory' } },
    { title: 'Capturing', text: ['The empty points beside a group are its liberties. Fill a group\'s last liberty and it is captured: its stones leave the board.', 'You may not play where your own stones would have no liberty, unless that move captures.'], figure: { kind: 'go-capture' } },
    { title: 'Ko and passing', text: ['A move may not repeat an earlier position, so a single stone taken in a ko cannot be retaken at once: play elsewhere first.', 'Two passes in a row end the game. Stones left on the board count as alive, so capture dead groups before you pass.'], figure: { kind: 'go-ko' } },
    { title: 'At the table', text: ['The table\'s goban follows the game; switching back to mancala puts it away.'], figure: { kind: 'keys', keys: [[['Z'], 'Sit down or stand up'], [['X'], 'Open the board, or put it away'], [['↑', '↓', '←', '→'], 'Move between points'], [['Enter'], 'Place a stone'], [['Esc'], 'Put the board away']] } },
  ] },
  { id: 'darts', name: 'Darts', place: 'The board on the south wall', pages: [
    { title: 'Taking a seat', text: ['A dartboard hangs on a post against the plaza\'s south wall. There is no chair: walk up to the throwing line in front of it and press X (Play darts).', 'Play a plaza regular, or Pass and play with a friend.'], figure: { kind: 'emblem' } },
    { title: 'The board', text: ['Each sector scores its number. The thin outer ring doubles it and the inner ring trebles it; the outer bull scores 25 and the bull 50.', 'The treble 20 is worth 60, the most on the board.'], figure: { kind: 'darts-board' } },
    { title: 'A throw', text: ['A line sweeps across the board: stop it to set where you aim across. A second line sweeps up and down: stop it, and the dart lands where they cross.'], figure: { kind: 'darts-throw' } },
    { title: '501, double out', text: ['Both start on 501 and take each turn\'s three darts off. The last dart must land in a double (or the bull) and bring you to exactly 0.', 'A dart that leaves you on 1, below 0, or on 0 without a double is a bust: the turn\'s darts don\'t count. On 170 or less the sheet suggests a checkout.'], figure: { kind: 'darts-checkout' } },
    { title: 'At the table', text: ['The real board shows the turn\'s darts where they landed.'], figure: { kind: 'keys', keys: [[['X'], 'Open the board, or put it away'], [['Space', 'Enter'], 'Stop the line: across, then up'], [['Tab'], 'Move between the buttons'], [['Esc'], 'Put the board away']] } },
  ] },
];

export const guideGame = id => GUIDE.find(game => game.id === id) ?? null;
// Pictures much wider than tall span the page above the text instead of beside it.
export const WIDE_FIGURES = new Set(['darts-checkout', 'mancala-board', 'mancala-sow', 'mancala-capture', 'spades-bids', 'spades-trump', 'spades-score', 'dominoes-line', 'dominoes-modes', 'hearts-points', 'hearts-pass', 'hearts-trick', 'backgammon-opening', 'backgammon-hit', 'jenga-meter', 'jenga-edge', 'pong-racks', 'pong-outcomes']);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const chapterOf = index => ROMAN[index] ?? String(index + 1);

// Moving through the book: { game, page } indexes. Next and previous carry on into the
// neighbouring game; choosing a game opens its first page.
export function guideStep({ game, page }, action) {
  const last = GUIDE.length - 1, pages = index => GUIDE[index].pages.length;
  if (action.type === 'game') return { game: Math.max(0, Math.min(last, action.game)), page: 0 };
  if (action.type === 'page') return { game, page: Math.max(0, Math.min(pages(game) - 1, action.page)) };
  if (action.type === 'next') return page < pages(game) - 1 ? { game, page: page + 1 } : game < last ? { game: game + 1, page: 0 } : { game, page };
  if (action.type === 'previous') return page > 0 ? { game, page: page - 1 } : game > 0 ? { game: game - 1, page: pages(game - 1) - 1 } : { game, page };
  return { game, page };
}

// Which guides this player has opened, kept on this device. Storage can throw (a
// private window, blocked site data), so every read and write is guarded.
export function createGuideMemory(storage = globalThis.localStorage, key = 'river-oaks-salon-guide-seen') {
  let seen = new Set();
  try { const saved = JSON.parse(storage?.getItem(key) ?? '[]'); if (Array.isArray(saved)) seen = new Set(saved.filter(id => typeof id === 'string')); } catch { /* Start fresh. */ }
  return {
    has: id => seen.has(id),
    add(id) { if (seen.has(id)) return; seen.add(id); try { storage?.setItem(key, JSON.stringify([...seen])); } catch { /* This visit still remembers. */ } },
  };
}

// ——— Illustrations ———————————————————————————————————————————————————————————
// The positions the pictures show, as data: preview/tests/salon-guide.test.js plays
// each one on the real rules, so a picture cannot show an illegal move or a false mate.
export const DIAGRAMS = {
  morrisMill: { rows: ['b.....b', '.......', '.......', 'b......', '.......', '.......', 'w..w..w'], mill: ['a1', 'd1', 'g1'] },
  morrisMove: { rows: ['w..b...', '.b...w.', '.......', 'w.....b', '.......', '.w...b.', 'b..w..w'], from: 'd1', to: 'd2' },
  morrisTake: { rows: ['...b...', '...b...', '...b...', 'wb.....', '.......', '.......', 'w..w...'], place: 'g1', takeable: ['b4'] },
  reversiStart: { marks: ['c4', 'd3', 'e6', 'f5'] },
  reversiFlip: { rows: ['........', '........', '...d....', '...l....', '.dll.ld.', '...l....', '........', '........'], place: 'e4', flips: ['c4', 'd4', 'f4'] },
  reversiCorner: { rows: ['........', '........', '........', '........', '...d....', '..l.....', '.l......', '........'], place: 'a1', flips: ['b2', 'c3'] },
  chessMate: { pieces: { g8: 'k', f7: 'p', g7: 'p', h7: 'p', e8: 'R', g1: 'K' }, toMove: 'b' },
  chessKnight: { from: 'd4', targets: ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'] },
  checkersJump: { dark: ['c3', 'a1', 'e1'], light: ['d4', 'f6', 'b6', 'h8'], path: ['c3', 'e5', 'g7'] },
  checkersCrown: { dark: ['c7', 'b4'], light: ['f8', 'g5'], from: 'c7', to: 'd8' },
  fourWin: { rows: ['.......', '.......', '.....r.', '....ry.', '..yrry.', '..ryyr.'], line: ['c1', 'd2', 'e3', 'f4'] },
  fourDrop: { rows: ['.......', '.......', '.......', '.......', '...y...', '..yrr..'], column: 3, lands: 'd3' },
  dominoesLine: { line: [[2, 6], [6, 6], [6, 4]], hand: [4, 1] },
  heartsTrick: { cards: ['9D', 'QD', 'KD', '4S'], winner: 'KD' },
  heartsPoints: ['5H', '9H', 'AH', 'QS'],
  // Darts: the checkout the sheet suggests from 81.
  dartsCheckout: { score: 81, plan: ['T19', 'D12'] },
  // Mancala: the opening, pit 3 sown into the store, and a capture (side 0's pit 2 sown into its empty pit 3 opposite seven seeds).
  mancalaSow: { pit: 3 },
  // Go on a small corner of the board (5×5, rows from the bottom): territory, a capture and a ko.
  goTerritory: { rows: ['..bw.', '.bbw.', 'bbww.', 'bw...', '.bw..'] },
  goCapture: { rows: ['.....', '..b..', '.bw..', '..b..', '.....'], play: [2, 3] },
  goKo: { rows: ['.....', '.bw..', 'b.bw.', '.bw..', '.....'], play: [2, 1], take: [2, 2] },
  mancalaCapture: { board: [0, 2, 0, 0, 0, 0, 0, 1, 1, 7, 1, 1, 1, 0], pit: 2 },
  // Spades: bids round the table (you, left, across, right), a heart trumped, and a hand's score.
  spadesBids: { bids: [3, 2, 4, 0], taken: [4, 2, 4, 0] },
  spadesTrump: { cards: ['KH', 'AH', '2S', '5H'], winner: '2S' },
  // Jenga: the top levels of a tower (bottom first), a pulled block's gap, and a level
  // whose last two blocks are its edges, so pulling one leaves the other alone.
  jengaTower: { levels: [[1, 1, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [1, 1, 1], [1, 1, 1], [0, 1, 0]], pulled: [3, 0] },
  jengaEdge: { level: [1, 0, 1], pull: 0 },
  jengaMeter: { lo: 0.38, hi: 0.62, marker: 0.5 },
  // Wine pong: the apex glass of the far rack, sunk by a dead-centre throw.
  pongThrow: { glass: 5 },
  backgammonOpening: { layout: { 24: 2, 13: 5, 8: 3, 6: 5, 1: -2, 12: -5, 17: -3, 19: -5 }, dice: [3, 1], moves: [[8, 5], [6, 5]] },
  backgammonHit: { layout: { 24: 2, 13: 5, 8: 2, 6: 4, 5: -1, 4: -2, 12: -4 }, dice: [3, 2], move: [8, 5], closed: 4 },
};
// Half a backgammon board shows points 12 to 1: white as 'w', black as 'b'.
const nearPoints = layout => Object.fromEntries(Object.entries(layout).filter(([point]) => point <= 12).map(([point, count]) => [point, [Math.abs(count), count > 0 ? 'w' : 'b']]));
const PIECE_GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const svg = (width, height, label, body) => `<svg class="salon-figure" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)}">${body}</svg>`;
const SYMBOL = 'font-family="Apple Symbols, Segoe UI Symbol, DejaVu Sans, Noto Sans Symbols 2, serif"';
const arrow = (points, id = 'a') => { const list = points.map(point => point.join(',')).join(' '); return `<polyline class="sg-path-halo" points="${list}"/><polyline class="sg-path" points="${list}" marker-end="url(#sg-head-${id})"/>`; };
const arrowHead = id => `<defs><marker id="sg-head-${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="sg-head" d="M0 0L10 5L0 10z"/></marker></defs>`;

// An 8×8 board from white's side, a1 at the bottom left; squares are named.
const CELL = 30, file = name => name.charCodeAt(0) - 97, rank = name => Number(name[1]) - 1;
const at = name => [file(name) * CELL + CELL / 2, (7 - rank(name)) * CELL + CELL / 2];
function board8(body, { marks = [], glow = [], felt = false } = {}) {
  let squares = '';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) squares += `<rect class="${felt ? 'sg-baize' : (r + f) % 2 ? 'sg-light' : 'sg-dark'}" x="${f * CELL}" y="${(7 - r) * CELL}" width="${CELL}" height="${CELL}"/>`;
  const glows = glow.map(name => `<rect class="sg-glow" x="${file(name) * CELL}" y="${(7 - rank(name)) * CELL}" width="${CELL}" height="${CELL}"/>`).join('');
  const dots = marks.map(name => `<circle class="sg-mark" cx="${at(name)[0]}" cy="${at(name)[1]}" r="5"/>`).join('');
  return `<rect class="sg-rim" x="-6" y="-6" width="252" height="252" rx="6"/>${squares}${glows}${dots}${body}`;
}
// Reversi discs from a diagram (rows from rank 8 down, 'd' / 'l' / '.'): black and white.
const reversiDiscs = (rows, { ring = [] } = {}) => rows.flatMap((row, index) => [...row].map((disc, f) => [disc, `${'abcdefgh'[f]}${8 - index}`]))
  .filter(([disc]) => disc !== '.').map(([disc, name]) => `<circle class="sg-disc sg-${disc === 'd' ? 'b' : 'w'}" cx="${at(name)[0]}" cy="${at(name)[1]}" r="11.5"/>${ring.includes(name) ? `<circle class="sg-turn" cx="${at(name)[0]}" cy="${at(name)[1]}" r="14"/>` : ''}`).join('');
// A morris board: the 24 points on three squares joined at their midpoints, from a
// diagram (rows from rank 7 down, 'w' / 'b' / '.'), with marks drawn on it.
const MORRIS_STEP = 34, morrisAt = name => [16 + ('abcdefg'.indexOf(name[0])) * MORRIS_STEP, 16 + (7 - Number(name[1])) * MORRIS_STEP];
const MORRIS_LINES = [['a7', 'g7'], ['g7', 'g1'], ['g1', 'a1'], ['a1', 'a7'], ['b6', 'f6'], ['f6', 'f2'], ['f2', 'b2'], ['b2', 'b6'], ['c5', 'e5'], ['e5', 'e3'], ['e3', 'c3'], ['c3', 'c5'], ['d7', 'd5'], ['d3', 'd1'], ['a4', 'c4'], ['e4', 'g4']];
const MORRIS_POINT_NAMES = ['a1', 'd1', 'g1', 'b2', 'd2', 'f2', 'c3', 'd3', 'e3', 'a4', 'b4', 'c4', 'e4', 'f4', 'g4', 'c5', 'd5', 'e5', 'b6', 'd6', 'f6', 'a7', 'd7', 'g7'];
function morrisBoard(rows, { glow = [], ring = [], body = '' } = {}) {
  const lines = MORRIS_LINES.map(([a, b]) => `<line class="sg-morris-line" x1="${morrisAt(a)[0]}" y1="${morrisAt(a)[1]}" x2="${morrisAt(b)[0]}" y2="${morrisAt(b)[1]}"/>`).join('');
  const points = MORRIS_POINT_NAMES.map(name => `<circle class="sg-morris-point" cx="${morrisAt(name)[0]}" cy="${morrisAt(name)[1]}" r="3.4"/>`).join('');
  const pieces = rows.flatMap((row, index) => [...row].map((piece, f) => [piece, `${'abcdefg'[f]}${7 - index}`])).filter(([piece]) => piece !== '.')
    .map(([piece, name]) => `${glow.includes(name) ? `<circle class="sg-morris-glow" cx="${morrisAt(name)[0]}" cy="${morrisAt(name)[1]}" r="15"/>` : ''}<circle class="sg-disc sg-${piece}" cx="${morrisAt(name)[0]}" cy="${morrisAt(name)[1]}" r="11"/>${ring.includes(name) ? `<circle class="sg-turn" cx="${morrisAt(name)[0]}" cy="${morrisAt(name)[1]}" r="14.5"/>` : ''}`).join('');
  return `<rect class="sg-morris-board" x="0" y="0" width="236" height="236" rx="10"/>${lines}${points}${pieces}${body}`;
}
const chessPiece = (glyph, name, side) => `<text class="sg-piece sg-${side}" x="${at(name)[0]}" y="${at(name)[1] + 10}" text-anchor="middle" font-size="27" ${SYMBOL}>${glyph}</text>`;
const man = (name, side, { king = false, taken = false, faded = false } = {}) => {
  const [x, y] = at(name), cls = `sg-man sg-${side}${taken ? ' sg-taken' : ''}${faded ? ' sg-faded' : ''}`;
  return king ? `<circle class="${cls}" cx="${x}" cy="${y + 3}" r="11"/><circle class="${cls}" cx="${x}" cy="${y - 2}" r="11"/><path class="sg-crown" d="M${x - 6} ${y + 1}l2-7 4 4 4-4 2 7z"/>`
    : `<circle class="${cls}" cx="${x}" cy="${y}" r="11"/><circle class="sg-man-ring" cx="${x}" cy="${y}" r="7"/>`;
};

// A Connect Four frame: rows are written top first, r / y / . per column.
function fourFrame(rows, { win = [], ghost = null, column = null } = {}) {
  const size = 32, discs = rows.flatMap((row, r) => [...row].map((disc, c) => ({ disc, c, r })));
  const cell = ({ c, r }) => [24 + c * size + size / 2, 40 + r * size + size / 2];
  let body = `<rect class="sg-frame" x="20" y="36" width="${7 * size + 8}" height="${6 * size + 8}" rx="10"/>`;
  for (const item of discs) {
    const [x, y] = cell(item), name = `${'abcdefg'[item.c]}${6 - item.r}`;
    body += `<circle class="${item.disc === 'r' ? 'sg-red' : item.disc === 'y' ? 'sg-yellow' : 'sg-slot'}" cx="${x}" cy="${y}" r="12"/>`;
    if (win.includes(name)) body += `<circle class="sg-win" cx="${x}" cy="${y}" r="14.5"/>`;
    if (ghost === name) body += `<circle class="sg-ghost" cx="${x}" cy="${y}" r="12"/>`;
  }
  if (column !== null) { const x = 24 + column * size + size / 2; body += arrowHead('f') + arrow([[x, 4], [x, 30]], 'f'); }
  return body;
}

// A domino on its side at (x, y): two squares of `s`, pips in the usual places.
const PIPS = { 0: [], 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .25], [.75, .25], [.25, .5], [.75, .5], [.25, .75], [.75, .75]] };
function domino(x, y, a, b, { s = 30, cls = '', glow = [] } = {}) {
  let body = `<g class="sg-tile ${cls}"><rect class="sg-tile-face" x="${x}" y="${y}" width="${2 * s}" height="${s}" rx="5"/><line class="sg-tile-line" x1="${x + s}" y1="${y + 4}" x2="${x + s}" y2="${y + s - 4}"/>`;
  [a, b].forEach((value, half) => {
    if (glow.includes(half)) body += `<rect class="sg-tile-glow" x="${x + half * s + 2}" y="${y + 2}" width="${s - 4}" height="${s - 4}" rx="4"/>`;
    for (const [px, py] of PIPS[value]) body += `<circle class="sg-pip" cx="${x + half * s + px * s}" cy="${y + py * s}" r="2.7"/>`;
  });
  return `${body}</g>`;
}

// A playing card: 'QS', 'TH', '2C'.
const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' }, RANK = rank => rank === 'T' ? '10' : rank;
function card(x, y, code, { cls = '', badge = null, rotate = 0 } = {}) {
  const suit = code[1], red = suit === 'H' || suit === 'D', w = 52, h = 74;
  const tilt = rotate ? ` transform="rotate(${rotate} ${x + w / 2} ${y + h / 2})"` : '';
  return `<g class="sg-card ${red ? 'sg-card-red' : ''} ${cls}"${tilt}><rect class="sg-card-face" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`
    + `<text class="sg-card-rank" x="${x + 7}" y="${y + 17}" font-size="13">${RANK(code[0])}</text>`
    + `<text class="sg-card-suit" x="${x + w / 2}" y="${y + h / 2 + 11}" text-anchor="middle" font-size="28" ${SYMBOL}>${SUIT[suit]}</text>`
    + (badge === null ? '' : `<circle class="sg-badge" cx="${x + w - 2}" cy="${y + 2}" r="11"/><text class="sg-badge-text" x="${x + w - 2}" y="${y + 6.5}" text-anchor="middle" font-size="11">${badge}</text>`)
    + '</g>';
}

// A backgammon half board: points 12 to 1 along the bottom, white checkers moving
// right towards 1; `checkers` maps a point to [count, side].
function backgammonStrip(checkers, { dice = [], moves = [], bar = null } = {}) {
  const w = 26, x0 = 12, base = 196, gap = 18, xOf = point => x0 + (12 - point) * w + (point <= 6 ? gap : 0) + w / 2;
  let body = `<rect class="sg-felt" x="4" y="20" width="${12 * w + gap + 16}" height="184" rx="8"/><rect class="sg-bar" x="${x0 + 6 * w}" y="20" width="${gap}" height="184"/>`;
  for (let point = 12; point >= 1; point--) {
    const x = xOf(point);
    body += `<path class="${point % 2 ? 'sg-point-a' : 'sg-point-b'}" d="M${x - w / 2 + 1} ${base}L${x} ${base - 104}L${x + w / 2 - 1} ${base}z"/><text class="sg-point-number" x="${x}" y="214" text-anchor="middle" font-size="9">${point}</text>`;
    const [count = 0, side = 'w'] = checkers[point] ?? [];
    for (let i = 0; i < count; i++) body += `<circle class="sg-checker sg-${side}" cx="${x}" cy="${base - 11 - i * 21}" r="10.5"/>`;
  }
  if (bar) body += `<circle class="sg-checker sg-${bar}" cx="${x0 + 6 * w + gap / 2}" cy="110" r="8.5"/>`;
  const diceX = 12 * w + gap + 34;
  dice.forEach((value, i) => {
    const y = 40 + i * 54;
    body += `<rect class="sg-die" x="${diceX}" y="${y}" width="40" height="40" rx="8"/>`;
    for (const [px, py] of PIPS[value]) body += `<circle class="sg-die-pip" cx="${diceX + 4 + px * 32}" cy="${y + 4 + py * 32}" r="3.4"/>`;
  });
  body += arrowHead('b');
  for (const [from, to, height] of moves) {
    const d = `M${xOf(from)} ${base - height}Q${(xOf(from) + xOf(to)) / 2} ${base - height - 46} ${xOf(to)} ${base - height - 4}`;
    body += `<path class="sg-path-halo" d="${d}"/><path class="sg-path" d="${d}" marker-end="url(#sg-head-b)"/>`;
  }
  return { body, width: diceX + 50 };
}

// The game's mark, used on its tab and its opening page.
export function iconMarkup(id) {
  const icon = {
    chess: `<text class="sg-icon-glyph" x="20" y="29" text-anchor="middle" font-size="25" ${SYMBOL}>♛</text>`,
    checkers: '<ellipse class="sg-icon-fill" cx="20" cy="25" rx="11" ry="5"/><ellipse class="sg-icon-fill" cx="20" cy="19" rx="11" ry="5"/><ellipse class="sg-icon-line" cx="20" cy="19" rx="6" ry="2.5"/>',
    connectFour: '<rect class="sg-icon-line" x="9" y="9" width="22" height="22" rx="4"/><circle class="sg-icon-fill" cx="15.5" cy="15.5" r="3.6"/><circle class="sg-icon-line" cx="24.5" cy="15.5" r="3.6"/><circle class="sg-icon-line" cx="15.5" cy="24.5" r="3.6"/><circle class="sg-icon-fill" cx="24.5" cy="24.5" r="3.6"/>',
    dominoes: '<rect class="sg-icon-line" x="13" y="7" width="14" height="26" rx="3"/><line class="sg-icon-line" x1="15" y1="20" x2="25" y2="20"/><circle class="sg-icon-fill" cx="20" cy="13.5" r="1.8"/><circle class="sg-icon-fill" cx="17" cy="24" r="1.8"/><circle class="sg-icon-fill" cx="23" cy="29" r="1.8"/>',
    go: '<rect class="sg-icon-line" x="8" y="8" width="24" height="24" rx="2"/><line class="sg-icon-line" x1="20" y1="8" x2="20" y2="32"/><line class="sg-icon-line" x1="8" y1="20" x2="32" y2="20"/><circle class="sg-icon-fill" cx="14" cy="14" r="4"/><circle class="sg-icon-line" cx="26" cy="26" r="4"/>',
    mancala: '<rect class="sg-icon-line" x="6" y="13" width="28" height="14" rx="7"/><circle class="sg-icon-fill" cx="14" cy="20" r="2.4"/><circle class="sg-icon-fill" cx="20" cy="20" r="2.4"/><circle class="sg-icon-fill" cx="26" cy="20" r="2.4"/>',
    reversi: '<circle class="sg-icon-line" cx="20" cy="20" r="11"/><path class="sg-icon-fill" d="M20 9a11 11 0 0 0 0 22z"/>',
    morris: '<rect class="sg-icon-line" x="9" y="9" width="22" height="22"/><rect class="sg-icon-line" x="15" y="15" width="10" height="10"/><path class="sg-icon-line" d="M20 9v6M20 25v6M9 20h6M25 20h6"/><circle class="sg-icon-fill" cx="9" cy="9" r="2.6"/><circle class="sg-icon-fill" cx="31" cy="31" r="2.6"/>',
    darts: '<circle class="sg-icon-line" cx="20" cy="20" r="12"/><circle class="sg-icon-line" cx="20" cy="20" r="6.5"/><circle class="sg-icon-fill" cx="20" cy="20" r="2.2"/><path class="sg-icon-line" d="M27 13l7-7M30 6h4v4"/>',
    hearts: '<path class="sg-icon-fill" d="M20 31C11 24 8 19.5 8 15.5A5.5 5.5 0 0 1 20 13a5.5 5.5 0 0 1 12 2.5C32 19.5 29 24 20 31z"/>',
    spades: '<path class="sg-icon-fill" d="M20 8C12 16 8 19.5 8 23.5a5.5 5.5 0 0 0 10 3.2L16.5 32h7L22 26.7a5.5 5.5 0 0 0 10-3.2C32 19.5 28 16 20 8z"/>',
    backgammon: '<path class="sg-icon-line" d="M9 31L13 12L17 31M17 31L21 12L25 31"/><circle class="sg-icon-fill" cx="29" cy="25" r="4.5"/>',
    jenga: '<rect class="sg-icon-fill" x="11" y="26" width="18" height="5" rx="1"/><rect class="sg-icon-line" x="11" y="19.5" width="18" height="5" rx="1"/><rect class="sg-icon-fill" x="11" y="13" width="5" height="5" rx="1"/><rect class="sg-icon-fill" x="24" y="13" width="5" height="5" rx="1"/><rect class="sg-icon-line" x="11" y="6.5" width="18" height="5" rx="1"/>',
    winePong: '<path class="sg-icon-line" d="M13 8h14c0 8-3 12-7 12s-7-4-7-12zM20 20v9M14 31h12"/><path class="sg-icon-fill" d="M13.6 12h12.8c-.6 4.5-3 7-6.4 7s-5.8-2.5-6.4-7z"/>',
  }[id] ?? '';
  return `<svg class="salon-icon" viewBox="0 0 40 40" aria-hidden="true">${icon}</svg>`;
}

// The HTML for a page's figure: an SVG illustration, or the keys as keycaps.
export function figureMarkup(figure, game) {
  switch (figure.kind) {
    case 'emblem': return `<div class="salon-emblem"><div class="salon-emblem-ring">${iconMarkup(game.id)}</div><p class="salon-emblem-place">${escape(game.place)}</p></div>`;
    case 'keys': return `<dl class="salon-keys">${figure.keys.map(([keys, label]) => `<div><dt>${keys.map(key => `<kbd>${escape(key)}</kbd>`).join('')}</dt><dd>${escape(label)}</dd></div>`).join('')}</dl>`;
    case 'chess-mate': return svg(240, 240, 'A back-rank mate: the white rook on e8 checks the black king on g8, whose own pawns block every escape.',
      board8(arrowHead('m') + arrow([[at('e8')[0] + 10, at('e8')[1]], [at('g8')[0] - 14, at('g8')[1]]], 'm')
        + Object.entries(DIAGRAMS.chessMate.pieces).map(([name, piece]) => chessPiece(PIECE_GLYPH[piece.toLowerCase()], name, piece === piece.toUpperCase() ? 'w' : 'b')).join(''), { glow: ['g8'] }));
    case 'chess-knight': return svg(240, 240, 'A white knight on d4 and the eight squares it can reach, each two squares one way and one square aside.',
      board8(chessPiece('♞', DIAGRAMS.chessKnight.from, 'w'), { marks: DIAGRAMS.chessKnight.targets }));
    case 'checkers-jump': return svg(240, 240, 'A dark man on c3 jumps the light men on d4 and f6, landing on g7: a double jump.',
      board8((({ dark, light, path }) => arrowHead('j') + arrow([...path.slice(0, -1).map(at), [at(path.at(-1))[0] - 7, at(path.at(-1))[1] + 7]], 'j')
        + dark.map(name => man(name, 'b')).join('') + light.map(name => man(name, 'w', { taken: ['d4', 'f6'].includes(name) })).join(''))(DIAGRAMS.checkersJump)));
    case 'reversi-start': return svg(240, 240, 'The opening: two black and two white discs in the centre, and black\'s four first moves marked.',
      board8(reversiDiscs(['........', '........', '........', '...ld...', '...dl...', '........', '........', '........']), { felt: true, marks: DIAGRAMS.reversiStart.marks }));
    case 'reversi-flip': { const { rows, place, flips } = DIAGRAMS.reversiFlip, placed = [...rows];
      return svg(240, 240, `Black places on ${place}; the white discs on ${flips.join(', ')} are outflanked and turn black. The white discs on d5 and d3 stay, their lines left open.`,
        board8(reversiDiscs(placed, { ring: flips }) + `<circle class="sg-disc sg-b sg-placed" cx="${at(place)[0]}" cy="${at(place)[1]}" r="11.5"/>` + arrowHead('r') + arrow([[at(place)[0] - 12, at(place)[1]], [at('c4')[0] - 4, at('c4')[1]]], 'r') + arrow([[at(place)[0] + 12, at(place)[1]], [at('f4')[0] + 4, at('f4')[1]]], 'r'), { felt: true, glow: [place] })); }
    case 'reversi-corner': { const { rows, place, flips } = DIAGRAMS.reversiCorner;
      return svg(240, 240, `Black takes the a1 corner, outflanking ${flips.join(' and ')} along the diagonal; a corner can never be turned back.`,
        board8(reversiDiscs(rows, { ring: flips }) + `<circle class="sg-disc sg-b sg-placed" cx="${at(place)[0]}" cy="${at(place)[1]}" r="11.5"/>` + arrowHead('k') + arrow([[at(place)[0] + 9, at(place)[1] - 9], [at('c3')[0] + 8, at('c3')[1] - 8]], 'k'), { felt: true, glow: [place] })); }
    case 'morris-mill': { const { rows, mill } = DIAGRAMS.morrisMill;
      return svg(236, 236, `White's pieces on ${mill.join(', ')} stand in a row along the bottom line: a mill.`, morrisBoard(rows, { glow: mill })); }
    case 'morris-move': { const { rows, from, to } = DIAGRAMS.morrisMove;
      return svg(236, 236, `With every piece placed, white moves the piece on ${from} along its line to the empty ${to}.`,
        morrisBoard(rows, { body: arrowHead('n') + arrow([[morrisAt(from)[0], morrisAt(from)[1] - 13], [morrisAt(to)[0], morrisAt(to)[1] + 12]], 'n') })); }
    case 'morris-take': { const { rows, place, takeable } = DIAGRAMS.morrisTake;
      return svg(236, 236, `White places on ${place} and closes a mill. Black's d5, d6 and d7 stand in a mill, so only ${takeable.join(' and ')} may be taken.`,
        morrisBoard(rows, { ring: takeable, body: `<circle class="sg-disc sg-w sg-placed" cx="${morrisAt(place)[0]}" cy="${morrisAt(place)[1]}" r="11"/>` })); }
    case 'checkers-crown': return svg(240, 240, 'A dark man steps from c7 to the far row and is crowned a king on d8.',
      board8((({ dark, light, from, to }) => arrowHead('c') + arrow([at(from), [at(to)[0] - 8, at(to)[1] + 8]], 'c')
        + dark.map(name => man(name, 'b', { faded: name === from })).join('') + man(to, 'b', { king: true }) + light.map(name => man(name, 'w')).join(''))(DIAGRAMS.checkersCrown), { glow: [DIAGRAMS.checkersCrown.to] }));
    case 'four-win': return svg(272, 244, 'Red has four in a row along a diagonal, from c1 to f4, lit in gold.',
      fourFrame(DIAGRAMS.fourWin.rows, { win: DIAGRAMS.fourWin.line }));
    case 'four-drop': return svg(272, 244, 'A disc dropped into column d falls to the lowest open slot, d3.',
      fourFrame(DIAGRAMS.fourDrop.rows, { ghost: DIAGRAMS.fourDrop.lands, column: DIAGRAMS.fourDrop.column }));
    case 'dominoes-line': return svg(300, 150, 'A line of dominoes, 2–6, 6–6, 6–4, with open ends 2 and 4; the 4–1 in hand matches the 4 and plays on the right.',
      DIAGRAMS.dominoesLine.line.map(([a, b], index, line) => domino(20 + index * 64, 28, a, b, { glow: [index === 0 && 0, index === line.length - 1 && 1].filter(half => half !== false) })).join('')
      + domino(176, 104, ...DIAGRAMS.dominoesLine.hand, { cls: 'sg-tile-hand', glow: [0] }) + arrowHead('d') + arrow([[204, 100], [204, 66]], 'd'));
    case 'dominoes-modes': return svg(300, 160, 'Two players draw from a boneyard of face-down tiles; four players hold seven tiles each and pass when blocked.',
      `<text class="sg-label" x="75" y="22" text-anchor="middle" font-size="12">2 players · draw</text><text class="sg-label" x="225" y="22" text-anchor="middle" font-size="12">4 players · block</text><line class="sg-divider" x1="150" y1="14" x2="150" y2="150"/>`
      + [0, 1, 2, 3].map(i => `<rect class="sg-tile-back" x="${28 + (i % 2) * 48}" y="${40 + Math.floor(i / 2) * 32}" width="42" height="24" rx="4"/>`).join('') + `<text class="sg-label sg-quiet" x="75" y="132" text-anchor="middle" font-size="11">the boneyard</text>`
      + [0, 1, 2, 3, 4, 5, 6].map(i => `<rect class="sg-tile-back" x="${172 + i * 15}" y="${52 + Math.abs(i - 3) * 3}" width="12" height="40" rx="3"/>`).join('') + `<text class="sg-label sg-quiet" x="225" y="132" text-anchor="middle" font-size="11">seven each, then pass</text>`);
    case 'darts-board': case 'darts-throw': {
      const c = 110, k = 0.55, ring = (r, cls) => `<circle cx="${c}" cy="${c}" r="${r * k}" class="${cls}"/>`;
      let body = ring(205, 'sg-rim') + ring(170, 'sg-tile-face') + `<circle cx="${c}" cy="${c}" r="${166 * k}" style="fill:none;stroke:#b0262c;stroke-width:${8 * k}"/>`
        + `<circle cx="${c}" cy="${c}" r="${103 * k}" style="fill:none;stroke:#237a45;stroke-width:${8 * k}"/>` + ring(15.9, 'sg-red') + ring(6.35, 'sg-rim');
      for (let i = 0; i < 20; i++) { const a = (i * 18 - 9) * Math.PI / 180; body += `<line x1="${c + Math.sin(a) * 15.9 * k}" y1="${c - Math.cos(a) * 15.9 * k}" x2="${c + Math.sin(a) * 170 * k}" y2="${c - Math.cos(a) * 170 * k}" style="stroke:#3a2c1a;stroke-width:.8"/>`; }
      body += `<text class="sg-label" x="${c}" y="${c - 186 * k}" text-anchor="middle" font-size="12" style="fill:#f3ead8">20</text>`;
      if (figure.kind === 'darts-board') {
        body += `<circle class="sg-glow" cx="${c}" cy="${c - 103 * k}" r="8"/><text class="sg-label" x="${c + 40}" y="${c - 103 * k + 4}" font-size="11">T20 · 60</text><text class="sg-label" x="${c + 26}" y="${c + 4}" font-size="11">Bull · 50</text>`;
        return svg(220, 220, 'A dartboard: twenty sectors, the double ring at the edge, the treble ring halfway in, the outer bull and the bull at the centre; the treble 20 at the top is worth 60.', body);
      }
      body += `<line x1="${c - 20}" y1="10" x2="${c - 20}" y2="210" style="stroke:#fff;stroke-width:2;stroke-dasharray:5 4"/><line x1="10" y1="${c - 40}" x2="210" y2="${c - 40}" style="stroke:#fff;stroke-width:2"/><circle cx="${c - 20}" cy="${c - 40}" r="7" style="fill:none;stroke:#fff;stroke-width:2"/>`;
      return svg(220, 220, 'The aiming lines: the dashed one, set across the board; the solid one, sweeping up and down; the dart lands where they cross.', body); }
    case 'darts-checkout': { const { score, plan } = DIAGRAMS.dartsCheckout;
      return svg(300, 110, `A checkout from ${score}: ${plan.join(', then ')}, finishing exactly on a double.`,
        `<text class="sg-label" x="30" y="62" font-size="26">${score}</text>` + plan.map((bed, i) => `<rect class="sg-tile-face" x="${110 + i * 90}" y="34" width="70" height="40" rx="8"/><text class="sg-label" x="${145 + i * 90}" y="60" text-anchor="middle" font-size="16">${bed}</text>`).join('')
        + arrow([[80, 54], [104, 54]], 'd') + arrowHead('d') + '<text class="sg-label sg-quiet" x="235" y="96" text-anchor="middle" font-size="11">the double ends it</text>'); }
    case 'hearts-points': return svg(300, 130, 'Each heart scores one point; the queen of spades scores thirteen.',
      DIAGRAMS.heartsPoints.map((code, index) => code === 'QS' ? card(210, 22, code, { badge: 13, cls: 'sg-card-queen' }) : card(18 + index * 52, index === 0 ? 30 : 26, code, { badge: 1, rotate: [-8, -3, 3][index] })).join(''));
    case 'hearts-pass': return svg(300, 160, 'Three cards pass to the left, then the right, then across; every fourth hand nobody passes.',
      card(110, 68, '2C', { rotate: -10 }) + card(124, 62, 'KS') + card(138, 68, 'JD', { rotate: 10 }) + arrowHead('p')
      + arrow([[104, 100], [40, 100]], 'p') + arrow([[200, 100], [262, 100]], 'p') + arrow([[150, 56], [150, 18]], 'p')
      + '<text class="sg-label" x="40" y="88" text-anchor="middle" font-size="11">1 · left</text><text class="sg-label" x="262" y="88" text-anchor="middle" font-size="11">2 · right</text><text class="sg-label" x="186" y="26" font-size="11">3 · across</text><text class="sg-label sg-quiet" x="150" y="156" text-anchor="middle" font-size="11">4 · keep your cards</text>');
    case 'hearts-trick': return svg(300, 170, 'A diamond is led; the king of diamonds takes the trick, and the spade, off suit, cannot win it.',
      '<text class="sg-label sg-quiet" x="150" y="14" text-anchor="middle" font-size="11">led</text>'
      + DIAGRAMS.heartsTrick.cards.map((code, index) => card(...[[124, 20], [48, 66], [124, 92], [200, 66]][index], code, { cls: code === DIAGRAMS.heartsTrick.winner ? 'sg-card-win' : '' })).join(''));
    case 'spades-bids': { const { bids } = DIAGRAMS.spadesBids, seats = [['You', 150, 132], ['Left', 44, 80], ['Across', 150, 28], ['Right', 256, 80]];
      return svg(300, 160, `Bids round the table: you ${bids[0]}, left ${bids[1]}, across ${bids[2]}, right nil. You and your partner across must take ${bids[0] + bids[2]} together.`,
        seats.map(([name, x, y], player) => `<rect class="sg-tile-face" x="${x - 40}" y="${y - 18}" width="80" height="30" rx="8"/><text class="sg-label" x="${x}" y="${y + 2}" text-anchor="middle" font-size="12">${name} · ${bids[player] === 0 ? 'nil' : bids[player]}</text>`).join('')
        + `<text class="sg-label sg-quiet" x="150" y="84" text-anchor="middle" font-size="11">you + across = ${bids[0] + bids[2]}</text>`); }
    case 'spades-trump': return svg(300, 170, 'A heart is led; the two of spades, a trump, takes the trick over the ace of hearts.',
      '<text class="sg-label sg-quiet" x="150" y="14" text-anchor="middle" font-size="11">led</text>'
      + DIAGRAMS.spadesTrump.cards.map((code, index) => card(...[[124, 20], [48, 66], [124, 92], [200, 66]][index], code, { cls: code === DIAGRAMS.spadesTrump.winner ? 'sg-card-win' : '' })).join(''));
    case 'spades-score': { const { bids, taken } = DIAGRAMS.spadesBids, contract = bids[0] + bids[2], made = taken[0] + taken[2];
      return svg(300, 130, `You bid ${contract} together and took ${made}: ${10 * contract} points and ${made - contract} bag, ${10 * contract + made - contract} in all. Right's nil took no trick: 100.`,
        `<text class="sg-label" x="20" y="40" font-size="13">You &amp; Across: bid ${contract}, took ${made}</text><text class="sg-label" x="280" y="40" text-anchor="end" font-size="13">${10 * contract} + ${made - contract} bag = ${10 * contract + made - contract}</text>`
        + `<text class="sg-label" x="20" y="84" font-size="13">Right: nil, took none</text><text class="sg-label" x="280" y="84" text-anchor="end" font-size="13">+100</text>`
        + '<text class="sg-label sg-quiet" x="150" y="118" text-anchor="middle" font-size="11">every tenth bag: −100</text>'); }
    case 'go-territory': case 'go-capture': case 'go-ko': {
      const data = { 'go-territory': DIAGRAMS.goTerritory, 'go-capture': DIAGRAMS.goCapture, 'go-ko': DIAGRAMS.goKo }[figure.kind], n = 5, step = 34, edge = 24;
      const label = { 'go-territory': 'A corner of the board: black has walled off the empty points on the left, white those on the right.',
        'go-capture': 'The white stone has one liberty left; a black stone there captures it.',
        'go-ko': 'A ko: white plays the marked point and takes the black stone beside it; black may not retake at once, and must play elsewhere first.' }[figure.kind];
      const at = (row, column) => [edge + column * step, edge + (n - 1 - row) * step];
      let body = '<rect class="sg-felt" x="4" y="4" width="' + (edge * 2 + step * (n - 1) - 8) + '" height="' + (edge * 2 + step * (n - 1) - 8) + '" rx="6" style="fill:#dcb46e"/>';
      for (let i = 0; i < n; i++) { const a = edge + i * step, far = edge + (n - 1) * step; body += `<line x1="${edge}" y1="${a}" x2="${far}" y2="${a}" style="stroke:#3a2c1a"/><line x1="${a}" y1="${edge}" x2="${a}" y2="${far}" style="stroke:#3a2c1a"/>`; }
      data.rows.forEach((line, r) => [...line].forEach((cell, column) => { const row = n - 1 - r, [x, y] = at(row, column); if (cell !== '.') body += `<circle cx="${x}" cy="${y}" r="14" style="fill:${cell === 'b' ? '#1b1b1d' : '#f4f1e8'};stroke:#00000066"/>`; }));
      if (data.play) { const [x, y] = at(...data.play), ring = figure.kind === 'go-ko' ? '#f4f1e8' : '#1b1b1d'; body += `<circle class="sg-glow" cx="${x}" cy="${y}" r="15"/><circle cx="${x}" cy="${y}" r="13" style="fill:none;stroke:${ring};stroke-width:2;stroke-dasharray:4 3"/>`; }
      if (data.take) { const [x, y] = at(...data.take); body += `<text class="sg-label" x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" style="fill:#b3262e">×</text>`; }
      return svg(edge * 2 + step * (n - 1), edge * 2 + step * (n - 1), label, body); }
    case 'mancala-board': case 'mancala-sow': case 'mancala-capture': {
      // Side 0 along the bottom (pits left to right, its store on the right), side 1 along the top.
      const kind = figure.kind, board = kind === 'mancala-capture' ? DIAGRAMS.mancalaCapture.board : [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
      const spot = index => index === 6 ? [272, 70] : index === 13 ? [28, 70] : index < 6 ? [62 + index * 36, 104] : [62 + (12 - index) * 36, 36];
      const label = { 'mancala-board': 'A mancala board: six pits of four seeds a side, a store at each end; yours runs along the bottom with your store on the right.',
        'mancala-sow': 'Your pit 3 is sown: its four seeds fall into the next three pits and your store, so you move again.',
        'mancala-capture': 'Your pit 2 is sown: its last seed lands in your empty pit 4, opposite seven seeds, and you capture all eight.' }[kind];
      const path = kind === 'mancala-sow' ? [3, 4, 5, 6] : kind === 'mancala-capture' ? [2, 3] : [];
      return svg(300, 140, label, '<rect class="sg-felt" x="6" y="8" width="288" height="124" rx="40"/>'
        + board.map((seeds, index) => { const [x, y] = spot(index), store = index === 6 || index === 13, glow = path.includes(index) || (kind === 'mancala-capture' && index === 9);
          return `${glow ? `<circle class="sg-glow" cx="${x}" cy="${y}" r="${store ? 24 : 17}"/>` : ''}${store ? `<rect class="sg-rim" x="${x - 14}" y="${y - 40}" width="28" height="80" rx="14"/>` : `<circle class="sg-rim" cx="${x}" cy="${y}" r="14"/>`}<text class="sg-label" x="${x}" y="${y + 5}" text-anchor="middle" font-size="13" style="fill:#f3e6cf">${seeds}</text>`; }).join('')
        + (kind === 'mancala-sow' ? arrow([[134, 122], [206, 122], [262, 102]], 'm') + arrowHead('m') : '')); }
    case 'jenga-tower': { const { levels, pulled } = DIAGRAMS.jengaTower, h = 22, top = 16;
      return svg(220, 200, 'A Jenga tower seen from the front: blocks are pulled from below the top and laid on top; the top level, still being finished, and the one under it are kept.',
        levels.map((row, level) => row.map((present, slot) => {
          const y = top + (levels.length - 1 - level) * h, x = 40 + slot * 48, isPulled = level === pulled[0] && slot === pulled[1];
          return present ? `<rect class="sg-tile-face" x="${x}" y="${y}" width="44" height="${h - 4}" rx="3"/>` : isPulled ? `<rect class="sg-ghost" x="${x}" y="${y}" width="44" height="${h - 4}" rx="3"/>` : '';
        }).join('')).join('')
        + arrow([[110 + 48, top + (levels.length - 1 - pulled[0]) * h + 9], [196, top + (levels.length - 1 - pulled[0]) * h + 9], [196, top - 6], [140, top - 6]], 'j') + arrowHead('j')
        + `<text class="sg-label sg-quiet" x="110" y="${top + levels.length * h + 14}" text-anchor="middle" font-size="11">pull from below, lay on top</text>`); }
    case 'jenga-meter': { const { lo, hi, marker } = DIAGRAMS.jengaMeter, x0 = 30, w = 240;
      return svg(300, 110, 'The steady-hand meter: a marker sweeps along the track; stopped inside the green zone, the block slides out.',
        `<rect class="sg-bar" x="${x0}" y="40" width="${w}" height="26" rx="13"/><rect class="sg-glow" x="${x0 + lo * w}" y="40" width="${(hi - lo) * w}" height="26"/>`
        + `<rect class="sg-mark" x="${x0 + marker * w - 3}" y="34" width="6" height="38" rx="3"/>`
        + `<text class="sg-label sg-quiet" x="${x0 + (lo + hi) / 2 * w}" y="92" text-anchor="middle" font-size="11">stop here: it slides out</text><text class="sg-label sg-quiet" x="${x0 + 30}" y="26" font-size="11">wobbles</text><text class="sg-label sg-quiet" x="${x0 + w - 30}" y="26" text-anchor="end" font-size="11">wobbles</text>`); }
    case 'jenga-edge': { const { level, pull } = DIAGRAMS.jengaEdge;
      return svg(260, 140, 'A level down to its two edge blocks: pull either and the other is left alone at the edge, and the tower above it falls.',
        `<rect class="sg-tile-back" x="40" y="24" width="180" height="22" rx="3"/>`
        + level.map((present, slot) => present ? `<rect class="${slot === pull ? 'sg-ghost' : 'sg-tile-face'}" x="${40 + slot * 62}" y="52" width="56" height="22" rx="3"/>` : '').join('')
        + `<rect class="sg-tile-back" x="40" y="80" width="180" height="22" rx="3"/><text class="sg-label" x="130" y="126" text-anchor="middle" font-size="12">one edge block left: it falls</text>`); }
    case 'pong-racks': { const rack = (x, flip) => [[0, -1], [0, 0], [0, 1], [1, -0.5], [1, 0.5], [2, 0]].map(([row, across]) => `<circle class="sg-tile-face" cx="${x + (flip ? -1 : 1) * row * 14}" cy="${65 + across * 16}" r="7"/><circle class="sg-red" cx="${x + (flip ? -1 : 1) * row * 14}" cy="${65 + across * 16}" r="4"/>`).join('');
      return svg(300, 130, 'The long table from above: six wine glasses racked three, two, one at each end; you throw at the far rack.',
        '<rect class="sg-tile-face" x="20" y="34" width="260" height="62" rx="6"/><line class="sg-path" x1="150" y1="38" x2="150" y2="92"/>' + rack(36, false) + rack(264, true)
        + '<text class="sg-label sg-quiet" x="40" y="118" font-size="11">your glasses</text><text class="sg-label sg-quiet" x="260" y="118" text-anchor="end" font-size="11">the far rack: sink all six</text>'); }
    case 'pong-throw': return svg(170, 260, 'From your end: the dotted aim line crosses the far rack, and the power target rides along it onto a glass.',
      '<rect class="sg-tile-face" x="55" y="20" width="60" height="200" rx="5"/>'
      + [[0, -1], [0, 0], [0, 1], [1, -0.5], [1, 0.5], [2, 0]].map(([row, across]) => `<circle class="sg-tile-face" cx="${85 + across * 13}" cy="${32 + row * 11}" r="5.5"/><circle class="sg-red" cx="${85 + across * 13}" cy="${32 + row * 11}" r="3.2"/>`).join('')
      + arrow([[85, 246], [85, 60]], 't') + arrowHead('t') + '<circle class="sg-win" cx="85" cy="54" r="8"/><circle class="sg-mark" cx="85" cy="246" r="5"/>'
      + '<text class="sg-label sg-quiet" x="85" y="14" text-anchor="middle" font-size="11">aim, then power</text>');
    case 'pong-outcomes': { const glass = (x, sunk) => `<circle class="sg-tile-face" cx="${x}" cy="62" r="16"/>${sunk ? '' : `<circle class="sg-red" cx="${x}" cy="62" r="10"/>`}`;
      return svg(300, 140, 'Three ways in: straight in, off the rim and in, or a bounce on the table and in.',
        glass(55, true) + '<circle class="sg-mark" cx="55" cy="62" r="5"/>' + glass(150, true) + '<circle class="sg-mark" cx="164" cy="50" r="5"/>' + glass(245, true) + '<circle class="sg-mark" cx="245" cy="62" r="5"/>'
        + arrow([[150, 112], [205, 104], [236, 70]], 'o') + arrowHead('o')
        + '<text class="sg-label" x="55" y="104" text-anchor="middle" font-size="12">in</text><text class="sg-label" x="150" y="104" text-anchor="middle" font-size="12">rim, then in</text><text class="sg-label" x="252" y="124" text-anchor="middle" font-size="12">bounce, then in</text>'); }
    case 'backgammon-opening': { const { layout, dice, moves } = DIAGRAMS.backgammonOpening, near = nearPoints(layout), top = point => 10 + near[point][0] * 21 - 21 + 1;
      const strip = backgammonStrip(near, { dice, moves: moves.map(([from, to]) => [from, to, top(from)]) });
      return svg(strip.width, 222, 'The opening three-one: one checker from the eight-point and one from the six-point land together on the five-point.', strip.body); }
    case 'backgammon-hit': { const { layout, dice, move } = DIAGRAMS.backgammonHit, near = nearPoints(layout);
      const strip = backgammonStrip(near, { dice, moves: [[...move, 10 + near[move[0]][0] * 21 - 20]] });
      return svg(strip.width, 222, 'A white checker lands on a lone black checker on the five-point and sends it to the bar; the black pair on the four-point is closed.', strip.body); }
    default: return '';
  }
}
