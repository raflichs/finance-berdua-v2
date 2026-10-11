import test from 'node:test';
import assert from 'node:assert/strict';
import { calcWallet, isPocketId, POCKET_PREFIX } from '../src/store/useStore.js';
import { transactionAccount } from '../src/lib/dashboard.js';
import { createBackup, parseBackup } from '../src/lib/backup.js';

// ponytail: test kontrak backend kantong — saldo turunan, total tetap QRIS+Cash, id p_* nggak bocor ke QRIS

const KOSAN = { id: 'p_1', nama: 'Kosan', icon: '🏠', aktif: true };
const LISTRIK = { id: 'p_2', nama: 'Listrik', icon: '⚡', aktif: true };
const POCKETS = [KOSAN, LISTRIK];

const income = (nominal, account = 'QRIS', tanggal = '2026-10-01') => ({ id: 1, tanggal, jenis: 'Pemasukan', kategori: 'Gaji', nominal, account, addedByUid: 'u1', addedByName: 'A' });
const allocate = (nominal, toAccount, fromAccount = 'QRIS', id = 2, tanggal = '2026-10-02') => ({ id, tanggal, jenis: 'CashMove', kategori: 'Alokasi', deskripsi: '', nominal, fromAccount, toAccount, addedByUid: 'u1', addedByName: 'A' });
const spend = (nominal, account, id = 3, tanggal = '2026-10-05') => ({ id, tanggal, jenis: 'Pengeluaran', kategori: 'Tagihan', deskripsi: '', nominal, account, addedByUid: 'u1', addedByName: 'A' });

test('isPocketId cuma ngeklaim id p_*', () => {
  assert.equal(POCKET_PREFIX, 'p_');
  assert.equal(isPocketId('p_1730000000000'), true);
  assert.equal(isPocketId('QRIS'), false);
  assert.equal(isPocketId('Cash'), false);
  assert.equal(isPocketId(undefined), false);
  assert.equal(isPocketId(123), false);
});

test('alokasi mindahin duit beneran: QRIS turun, kantong naik, total turun sesuai alokasi', () => {
  const w = calcWallet([income(10000000), allocate(1500000, KOSAN.id)], POCKETS);
  assert.equal(w.QRIS, 8500000, 'QRIS harus turun 1,5jt — bukan net zero');
  assert.equal(w.Cash, 0);
  assert.equal(w.pockets.p_1, 1500000);
  assert.equal(w.pockets.p_2, 0, 'kantong kosong tetap muncul di daftar dengan saldo 0');
  assert.equal(w.total, 8500000);
  assert.equal(w.QRIS + w.Cash, w.total);
});

test('bayar tagihan dari kantong: kantong turun, QRIS/Cash nggak kesentuh', () => {
  const w = calcWallet([income(10000000), allocate(1500000, KOSAN.id), spend(1500000, KOSAN.id)], POCKETS);
  assert.equal(w.pockets.p_1, 0);
  assert.equal(w.QRIS, 8500000, 'bayar pakai duit kantong, bukan duit QRIS');
  assert.equal(w.total, 8500000);
});

test('rollover: sisa bulan lalu nambah ke bulan ini tanpa reset', () => {
  const txs = [
    income(20000000),
    allocate(1500000, KOSAN.id, 'QRIS', 2, '2026-09-02'),
    allocate(1500000, KOSAN.id, 'QRIS', 3, '2026-10-02'),
    spend(1200000, KOSAN.id, 4, '2026-10-03'),
  ];
  const w = calcWallet(txs, POCKETS);
  assert.equal(w.pockets.p_1, 1800000, '3jt terkumpul - 1,2jt kepakai = 1,8jt');
});

test('kantong diarsipkan (aktif:false) tetap kehitung — duit nggak bocor balik ke QRIS', () => {
  const arsip = [{ id: 'p_1', nama: 'Kosan', aktif: false }];
  const w = calcWallet([income(1000000), allocate(500000, 'p_1')], arsip);
  assert.equal(w.pockets.p_1, 500000);
  assert.equal(w.QRIS, 500000, 'QRIS tetap 500rb, bukan balik ke 1jt');
});

