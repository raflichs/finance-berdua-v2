import { useEffect, useMemo, useRef, useState } from 'react';
import useStore, { calcWallet } from '../store/useStore';
import { saveCashMove, saveTx } from '../lib/db';
import { enqueueOperation, enqueueTx } from '../lib/offlineQueue';
import { auth } from '../config/firebase';
import { formatThousands } from '../lib/dashboard';

const categories = { Pemasukan: ['Gaji', 'Bonus', 'Lainnya'], Pengeluaran: ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Nongkrong', 'Hiburan', 'Tabungan', 'Pulsa/Kuota', 'Lainnya'] };
const icons = { Makan: 'restaurant', Transport: 'directions_car', Belanja: 'shopping_cart', Tagihan: 'receipt_long', Nongkrong: 'local_cafe', Hiburan: 'movie', Tabungan: 'savings', 'Pulsa/Kuota': 'phone_android', Gaji: 'payments', Bonus: 'redeem', Lainnya: 'category' };

const BASE_ACCOUNTS = [{ id: 'QRIS', nama: 'QRIS' }, { id: 'Cash', nama: 'Cash' }];
const saldoOf = (wallet, id) => id === 'Cash' ? wallet.Cash : id === 'QRIS' ? wallet.QRIS : wallet.pockets[id] || 0;

export default function InputTransaction() {
  const { uid, workspaceId, myName, parseMoney, toLocalDateKey, transactions, pockets, setTransactions, setActiveTab, setSyncing } = useStore();
  // Draft sekali pakai dari halaman Kantong: dibaca sebagai nilai awal, jadi nggak perlu setState di effect.
  const [draft] = useState(() => useStore.getState().inputDraft);
  const wallet = useMemo(() => calcWallet(transactions, pockets), [transactions, pockets]);
  // Kantong arsip nggak boleh dipilih lagi — id-nya tetap ada di ledger, tapi transaksi baru berhenti di situ.
  const accounts = useMemo(() => [...BASE_ACCOUNTS, ...pockets.filter((p) => p.aktif !== false).map((p) => ({ id: p.id, nama: p.nama, icon: p.icon }))], [pockets]);
  const nameOf = (id) => accounts.find((a) => a.id === id)?.nama || id;
  const moveTab = (event, values, setValue) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = values.indexOf(event.currentTarget.value);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : values.length - 1)) % values.length;
    setValue(values[nextIndex]);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };
  const [mode, setMode] = useState(draft?.mode === 'cash' ? 'cash' : 'normal');
  const [jenis, setJenis] = useState(draft?.jenis || 'Pengeluaran');
  const [nominal, setNominal] = useState('');
  const [kategori, setKategori] = useState(draft?.kategori || (draft?.jenis === 'Pemasukan' ? categories.Pemasukan[0] : 'Makan'));
  const [account, setAccount] = useState(draft?.account || 'QRIS');
  const [tanggal, setTanggal] = useState(toLocalDateKey());
  const [deskripsi, setDeskripsi] = useState('');
  const [from, setFrom] = useState(draft?.from || 'QRIS');
  const [to, setTo] = useState(draft?.to || 'Cash');
  const [adminFee, setAdminFee] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nominalRef = useRef(null);

  const amount = parseMoney(nominal);
  const fee = parseMoney(adminFee);
  const available = saldoOf(wallet, from);
  const validationError = amount < 1000 ? 'Nominal minimal Rp 1.000'
    : !tanggal ? 'Tanggal wajib diisi'
    : mode === 'cash' && from === to ? 'Akun asal dan tujuan harus beda'
    : mode === 'cash' && amount + fee > available ? `Saldo ${nameOf(from)} tidak cukup`
    : '';

  useEffect(() => {
    // auto-focus nominal saat mount atau mode Catat dipilih
    if (mode === 'normal') nominalRef.current?.focus();
  }, [mode]);
  useEffect(() => {
    nominalRef.current?.focus();
  }, []);
  useEffect(() => {
    // Draft sudah dipakai sebagai nilai awal; bersihin dari store biar nggak ke-apply ulang lain kali.
    if (draft) useStore.getState().setInputDraft(null);
  }, [draft]);

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
        const defaultNote = to.startsWith('p_') ? `Alokasi ke ${nameOf(to)}` : from.startsWith('p_') ? `Tarik dari ${nameOf(from)}` : `Pindah ${nameOf(from)} ke ${nameOf(to)}`;
        const move = { ...base, id, jenis: 'CashMove', kategori: 'Pindah Dana', deskripsi: deskripsi.trim() || defaultNote };
        const adminTx = fee > 0 ? { ...base, id: id + 1, jenis: 'Pengeluaran', kategori: 'Tagihan', deskripsi: `Biaya admin pindah dana (${nameOf(from)})`, nominal: fee, account: from } : null;
        const cashMove = { ...move, fromAccount: from, toAccount: to };
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
    <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--overlay)] p-1" role="tablist" aria-label="Mode input"><button type="button" role="tab" value="normal" tabIndex={mode === 'normal' ? 0 : -1} aria-selected={mode === 'normal'} onKeyDown={(event) => moveTab(event, ['normal', 'cash'], setMode)} onClick={() => setMode('normal')} className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${mode === 'normal' ? 'bg-[var(--surface-control-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Catat</button><button type="button" role="tab" value="cash" tabIndex={mode === 'cash' ? 0 : -1} aria-selected={mode === 'cash'} onKeyDown={(event) => moveTab(event, ['normal', 'cash'], setMode)} onClick={() => setMode('cash')} className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${mode === 'cash' ? 'bg-[var(--surface-control-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>Pindah Dana</button><button type="button" onClick={() => setActiveTab('split')} className="min-h-11 flex-1 rounded-xl text-sm font-bold text-[var(--text-secondary)]">Split</button></div>
    {mode === 'normal' ? <>
      <div className="flex gap-1 rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--overlay)] p-1" role="tablist" aria-label="Jenis transaksi">{['Pemasukan', 'Pengeluaran'].map((value) => <button type="button" role="tab" value={value} tabIndex={jenis === value ? 0 : -1} aria-selected={jenis === value} key={value} onKeyDown={(event) => moveTab(event, ['Pemasukan', 'Pengeluaran'], setJenis)} onClick={() => { setJenis(value); setKategori(categories[value][0]); }} className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${jenis === value ? value === 'Pemasukan' ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--error)]/15 text-[var(--error)]' : 'text-[var(--text-secondary)]'}`}>{value}</button>)}</div>
      <Field label="Nominal" id="amount">
        <input ref={nominalRef} id="amount" autoFocus className={`${inputClass} ${touched && validationError && validationError.includes('Nominal') ? 'border-[var(--error)]' : ''}`} inputMode="numeric" placeholder="Rp 0" value={formatThousands(nominal)} onChange={(event) => setNominal(event.target.value)} onBlur={() => setTouched(true)} aria-invalid={Boolean(touched && validationError && validationError.includes('Nominal'))} aria-describedby="amount-error" />
        {touched && validationError && validationError.includes('Nominal') && <p id="amount-error" className="mt-1 text-xs text-[var(--error-weak)]" role="alert">{validationError}</p>}
      </Field>
      <section aria-labelledby="category-title"><h2 id="category-title" className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Kategori</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{categories[jenis].map((value) => <button type="button" key={value} aria-pressed={kategori === value} onClick={() => { setKategori(value); if (value === 'Tabungan' && !deskripsi.trim()) setDeskripsi('Setor Dana Nikah'); }} className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[var(--radius-input)] border text-xs font-semibold ${kategori === value ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent-weak)]' : 'border-[var(--border-1)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)]'}`}><span className="material-symbols-outlined" aria-hidden="true">{icons[value] || 'category'}</span>{value}</button>)}</div></section>
      <AccountSelect id="wallet" label={jenis === 'Pemasukan' ? 'Masuk ke' : 'Bayar pakai'} value={account} onChange={setAccount} options={accounts} wallet={wallet} />
    </> : <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        <AccountSelect id="move-from" label="Dari" value={from} onChange={setFrom} options={accounts} wallet={wallet} />
        <button type="button" className="pill-control !min-h-12 !min-w-12 !px-0 justify-center" aria-label="Tukar akun asal dan tujuan" onClick={() => { setFrom(to); setTo(from); }}><span className="material-symbols-outlined text-base" aria-hidden="true">swap_horiz</span></button>
        <AccountSelect id="move-to" label="Ke" value={to} onChange={setTo} options={accounts} wallet={wallet} />
      </div>
      <p className="text-xs leading-5 text-[var(--text-secondary)]">{to.startsWith('p_') ? `Alokasi: ${nameOf(from)} berkurang, kantong ${nameOf(to)} bertambah. Ini bukan pengeluaran.` : from.startsWith('p_') ? `Tarik dana: kantong ${nameOf(from)} berkurang, ${nameOf(to)} bertambah. Ini bukan pemasukan.` : 'Pindah antar QRIS dan Cash. Ini bukan pemasukan atau pengeluaran.'}</p>
      <Field label={`Nominal (saldo ${nameOf(from)}: Rp ${available.toLocaleString('id-ID')})`} id="cash-amount"><input ref={nominalRef} id="cash-amount" className={`${inputClass} ${touched && validationError && validationError.includes('Nominal') ? 'border-[var(--error)]' : ''}`} inputMode="numeric" placeholder="Rp 0" value={formatThousands(nominal)} onChange={(event) => setNominal(event.target.value)} onBlur={() => setTouched(true)} />{touched && validationError && validationError.includes('Nominal') && <p className="mt-1 text-xs text-[var(--error-weak)]" role="alert">{validationError}</p>}</Field>
      <Field label="Biaya admin" id="admin-fee"><input id="admin-fee" className={inputClass} inputMode="numeric" placeholder="Rp 0" value={formatThousands(adminFee)} onChange={(event) => setAdminFee(event.target.value)} /></Field>
    </>}
    <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="date">Tanggal</label><input id="date" className={`${inputClass} ${touched && validationError && validationError.includes('Tanggal') ? 'border-[var(--error)]' : ''}`} type="date" value={tanggal} onChange={(event) => setTanggal(event.target.value)} onBlur={() => setTouched(true)} aria-invalid={Boolean(touched && validationError && validationError.includes('Tanggal'))} />
    {touched && validationError && validationError.includes('Tanggal') && <p className="text-xs text-[var(--error-weak)]" role="alert">{validationError}</p>}
    <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="note">Deskripsi <span className="font-normal text-[var(--text-tertiary)]">(opsional)</span></label><textarea id="note" className="rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-4 py-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" rows="2" placeholder={mode === 'cash' ? 'Contoh: alokasi kosan Oktober...' : 'Catatan (opsional)'} value={deskripsi} onChange={(event) => setDeskripsi(event.target.value)} />
    {touched && validationError && !validationError.includes('Nominal') && !validationError.includes('Tanggal') && <p className="text-xs text-[var(--error-weak)]" role="alert">{validationError}</p>}{error && <p className="text-xs text-[var(--error-weak)]" role="alert">{error}</p>}<button type="submit" disabled={saving} className="min-h-11 rounded-[var(--radius-input)] bg-gradient-to-br from-[var(--accent)] to-[var(--gradient-fab-end)] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40" aria-busy={saving}>{saving ? 'Menyimpan…' : mode === 'cash' ? 'Simpan Pindah Dana' : 'Simpan transaksi'}</button>
  </form>;
}

