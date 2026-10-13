import { SIZE, SHAPES, COLORS, emptyBoard, dimensions, canPlace, hasMove, place, drawPieces } from './game.js';

const STORAGE_KEY = 'block-bloom-save-v1';
const boardEl = document.querySelector('#board');
const trayEl = document.querySelector('#tray');
const ghostEl = document.querySelector('#drag-ghost');
const statusEl = document.querySelector('#status');
const scoreEl = document.querySelector('#score');
const bestEl = document.querySelector('#best');
const scoreBurstEl = document.querySelector('#score-burst');
const flashEl = document.querySelector('#board-flash');
const clearLayerEl = document.querySelector('#clear-layer');
const helpDialog = document.querySelector('#help-dialog');
const gameOverDialog = document.querySelector('#game-over-dialog');
const restartDialog = document.querySelector('#restart-dialog');

function readSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.board) || saved.board.length !== SIZE ||
        !saved.board.every(row => Array.isArray(row) && row.length === SIZE && row.every(color => color === null || COLORS.includes(color))) ||
        !Array.isArray(saved.pieces) || saved.pieces.length !== 3 ||
        !saved.pieces.every(piece => piece === null || (SHAPES.some(shape => shape.id === piece.id) && COLORS.includes(piece.color)))) return null;
    return {
      board: saved.board,
      pieces: saved.pieces.map(piece => piece && ({ shape: SHAPES.find(shape => shape.id === piece.id), color: piece.color })),
      score: Number.isSafeInteger(saved.score) && saved.score >= 0 ? saved.score : 0,
      best: Number.isSafeInteger(saved.best) && saved.best >= 0 ? saved.best : 0,
      streak: Number.isSafeInteger(saved.streak) && saved.streak >= 0 ? saved.streak : 0,
      ended: Boolean(saved.ended),
    };
  } catch { return null; }
}

const previous = readSave();
let state = previous || { board: emptyBoard(), pieces: drawPieces(emptyBoard()), score: 0, best: 0, streak: 0, ended: false };
let selected = null;
let drag = null;
let preview = null;
let scoreBurstTimer = null;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      board: state.board,
      pieces: state.pieces.map(piece => piece && ({ id: piece.shape.id, color: piece.color })),
      score: state.score, best: state.best, streak: state.streak, ended: state.ended,
    }));
  } catch { /* Play remains available when storage is disabled. */ }
}

function makeTile(color) {
  const tile = document.createElement('span');
  tile.className = `tile tile-${color}`;
  tile.setAttribute('aria-hidden', 'true');
  return tile;
}

function renderBoard(placedCells = []) {
  const placed = new Set(placedCells.map(([row, col]) => row * SIZE + col));
  const cells = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'board-cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.tabIndex = row === 0 && col === 0 ? 0 : -1;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `Row ${row + 1}, column ${col + 1}, ${state.board[row][col] ? 'filled' : 'empty'}`);
      if (state.board[row][col]) {
        const tile = makeTile(state.board[row][col]);
        if (placed.has(row * SIZE + col)) tile.classList.add('tile-placed');
        cell.append(tile);
      }
      cells.push(cell);
    }
  }
  boardEl.replaceChildren(...cells);
}

function makePieceGrid(piece, className = '') {
  const { rows, cols } = dimensions(piece.shape);
  const grid = document.createElement('span');
  grid.className = `piece-grid ${className}`;
  grid.style.setProperty('--rows', rows);
  grid.style.setProperty('--cols', cols);
  for (const [row, col] of piece.shape.cells) {
    const tile = makeTile(piece.color);
    tile.style.gridRow = row + 1;
    tile.style.gridColumn = col + 1;
    grid.append(tile);
  }
  return grid;
}

function renderTray(refilled = false) {
  const slots = state.pieces.map((piece, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'piece-slot';
    button.dataset.index = index;
    button.setAttribute('aria-pressed', String(selected === index));
    if (!piece) {
      button.classList.add('piece-used');
      button.disabled = true;
      button.setAttribute('aria-label', `Piece ${index + 1} used`);
      const dot = document.createElement('span');
      dot.className = 'used-mark';
      dot.textContent = '✓';
      button.append(dot);
      return button;
    }
    if (selected === index) button.classList.add('is-selected');
    button.setAttribute('aria-label', `Piece ${index + 1}, ${piece.shape.cells.length} blocks. Select to place.`);
    if (refilled) {
      button.classList.add('piece-arrived');
      button.style.setProperty('--arrival-index', index);
    }
    button.append(makePieceGrid(piece));
    return button;
  });
  trayEl.replaceChildren(...slots);
}

function render(placedCells = [], refilled = false) {
  renderBoard(placedCells);
  renderTray(refilled);
  scoreEl.textContent = state.score.toLocaleString();
  bestEl.textContent = state.best.toLocaleString();
  save();
}

function setStatus(message) { statusEl.textContent = message; }

function clearPreview() {
  for (const cell of boardEl.querySelectorAll('.preview-valid, .preview-invalid, .preview-clear')) cell.classList.remove('preview-valid', 'preview-invalid', 'preview-clear');
  preview = null;
}

