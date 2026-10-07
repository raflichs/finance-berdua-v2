import { useEffect, useMemo, useRef, useState } from 'react';
import useStore, { calcWallet } from '../store/useStore';
import { saveCashMove, saveTx } from '../lib/db';
import { enqueueOperation, enqueueTx } from '../lib/offlineQueue';
import { auth } from '../config/firebase';
import { formatThousands } from '../lib/dashboard';

const categories = { Pemasukan: ['Gaji', 'Bonus', 'Lainnya'], Pengeluaran: ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Nongkrong', 'Hiburan', 'Tabungan', 'Pulsa/Kuota', 'Lainnya'] };
const icons = { Makan: 'restaurant', Transport: 'directions_car', Belanja: 'shopping_cart', Tagihan: 'receipt_long', Nongkrong: 'local_cafe', Hiburan: 'movie', Tabungan: 'savings', 'Pulsa/Kuota': 'phone_android', Gaji: 'payments', Bonus: 'redeem', Lainnya: 'category' };

export default function InputTransaction() {
  const { uid, workspaceId, myName, parseMoney, toLocalDateKey, transactions, setTransactions, setActiveTab, setSyncing } = useStore();
  const wallet = useMemo(() => calcWallet(transactions), [transactions]);
  const moveTab = (event, values, setValue) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = values.indexOf(event.currentTarget.value);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : values.length - 1)) % values.length;
    setValue(values[nextIndex]);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };
  const [mode, setMode] = useState('normal');
  const [jenis, setJenis] = useState('Pengeluaran');
  const [nominal, setNominal] = useState('');
  const [kategori, setKategori] = useState('Makan');
  const [account, setAccount] = useState('QRIS');
  const [tanggal, setTanggal] = useState(toLocalDateKey());
  const [deskripsi, setDeskripsi] = useState('');
  const [cashDirection, setCashDirection] = useState('withdraw');
  const [adminFee, setAdminFee] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nominalRef = useRef(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const accountLabel = account === 'QRIS' ? 'QRIS' : 'Cash';

  const amount = parseMoney(nominal);
  const fee = parseMoney(adminFee);
  const source = cashDirection === 'withdraw' ? 'QRIS' : 'Cash';
  const target = cashDirection === 'withdraw' ? 'Cash' : 'QRIS';
  const available = wallet[source];
  const validationError = amount < 1000 ? 'Nominal minimal Rp 1.000' : !tanggal ? 'Tanggal wajib diisi' : mode === 'cash' && amount + fee > available ? `Saldo ${source} tidak cukup` : '';

  useEffect(() => {
    // auto-focus nominal saat mount atau mode Catat dipilih
    if (mode === 'normal') nominalRef.current?.focus();
  }, [mode]);
  useEffect(() => {
    nominalRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e) => { if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setAccountOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [accountOpen]);

  const reset = () => { setNominal(''); setAdminFee(''); setDeskripsi(''); setTouched(false); };
  const submit = async (event) => {
    event.preventDefault(); setTouched(true); if (validationError || saving) return;
    if (!workspaceId) { setError('Workspace belum aktif.'); return; }
    setSaving(true); setError(''); setSyncing(true);
    const currentUser = auth.currentUser;
    const addedByUid = currentUser?.uid || uid;
    const addedByName = myName || currentUser?.email || 'Tidak diketahui';
    try {
      const base = { tanggal, nominal: amount, addedByUid, addedByName, addedBy: addedByName };
      if (mode === 'cash') {
        const id = Date.now();
        const move = { ...base, id, jenis: 'CashMove', kategori: 'Atur Cash', deskripsi: deskripsi.trim() || (cashDirection === 'withdraw' ? 'Tarik cash' : 'Setor cash ke QRIS') };
        const adminTx = fee > 0 ? { ...base, id: id + 1, jenis: 'Pengeluaran', kategori: 'Tagihan', deskripsi: cashDirection === 'withdraw' ? 'Biaya admin tarik cash' : 'Biaya admin setor cash', nominal: fee, account: source } : null;
        const cashMove = { ...move, fromAccount: source, toAccount: target };
        try {
          await saveCashMove(workspaceId, cashMove, adminTx);
        } catch (cause) {
          if (['PERMISSION_DENIED', 'permission-denied', 'INVALID_ARGUMENT', 'invalid-argument'].includes(cause?.code)) throw cause;
          await enqueueOperation(uid, `cash:${id}`, { type: 'cashMove', move: cashMove, adminTx });
          setTransactions([...transactions, cashMove, ...(adminTx ? [adminTx] : [])]);
        }
      } else {
        const transaction = { ...base, id: Date.now(), jenis, kategori, deskripsi: deskripsi.trim() || (kategori === 'Tabungan' ? 'Setor Dana Nikah' : '-'), account };
        try {
          await saveTx(workspaceId, transaction);
        } catch (cause) {
          if (['PERMISSION_DENIED', 'permission-denied', 'INVALID_ARGUMENT', 'invalid-argument'].includes(cause?.code)) throw cause;
          await enqueueTx(uid, transaction);
          setTransactions([...transactions, transaction]);
        }
      }
      reset(); setActiveTab('dashboard');
    } catch { setError('Transaksi gagal disimpan. Coba lagi saat online.'); } finally { setSaving(false); setSyncing(false); }
  };
  const inputClass = 'min-h-12 w-full rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-4 text-base text-[var(--text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent-weak)]';

  return <form className="transaction-form flex flex-col gap-4 pb-2" onSubmit={submit} noValidate aria-label="Form transaksi">
    <button type="button" className="self-start text-left text-xs font-semibold text-[var(--accent-weak)]" onClick={() => setActiveTab('dashboard')} aria-label="Kembali ke Dashboard">← Kembali ke Dashboard</button>
    <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--overlay)] p-1" role="tablist" aria-label="Mode input"><button type="button" role="tab" value="normal" tabIndex={mode === 'normal' ? 0 : -1} aria-selected={mode === 'normal'} onKeyDown={(event) => moveTab(event, ['normal', 'cash'], setMode)} onClick={() => setMode('normal')} className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${mode === 'normal' ? 'bg-[var(--surface-control-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Catat</button><button type="button" role="tab" value="cash" tabIndex={mode === 'cash' ? 0 : -1} aria-selected={mode === 'cash'} onKeyDown={(event) => moveTab(event, ['normal', 'cash'], setMode)} onClick={() => setMode('cash')} className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${mode === 'cash' ? 'bg-[var(--surface-control-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Atur Cash</button><button type="button" onClick={() => setActiveTab('split')} className="min-h-11 flex-1 rounded-xl text-sm font-bold text-[var(--text-secondary)]">Split</button></div>
    {mode === 'normal' ? <>
      <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--overlay)] p-1" role="tablist" aria-label="Jenis transaksi">{['Pemasukan', 'Pengeluaran'].map((value) => <button type="button" role="tab" value={value} tabIndex={jenis === value ? 0 : -1} aria-selected={jenis === value} key={value} onKeyDown={(event) => moveTab(event, ['Pemasukan', 'Pengeluaran'], setJenis)} onClick={() => { setJenis(value); setKategori(categories[value][0]); }} className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${jenis === value ? value === 'Pemasukan' ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--error)]/15 text-[var(--error)]' : 'text-[var(--text-secondary)]'}`}>{value}</button>)}</div>
      <Field label="Nominal" id="amount">
        <input ref={nominalRef} id="amount" autoFocus className={`${inputClass} ${touched && validationError && validationError.includes('Nominal') ? 'border-[var(--error)]' : ''}`} inputMode="numeric" placeholder="Rp 0" value={formatThousands(nominal)} onChange={(event) => setNominal(event.target.value)} onBlur={() => setTouched(true)} aria-invalid={Boolean(touched && validationError && validationError.includes('Nominal'))} aria-describedby="amount-error" />
        {touched && validationError && validationError.includes('Nominal') && <p id="amount-error" className="mt-1 text-xs text-[var(--error-weak)]" role="alert">{validationError}</p>}
      </Field>
      <section aria-labelledby="category-title"><h2 id="category-title" className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Kategori</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{categories[jenis].map((value) => <button type="button" key={value} aria-pressed={kategori === value} onClick={() => { setKategori(value); if (value === 'Tabungan' && !deskripsi.trim()) setDeskripsi('Setor Dana Nikah'); }} className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[var(--radius-input)] border text-xs font-semibold ${kategori === value ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent-weak)]' : 'border-[var(--border-1)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)]'}`}><span className="material-symbols-outlined" aria-hidden="true">{icons[value] || 'category'}</span>{value}</button>)}</div></section>
      <div className="flex flex-col gap-1.5">
        <span id="wallet-label" className="text-xs font-semibold text-[var(--text-secondary)]">{jenis === 'Pemasukan' ? 'Masuk ke' : 'Bayar pakai'}</span>
        <div className="relative" ref={accountRef}>
          <button
            type="button"
            id="wallet"
            className={`pill-control w-full !justify-between !min-h-12 !rounded-[var(--radius-input)] !bg-[var(--bg-surface-1)] !px-4 !text-sm !font-semibold ${accountOpen ? 'pill-control--active !border-[var(--accent)]/45' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={accountOpen}
            aria-labelledby="wallet-label"
            onClick={() => setAccountOpen((v) => !v)}
          >
            <span className="flex items-center gap-2 truncate"><span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">account_balance_wallet</span>{accountLabel}</span>
            <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">{accountOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          {accountOpen && (
            <div role="listbox" aria-label="Pilih akun pembayaran" className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[min(280px,50vh)] overflow-auto rounded-2xl border border-[var(--border-1)] bg-[var(--bg-modal)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
              {['QRIS','Cash'].map((opt) => {
                const active = opt === account;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => { setAccount(opt); setAccountOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-sm ${active ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-1)]'}`}
                  >
                    <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${opt === 'QRIS' ? 'bg-[#60a5fa]' : 'bg-[#fbbf24]'}`} aria-hidden="true" />{opt}</span>
                    {active && <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">check</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </> : <>
      <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--overlay)] p-1" role="tablist" aria-label="Aksi cash"><button type="button" role="tab" value="withdraw" tabIndex={cashDirection === 'withdraw' ? 0 : -1} aria-selected={cashDirection === 'withdraw'} onKeyDown={(event) => moveTab(event, ['withdraw', 'deposit'], setCashDirection)} onClick={() => setCashDirection('withdraw')} className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${cashDirection === 'withdraw' ? 'bg-[var(--accent)]/20 text-[var(--accent-weak)]' : 'text-[var(--text-secondary)]'}`}>Tarik Cash</button><button type="button" role="tab" value="deposit" tabIndex={cashDirection === 'deposit' ? 0 : -1} aria-selected={cashDirection === 'deposit'} onKeyDown={(event) => moveTab(event, ['withdraw', 'deposit'], setCashDirection)} onClick={() => setCashDirection('deposit')} className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${cashDirection === 'deposit' ? 'bg-[var(--accent)]/20 text-[var(--accent-weak)]' : 'text-[var(--text-secondary)]'}`}>Setor Cash</button></div><p className="text-xs leading-5 text-[var(--text-secondary)]">{cashDirection === 'withdraw' ? 'QRIS berkurang, Cash bertambah. Ini bukan pengeluaran.' : 'Cash berkurang, QRIS bertambah. Ini bukan pemasukan.'}</p><Field label={`Nominal (saldo ${source}: Rp ${available.toLocaleString('id-ID')})`} id="cash-amount"><input ref={nominalRef} id="cash-amount" className={`${inputClass} ${touched && validationError && validationError.includes('Nominal') ? 'border-[var(--error)]' : ''}`} inputMode="numeric" placeholder="Rp 0" value={formatThousands(nominal)} onChange={(event) => setNominal(event.target.value)} onBlur={() => setTouched(true)} />{touched && validationError && validationError.includes('Nominal') && <p className="mt-1 text-xs text-[var(--error-weak)]" role="alert">{validationError}</p>}</Field><Field label="Biaya admin" id="admin-fee"><input id="admin-fee" className={inputClass} inputMode="numeric" placeholder="Rp 0" value={formatThousands(adminFee)} onChange={(event) => setAdminFee(event.target.value)} onBlur={() => setTouched(true)} /></Field></>}
    <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="date">Tanggal</label><input id="date" className={`${inputClass} ${touched && validationError && validationError.includes('Tanggal') ? 'border-[var(--error)]' : ''}`} type="date" value={tanggal} onChange={(event) => setTanggal(event.target.value)} onBlur={() => setTouched(true)} aria-invalid={Boolean(touched && validationError && validationError.includes('Tanggal'))} />
    {touched && validationError && validationError.includes('Tanggal') && <p className="text-xs text-[var(--error-weak)]" role="alert">{validationError}</p>}
    <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="note">Deskripsi <span className="font-normal text-[var(--text-tertiary)]">(opsional)</span></label><textarea id="note" className="rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-4 py-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" rows="2" placeholder={mode === 'cash' ? 'Contoh: tarik ATM...' : 'Catatan (opsional)'} value={deskripsi} onChange={(event) => setDeskripsi(event.target.value)} />
    {touched && validationError && !validationError.includes('Nominal') && !validationError.includes('Tanggal') && <p className="text-xs text-[var(--error-weak)]" role="alert">{validationError}</p>}{error && <p className="text-xs text-[var(--error-weak)]" role="alert">{error}</p>}<button type="submit" disabled={saving} className="min-h-11 rounded-[var(--radius-input)] bg-gradient-to-br from-[var(--accent)] to-[var(--gradient-fab-end)] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40" aria-busy={saving}>{saving ? 'Menyimpan…' : mode === 'cash' ? 'Simpan Atur Cash' : 'Simpan transaksi'}</button>
  </form>;
}

function Field({ label, id, children }) { return <div><label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]" htmlFor={id}>{label}</label>{children}</div>; }