function Field({ label, id, children }) { return <div><label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]" htmlFor={id}>{label}</label>{children}</div>; }

function AccountSelect({ id, label, value, onChange, options, wallet }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const current = options.find((option) => option.id === value);
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={`${id}-label`} className="text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
      <div className="relative min-w-0" ref={boxRef}>
        <button
          type="button"
          id={id}
          className={`pill-control w-full !justify-between !min-h-12 !rounded-[var(--radius-input)] !bg-[var(--bg-surface-1)] !px-4 !text-sm !font-semibold ${open ? 'pill-control--active !border-[var(--accent)]/45' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-label`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="flex min-w-0 items-center gap-2 truncate"><span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">{current?.icon ? 'savings' : 'account_balance_wallet'}</span><span className="truncate">{current?.icon ? `${current.icon} ` : ''}{current?.nama || value}</span></span>
          <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">{open ? 'expand_less' : 'expand_more'}</span>
        </button>
        {open && (
          <div role="listbox" aria-label={`Pilih ${label}`} className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[min(280px,50vh)] overflow-auto rounded-2xl border border-[var(--border-1)] bg-[var(--bg-modal)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
            {options.map((option) => {
              const active = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { onChange(option.id); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-sm ${active ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-1)]'}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${option.id === 'QRIS' ? 'bg-[#60a5fa]' : option.id === 'Cash' ? 'bg-[#fbbf24]' : 'bg-[var(--success)]'}`} aria-hidden="true" />
                    <span className="truncate">{option.icon ? `${option.icon} ` : ''}{option.nama}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold opacity-80">{active ? '' : `Rp ${saldoOf(wallet, option.id).toLocaleString('id-ID')}`}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
