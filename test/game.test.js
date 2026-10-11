import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, SHAPES, emptyBoard, canPlace, place, drawPieces, hasMove } from '../public/game.js';

const shape = id => SHAPES.find(item => item.id === id);

test('a placement fills cells and cannot overlap or leave the board', () => {
  const board = emptyBoard();
  const piece = { shape: shape('square'), color: 'teal' };
  const result = place(board, piece, 0, 0);
  assert.equal(result.points, 40);
  assert.equal(result.board[0][0], 'teal');
  assert.equal(board[0][0], null);
  assert.equal(canPlace(result.board, piece.shape, 0, 0), false);
  assert.equal(canPlace(board, piece.shape, SIZE - 1, SIZE - 1), false);
});

test('full rows and columns clear together and count the intersection once', () => {
  const board = emptyBoard();
  for (let col = 0; col < SIZE - 1; col++) board[3][col] = 'gold';
  for (let row = 0; row < SIZE; row++) if (row !== 3) board[row][7] = 'coral';
  const result = place(board, { shape: shape('dot'), color: 'teal' }, 3, 7);
  assert.deepEqual(result.rows, [3]);
  assert.deepEqual(result.cols, [7]);
  assert.equal(result.points, 260);
  assert.equal(result.board.flat().filter(Boolean).length, 0);
  assert.equal(result.streak, 1);
});

test('clearing streak scores and resets on a move without a clear', () => {
  const board = emptyBoard();
  board[0].fill('mint');
  board[0][0] = null;
  const first = place(board, { shape: shape('dot'), color: 'mint' }, 0, 0, 1);
  assert.equal(first.points, 135);
  const second = place(first.board, { shape: shape('dot'), color: 'mint' }, 0, 0, first.streak);
  assert.equal(second.streak, 0);
  assert.equal(second.points, 10);
});

test('a new tray always contains an available move while one exists', () => {
  const board = emptyBoard();
  for (let row = 0; row < SIZE; row++) board[row].fill('violet');
  board[6][4] = null;
  const tray = drawPieces(board, () => .9);
  assert.equal(tray.length, 3);
  assert.equal(hasMove(board, tray), true);
  assert.deepEqual(drawPieces(board.map(row => row.map(() => 'violet')), () => .5), [null, null, null]);
});
