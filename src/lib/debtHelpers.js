// Tambah N unit ke tanggal YYYY-MM-DD lokal, return YYYY-MM-DD.
// Pakai Date lokal, bukan toISOString (invariant data-model #272).
export const addTenor = (tanggal, amount, unit) => {
  if (!tanggal || !amount || !unit) return '';
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(`${tanggal}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  if (unit === 'hari') d.setDate(d.getDate() + n);
  else if (unit === 'minggu') d.setDate(d.getDate() + n * 7);
  else if (unit === 'bulan') {
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    // clamp: kalau rollover ke bulan berikutnya (hari melebihi lastDay bulan target), mundur ke hari terakhir
    if (d.getDate() < day) d.setDate(0);
  } else return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Format YYYY-MM-DD -> "15 Jan" (ikut V1 app.jsx:26, BULAN array).
export const fmtDueDate = (s) => {
  if (!s) return '';
  const [, m, d] = s.split('-');
  if (!m || !d) return '';
  const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${Number(d)} ${BULAN[Number(m) - 1]}`;
};