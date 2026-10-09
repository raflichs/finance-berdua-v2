// Pure helpers for scan struk. Dipisah dari komponen biar bisa di-test tanpa DOM.

// Ambil teks JSON dari respons Gemini (candidates[0].content.parts[0].text).
export const extractGeminiText = (data) => {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    const message = data?.error?.message || data?.error || 'Respons scan kosong.';
    throw new Error(typeof message === 'string' ? message : 'Respons scan kosong.');
  }
  return text;
};

const stripFence = (text) => text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

const toPrice = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
};

// Normalisasi hasil scan ke bentuk { items:[{name,price}], tax, taxLabel }.
// Terima object baru maupun array lama (kompat V1).
export const parseScanResult = (raw) => {
  const parsed = typeof raw === 'string' ? JSON.parse(stripFence(raw)) : raw;
  const list = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(list)) throw new Error('Format scan tidak dikenal.');

  const items = list
    .map((item) => ({ name: String(item?.name ?? '').trim(), price: toPrice(item?.price) }))
    .filter((item) => item.name && item.price > 0);

  if (!items.length) throw new Error('Tidak ada item terbaca dari struk.');

  const tax = Array.isArray(parsed) ? 0 : Math.max(0, toPrice(parsed?.tax));
  const taxLabel = Array.isArray(parsed) ? '' : String(parsed?.taxLabel ?? '').trim();
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  return { items, subtotal, tax, taxLabel };
};

// Porsi pajak proporsional: fraksi subtotal orang dibagi subtotal total.
// subtotal 0 -> fraksi 0 (hindari bagi nol).
export const taxShare = (personSubtotal, subtotal, tax) => {
  if (!subtotal || subtotal <= 0) return 0;
  return (tax * personSubtotal) / subtotal;
};

// Hitung untuk satu orang: subtotal porsi + pajak proporsional (dibulatkan).
export const personTotal = (personSubtotal, subtotal, tax) =>
  Math.round(personSubtotal + taxShare(personSubtotal, subtotal, tax));
