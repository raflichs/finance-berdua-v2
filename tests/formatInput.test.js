import test from 'node:test';
import assert from 'node:assert/strict';
import { formatThousands } from '../src/lib/formatInput.js';

test('formatThousands: 12500 -> 12.500', () => {
  assert.equal(formatThousands('12500'), '12.500');
});

test('formatThousands: 1000000 -> 1.000.000', () => {
  assert.equal(formatThousands('1000000'), '1.000.000');
});

test('formatThousands: empty -> empty', () => {
  assert.equal(formatThousands(''), '');
});

test('formatThousands: non-digit -> empty', () => {
  assert.equal(formatThousands('abc'), '');
});

test('formatThousands: idempotent (sudah formatted)', () => {
  assert.equal(formatThousands('12.500'), '12.500');
});

test('formatThousands: null -> empty', () => {
  assert.equal(formatThousands(null), '');
});

test('formatThousands: leading zero stripped', () => {
  assert.equal(formatThousands('007'), '7');
});