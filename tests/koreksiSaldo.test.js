import test from 'node:test';
import assert from 'node:assert/strict';
import { koreksiSelisih, buildKoreksiTx } from '../src/lib/koreksiSaldoHelpers.js';

test('koreksiSelisih: target > current', () => {
  assert.equal(koreksiSelisih(10000000, 8000000), 2000000);
});

test('koreksiSelisih: target < current', () => {
  assert.equal(koreksiSelisih(5000000, 8000000), -3000000);
});

test('koreksiSelisih: target === current', () => {
  assert.equal(koreksiSelisih(8000000, 8000000), 0);
});

test('buildKoreksiTx selisih positif → Pemasukan', () => {
  const tx = buildKoreksiTx({
    target: 10000000,
    currentQRIS: 8000000,
    id: 123,
    tanggal: '2026-10-06',
    addedByUid: 'uid-1',
    addedByName: 'Rafli',
  });
  assert.equal(tx.jenis, 'Pemasukan');
  assert.equal(tx.nominal, 2000000);
  assert.equal(tx.kategori, 'Lainnya');
  assert.equal(tx.account, 'QRIS');
  assert.equal(tx.deskripsi, 'Penyesuaian Saldo QRIS');
  assert.equal(tx.addedByUid, 'uid-1');
  assert.equal(tx.addedByName, 'Rafli');
});

test('buildKoreksiTx selisih negatif → Pengeluaran', () => {
  const tx = buildKoreksiTx({
    target: 5000000,
    currentQRIS: 8000000,
    id: 456,
    tanggal: '2026-10-06',
    addedByUid: 'uid-2',
    addedByName: 'Dinda',
  });
  assert.equal(tx.jenis, 'Pengeluaran');
  assert.equal(tx.nominal, 3000000);
  assert.equal(tx.kategori, 'Lainnya');
  assert.equal(tx.account, 'QRIS');
  assert.equal(tx.deskripsi, 'Penyesuaian Saldo QRIS');
});

test('buildKoreksiTx selisih 0 → null', () => {
  const tx = buildKoreksiTx({
    target: 8000000,
    currentQRIS: 8000000,
    id: 789,
    tanggal: '2026-10-06',
    addedByUid: 'uid-1',
    addedByName: 'Rafli',
  });
  assert.equal(tx, null);
});
