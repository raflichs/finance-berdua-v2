// Format angka mentah jadi string ribuan titik untuk tampil di input field.
// Murni, tanpa import store, supaya bisa diuji di node:test (dashboard.js import useStore).
export const formatThousands = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
};
