export const SIZE = 8;

// Coordinates are intentionally simple data: the UI and tests share the rules.
export const SHAPES = [
  { id: 'dot', cells: [[0, 0]] },
  { id: 'pair-h', cells: [[0, 0], [0, 1]] },
  { id: 'pair-v', cells: [[0, 0], [1, 0]] },
  { id: 'line-3-h', cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'line-3-v', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'line-4-h', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: 'line-4-v', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: 'line-5-h', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: 'line-5-v', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { id: 'square', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: 'square-3', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
  { id: 'l-small', cells: [[0, 0], [1, 0], [1, 1]] },
  { id: 'l-small-flip', cells: [[0, 1], [1, 0], [1, 1]] },
  { id: 'l', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: 'l-flip', cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
  { id: 't', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: 's', cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { id: 'z', cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
];

export const COLORS = ['teal', 'coral', 'gold', 'violet', 'mint'];

export function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

export function dimensions(shape) {
  return {
    rows: Math.max(...shape.cells.map(([row]) => row)) + 1,
    cols: Math.max(...shape.cells.map(([, col]) => col)) + 1,
  };
}

export function canPlace(board, shape, row, col) {
  return shape.cells.every(([dr, dc]) => {
    const r = row + dr;
    const c = col + dc;
    return r >= 0 && c >= 0 && r < SIZE && c < SIZE && board[r][c] === null;
  });
}

export function anyFit(board, shape) {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (canPlace(board, shape, row, col)) return true;
    }
  }
  return false;
}

export function hasMove(board, pieces) {
  return pieces.some(piece => piece && anyFit(board, piece.shape));
}

export function place(board, piece, row, col, streak = 0) {
  if (!canPlace(board, piece.shape, row, col)) return null;

  const next = board.map(line => [...line]);
  for (const [dr, dc] of piece.shape.cells) next[row + dr][col + dc] = piece.color;

  const rows = [];
  const cols = [];
  for (let r = 0; r < SIZE; r++) if (next[r].every(Boolean)) rows.push(r);
  for (let c = 0; c < SIZE; c++) if (next.every(line => Boolean(line[c]))) cols.push(c);

  for (const r of rows) next[r].fill(null);
  for (const c of cols) for (let r = 0; r < SIZE; r++) next[r][c] = null;

  const lines = rows.length + cols.length;
  const nextStreak = lines ? streak + 1 : 0;
  const points = piece.shape.cells.length * 10 + lines * 100 + Math.max(0, lines - 1) * 50 + (lines ? Math.max(0, nextStreak - 1) * 25 : 0);
  return { board: next, rows, cols, lines, streak: nextStreak, points };
}

export function drawPieces(board, random = Math.random) {
  const fitting = SHAPES.filter(shape => anyFit(board, shape));
  if (fitting.length === 0) return [null, null, null];
  const pick = list => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const shapes = [pick(fitting), pick(SHAPES), pick(SHAPES)];
  for (let i = shapes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shapes[i], shapes[j]] = [shapes[j], shapes[i]];
  }
  return shapes.map(shape => ({ shape, color: pick(COLORS) }));
}