function showPreview(index, row, col) {
  clearPreview();
  const piece = state.pieces[index];
  if (!piece) return;
  const valid = canPlace(state.board, piece.shape, row, col);
  preview = { index, row, col, valid };
  for (const [dr, dc] of piece.shape.cells) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) continue;
    boardEl.children[r * SIZE + c].classList.add(valid ? 'preview-valid' : 'preview-invalid');
  }
  if (valid) {
    const projected = new Set(piece.shape.cells.map(([dr, dc]) => (row + dr) * SIZE + col + dc));
    for (let r = 0; r < SIZE; r++) {
      if (state.board[r].every((color, c) => color || projected.has(r * SIZE + c))) {
        for (let c = 0; c < SIZE; c++) boardEl.children[r * SIZE + c].classList.add('preview-clear');
      }
    }
    for (let c = 0; c < SIZE; c++) {
      if (state.board.every((line, r) => line[c] || projected.has(r * SIZE + c))) {
        for (let r = 0; r < SIZE; r++) boardEl.children[r * SIZE + c].classList.add('preview-clear');
      }
    }
  }
}

function celebrateClear(before, result, placedCells, pieceColor) {
  const layer = document.createElement('div');
  layer.className = 'clear-grid';
  const placed = new Map(placedCells.map(([row, col]) => [row * SIZE + col, pieceColor]));
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!result.rows.includes(row) && !result.cols.includes(col)) continue;
      const color = placed.get(row * SIZE + col) || before[row][col];
      if (!color) continue;
      const cell = document.createElement('span');
      cell.className = 'clear-cell';
      cell.style.gridRow = row + 1;
      cell.style.gridColumn = col + 1;
      cell.style.setProperty('--clear-delay', `${Math.min(180, (row + col) * 14)}ms`);
      cell.append(makeTile(color));
      layer.append(cell);
    }
  }
  clearLayerEl.append(layer);
  window.setTimeout(() => layer.remove(), 680);
}

function showScoreGain(points, lines) {
  scoreBurstEl.textContent = `+${points}`;
  scoreBurstEl.classList.remove('is-visible');
  void scoreBurstEl.offsetWidth;
  scoreBurstEl.classList.add('is-visible');
  window.clearTimeout(scoreBurstTimer);
  scoreBurstTimer = window.setTimeout(() => scoreBurstEl.classList.remove('is-visible'), 680);
  scoreEl.classList.remove('score-pulse');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('score-pulse');
  if (lines) {
    flashEl.classList.remove('flash');
    void flashEl.offsetWidth;
    flashEl.classList.add('flash');
  }
}

function finishIfStuck() {
  if (hasMove(state.board, state.pieces)) return;
  state.ended = true;
  save();
  document.querySelector('#final-score').textContent = state.score.toLocaleString();
  document.querySelector('#record-message').textContent = state.score > 0 && state.score === state.best ? 'Your best score so far. Nice work!' : 'There’s always a new shape around the corner.';
  setStatus('No more moves');
  gameOverDialog.showModal();
}

function commit(index, row, col) {
  if (state.ended || !state.pieces[index]) return false;
  const piece = state.pieces[index];
  const before = state.board;
  const placedCells = piece.shape.cells.map(([dr, dc]) => [row + dr, col + dc]);
  const result = place(before, piece, row, col, state.streak);
  if (!result) {
    setStatus('That spot is blocked. Try another square.');
    return false;
  }
  if (result.lines) {
    celebrateClear(before, result, placedCells, piece.color);
  }
  const oldBest = state.best;
  state.board = result.board;
  state.score += result.points;
  state.best = Math.max(state.best, state.score);
  state.streak = result.streak;
  state.pieces[index] = null;
  selected = null;
  clearPreview();
  const refilled = state.pieces.every(piece => piece === null);
  if (refilled) state.pieces = drawPieces(state.board);
  render(placedCells, refilled);
  showScoreGain(result.points, result.lines);
  if (result.lines) {
    const lineMessage = result.lines > 1 ? `${result.lines} lines cleared` : 'Line cleared';
    setStatus(`${lineMessage}!${result.streak > 1 ? ` ${result.streak} in a row.` : ''} +${result.points}${state.score > oldBest && oldBest > 0 ? ' · New best!' : ''}`);
  } else {
    setStatus(`Placed! +${result.points}${state.score > oldBest && oldBest > 0 ? ' · New best!' : ''}`);
  }
  finishIfStuck();
  return true;
}

function resetGame() {
  state = { board: emptyBoard(), pieces: drawPieces(emptyBoard()), score: 0, best: state.best, streak: 0, ended: false };
  selected = null;
  clearPreview();
  clearLayerEl.replaceChildren();
  flashEl.classList.remove('flash');
  window.clearTimeout(scoreBurstTimer);
  scoreBurstEl.classList.remove('is-visible');
  render();
  setStatus('Pick a piece to begin');
  if (gameOverDialog.open) gameOverDialog.close();
  if (restartDialog.open) restartDialog.close();
}

