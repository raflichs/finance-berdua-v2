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

const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

const toKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseLocalDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Tanggal jatuh tempo cicilan ke-N
export const periodeTanggal = (debt, periode) => {
  const start = debt.tanggalMulai;
  // periode 1 = tanggalMulai langsung
  if (periode === 1) return start;
  if (debt.unit === 'hari') return addTenor(start, periode - 1, 'hari');
  if (debt.unit === 'minggu') return addTenor(start, (periode - 1) * 7, 'hari');
  // bulan: periode-1 bulan dari tanggalMulai, clamp hari ke tanggalJatuhTempoPeriode
  const d = parseLocalDate(start);
  const originalMonth = d.getMonth();
  d.setMonth(d.getMonth() + (periode - 1));
  // kalau rollover ke bulan berikutnya (setMonth overflow), mundur ke bulan target
  if (d.getMonth() !== (originalMonth + (periode - 1)) % 12) {
    d.setDate(1);
    d.setMonth((originalMonth + (periode - 1)) % 12);
  }
  const target = Math.min(debt.tanggalJatuhTempoPeriode || d.getDate(), daysInMonth(d));
  d.setDate(target);
  return toKey(d);
};

// Generate jadwal cicilan dari debt
export const generateSchedule = (debt) => {
  if (!debt?.tenor || !debt?.unit || !debt?.tanggalMulai) return [];
  const cicilanList = Array.isArray(debt.cicilan) ? debt.cicilan : [];
  const cicilanMap = new Map(cicilanList.map((c) => [c.periode, c]).filter(([p]) => p != null));
  return Array.from({ length: debt.tenor }, (_, i) => {
    const periode = i + 1;
    const tanggalJatuhTempo = periodeTanggal(debt, periode);
    const payment = cicilanMap.get(periode);
    const nominal = debt.nominalPerCicilan || 0;
    return { 
      periode, 
      tanggalJatuhTempo, 
      nominal, 
      paid: payment ? Number(payment.nominal) : 0, 
      status: payment && Number(payment.nominal) >= nominal ? 'lunas' : payment ? 'sebagian' : 'belum' 
    };
  });
};

// Periode terdekat yang belum lunas
export const nextDue = (debt) => {
  const schedule = generateSchedule(debt);
  if (!schedule.length) return debt?.jatuhTempo ? { tanggal: debt.jatuhTempo, periode: null } : null;
  const today = toKey(new Date());
  const next = schedule.find((s) => s.status !== 'lunas');
  if (!next) return null;
  const days = Math.ceil((new Date(`${next.tanggalJatuhTempo}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
  return { tanggal: next.tanggalJatuhTempo, periode: next.periode, days, nominal: next.nominal };
};

// Jumlah cicilan lunas
export const countPaid = (debt) => generateSchedule(debt).filter((s) => s.status === 'lunas').length;