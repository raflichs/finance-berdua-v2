import { useMemo, useState } from 'react';
import useStore, { calcWallet } from '../store/useStore';
import { savePocket } from '../lib/db';
import { auth } from '../config/firebase';
import { formatRp, formatThousands, pocketBills } from '../lib/dashboard';

// ponytail: kantong ditulis online-only. Offline queue cuma paham tx/cashMove (queueSync.js:14),
// dan bikin kantong butuh id balik dari server biar transaksi berikutnya nggak nunjuk ke hantu.
const ICONS = ['🏠', '⚡', '💧', '📶', '🎓', '🚗', '💊', '🎁'];

export default function Kantong() {
  const { workspaceId, pockets, setPockets, transactions, myName, uid, parseMoney, setActiveTab, setInputDraft } = useStore();
  const wallet = useMemo(() => calcWallet(transactions, pockets), [transactions, pockets]);
  const bills = useMemo(() => pocketBills(pockets, wallet), [pockets, wallet]);
  const aktif = pockets.filter((p) => p.aktif !== false);
  const arsip = pockets.filter((p) => p.aktif === false);
  const total = aktif.reduce((sum, p) => sum + (wallet.pockets[p.id] || 0), 0);
  // form === null → form ketutup. form.id ada → mode atur target, nggak ada → mode bikin baru.
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const simpan = async (pocket) => {
    if (!workspaceId) { setError('Workspace belum aktif.'); return false; }
    setBusy(true); setError('');
    try {
      await savePocket(workspaceId, pocket);
      setPockets((list) => list.some((p) => p.id === pocket.id) ? list.map((p) => p.id === pocket.id ? pocket : p) : [...list, pocket]);
      return true;
    } catch { setError('Gagal menyimpan kantong. Coba lagi saat online.'); return false; }
    finally { setBusy(false); }
  };

  const bukaForm = (pocket) => {
    setError('');
    setForm(pocket
      ? { id: pocket.id, nama: pocket.nama, icon: pocket.icon || ICONS[0], nominal: pocket.nominal ? String(pocket.nominal) : '', jatuhTempo: pocket.jatuhTempo ? String(pocket.jatuhTempo) : '' }
      : { nama: '', icon: ICONS[0], nominal: '', jatuhTempo: '' });
  };

  const submit = async (event) => {
    event.preventDefault();
    const nama = form.nama.trim();
    const nominal = parseMoney(form.nominal);
    const day = Number(form.jatuhTempo) || 0;
    if (!nama || busy) return;
    if (day && (day < 1 || day > 28)) { setError('Tanggal jatuh tempo harus 1-28.'); return; }
    const currentUser = auth.currentUser;
    const base = form.id ? pockets.find((p) => p.id === form.id) : {
      id: `p_${Date.now()}`,
      aktif: true,
      createdByUid: currentUser?.uid || uid,
      createdByName: myName || currentUser?.email || 'Tidak diketahui',
      createdAt: Date.now(),
    };
    // `null` di RTDB = hapus child, jadi dikosongin = kantongnya balik tanpa target/jatuh tempo.
    const ok = await simpan({
      ...base,
      nama: nama.slice(0, 60),
      icon: form.icon,
      nominal: nominal > 0 ? nominal : null,
      jatuhTempo: day || null,
    });
    if (ok) setForm(null);
  };

  const alokasi = (pocket) => { setInputDraft({ mode: 'cash', from: 'QRIS', to: pocket.id }); setActiveTab('input'); };
  const bayar = (pocket) => { setInputDraft({ mode: 'normal', jenis: 'Pengeluaran', kategori: 'Tagihan', account: pocket.id }); setActiveTab('input'); };
  const inputClass = 'min-h-12 w-full rounded-[var(--radius-input)] border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-4 text-base text-[var(--text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent-weak)]';

  return (
    <div className="flex flex-col gap-4" aria-label="Kantong alokasi dana">
      <button type="button" className="self-start text-left text-xs font-semibold text-[var(--accent-weak)]" onClick={() => setActiveTab('dashboard')} aria-label="Kembali ke Dashboard">← Kembali ke Dashboard</button>

      <section className="hero-card" aria-labelledby="pocket-total">
        <h2 id="pocket-total" className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Total di kantong</h2>
        <p className="mt-2 truncate text-[30px] font-extrabold tracking-tight" aria-live="polite">{formatRp(total)}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Uang ini sudah keluar dari saldo QRIS/Cash, jadi nggak ketarik buat jajan. Bayar tagihan dari kantong biar saldo bulanan aman.</p>
        <button type="button" className="mt-4 min-h-11 w-full rounded-xl bg-[var(--accent)]/20 text-sm font-bold text-[var(--accent-weak)] flex items-center justify-center gap-2" onClick={() => (form ? setForm(null) : bukaForm(null))} aria-expanded={Boolean(form)}>
          <span className="material-symbols-outlined text-base" aria-hidden="true">{form ? 'close' : 'add'}</span>
          {form ? 'Batal' : 'Bikin kantong baru'}
        </button>
        {form && (
          <form className="mt-3 flex flex-col gap-3" onSubmit={submit}>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]" htmlFor="pocket-name">Nama kantong</label>
              <input id="pocket-name" className={inputClass} maxLength={60} placeholder="Contoh: Kosan" value={form.nama} onChange={(event) => setForm({ ...form, nama: event.target.value })} autoFocus />
            </div>
            <fieldset>
              <legend className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">Icon</legend>
              <div className="flex flex-wrap gap-2">{ICONS.map((value) => <button type="button" key={value} aria-pressed={form.icon === value} aria-label={`Icon ${value}`} onClick={() => setForm({ ...form, icon: value })} className={`h-11 w-11 rounded-xl border text-lg ${form.icon === value ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15' : 'border-[var(--border-1)] bg-[var(--bg-surface-1)]'}`}>{value}</button>)}</div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]" htmlFor="pocket-nominal">Target per bulan</label>
                <input id="pocket-nominal" className={inputClass} inputMode="numeric" placeholder="Rp 0" value={formatThousands(form.nominal)} onChange={(event) => setForm({ ...form, nominal: event.target.value })} aria-describedby="pocket-target-hint" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]" htmlFor="pocket-due">Jatuh tempo</label>
                <input id="pocket-due" className={inputClass} inputMode="numeric" maxLength={2} placeholder="tgl 1-28" value={form.jatuhTempo} onChange={(event) => setForm({ ...form, jatuhTempo: event.target.value.replace(/\D/g, '') })} aria-describedby="pocket-target-hint" />
              </div>
            </div>
            <p id="pocket-target-hint" className="text-[11px] leading-4 text-[var(--text-tertiary)]">Opsional. Target dipakai buat ngitung “kurang berapa lagi” tiap bulan, jatuh tempo (tanggal 1-28) buat reminder di Dashboard.</p>
            <button type="submit" disabled={busy || !form.nama.trim()} className="min-h-11 rounded-[var(--radius-input)] bg-[var(--accent)] px-4 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Menyimpan…' : form.id ? 'Simpan perubahan' : 'Simpan kantong'}</button>
          </form>
        )}
      </section>

      {error && <p className="text-xs text-[var(--error-weak)]" role="alert">{error}</p>}

      {aktif.length ? (
        <section aria-labelledby="pocket-list-title">
          <h2 id="pocket-list-title" className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Kantong aktif</h2>
          <ul className="flex flex-col gap-3">
            {aktif.map((pocket) => {
              const bill = bills.find((b) => b.id === pocket.id);
              const saldo = wallet.pockets[pocket.id] || 0;
              const nominal = bill ? bill.nominal : 0;
              const pct = nominal > 0 ? Math.min(100, Math.round((saldo / nominal) * 100)) : 0;
              return (
                <li key={pocket.id} className="glass-card rounded-[var(--radius-card)] p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--surface-muted)] text-lg" aria-hidden="true">{pocket.icon || '🏦'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{pocket.nama}</p>
                      <p className="truncate text-xs text-[var(--text-secondary)]">{formatRp(saldo)}{nominal > 0 ? ` dari target ${formatRp(nominal)}` : ''}</p>
                    </div>
                  </div>
                  {nominal > 0 && (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]" role="img" aria-label={`Progress ${pct}%`}>
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {bill && (
                    <p className={`mt-2 text-xs font-semibold ${bill.shortfall > 0 ? 'text-[var(--warning-weak)]' : 'text-[var(--success)]'}`}>
                      {bill.shortfall > 0 ? `Kurang ${formatRp(bill.shortfall)}` : 'Target bulan ini ketutup'}
                      {bill.jatuhTempo ? ` · jatuh tempo tgl ${bill.jatuhTempo}${bill.days === 0 ? ' (hari ini)' : ` (${bill.days} hari lagi)`}` : ''}
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="min-h-11 flex-1 rounded-xl bg-[var(--accent)]/20 text-sm font-bold text-[var(--accent-weak)]" onClick={() => alokasi(pocket)}>Alokasi</button>
                    <button type="button" className="min-h-11 flex-1 rounded-xl border border-[var(--border-1)] text-sm font-bold" onClick={() => bayar(pocket)}>Bayar</button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="min-h-11 flex-1 rounded-xl border border-[var(--border-1)] text-xs font-semibold text-[var(--text-secondary)]" onClick={() => bukaForm(pocket)} aria-label={`Atur target kantong ${pocket.nama}`}>Atur target</button>
                    <button type="button" className="min-h-11 flex-1 rounded-xl border border-[var(--border-1)] text-xs font-semibold text-[var(--text-secondary)]" disabled={busy} onClick={() => simpan({ ...pocket, aktif: false })}>Arsipkan</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="glass-card rounded-[var(--radius-card)] p-6 text-center">
          <span className="material-symbols-outlined text-3xl text-[var(--accent-weak)]" aria-hidden="true">savings</span>
          <p className="mt-2 text-sm font-semibold">Belum ada kantong</p>
          <p className="mx-auto mt-1 max-w-[32ch] text-xs leading-5 text-[var(--text-secondary)]">Bikin satu kantong per tagihan tetap (kosan, listrik, internet), lalu alokasi tiap bulan.</p>
        </section>
      )}

      {arsip.length > 0 && (
        <section aria-labelledby="pocket-archive-title">
          <h2 id="pocket-archive-title" className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Diarsipkan</h2>
          <ul className="divide-y divide-[var(--border-1)] rounded-[var(--radius-card)] border border-[var(--border-1)]">
            {arsip.map((pocket) => (
              <li key={pocket.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-secondary)]">{pocket.icon || '🏦'} {pocket.nama}</p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">{formatRp(wallet.pockets[pocket.id] || 0)} · id tetap ada biar riwayat nggak salah hitung</p>
                </div>
                <button type="button" className="pill-control shrink-0" disabled={busy} onClick={() => simpan({ ...pocket, aktif: true })}>Aktifkan</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
