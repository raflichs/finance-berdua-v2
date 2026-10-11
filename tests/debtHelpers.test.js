import test from 'node:test';
import assert from 'node:assert/strict';
import { addTenor, fmtDueDate, periodeTanggal, generateSchedule, nextDue, countPaid } from '../src/lib/debtHelpers.js';

test('addTenor: +30 hari', () => {
  assert.equal(addTenor('2026-01-15', 30, 'hari'), '2026-02-14');
});

test('addTenor: +2 minggu (= +14 hari)', () => {
  assert.equal(addTenor('2026-01-15', 2, 'minggu'), '2026-01-29');
});

test('addTenor: +3 bulan', () => {
  assert.equal(addTenor('2026-01-15', 3, 'bulan'), '2026-04-15');
});

test('addTenor: cross year Dec + 3 bulan', () => {
  assert.equal(addTenor('2026-12-15', 3, 'bulan'), '2027-03-15');
});

test('addTenor: amount 0 -> empty', () => {
  assert.equal(addTenor('2026-01-15', 0, 'hari'), '');
});

test('addTenor: amount negative -> empty', () => {
  assert.equal(addTenor('2026-01-15', -5, 'hari'), '');
});

test('addTenor: amount invalid -> empty', () => {
  assert.equal(addTenor('2026-01-15', 'abc', 'hari'), '');
});

test('addTenor: unit invalid -> empty', () => {
  assert.equal(addTenor('2026-01-15', 10, 'tahun'), '');
});

test('addTenor: tanggal invalid -> empty', () => {
  assert.equal(addTenor('invalid', 10, 'hari'), '');
});

test('addTenor: bulan edge 31 Jan +1 bulan -> clamp ke 28 Feb (no Feb 31)', () => {
  const result = addTenor('2026-01-31', 1, 'bulan');
  // clamp: 31 Jan + 1 bulan -> 28 Feb 2026 (non-leap year)
  assert.equal(result, '2026-02-28');
});

test('addTenor: bulan edge 31 Agu +1 bulan -> clamp ke 30 Sep', () => {
  const result = addTenor('2026-08-31', 1, 'bulan');
  // clamp: 31 Agu + 1 bulan -> 30 Sep 2026
  assert.equal(result, '2026-09-30');
});

test('addTenor: bulan edge leap year 31 Jan +1 bulan -> clamp ke 29 Feb', () => {
  const result = addTenor('2024-01-31', 1, 'bulan');
  // clamp: 31 Jan + 1 bulan -> 29 Feb 2024 (leap year)
  assert.equal(result, '2024-02-29');
});

test('fmtDueDate: valid date', () => {
  assert.equal(fmtDueDate('2026-01-15'), '15 Jan');
});

test('fmtDueDate: empty string', () => {
  assert.equal(fmtDueDate(''), '');
});

test('fmtDueDate: invalid format', () => {
  assert.equal(fmtDueDate('invalid'), '');
});

test('fmtDueDate: partial date', () => {
  assert.equal(fmtDueDate('2026-01'), '');
});

test('fmtDueDate: cross year format', () => {
  assert.equal(fmtDueDate('2027-03-15'), '15 Mar');
});

test('periodeTanggal: hari', () => {
  const debt = { unit: 'hari', tanggalMulai: '2026-10-07' };
  assert.equal(periodeTanggal(debt, 1), '2026-10-07');
  assert.equal(periodeTanggal(debt, 2), '2026-10-08');
});

test('periodeTanggal: minggu', () => {
  const debt = { unit: 'minggu', tanggalMulai: '2026-10-07' };
  assert.equal(periodeTanggal(debt, 1), '2026-10-07');
  assert.equal(periodeTanggal(debt, 2), '2026-10-14');
});

test('periodeTanggal: bulan', () => {
  const debt = { unit: 'bulan', tanggalMulai: '2026-11-01', tanggalJatuhTempoPeriode: 1 };
  assert.equal(periodeTanggal(debt, 1), '2026-11-01');
  assert.equal(periodeTanggal(debt, 2), '2026-12-01');
  assert.equal(periodeTanggal(debt, 6), '2027-04-01');
});

test('periodeTanggal: bulan clamp hari 31 -> 30', () => {
  const debt = { unit: 'bulan', tanggalMulai: '2026-08-31', tanggalJatuhTempoPeriode: 1 };
  assert.equal(periodeTanggal(debt, 2), '2026-09-01');
});

