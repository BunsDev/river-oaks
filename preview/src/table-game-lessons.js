// Guided first games at the plaza tables: one short scripted game per kind. You play the
// marked move, the plaza regular answers from the script, and each step says why. You
// always play the side that moves first. Pure data and a reader, so the unit tests replay
// every script through the game adapters (table-game-adapters.js), and a rules change
// that breaks a lesson fails there rather than at the table.

export const LESSONS = {
  chess: {
    steps: [
      { move: 'e2e4', reply: 'e7e5', say: 'Pawns move straight ahead, and two squares on their first move. Claim the centre: e2 to e4.' },
      { move: 'f1c4', reply: 'b8c6', say: 'Bishops slide diagonally. Aim this one at f7, guarded only by Black’s king: f1 to c4.' },
      { move: 'd1h5', reply: 'g8f6', say: 'The queen goes any distance in a straight line. Bring her to h5, where she also aims at f7.' },
      { move: 'h5f7', say: 'Two of your pieces attack f7 and only the king defends it. Take on f7 with the queen.' },
    ],
    done: 'Checkmate: the king is attacked and has nowhere to go. Lesson done. The plaza regular won’t fall for that, so try a real game.',
  },
  checkers: {
    steps: [
      { move: 'c3-d4', reply: 'f6-e5', say: 'Men move one square diagonally forward, on the dark squares. Move c3 to d4.' },
      { move: 'd4xf6', reply: 'g7xe5', say: 'A man beside yours with an empty square behind it can be jumped and taken, and a jump is compulsory. Jump d4 over e5 to f6.' },
      { move: 'd2-c3', reply: 'b6-c5', say: 'Keep your men together: d2 to c3 backs up the middle.' },
      { move: 'e3-d4', reply: 'c5xe3', say: 'Give one to take two: move e3 to d4. The regular has to jump it.' },
      { move: 'f2xd4xf6', say: 'Now jump twice in one move: f2 over e3 to d4, then over e5 to f6.' },
    ],
    done: 'Two for one. Lesson done. Men reaching the far row are crowned kings, which move both ways. Try the plaza regular.',
  },
  connectFour: {
    steps: [
      { move: 'd', reply: 'd', say: 'Discs drop to the lowest free cell of a column. Start in the middle column, d, which joins the most lines of four.' },
      { move: 'e', reply: 'e', say: 'Build a line along the bottom: drop in e.' },
      { move: 'c', reply: 'f', say: 'Drop in c. Three in a row with both ends open is a trap: the regular can block only one end.' },
      { move: 'b', say: 'The regular blocked f. Drop in b for four in a row.' },
    ],
    done: 'Four in a row. Lesson done. Lines also run upwards and diagonally, so try the plaza regular.',
  },
  reversi: {
    steps: [
      { move: 'd3', reply: 'c3', say: 'Place a disc so a line of the regular’s discs sits between it and one of yours. Those discs flip to your colour. Play d3 to trap d4.' },
      { move: 'f5', reply: 'f4', say: 'The regular flipped d4 back: discs change hands all game. Lines run across as well as up and down. Play f5 to trap e5.' },
      { move: 'b3', reply: 'b2', say: 'Win c3 back: play b3, with your d3 on its other side.' },
      { move: 'a1', say: 'The regular stepped next to a corner. A corner disc can never be flipped. Take a1: lines run diagonally too, so b2, c3 and d4 all turn.' },
    ],
    done: 'Corners are worth waiting for, and the most discs at the end wins. Lesson done. Try the plaza regular.',
  },
  morris: {
    steps: [
      { move: 'a1', reply: 'a7', say: 'Each side places nine pieces on the points, one at a time. Place your first on a1.' },
      { move: 'd1', reply: 'd7', say: 'Three in a line is a mill. Place on d1 to make two.' },
      { move: 'g1xa7', reply: 'g7', say: 'Place on g1 to close the mill.', take: 'A mill takes one of the regular’s pieces. Take a7.' },
      { move: 'a7', say: 'The regular has two on the top line. Block its mill: place on a7.' },
    ],
    done: 'Mill made and mill blocked. Lesson done. After placing, pieces step along the lines, so try the plaza regular.',
  },
};

// Where a lesson stands after these moves: the step being taught and the move it wants
// next, or the regular's scripted reply, or done. Moves off the script return null.
export function lessonAt(lesson, moves) {
  if (!lesson) return null;
  let ply = 0;
  for (const [index, step] of lesson.steps.entries()) {
    if (moves.length === ply) return { index, step, next: step.move };
    if (moves[ply++] !== step.move) return null;
    if (!step.reply) continue;
    if (moves.length === ply) return { index, step, reply: step.reply };
    if (moves[ply++] !== step.reply) return null;
  }
  return moves.length === ply ? { index: lesson.steps.length, done: true } : null;
}
