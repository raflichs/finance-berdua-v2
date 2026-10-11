import { calcWallet, isPocketId, toLocalMonthKey } from '../store/useStore.js';
import { koreksiSelisih, buildKoreksiTx } from './koreksiSaldoHelpers.js';
import { nextDue } from './debtHelpers.js';

export { koreksiSelisih, buildKoreksiTx };

const dateValue = (tx) => String(tx.tanggal || '');

export const getDueSoonDebts = (debts, now = new Date()) => debts.map((debt) => {
  const nd = nextDue(debt, now);
  if (!nd) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.ceil((new Date(`${nd.tanggal}T00:00:00`) - today) / 86400000);
  const remaining = Number(debt.total || 0) - Number(debt.paid || 0);
  return remaining > 0 && days <= 7 ? { ...debt, days, remaining, duePeriode: nd.periode, dueTanggal: nd.tanggal } : null;
}).filter(Boolean).sort((a, b) => a.days - b.days);

// Tanggal jatuh tempo bulanan (1-28) → berapa hari lagi. Kalau tanggalnya sudah lewat bulan ini, hitung ke bulan depan.
const daysUntilDay = (day, now) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(now.getFullYear(), now.getMonth(), day);
  if (target < today) target.setMonth(target.getMonth() + 1);
  return Math.round((target - today) / 86400000);
};

// Tagihan tetap per kantong: target bulanan (`nominal`) vs saldo kantong sekarang.
// `shortfall` = kurang berapa lagi biar target bulan ini ketutup. Saldo ngumpul (rollover), jadi
// begitu tagihan dibayar saldonya turun lagi dan target bulan berikutnya muncul sendiri.
export const pocketBills = (pockets, wallet, now = new Date()) => pockets
  .filter((pocket) => pocket.aktif !== false && Number(pocket.nominal) > 0)
  .map((pocket) => {
    const nominal = Number(pocket.nominal);
    const saldo = (wallet && wallet.pockets && wallet.pockets[pocket.id]) || 0;
    const day = Number(pocket.jatuhTempo) || 0;
    return {
      id: pocket.id,
      nama: pocket.nama,
      icon: pocket.icon,
      nominal,
      saldo,
      shortfall: Math.max(0, nominal - saldo),
      jatuhTempo: day || null,
      days: day ? daysUntilDay(day, now) : null,
    };
  });

// Reminder Dashboard: kantong yang jatuh tempo ≤ 7 hari lagi tapi saldonya masih kurang.
export const getDueSoonPockets = (pockets, wallet, now = new Date(), windowDays = 7) => pocketBills(pockets, wallet, now)
  .filter((bill) => bill.days !== null && bill.days <= windowDays && bill.shortfall > 0)
  .sort((a, b) => a.days - b.days);

export const getDashboardData = (transactions, debts, now = new Date(), pockets = []) => {
  const month = toLocalMonthKey(now);
  const monthTransactions = transactions.filter((tx) => dateValue(tx).startsWith(month));
  const spending = monthTransactions.filter((tx) => tx.jenis === 'Pengeluaran');
  const byCategory = spending.reduce((result, tx) => {
    const category = tx.kategori || 'Lainnya';
    result[category] = (result[category] || 0) + Number(tx.nominal || 0);
    return result;
  }, {});

  return {
    wallet: calcWallet(transactions, pockets),
    income: monthTransactions.filter((tx) => tx.jenis === 'Pemasukan').reduce((sum, tx) => sum + Number(tx.nominal || 0), 0),
    expense: spending.reduce((sum, tx) => sum + Number(tx.nominal || 0), 0),
    spendingByCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
    recent: [...transactions].sort((a, b) => dateValue(b).localeCompare(dateValue(a)) || Number(b.id || 0) - Number(a.id || 0)).slice(0, 5),
    dueSoon: getDueSoonDebts(debts, now),
  };
};

export const formatRp = (value) => `Rp ${Math.abs(Math.round(Number(value) || 0)).toLocaleString('id-ID')}`;
export { formatThousands } from './formatInput.js';
export const signedRp = (tx) => `${tx.jenis === 'Pemasukan' ? '+' : '-'}${formatRp(tx.nominal)}`;
const accountName = (account, pockets) => {
  if (account === 'Cash') return 'Cash';
  if (isPocketId(account)) return pockets.find((pocket) => pocket.id === account)?.nama || 'Kantong dihapus';
  return 'QRIS';
};
export const transactionAccount = (tx, pockets = []) => tx.jenis === 'CashMove' ? `${accountName(tx.fromAccount, pockets)} → ${accountName(tx.toAccount, pockets)}` : accountName(tx.account || tx.paymentMethod, pockets);