test('id p_* yang belum ada di daftar kantong nggak dilempar ke QRIS', () => {
  const w = calcWallet([income(1000000), allocate(400000, 'p_belum_muat')], []);
  assert.equal(w.pockets.p_belum_muat, 400000);
  assert.equal(w.QRIS, 600000, 'QRIS aman walau daftar kantong belum dimuat');
});

test('akun asing / paymentMethod legacy tetap fallback ke QRIS', () => {
  const w = calcWallet([
    { id: 1, tanggal: '2026-10-01', jenis: 'Pemasukan', kategori: 'Gaji', nominal: 100000, paymentMethod: 'Cash', addedByUid: 'u1', addedByName: 'A' },
    { id: 2, tanggal: '2026-10-01', jenis: 'Pemasukan', kategori: 'Gaji', nominal: 50000, account: 'Entah', addedByUid: 'u1', addedByName: 'A' },
  ]);
  assert.equal(w.Cash, 100000);
  assert.equal(w.QRIS, 50000);
});

test('total = QRIS + Cash di skenario campur', () => {
  const txs = [
    income(28000000),
    income(2000000, 'Cash'),
    spend(450000, 'QRIS'),
    allocate(1000000, KOSAN.id, 'QRIS'),
    allocate(500000, LISTRIK.id, 'Cash'),
    spend(300000, LISTRIK.id),
  ];
  const w = calcWallet(txs, POCKETS);
  assert.equal(w.QRIS, 28000000 - 450000 - 1000000);
  assert.equal(w.Cash, 2000000 - 500000);
  assert.equal(w.pockets.p_1, 1000000);
  assert.equal(w.pockets.p_2, 500000 - 300000);
  assert.equal(w.total, w.QRIS + w.Cash);
});

test('transactionAccount nampilin nama kantong, bukan id mentah', () => {
  assert.equal(transactionAccount(allocate(1000, 'p_1'), POCKETS), 'QRIS → Kosan');
  assert.equal(transactionAccount(spend(1000, 'p_2'), POCKETS), 'Listrik');
  assert.equal(transactionAccount(allocate(1000, 'p_1', 'Cash'), POCKETS), 'Cash → Kosan');
  assert.equal(transactionAccount(spend(1000, 'p_hilang'), POCKETS), 'Kantong dihapus');
  assert.equal(transactionAccount(spend(1000, 'QRIS'), POCKETS), 'QRIS');
  assert.equal(transactionAccount(spend(1000, 'Cash'), POCKETS), 'Cash');
});

test('backup roundtrip bawa kantong; backup lama tanpa pockets tetap kebaca', () => {
  const json = createBackup({ transactions: [income(1000)], debts: [], pockets: POCKETS });
  const parsed = parseBackup(json);
  assert.equal(parsed.pockets.length, 2);
  assert.equal(parsed.pockets[0].nama, 'Kosan');

  const lama = JSON.parse(json);
  delete lama.pockets;
  const parsedLama = parseBackup(JSON.stringify(lama));
  assert.deepEqual(parsedLama.pockets, [], 'backup versi lama default ke daftar kosong, bukan error');
});

test('backup nolak kantong rusak', () => {
  assert.throws(() => createBackup({ transactions: [], debts: [], pockets: [{ id: 'p_1' }] }), /Kantong tidak valid/);
  assert.throws(() => createBackup({ transactions: [], debts: [], pockets: [{ id: 'p_1', nama: 'Kosan', nominal: -1 }] }), /Nominal kantong tidak valid/);
  assert.throws(() => createBackup({ transactions: [], debts: [], pockets: [{ id: 'p_1', nama: 'Kosan', jatuhTempo: 31 }] }), /Jatuh tempo kantong tidak valid/);
});
