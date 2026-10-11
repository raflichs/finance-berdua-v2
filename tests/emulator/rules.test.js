import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, set, get } from 'firebase/database';

// ponytail: test rules cuma buat jalur yang berubah gara-gara kantong + regresi member/non-member.
// Jalanin lewat `npm run test:rules` (butuh emulator RTDB, butuh Java).

const PROJECT_ID = 'demo-finance-berdua';
const WS = 'w1';
const base = `finance_berdua_v2/workspaces/${WS}`;

let env;
let db1;
let db2;
let outsider;

const tx = (over = {}) => ({
  id: 1, tanggal: '2026-10-11', jenis: 'Pengeluaran', kategori: 'Makan', deskripsi: '', nominal: 1000,
  account: 'QRIS', addedByUid: 'u1', addedByName: 'U1', ...over,
});
const move = (toAccount, over = {}) => { const t = tx({ id: 2, jenis: 'CashMove', kategori: 'Alokasi', fromAccount: 'QRIS', toAccount, ...over }); delete t.account; return t; };
const pocket = (over = {}) => ({ id: 'p_1', nama: 'Kosan', aktif: true, createdByUid: 'u1', createdByName: 'U1', createdAt: 1730000000000, ...over });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules: readFileSync('firebase.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `${base}/members/u1`), { role: 'owner' });
    await set(ref(db, `${base}/members/u2`), { role: 'member' });
    await set(ref(db, `${base}/pockets/p_1`), pocket());
  });
  db1 = env.authenticatedContext('u1').database();
  db2 = env.authenticatedContext('u2').database();
  outsider = env.authenticatedContext('u3').database();
});

after(async () => { await env?.cleanup(); });

test('member bisa nulis transaksi biasa pakai QRIS/Cash', async () => {
  await assertSucceeds(set(ref(db1, `${base}/transactions/1`), tx()));
  await assertSucceeds(set(ref(db1, `${base}/transactions/2`), tx({ id: 2, account: 'Cash' })));
});

test('member bisa nulis CashMove QRIS -> kantong', async () => {
  await assertSucceeds(set(ref(db1, `${base}/transactions/10`), move('p_1')));
});

test('member bisa nulis pengeluaran dari kantong', async () => {
  await assertSucceeds(set(ref(db1, `${base}/transactions/11`), tx({ id: 11, account: 'p_1', kategori: 'Tagihan' })));
});

test('CashMove ke kantong yang nggak ada DITOLAK', async () => {
  await assertFails(set(ref(db1, `${base}/transactions/12`), move('p_hantu')));
});

test('CashMove dari kantong yang nggak ada DITOLAK', async () => {
  await assertFails(set(ref(db1, `${base}/transactions/13`), move('QRIS', { fromAccount: 'p_hantu' })));
});

test('pengeluaran dari kantong yang nggak ada DITOLAK', async () => {
  await assertFails(set(ref(db1, `${base}/transactions/14`), tx({ id: 14, account: 'p_hantu' })));
});

test('akun ngawur (bukan QRIS/Cash/p_*) DITOLAK', async () => {
  await assertFails(set(ref(db1, `${base}/transactions/15`), tx({ id: 15, account: 'Gopay' })));
});

test('member bisa bikin kantong valid', async () => {
  await assertSucceeds(set(ref(db1, `${base}/pockets/p_2`), pocket({ id: 'p_2', nama: 'Listrik' })));
});

test('kantong dengan id nggak sama path DITOLAK', async () => {
  await assertFails(set(ref(db1, `${base}/pockets/p_3`), pocket({ id: 'p_9' })));
});

test('kantong tanpa prefix p_ DITOLAK', async () => {
  await assertFails(set(ref(db1, `${base}/pockets/kosan`), pocket({ id: 'kosan' })));
});

test('kantong tanpa nama DITOLAK', async () => {
  await assertFails(set(ref(db1, `${base}/pockets/p_4`), pocket({ id: 'p_4', nama: '' })));
});

test('field Tahap 2: jatuhTempo 1-28 boleh, di luar itu DITOLAK', async () => {
  await assertSucceeds(set(ref(db1, `${base}/pockets/p_5`), pocket({ id: 'p_5', nominal: 1500000, jatuhTempo: 15 })));
  await assertFails(set(ref(db1, `${base}/pockets/p_6`), pocket({ id: 'p_6', jatuhTempo: 31 })));
});

test('field Tahap 2: target negatif DITOLAK', async () => {
  await assertFails(set(ref(db1, `${base}/pockets/p_8`), pocket({ id: 'p_8', nominal: -1 })));
});

test('field Tahap 2: target & jatuh tempo bisa dikosongin lagi (null = hapus field)', async () => {
  await assertSucceeds(set(ref(db1, `${base}/pockets/p_9`), pocket({ id: 'p_9', nominal: 200000, jatuhTempo: 5 })));
  await assertSucceeds(set(ref(db1, `${base}/pockets/p_9`), pocket({ id: 'p_9', nominal: null, jatuhTempo: null })));
  const snap = await get(ref(db2, `${base}/pockets/p_9`));
  assert.equal(snap.val().nominal, undefined, 'nominal harus kehapus, bukan jadi 0');
  assert.equal(snap.val().jatuhTempo, undefined);
});

test('member lain bisa baca transaksi & kantong', async () => {
  await assertSucceeds(get(ref(db2, `${base}/transactions/10`)));
  await assertSucceeds(get(ref(db2, `${base}/pockets/p_1`)));
});

test('non-member ditolak baca dan nulis', async () => {
  await assertFails(get(ref(outsider, `${base}/transactions/10`)));
  await assertFails(get(ref(outsider, `${base}/pockets/p_1`)));
  await assertFails(set(ref(outsider, `${base}/transactions/20`), tx({ id: 20, addedByUid: 'u3', addedByName: 'U3' })));
  await assertFails(set(ref(outsider, `${base}/pockets/p_7`), pocket({ id: 'p_7', createdByUid: 'u3', createdByName: 'U3' })));
});

test('member nggak bisa ngaku-ngaku sebagai orang lain', async () => {
  await assertFails(set(ref(db1, `${base}/transactions/21`), tx({ id: 21, addedByUid: 'u2' })));
});

test('transaksi nggak valid tetap ditolak (regresi)', async () => {
  await assertFails(set(ref(db1, `${base}/transactions/22`), tx({ id: 22, nominal: 0 })));
  await assertFails(set(ref(db1, `${base}/transactions/23`), tx({ id: 23, tanggal: '11-10-2026' })));
  await assertFails(set(ref(db1, `${base}/transactions/24`), move('QRIS')));
});

test('data legacy users/{uid} nggak kesentuh sama sekali', async () => {
  const legacy = env.authenticatedContext('u1').database();
  await assertSucceeds(set(ref(legacy, 'finance_berdua_v2/users/u1/transactions/1'), {
    id: 1, tanggal: '2026-10-11', jenis: 'Pengeluaran', kategori: 'Makan', deskripsi: '', nominal: 1000, account: 'QRIS', addedBy: 'u1',
  }));
  await assertFails(get(ref(outsider, 'finance_berdua_v2/users/u1/transactions/1')));
});
