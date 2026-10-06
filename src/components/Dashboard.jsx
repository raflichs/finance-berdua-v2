import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore, { calcWallet, toLocalMonthKey } from '../store/useStore';
import { formatRp, getDashboardData, signedRp, transactionAccount, buildKoreksiTx } from '../lib/dashboard';
import { saveTx } from '../lib/db';
import { enqueueTx } from '../lib/offlineQueue';
import { auth } from '../config/firebase';
import KoreksiSaldo from './KoreksiSaldo';

const categoryIcons = { Makan: 'restaurant', Transport: 'directions_car', Belanja: 'shopping_cart', Tagihan: 'receipt_long', Nongkrong: 'local_cafe', Hiburan: 'movie', Tabungan: 'savings', 'Pulsa/Kuota': 'phone_android', Gaji: 'payments', Bonus: 'redeem', Lainnya: 'category' };
const KAT_COLORS = { Makan: '#f59e0b', Transport: '#38bdf8', Belanja: '#a78bfa', Tagihan: '#ef4444', Nongkrong: '#fb923c', Hiburan: '#ec4899', Tabungan: '#34d399', 'Pulsa/Kuota': '#60a5fa', Gaji: '#22c55e', Bonus: '#eab308', Lainnya: '#a78bfa' };
const monthName = (key) => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T00:00:00`));
const monthOptions = () => Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - index); return toLocalMonthKey(date); });
const dueDebtInfo = (debts) => debts.map((debt) => {
  const due = new Date(`${debt.jatuhTempo}T00:00:00`);
  const days = Math.ceil((due - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
  return { ...debt, days, remaining: Number(debt.total || 0) - Number(debt.paid || 0) };
}).filter((debt) => debt.jatuhTempo && debt.remaining > 0 && debt.days <= 7).sort((a, b) => a.days - b.days);

function Donut({ data, total }) {
  const sliced = data.slice(0, 4);
  const colors = sliced.map(([kat]) => KAT_COLORS[kat] || '#a78bfa');
  const stops = sliced.reduce((out, entry, i) => {
    const val = entry[1];
    const pct = total ? (val / total) * 100 : 0;
    const start = out.acc;
    out.acc += pct;
    out.list.push(`${colors[i]} ${start}% ${out.acc}%`);
    return out;
  }, { acc: 0, list: [] }).list.join(', ');
  const conic = stops ? `conic-gradient(${stops})` : 'conic-gradient(rgba(255,255,255,0.08) 0% 100%)';
  return (
    <div className="relative h-[96px] w-[96px] shrink-0 rounded-full" style={{ background: conic }} aria-hidden="true">
      <div className="absolute inset-[14px] rounded-full bg-[var(--bg-surface-1)] border border-[var(--border-1)]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)]">{data.length ? `${Math.round((data[0][1]/total)*100)}%` : '0%'}</span>
      </div>
    </div>
  );
}

function Dashboard() {
  const { transactions, debts, setActiveTab, setTransactions, workspaceId, myName, uid, toLocalDateKey } = useStore();
  const wallet = useMemo(() => calcWallet(transactions), [transactions]);
  const [selectedMonth, setSelectedMonth] = useState(() => toLocalMonthKey());
  const [hideBalance, setHideBalance] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [koreksiOpen, setKoreksiOpen] = useState(false);
  const koreksiTriggerRef = useRef(null);
  const monthRef = useRef(null);
  const closeKoreksi = useCallback(() => setKoreksiOpen(false), []);
  const data = getDashboardData(transactions, debts, new Date(`${selectedMonth}-01T00:00:00`));
  const topCategories = data.spendingByCategory.slice(0, 4);
  const dueDebts = useMemo(() => dueDebtInfo(debts), [debts]);
  const options = useMemo(() => monthOptions(), []);
  const display = (value) => hideBalance ? '••••••' : formatRp(value);
  const monthLabel = monthName(selectedMonth);
  const isEmpty = transactions.length === 0;

  useEffect(() => {
    if (!monthOpen) return;
    const onDown = (e) => { if (monthRef.current && !monthRef.current.contains(e.target)) setMonthOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMonthOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [monthOpen]);

  const handleKoreksiSaved = async (target) => {
    const currentUser = auth.currentUser;
    const addedByUid = currentUser?.uid || uid;
    const addedByName = myName || currentUser?.email || 'Tidak diketahui';
    const tx = buildKoreksiTx({
      target,
      currentQRIS: wallet.QRIS,
      id: Date.now(),
      tanggal: toLocalDateKey(),
      addedByUid,
      addedByName,
    });
    if (!tx) return; // selisih === 0, tidak perlu transaksi
    try {
      await saveTx(workspaceId, tx);
      setTransactions([...transactions, tx]);
    } catch (cause) {
      if (['PERMISSION_DENIED', 'permission-denied', 'INVALID_ARGUMENT', 'invalid-argument'].includes(cause?.code)) throw cause;
      await enqueueTx(uid, tx);
      setTransactions([...transactions, tx]);
    }
  };

  return (
    <div className="dashboard-layout flex flex-col gap-4" aria-label="Dashboard">
      {/* A. Header periode */}
      <section className="flex flex-wrap items-center justify-between gap-3" aria-label="Periode dashboard">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)] shrink-0">Periode</span>
          {/* Custom month picker — no native select */}
          <div className="relative shrink-0" ref={monthRef}>
            <button
              type="button"
              className={`pill-control ${monthOpen ? 'pill-control--active' : ''} !min-h-[40px] !bg-[var(--bg-surface-1)]`}
              aria-haspopup="listbox"
              aria-expanded={monthOpen}
              aria-label={`Pilih bulan, saat ini ${monthLabel}`}
              onClick={() => setMonthOpen((v) => !v)}
            >
              <span className="truncate max-w-[150px]">{monthLabel}</span>
              <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">{monthOpen ? 'expand_less' : 'expand_more'}</span>
            </button>
            {monthOpen && (
              <div
                role="listbox"
                aria-label="Pilih bulan"
                className="absolute left-0 top-[calc(100%+8px)] z-30 max-h-[min(360px,60vh)] w-[min(280px,calc(100vw-32px))] overflow-auto rounded-2xl border border-[var(--border-1)] bg-[var(--bg-modal)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
              >
                {options.map((month) => {
                  const active = month === selectedMonth;
                  return (
                    <button
                      key={month}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => { setSelectedMonth(month); setMonthOpen(false); }}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-sm ${active ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-1)]'}`}
                    >
                      <span className="truncate font-medium">{monthName(month)}</span>
                      {active && <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">check</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* B. Hero balance card — gradient/glass, border accent, inset highlight */}
      <section className="hero-card" aria-labelledby="balance-title">
        <div className="relative flex items-start justify-between gap-3 pr-1">
          <div className="min-w-0">
            <h2 id="balance-title" className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Total Uang (QRIS + Cash)</h2>
            <p className="mt-2 truncate text-[30px] font-extrabold tracking-tight sm:text-[32px]" aria-live="polite">{display(wallet.total)}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Saldo gabungan • {monthLabel}</p>
          </div>
          <button
            type="button"
            className="pill-control !min-h-[40px] !min-w-[40px] !p-0 !w-10 !h-10 shrink-0 !px-0 rounded-full"
            onClick={() => setHideBalance((v) => !v)}
            aria-label={hideBalance ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
            aria-pressed={hideBalance}
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">{hideBalance ? 'visibility_off' : 'visibility'}</span>
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-2xl border border-[var(--accent)]/25 bg-[rgba(88,86,214,0.10)] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent-weak)]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#60a5fa]" aria-hidden="true" /> QRIS</p>
            <p className="mt-2 truncate text-sm font-bold text-[#93c5fd]">{display(wallet.QRIS)}</p>
            <p className="mt-1 text-[10px] font-semibold leading-tight text-[rgba(167,139,250,0.9)]">Bandingkan dengan M-banking</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-1)] bg-[var(--surface-muted)] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#fbbf24]" aria-hidden="true" /> CASH</p>
            <p className="mt-2 truncate text-sm font-bold text-[#fcd34d]">{display(wallet.Cash)}</p>
            <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">Uang tunai</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" aria-hidden="true" /> MASUK BULAN INI</p>
            <p className="mt-2 truncate text-sm font-bold text-[var(--success)]">{display(data.income)}</p>
          </div>
           <div className="rounded-2xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-3">
             <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--error)]" aria-hidden="true" /> KELUAR BULAN INI</p>
             <p className="mt-2 truncate text-sm font-bold text-[var(--error)]">{display(data.expense)}</p>
           </div>
         </div>
          <button
            ref={koreksiTriggerRef}
            type="button"
            onClick={() => setKoreksiOpen(true)}
            className="mt-4 min-h-11 w-full rounded-xl bg-[var(--accent)]/20 text-sm font-bold text-[var(--accent-weak)] flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">balance</span>
            Koreksi Saldo
          </button>
       </section>

      {/* C. Empty state onboarding */}
      {isEmpty && (
        <section className="glass-card rounded-[var(--radius-card)] p-5 text-center" aria-label="Onboarding">
          <span className="material-symbols-outlined text-3xl text-[var(--accent-weak)]" aria-hidden="true">waving_hand</span>
          <h2 className="mt-2 text-sm font-bold">Mulai perjalanan finansial berdua</h2>
          <p className="mx-auto mt-1 max-w-[28ch] text-xs leading-5 text-[var(--text-secondary)]">Mulai catat transaksi pertama kalian untuk melihat kondisi finansial di sini.</p>
          <button type="button" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white" onClick={() => setActiveTab('input')}>Tambah transaksi pertama</button>
        </section>
      )}

      {/* Hutang jatuh tempo — full-width di atas grid kategori/tools agar tidak memecah kolom */}
      {dueDebts.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-[var(--warning)]/25 bg-[var(--warning)]/10 p-4" aria-labelledby="debt-alert-title">
          <div className="flex items-center justify-between gap-2">
            <h2 id="debt-alert-title" className="text-sm font-bold text-[var(--warning)]">Hutang perlu dicek</h2>
            <span className="pill-control !min-h-0 !py-1 !px-2.5 !text-xs !bg-[var(--warning)]/15 !border-[var(--warning)]/30 !text-[var(--warning-weak)]">{dueDebts.length}</span>
          </div>
          <ul className="mt-3 divide-y divide-[var(--border-1)]">
            {dueDebts.slice(0, 3).map((debt) => (
              <li key={debt.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{debt.name}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{debt.days < 0 ? `Terlambat ${Math.abs(debt.days)} hari` : debt.days === 0 ? 'Jatuh tempo hari ini' : `${debt.days} hari lagi`} · sisa {formatRp(debt.remaining)}</p>
                </div>
                <button type="button" className="pill-control shrink-0" onClick={() => setActiveTab('debt')}>Lihat hutang</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* D. Kategori terboros */}
      <section aria-labelledby="category-title">
        <h2 id="category-title" className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">KATEGORI TERBOROS — {monthLabel.toUpperCase()}</h2>
        {topCategories.length ? (
          <div className="glass-card flex items-center gap-4 rounded-2xl p-4 sm:p-5">
            <Donut data={topCategories} total={data.expense} />
            <div className="min-w-0 flex-1 space-y-2.5">
              {topCategories.map(([category, value]) => {
                const pct = data.expense ? Math.round((value / data.expense) * 100) : 0;
                const c = KAT_COLORS[category] || '#a78bfa';
                return (
                  <div key={category} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} aria-hidden="true" />
                      <span className="material-symbols-outlined shrink-0 text-[18px]" style={{ color: c }} aria-hidden="true">{categoryIcons[category] || 'category'}</span>
                      <span className="truncate text-sm font-medium">{category}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-6 text-center">
            <span className="material-symbols-outlined text-3xl text-[var(--text-muted)]" aria-hidden="true">donut_small</span>
            <p className="mt-2 text-sm font-semibold">Belum ada pengeluaran</p>
            <p className="mx-auto mt-1 max-w-[28ch] text-xs leading-5 text-[var(--text-secondary)]">Catat pengeluaran di {monthLabel} untuk melihat kategori terboros.</p>
          </div>
        )}
      </section>

      {/* E. Feature cards Tools berdua */}
      <section aria-labelledby="shortcut-title">
        <h2 id="shortcut-title" className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Tools berdua</h2>
        <div className="grid w-full grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <ShortcutCard icon="favorite" title="Dana Nikah" subtitle="Target tabungan" tone="wedding" onClick={() => setActiveTab('savings')} />
          <ShortcutCard icon="payments" title="Hutang & Piutang" subtitle="Kelola pinjaman" tone="error" onClick={() => setActiveTab('debt')} />
          <ShortcutCard icon="call_split" title="Split Bill" subtitle="Bagi tagihan" tone="accent" onClick={() => setActiveTab('split')} />
        </div>
      </section>

      {/* F. Transaksi terbaru */}
      <section aria-labelledby="recent-title">
        <h2 id="recent-title" className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Transaksi terbaru</h2>
        <div className="glass-card overflow-hidden rounded-[var(--radius-card)]">
          {data.recent.length ? (
            <>
              <ul className="divide-y divide-[rgba(255,255,255,0.06)]">
                {data.recent.map((tx) => (
                  <li key={tx.id} className="flex items-center justify-between gap-3 p-4">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] border border-[var(--border-1)]" aria-hidden="true">
                        <span className="material-symbols-outlined text-lg" style={{ color: tx.jenis === 'CashMove' ? '#60a5fa' : KAT_COLORS[tx.kategori] || '#a78bfa' }}>{tx.jenis === 'CashMove' ? 'swap_horiz' : categoryIcons[tx.kategori] || 'category'}</span>
                      </span>
                      <span className="min-w-0">
                        <p className="truncate text-sm font-semibold">{tx.deskripsi || tx.kategori}</p>
                        <p className="truncate text-xs text-[var(--text-secondary)]">{tx.tanggal} · {transactionAccount(tx)}</p>
                      </span>
                    </span>
                    <strong className={`shrink-0 truncate text-sm font-bold ${tx.jenis === 'Pemasukan' ? 'text-[var(--success)]' : tx.jenis === 'CashMove' ? 'text-[#60a5fa]' : 'text-[var(--error)]'}`}>{signedRp(tx)}</strong>
                  </li>
                ))}
              </ul>
              <button type="button" className="flex min-h-11 w-full items-center justify-center border-t border-[rgba(255,255,255,0.06)] text-sm font-semibold text-[var(--accent-weak)] hover:bg-white/[0.04]" onClick={() => setActiveTab('history')}>Lihat semua ({data.recent.length < transactions.length ? `${data.recent.length}+` : data.recent.length})</button>
            </>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm text-[var(--text-secondary)]">Belum ada transaksi. Mulai catat agar ringkasan muncul di sini.</p>
              <button type="button" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white" onClick={() => setActiveTab('input')}>Tambah transaksi pertama</button>
            </div>
           )}
         </div>
       </section>

      {koreksiOpen && <KoreksiSaldo key="koreksi" open onClose={closeKoreksi} currentQRIS={wallet.QRIS} onSaved={handleKoreksiSaved} triggerRef={koreksiTriggerRef} />}
     </div>
   );
}

function ShortcutCard({ icon, title, subtitle, tone, onClick }) {
  const toneMap = {
    wedding: 'bg-[var(--wedding-bg)] border-[var(--wedding-border)] text-[var(--wedding)]',
    error: 'bg-[var(--error)]/10 border-[var(--error)]/20 text-[var(--error)]',
    accent: 'bg-[var(--accent)]/12 border-[var(--accent)]/20 text-[var(--accent-weak)]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card flex min-h-[84px] w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.98]"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${toneMap[tone] || toneMap.accent}`} aria-hidden="true">
        <span className="material-symbols-outlined text-xl">{icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-tight">{title}</span>
        <span className="block truncate text-xs leading-tight text-[var(--text-secondary)]">{subtitle}</span>
      </span>
      <span className="material-symbols-outlined shrink-0 text-lg text-[var(--text-tertiary)]" aria-hidden="true">chevron_right</span>
    </button>
  );
}

export default Dashboard;
