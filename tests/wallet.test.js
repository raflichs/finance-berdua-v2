import test from 'node:test';
import assert from 'node:assert/strict';
import { calcWallet } from '../src/store/useStore.js';

// ponytail: unit test calcWallet only; Zustand reactivity verified via component memo (Dashboard/InputTransaction useMemo)

test('scenario bug report: Pemasukan QRIS 28jt + Pengeluaran QRIS 450k = QRIS & Total 27.550.000', () => {
  const txs = [
    { id: 1, tanggal: '2026-10-04', jenis: 'Pemasukan', kategori: 'Gaji', nominal: 28000000, account: 'QRIS', addedBy: 'A' },
    { id: 2, tanggal: '2026-10-04', jenis: 'Pengeluaran', kategori: 'Makan', nominal: 450000, account: 'QRIS', addedBy: 'A' },
  ];
  const w = calcWallet(txs);
  assert.equal(w.QRIS, 27550000);
  assert.equal(w.Cash, 0);
  assert.equal(w.total, 27550000);
  assert.equal(w.QRIS + w.Cash, w.total);
});

test('Pemasukan Cash menambah Cash', () => {
  const w = calcWallet([{ id: 1, tanggal: '2026-10-04', jenis: 'Pemasukan', kategori: 'Bonus', nominal: 500000, account: 'Cash', addedBy: 'A' }]);
  assert.equal(w.Cash, 500000);
  assert.equal(w.QRIS, 0);
  assert.equal(w.total, 500000);
});

test('Pengeluaran Cash mengurangi Cash', () => {
  const w = calcWallet([
    { id: 1, tanggal: '2026-10-04', jenis: 'Pemasukan', kategori: 'Gaji', nominal: 1000000, account: 'Cash', addedBy: 'A' },
    { id: 2, tanggal: '2026-10-04', jenis: 'Pengeluaran', kategori: 'Makan', nominal: 200000, account: 'Cash', addedBy: 'A' },
  ]);
  assert.equal(w.Cash, 800000);
  assert.equal(w.total, 800000);
});

test('CashMove QRIS->Cash mengurangi sumber menambah tujuan, Total tetap', () => {
  const w = calcWallet([
    { id: 1, tanggal: '2026-10-04', jenis: 'Pemasukan', kategori: 'Gaji', nominal: 1000000, account: 'QRIS', addedBy: 'A' },
    { id: 2, tanggal: '2026-10-04', jenis: 'CashMove', kategori: 'Atur Cash', nominal: 300000, fromAccount: 'QRIS', toAccount: 'Cash', addedBy: 'A' },
  ]);
  assert.equal(w.QRIS, 700000);
  assert.equal(w.Cash, 300000);
  assert.equal(w.total, 1000000);
});

test('CashMove Cash->QRIS', () => {
  const w = calcWallet([
    { id: 1, tanggal: '2026-10-04', jenis: 'Pemasukan', kategori: 'Gaji', nominal: 500000, account: 'Cash', addedBy: 'A' },
    { id: 2, tanggal: '2026-10-04', jenis: 'CashMove', kategori: 'Atur Cash', nominal: 200000, fromAccount: 'Cash', toAccount: 'QRIS', addedBy: 'A' },
  ]);
  assert.equal(w.QRIS, 200000);
  assert.equal(w.Cash, 300000);
  assert.equal(w.total, 500000);
});

test('Total = QRIS + Cash invariant across mixed ops', () => {
  const txs = [
    { id: 1, tanggal: '2026-10-04', jenis: 'Pemasukan', kategori: 'Gaji', nominal: 28000000, account: 'QRIS', addedBy: 'A' },
    { id: 2, tanggal: '2026-10-04', jenis: 'Pemasukan', kategori: 'Bonus', nominal: 2000000, account: 'Cash', addedBy: 'A' },
    { id: 3, tanggal: '2026-10-04', jenis: 'Pengeluaran', kategori: 'Makan', nominal: 450000, account: 'QRIS', addedBy: 'A' },
    { id: 4, tanggal: '2026-10-04', jenis: 'CashMove', kategori: 'Atur Cash', nominal: 1000000, fromAccount: 'QRIS', toAccount: 'Cash', addedBy: 'A' },
  ];
  const w = calcWallet(txs);
  assert.equal(w.total, w.QRIS + w.Cash);
  // QRIS: 28jt -450k -1jt = 26550000, Cash: 2jt+1jt=3jt, total 29550000
  assert.equal(w.QRIS, 26550000);
  assert.equal(w.Cash, 3000000);
  assert.equal(w.total, 29550000);
});

test('legacy paymentMethod fallback via txAccount equiv', () => {
  const w = calcWallet([
    { id: 1, tanggal: '2026-10-04', jenis: 'Pemasukan', kategori: 'Gaji', nominal: 100000, paymentMethod: 'Cash', addedBy: 'A' },
  ]);
  assert.equal(w.Cash, 100000);
});

test('Zustand store no longer has getter wallet; reactivity via calcWallet(transactions)', async () => {
  const { default: useStore } = await import('../src/store/useStore.js');
  // initial should have no own wallet prop, or if exists not a getter snapshot
  const state = useStore.getState();
  const desc = Object.getOwnPropertyDescriptor(state, 'wallet');
  // getter removed => either no descriptor or plain value; but not stale 0
  // After setTransactions, calcWallet should reflect changes without store.wallet
  useStore.setState({ transactions: [] });
  let w = calcWallet(useStore.getState().transactions);
  assert.equal(w.total, 0);
  useStore.setState({ transactions: [{ id: 99, tanggal: '2026-10-04', jenis: 'Pemasukan', kategori: 'Gaji', nominal: 10000, account: 'QRIS', addedBy: 'A' }] });
  w = calcWallet(useStore.getState().transactions);
  assert.equal(w.QRIS, 10000);
  assert.equal(w.total, 10000);
  // Ensure no wallet getter on store
  assert.equal(desc?.get, undefined);
});
