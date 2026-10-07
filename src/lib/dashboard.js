import { accountLabel, calcWallet, toLocalMonthKey } from '../store/useStore';
import { koreksiSelisih, buildKoreksiTx } from './koreksiSaldoHelpers';
import { nextDue } from './debtHelpers';

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

export const getDashboardData = (transactions, debts, now = new Date()) => {
  const month = toLocalMonthKey(now);
  const monthTransactions = transactions.filter((tx) => dateValue(tx).startsWith(month));
  const spending = monthTransactions.filter((tx) => tx.jenis === 'Pengeluaran');
  const byCategory = spending.reduce((result, tx) => {
    const category = tx.kategori || 'Lainnya';
    result[category] = (result[category] || 0) + Number(tx.nominal || 0);
    return result;
  }, {});

  return {
    wallet: calcWallet(transactions),
    income: monthTransactions.filter((tx) => tx.jenis === 'Pemasukan').reduce((sum, tx) => sum + Number(tx.nominal || 0), 0),
    expense: spending.reduce((sum, tx) => sum + Number(tx.nominal || 0), 0),
    spendingByCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
    recent: [...transactions].sort((a, b) => dateValue(b).localeCompare(dateValue(a)) || Number(b.id || 0) - Number(a.id || 0)).slice(0, 5),
    dueSoon: getDueSoonDebts(debts, now),
  };
};

export const formatRp = (value) => `Rp ${Math.abs(Math.round(Number(value) || 0)).toLocaleString('id-ID')}`;
export { formatThousands } from './formatInput';
export const signedRp = (tx) => `${tx.jenis === 'Pemasukan' ? '+' : '-'}${formatRp(tx.nominal)}`;
export const transactionAccount = (tx) => tx.jenis === 'CashMove' ? `${accountLabel(tx.fromAccount)} → ${accountLabel(tx.toAccount)}` : accountLabel(tx.account || tx.paymentMethod);