test('generateSchedule: tenor 6 bulan, tgl mulai 2026-11-01, tgl jatuh 1', () => {
  const debt = { tenor: 6, unit: 'bulan', tanggalMulai: '2026-11-01', tanggalJatuhTempoPeriode: 1, nominalPerCicilan: 500000, cicilan: [] };
  const schedule = generateSchedule(debt);
  assert.equal(schedule.length, 6);
  assert.equal(schedule[0].periode, 1);
  assert.equal(schedule[0].tanggalJatuhTempo, '2026-11-01');
  assert.equal(schedule[5].periode, 6);
  assert.equal(schedule[5].tanggalJatuhTempo, '2027-04-01');
  assert.equal(schedule[0].status, 'belum');
});

test('generateSchedule: tenor 4 minggu mulai 2026-10-07', () => {
  const debt = { tenor: 4, unit: 'minggu', tanggalMulai: '2026-10-07', nominalPerCicilan: 100000, cicilan: [] };
  const schedule = generateSchedule(debt);
  assert.equal(schedule.length, 4);
  assert.equal(schedule[0].tanggalJatuhTempo, '2026-10-07');
  assert.equal(schedule[1].tanggalJatuhTempo, '2026-10-14');
  assert.equal(schedule[3].tanggalJatuhTempo, '2026-10-28');
});

test('generateSchedule: dengan bayaran parsial', () => {
  const debt = { tenor: 3, unit: 'bulan', tanggalMulai: '2026-11-01', nominalPerCicilan: 500000, cicilan: [{ periode: 1, nominal: 500000 }, { periode: 2, nominal: 250000 }] };
  const schedule = generateSchedule(debt);
  assert.equal(schedule[0].status, 'lunas');
  assert.equal(schedule[1].status, 'sebagian');
  assert.equal(schedule[2].status, 'belum');
  assert.equal(schedule[0].paid, 500000);
  assert.equal(schedule[1].paid, 250000);
});

test('nextDue: fallback non-cicilan', () => {
  const debt = { jatuhTempo: '2026-12-01' };
  const result = nextDue(debt);
  assert.equal(result.tanggal, '2026-12-01');
  assert.equal(result.periode, null);
});

test('nextDue: cicilan semua lunas -> null', () => {
  const debt = { tenor: 2, unit: 'bulan', tanggalMulai: '2026-11-01', nominalPerCicilan: 500000, cicilan: [{ periode: 1, nominal: 500000 }, { periode: 2, nominal: 500000 }] };
  const result = nextDue(debt);
  assert.equal(result, null);
});

test('nextDue: periode 3 belum lunas', () => {
  const debt = { tenor: 3, unit: 'bulan', tanggalMulai: '2026-11-01', nominalPerCicilan: 500000, cicilan: [{ periode: 1, nominal: 500000 }, { periode: 2, nominal: 500000 }] };
  const result = nextDue(debt);
  assert.equal(result.periode, 3);
  assert.equal(result.tanggal, '2027-01-01');
  assert.ok(result.days !== undefined);
});

test('countPaid: tanpa cicilan', () => {
  const debt = { tenor: 3, unit: 'bulan', tanggalMulai: '2026-11-01', nominalPerCicilan: 500000, cicilan: [] };
  assert.equal(countPaid(debt), 0);
});

test('countPaid: dengan cicilan parsial', () => {
  const debt = { tenor: 3, unit: 'bulan', tanggalMulai: '2026-11-01', nominalPerCicilan: 500000, cicilan: [{ periode: 1, nominal: 500000 }, { periode: 2, nominal: 250000 }] };
  assert.equal(countPaid(debt), 1);
});

test('generateSchedule: cicilan object {} (bukan array) -> semua status belum', () => {
  const debt = { tenor: 3, unit: 'bulan', tanggalMulai: '2026-11-01', nominalPerCicilan: 500000, cicilan: {} };
  const schedule = generateSchedule(debt);
  assert.equal(schedule.length, 3);
  assert.equal(schedule[0].status, 'belum');
  assert.equal(schedule[1].status, 'belum');
  assert.equal(schedule[2].status, 'belum');
});

test('countPaid: cicilan object {} -> return 0', () => {
  const debt = { tenor: 3, unit: 'bulan', tanggalMulai: '2026-11-01', nominalPerCicilan: 500000, cicilan: {} };
  assert.equal(countPaid(debt), 0);
});