import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScanResult, extractGeminiText, taxShare, personTotal } from '../src/lib/scanStrukHelpers.js';

test('parseScanResult: object baru', () => {
  const result = parseScanResult({
    items: [{ name: 'Nasi Goreng', price: 25000 }, { name: 'Es Teh', price: 5000 }],
    subtotal: 30000,
    tax: 3000,
    taxLabel: 'PB1 10%',
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.subtotal, 30000);
  assert.equal(result.tax, 3000);
  assert.equal(result.taxLabel, 'PB1 10%');
});

test('parseScanResult: array lama (kompat V1) → tax 0', () => {
  const result = parseScanResult([{ name: 'Kopi', price: 18000 }]);
  assert.equal(result.items.length, 1);
  assert.equal(result.tax, 0);
  assert.equal(result.taxLabel, '');
  assert.equal(result.subtotal, 18000);
});

test('parseScanResult: string dengan markdown fence', () => {
  const result = parseScanResult('```json\n{"items":[{"name":"Ayam","price":20000}],"tax":2000}\n```');
  assert.equal(result.items[0].name, 'Ayam');
  assert.equal(result.tax, 2000);
});

test('parseScanResult: harga string "Rp 25.000" diparse', () => {
  const result = parseScanResult({ items: [{ name: 'Sate', price: 'Rp 25.000' }] });
  assert.equal(result.items[0].price, 25000);
});

test('parseScanResult: item tanpa harga / nama kosong dibuang', () => {
  const result = parseScanResult({ items: [{ name: 'Valid', price: 10000 }, { name: '', price: 5000 }, { name: 'Zero', price: 0 }] });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, 'Valid');
});

test('parseScanResult: shape rusak → throw', () => {
  assert.throws(() => parseScanResult({ foo: 'bar' }));
  assert.throws(() => parseScanResult({ items: [] }));
});

test('extractGeminiText: ambil text dari candidates', () => {
  const text = extractGeminiText({ candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }] });
  assert.equal(text, '{"items":[]}');
});

test('extractGeminiText: respons kosong → throw', () => {
  assert.throws(() => extractGeminiText({}));
});

test('taxShare: proporsional ke porsi', () => {
  assert.equal(taxShare(15000, 30000, 3000), 1500);
});

test('taxShare: subtotal 0 → 0 (tanpa NaN)', () => {
  assert.equal(taxShare(0, 0, 3000), 0);
});

test('personTotal: subtotal porsi + pajak proporsional, dibulatkan', () => {
  assert.equal(personTotal(15000, 30000, 3000), 16500);
});

test('personTotal: pembagian tidak bulat tetap konsisten', () => {
  assert.equal(personTotal(10000, 30000, 3000), 11000);
});
