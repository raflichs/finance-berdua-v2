import test from 'node:test';
import assert from 'node:assert/strict';
import { calcWallet } from '../src/store/useStore.js';
import { pocketBills, getDueSoonPockets } from '../src/lib/dashboard.js';

// ponytail: test lapisan tagihan tetap — target bulanan (`nominal`) vs saldo kantong, plus reminder jatuh tempo.
// Tanggal dikunci biar nggak flaky: "hari ini" = 11 Okt 2026 lokal.

const NOW = new Date(2026, 9, 11);
const income = (nominal, account = 'QRIS') => ({ id: 1, tanggal: '2026-10-01', jenis: 'Pemasukan', kategori: 'Gaji', nominal, account });
const allocate = (nominal, toAccount, id = 2) => ({ id, tanggal: '2026-10-02', jenis: 'CashMove', kategori: 'Alokasi', deskripsi: '', nominal, fromAccount: 'QRIS', toAccount });

const KOSAN = { id: 'p_1', nama: 'Kosan', icon: '🏠', aktif: true, nominal: 1500000, jatuhTempo: 15 };
const LISTRIK = { id: 'p_2', nama: 'Listrik', icon: '⚡', aktif: true, nominal: 300000, jatuhTempo: 5 };
const TANPA_TARGET = { id: 'p_3', nama: 'Jajan', aktif: true };
const ARSIP = { id: 'p_4', nama: 'Internet lama', aktif: false, nominal: 200000, jatuhTempo: 20 };

const walletOf = (transactions, pockets) => calcWallet(transactions, pockets);

test('pocketBills: cuma kantong aktif yang punya target, shortfall = target - saldo', () => {
  const pockets = [KOSAN, LISTRIK, TANPA_TARGET, ARSIP];
  const wallet = walletOf([income(10000000), allocate(1500000, KOSAN.id)], pockets);
  const bills = pocketBills(pockets, wallet, NOW);
  assert.deepEqual(bills.map((b) => b.id), ['p_1', 'p_2'], 'kantong tanpa target & arsip nggak masuk tagihan');
  assert.equal(bills[0].saldo, 1500000);
  assert.equal(bills[0].shortfall, 0, 'Kosan udah ketutup target bulan ini');
  assert.equal(bills[1].shortfall, 300000, 'Listrik belum diisi sama sekali');
});

test('pocketBills: saldo lebih dari target nggak bikin shortfall negatif', () => {
  const wallet = walletOf([income(10000000), allocate(2000000, KOSAN.id)], [KOSAN]);
  assert.equal(pocketBills([KOSAN], wallet, NOW)[0].shortfall, 0);
});

test('pocketBills: hitung hari ke jatuh tempo, tanggal yang udah lewat lompat ke bulan depan', () => {
  const wallet = walletOf([income(10000000)], [KOSAN, LISTRIK]);
  const [kosan, listrik] = pocketBills([KOSAN, LISTRIK], wallet, NOW);
  assert.equal(kosan.jatuhTempo, 15);
  assert.equal(kosan.days, 4, '11 Okt → 15 Okt = 4 hari');
  assert.equal(listrik.days, 25, 'tgl 5 udah lewat, jadi ke 5 Nov = 25 hari');
});

test('pocketBills: jatuh tempo hari ini = 0 hari, kantong tanpa jatuh tempo days null', () => {
  const hariIni = { id: 'p_5', nama: 'Wifi', aktif: true, nominal: 250000, jatuhTempo: 11 };
  const tanpaDue = { id: 'p_6', nama: 'Nabung', aktif: true, nominal: 500000 };
  const wallet = walletOf([income(10000000)], [hariIni, tanpaDue]);
  const bills = pocketBills([hariIni, tanpaDue], wallet, NOW);
  assert.equal(bills[0].days, 0);
  assert.equal(bills[0].jatuhTempo, 11);
  assert.equal(bills[1].days, null);
  assert.equal(bills[1].jatuhTempo, null);
});

test('pocketBills: wallet tanpa bucket kantong nggak bikin crash, saldo dianggap 0', () => {
  const bills = pocketBills([KOSAN], undefined, NOW);
  assert.equal(bills[0].saldo, 0);
  assert.equal(bills[0].shortfall, 1500000);
});

test('getDueSoonPockets: cuma yang <= 7 hari DAN masih kurang, urut paling mepet dulu', () => {
  const MEpet = { id: 'p_7', nama: 'Air', aktif: true, nominal: 200000, jatuhTempo: 13 };
  const pockets = [KOSAN, LISTRIK, MEpet, TANPA_TARGET, ARSIP];
  const wallet = walletOf([income(10000000), allocate(1500000, KOSAN.id)], pockets);
  const due = getDueSoonPockets(pockets, wallet, NOW);
  assert.deepEqual(due.map((b) => b.id), ['p_7'], 'Kosan udah cukup, Listrik masih 25 hari lagi, arsip & tanpa target keluar');
  assert.equal(due[0].days, 2);
  assert.equal(due[0].shortfall, 200000);
});

test('getDueSoonPockets: kantong yang jatuh tempo dekat tapi saldonya cukup nggak muncul', () => {
  const pockets = [{ id: 'p_8', nama: 'Kosan', aktif: true, nominal: 1000000, jatuhTempo: 12 }];
  const wallet = walletOf([income(10000000), allocate(1000000, 'p_8')], pockets);
  assert.deepEqual(getDueSoonPockets(pockets, wallet, NOW), []);
});

test('getDueSoonPockets: bikin kantong baru (target diisi) langsung kehitung dari saldo 0', () => {
  const baru = { id: 'p_9', nama: 'Sekolah', aktif: true, nominal: 750000, jatuhTempo: 14 };
  const wallet = walletOf([income(10000000)], [baru]);
  const due = getDueSoonPockets([baru], wallet, NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].shortfall, 750000);
  assert.equal(due[0].saldo, 0);
});