function ghostPosition(x, y, pointerType) {
  const piece = state.pieces[drag.index];
  const { rows, cols } = dimensions(piece.shape);
  const cell = boardEl.getBoundingClientRect().width / SIZE;
  const left = x - (cols * cell) / 2;
  const top = y - (rows * cell) / 2 - (pointerType === 'touch' ? 72 : 18);
  ghostEl.style.left = `${left}px`;
  ghostEl.style.top = `${top}px`;
  ghostEl.style.setProperty('--cell', `${cell}px`);
  return { left, top, cell };
}

function updateDrag(event) {
  if (!drag) return;
  const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.active && moved < 8) return;
  if (!drag.active) {
    drag.active = true;
    ghostEl.replaceChildren(makePieceGrid(state.pieces[drag.index]));
    ghostEl.classList.add('visible');
    document.body.classList.add('is-dragging');
  }
  const pos = ghostPosition(event.clientX, event.clientY, drag.pointerType);
  const rect = boardEl.getBoundingClientRect();
  const row = Math.round((pos.top - rect.top) / pos.cell);
  const col = Math.round((pos.left - rect.left) / pos.cell);
  const dims = dimensions(state.pieces[drag.index].shape);
  if (row >= 0 && col >= 0 && row + dims.rows <= SIZE && col + dims.cols <= SIZE) showPreview(drag.index, row, col);
  else clearPreview();
}

trayEl.addEventListener('pointerdown', event => {
  const slot = event.target.closest('.piece-slot');
  if (!slot || slot.disabled || state.ended) return;
  const index = Number(slot.dataset.index);
  drag = { index, startX: event.clientX, startY: event.clientY, pointerType: event.pointerType, active: false };
  slot.setPointerCapture(event.pointerId);
});

trayEl.addEventListener('pointermove', updateDrag);

function endDrag(event) {
  if (!drag) return;
  const { index, active } = drag;
  if (active && event.type !== 'pointercancel' && preview?.valid && preview.index === index) {
    commit(index, preview.row, preview.col);
  } else if (!active && event.type !== 'pointercancel') {
    selected = selected === index ? null : index;
    renderTray();
    setStatus(selected === null ? 'Pick a piece to begin' : 'Tap a square to place your piece');
  } else if (active && event.type !== 'pointercancel') {
    setStatus('Move the piece over an open spot');
  }
  drag = null;
  ghostEl.classList.remove('visible');
  ghostEl.replaceChildren();
  document.body.classList.remove('is-dragging');
  clearPreview();
}

trayEl.addEventListener('pointerup', endDrag);
trayEl.addEventListener('pointercancel', endDrag);
trayEl.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const slot = event.target.closest('.piece-slot');
  if (!slot || slot.disabled) return;
  event.preventDefault();
  selected = Number(slot.dataset.index);
  renderTray();
  setStatus('Choose a board square to place your piece');
  boardEl.querySelector('.board-cell')?.focus();
});

boardEl.addEventListener('click', event => {
  const cell = event.target.closest('.board-cell');
  if (!cell || selected === null) return;
  const placed = commit(selected, Number(cell.dataset.row), Number(cell.dataset.col));
  if (placed && event.detail === 0 && !state.ended) trayEl.querySelector('.piece-slot:not(:disabled)')?.focus();
});

boardEl.addEventListener('pointermove', event => {
  if (drag || selected === null) return;
  const cell = event.target.closest('.board-cell');
  if (cell) showPreview(selected, Number(cell.dataset.row), Number(cell.dataset.col));
});
boardEl.addEventListener('pointerleave', () => { if (!drag) clearPreview(); });
boardEl.addEventListener('focusin', event => {
  if (selected === null) return;
  const cell = event.target.closest('.board-cell');
  if (cell) showPreview(selected, Number(cell.dataset.row), Number(cell.dataset.col));
});
boardEl.addEventListener('keydown', event => {
  const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (event.key === 'Escape' && selected !== null) {
    selected = null;
    clearPreview();
    renderTray();
    setStatus('Piece unselected');
    return;
  }
  const step = directions[event.key];
  const cell = event.target.closest('.board-cell');
  if (!step || !cell) return;
  event.preventDefault();
  const row = Math.max(0, Math.min(SIZE - 1, Number(cell.dataset.row) + step[0]));
  const col = Math.max(0, Math.min(SIZE - 1, Number(cell.dataset.col) + step[1]));
  boardEl.children[row * SIZE + col].focus();
});

document.querySelector('#help-button').addEventListener('click', () => helpDialog.showModal());
document.querySelector('#close-help').addEventListener('click', () => helpDialog.close());
document.querySelector('#new-game').addEventListener('click', () => restartDialog.showModal());
document.querySelector('#cancel-restart').addEventListener('click', () => restartDialog.close());
document.querySelector('#confirm-restart').addEventListener('click', resetGame);
document.querySelector('#play-again').addEventListener('click', resetGame);

render();
if (state.ended) setStatus('No more moves — start a new game');
else if (previous) setStatus('Welcome back. Pick a piece!');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
