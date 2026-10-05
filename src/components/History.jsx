import { useEffect, useMemo, useState } from 'react';
import useStore, { toLocalMonthKey } from '../store/useStore';
import { removeTx, saveTx } from '../lib/db';
import { enqueueRemoveTx, enqueueTx } from '../lib/offlineQueue';
import { formatRp, transactionAccount } from '../lib/dashboard';

const PRIMARY_FILTERS = ['Semua', 'Pemasukan', 'Pengeluaran'];
const ACCOUNT_FILTERS = ['Semua', 'QRIS', 'Cash', 'Transfer Cash'];
const iconFor = (category) => ({ Makan: 'restaurant', Transport: 'directions_car', Belanja: 'shopping_cart', Tagihan: 'receipt_long', Nongkrong: 'local_cafe', Hiburan: 'movie', Tabungan: 'savings', 'Pulsa/Kuota': 'phone_android', Gaji: 'payments', Bonus: 'redeem' }[category] || 'category');
const monthLabel = (key) => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T00:00:00`));
const recentMonths = () => Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - index); return toLocalMonthKey(date); });

export default function History() {
  const { uid, workspaceId, transactions, setTransactions, setSyncing, setActiveTab } = useStore();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('Semua');
  const [accountFilter, setAccountFilter] = useState('Semua');
  const [month, setMonth] = useState('recent');
  const [draftMonth, setDraftMonth] = useState('recent');
  const [draftAccount, setDraftAccount] = useState('Semua');
  const [filterOpen, setFilterOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const months = useMemo(() => recentMonths(), []);

  const openFilter = () => {
    setDraftMonth(month);
    setDraftAccount(accountFilter);
    setFilterOpen(true);
  };

  useEffect(() => {
    if (!filterOpen) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [filterOpen]);
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') { setEditing(null); setError(''); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editing]);

   const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      const txMonth = String(tx.tanggal || '').slice(0, 7);
      const matchesMonth = query ? true : month === 'recent' ? months.includes(txMonth) : txMonth === month;
      const matchesSearch = !query || [tx.deskripsi, tx.kategori, tx.addedByName, tx.addedBy, tx.nominal].some((value) => String(value || '').toLowerCase().includes(query));
      const isTransfer = tx.jenis === 'CashMove';
      const matchesType = filterType === 'Semua' || tx.jenis === filterType;
      const matchesAccount = accountFilter === 'Semua'
        || (accountFilter === 'Transfer Cash' && isTransfer)
        || (!isTransfer && transactionAccount(tx) === accountFilter);
      const typeExcludesTransfer = (filterType === 'Pemasukan' || filterType === 'Pengeluaran') && isTransfer;
      const matchesFilter = !typeExcludesTransfer && matchesType && matchesAccount;
      return matchesMonth && matchesSearch && matchesFilter;
    }).sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')) || Number(b.id || 0) - Number(a.id || 0));
  }, [filterType, accountFilter, month, months, search, transactions]);

  const grouped = useMemo(() => Object.entries(filtered.reduce((result, tx) => { const key = String(tx.tanggal || '').slice(0, 7) || 'Tanpa tanggal'; (result[key] ||= []).push(tx); return result; }, {})), [filtered]);
  const totals = useMemo(() => filtered.reduce((result, tx) => { if (tx.jenis === 'Pemasukan') result.income += Number(tx.nominal || 0); if (tx.jenis === 'Pengeluaran') result.expense += Number(tx.nominal || 0); return result; }, { income: 0, expense: 0 }), [filtered]);

  const mutate = async (operation) => { setError(''); setSyncing(true); try { await operation(); } catch { setError('Perubahan gagal disimpan. Coba lagi saat online.'); } finally { setSyncing(false); } };
  const isServerError = (cause) => ['PERMISSION_DENIED', 'permission-denied', 'INVALID_ARGUMENT', 'invalid-argument'].includes(cause?.code);
  const deleteTransaction = (tx) => {
    if (!window.confirm(`Hapus transaksi "${tx.deskripsi}"?`)) return;
    mutate(async () => {
      const next = transactions.filter((current) => current.id !== tx.id);
      setTransactions(next);
      try { await removeTx(workspaceId, tx.id); } catch (cause) { if (isServerError(cause)) { setTransactions(transactions); throw cause; } await enqueueRemoveTx(uid, tx.id); }
    });
  };
  const saveEdit = (event) => {
    event.preventDefault();
    const tx = { ...editing, nominal: Number(editing.nominal), deskripsi: editing.deskripsi.trim() || '-' };
    if (!tx.nominal || tx.nominal < 1000 || !tx.tanggal) { setError('Nominal minimal Rp 1.000 dan tanggal wajib diisi.'); return; }
    mutate(async () => {
      setTransactions(transactions.map((current) => current.id === tx.id ? tx : current));
      try { await saveTx(workspaceId, tx); } catch (cause) { if (isServerError(cause)) { setTransactions(transactions); throw cause; } await enqueueTx(uid, tx); }
      setEditing(null);
    });
  };

  const handleTablistKeyDown = (event) => {
    if (!event.target.matches('[role="tab"]')) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
    const currentIndex = tabs.indexOf(event.target);
    if (currentIndex === -1) return;
    let nextIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  };

  const activeSecondaryCount = (accountFilter !== 'Semua' ? 1 : 0) + (month !== 'recent' ? 1 : 0);
  const monthChipLabel = month === 'recent' ? '6 bulan terakhir' : monthLabel(month);
  const applyDraft = () => { setMonth(draftMonth); setAccountFilter(draftAccount); setFilterOpen(false); };

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-2">
      <div className="relative">
        <label className="sr-only" htmlFor="history-search">Cari transaksi</label>
        <span className="material-symbols-outlined pointer-events-none absolute left-3 top-3 text-lg text-[var(--text-secondary)]" aria-hidden="true">search</span>
        <input id="history-search" className="min-h-12 w-full rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-10 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" type="search" placeholder="Cari transaksi, kategori, nama..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      {/* Filter utama — pill konsisten */}
      <div className="filter-row" role="tablist" aria-label="Filter tipe transaksi" onKeyDown={handleTablistKeyDown}>
        {PRIMARY_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filterType === value}
            tabIndex={filterType === value ? 0 : -1}
            onClick={() => setFilterType(value)}
            className={`pill-control ${filterType === value ? 'pill-control--active' : ''}`}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          onClick={openFilter}
          className={`pill-control ${filterOpen || activeSecondaryCount ? 'pill-control--active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">tune</span>
          Filter{activeSecondaryCount ? ` · ${activeSecondaryCount}` : ''}
        </button>
      </div>

      {(month !== 'recent' || accountFilter !== 'Semua') && (
        <div className="flex flex-wrap gap-2">
          {month !== 'recent' && (
            <span className="pill-control !min-h-[32px] !py-1 !text-xs">
              {monthChipLabel}
              <button type="button" aria-label="Hapus filter bulan" className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs leading-none" onClick={() => setMonth('recent')}>✕</button>
            </span>
          )}
          {accountFilter !== 'Semua' && (
            <span className="pill-control !min-h-[32px] !py-1 !text-xs">
              {accountFilter}
              <button type="button" aria-label="Hapus filter akun" className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs leading-none" onClick={() => setAccountFilter('Semua')}>✕</button>
            </span>
          )}
          <button type="button" className="pill-control !border-transparent !bg-transparent !px-2 !text-xs !text-[var(--accent-weak)]" onClick={() => { setMonth('recent'); setAccountFilter('Semua'); }}>Reset filter</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-2xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-3"><div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Pemasukan</div><div className="truncate text-sm font-bold text-[var(--success)]">{formatRp(totals.income)}</div></div>
        <div className="min-w-0 rounded-2xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-3"><div className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Pengeluaran</div><div className="truncate text-sm font-bold text-[var(--error)]">{formatRp(totals.expense)}</div></div>
      </div>

      {error && !editing && <p className="text-xs text-[var(--error-weak)]" role="alert">{error}</p>}

      {filterOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[var(--overlay-strong)] p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Filter lanjutan" onClick={() => setFilterOpen(false)}>
          <div className="w-full max-w-[480px] rounded-t-[var(--radius-modal)] border border-[var(--border-1)] bg-[var(--bg-modal)] p-5 sm:rounded-[var(--radius-modal)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-bold">Filter lanjutan</h2><button type="button" className="pill-control !min-h-[36px]" onClick={() => setFilterOpen(false)}>Tutup</button></div>
            <p className="mb-2 text-xs font-semibold tracking-widest uppercase text-[var(--text-secondary)]">Bulan</p>
            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setDraftMonth('recent')} className={`pill-control ${draftMonth === 'recent' ? 'pill-control--active' : ''}`}>6 bulan terakhir</button>
              {months.map((value) => (
                <button key={value} type="button" onClick={() => setDraftMonth(value)} className={`pill-control ${draftMonth === value ? 'pill-control--active' : ''}`}>{monthLabel(value)}</button>
              ))}
            </div>
            <p className="mb-2 text-xs font-semibold tracking-widest uppercase text-[var(--text-secondary)]">Akun pembayaran</p>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_FILTERS.map((value) => (
                <button key={value} type="button" onClick={() => setDraftAccount(value)} className={`pill-control ${draftAccount === value ? 'pill-control--active' : ''}`}>{value}</button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">Tip: “Transfer Cash” menampilkan perpindahan saldo QRIS ↔ Cash.</p>
            <div className="mt-5 flex gap-2">
              <button type="button" className="pill-control flex-1 !rounded-xl !min-h-11 !text-sm" onClick={() => { setDraftMonth('recent'); setDraftAccount('Semua'); }}>Reset</button>
              <button type="button" className="min-h-11 flex-1 rounded-xl bg-[var(--accent)] text-sm font-bold text-white" onClick={applyDraft}>Terapkan</button>
            </div>
          </div>
        </div>
      )}

      {grouped.length === 0 ? (
        transactions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-2)] p-8 text-center"><span className="material-symbols-outlined text-4xl text-[var(--text-muted)]">inbox</span><p className="mt-2 text-sm font-bold">Belum ada transaksi</p><p className="mx-auto mt-1 max-w-[30ch] text-xs leading-5 text-[var(--text-secondary)]">Mulai catat pemasukan dan pengeluaran kalian agar riwayat dan laporan muncul di sini.</p><button type="button" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white" onClick={() => setActiveTab('input')}>Tambah transaksi pertama</button></div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-2)] p-8 text-center"><span className="material-symbols-outlined text-4xl text-[var(--text-muted)]">search_off</span><p className="mt-2 text-sm font-semibold">Tidak ada hasil</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Coba kata kunci atau filter lain</p><button type="button" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-1)] px-4 text-sm" onClick={() => { setSearch(''); setFilterType('Semua'); setAccountFilter('Semua'); setMonth('recent'); }}>Reset filter</button></div>
        )
      ) : grouped.map(([monthKey, items]) => (
        <section key={monthKey} aria-labelledby={`month-${monthKey}`}>
          <h2 id={`month-${monthKey}`} className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{monthKey === 'Tanpa tanggal' ? monthKey : monthLabel(monthKey)} · {items.length} transaksi</h2>
          <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-1)] bg-[var(--bg-surface-1)]">
            {items.map((tx) => {
              const cashMove = tx.jenis === 'CashMove';
              const mine = tx.addedByUid === uid;
              return (
                <li key={tx.id} className="flex min-w-0 items-center gap-2 border-b border-[var(--border-1)] p-3 last:border-0">
                  <span className={`transaction-icon material-symbols-outlined flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tx.jenis === 'Pemasukan' ? 'bg-[var(--success)]/10 text-[var(--success)]' : cashMove ? 'bg-[var(--info-soft)] text-[var(--info)]' : 'bg-[var(--error)]/10 text-[var(--error)]'}`} aria-hidden="true">{cashMove ? 'swap_horiz' : iconFor(tx.kategori)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{tx.deskripsi || tx.kategori}</div>
                    <div className="truncate text-[11px] text-[var(--text-secondary)]">{tx.tanggal || '-'} · {transactionAccount(tx)}{cashMove && ' · Transfer Cash'}</div>
                    <div className="truncate text-[10px] text-[var(--accent-weak)]">{mine ? 'Gue' : tx.addedByName || 'Tidak diketahui'}</div>
                  </div>
                  <div className="flex max-w-[44%] shrink-0 flex-col items-end gap-1">
                    <div className={`truncate text-[13px] font-bold ${tx.jenis === 'Pemasukan' ? 'text-[var(--success)]' : cashMove ? 'text-[var(--info)]' : 'text-[var(--error)]'}`}>{cashMove ? 'Transfer Cash' : `${tx.jenis === 'Pemasukan' ? '+' : '-'}${formatRp(tx.nominal)}`}</div>
                    {mine && !cashMove && (
                      <div className="flex gap-1">
                        <button type="button" aria-label={`Edit ${tx.deskripsi || tx.kategori}`} className="pill-control !min-h-8 !px-2 !text-[11px]" onClick={() => { setError(''); setEditing({ ...tx }); }}>Edit</button>
                        <button type="button" aria-label={`Hapus ${tx.deskripsi || tx.kategori}`} className="pill-control !min-h-8 !px-2 !text-[11px] !border-[var(--error)]/30 !text-[var(--error)]" onClick={() => deleteTransaction(tx)}>Hapus</button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-strong)] p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="edit-title" onClick={() => { setEditing(null); setError(''); }}>
          <form onClick={(e) => e.stopPropagation()} className="max-h-[calc(100dvh-32px)] w-full max-w-[480px] overflow-y-auto rounded-t-[var(--radius-modal)] border border-[var(--border-1)] bg-[var(--bg-modal)] p-5 sm:rounded-[var(--radius-modal)]" onSubmit={saveEdit}>
            <h2 id="edit-title" className="text-lg font-bold">Edit transaksi</h2>
            <label className="mt-4 block text-xs text-[var(--text-secondary)]" htmlFor="edit-description">Deskripsi</label>
            <input id="edit-description" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-3 text-base text-[var(--text-primary)]" value={editing.deskripsi} onChange={(event) => setEditing({ ...editing, deskripsi: event.target.value })} />
            <label className="mt-3 block text-xs text-[var(--text-secondary)]" htmlFor="edit-amount">Nominal</label>
            <input id="edit-amount" required min="1000" type="number" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-3 text-base text-[var(--text-primary)]" value={editing.nominal} onChange={(event) => setEditing({ ...editing, nominal: event.target.value })} />
            <label className="mt-3 block text-xs text-[var(--text-secondary)]" htmlFor="edit-date">Tanggal</label>
            <input id="edit-date" required type="date" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-3 text-base text-[var(--text-primary)]" value={editing.tanggal} onChange={(event) => setEditing({ ...editing, tanggal: event.target.value })} />
            {error && <p className="mt-3 text-xs text-[var(--error-weak)]" role="alert">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" className="pill-control flex-1 !rounded-xl !min-h-11 !text-sm" onClick={() => { setEditing(null); setError(''); }}>Batal</button>
              <button type="submit" className="min-h-11 flex-1 rounded-xl bg-[var(--accent)] text-sm font-bold text-white">Simpan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
