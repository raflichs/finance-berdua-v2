import test from 'node:test';
import assert from 'node:assert/strict';
import { memberName, partnerUid } from '../src/lib/memberNames.js';

test('memberName pilih name benar, trim spasi', () => {
  const workspace = { members: { 'user-1': { displayName: '  Rafli  ' } } };
  assert.equal(memberName(workspace, 'user-1'), 'Rafli');
});

test('member tanpa displayName → string kosong', () => {
  const workspace = { members: { 'user-2': { role: 'member' } } };
  assert.equal(memberName(workspace, 'user-2'), '');
});

test('workspace null → string kosong', () => {
  assert.equal(memberName(null, 'user-1'), '');
});

test('partnerUid pilih member yang bukan uid kita', () => {
  const workspace = { members: { 'user-1': {}, 'user-2': {} } };
  assert.equal(partnerUid(workspace, 'user-1'), 'user-2');
});

test('partnerUid saat member cuma 1', () => {
  const workspace = { members: { 'user-1': {} } };
  assert.equal(partnerUid(workspace, 'user-1'), null);
});

test('dua member dengan displayName berbeda → memberName benar per uid', () => {
  const workspace = { members: { 'rafli-uid': { displayName: 'Rafli' }, 'dinda-uid': { displayName: 'Dinda' } } };
  assert.equal(memberName(workspace, 'rafli-uid'), 'Rafli');
  assert.equal(memberName(workspace, 'dinda-uid'), 'Dinda');
});
