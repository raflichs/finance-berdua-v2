import { useMemo, useState } from 'react';
import useStore from '../store/useStore';
import { saveTx } from '../lib/db';
import { enqueueTx } from '../lib/offlineQueue';
import { auth } from '../config/firebase';

const parse = (value) => Number(String(value).replace(/\D/g, '')) || 0;
const format = (value) => `Rp ${value.toLocaleString('id-ID')}`;

export default function SplitBill() {
  const { uid, workspaceId, toLocalDateKey, transactions, setTransactions, setSyncing, setActiveTab } = useStore();
  const [step, setStep] = useState(0);
  const [friends, setFriends] = useState([]);
  const [friend, setFriend] = useState('');
  const [items, setItems] = useState([]);
  const [item, setItem] = useState({ name: '', price: '', people: ['Gue'] });
  const [paid, setPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const people = ['Gue', 'Pasangan', ...friends];
  const myTotal = useMemo(() => items.reduce((sum, current) => current.people.includes('Gue') ? sum + current.price / current.people.length : sum, 0), [items]);

  const addFriend = () => {
    const value = friend.trim();
    if (!value) return;
    if (people.some((person) => person.toLowerCase() === value.toLowerCase())) { setError('Nama itu sudah ada.'); return; }
    setFriends((current) => [...current, value]);
    setFriend('');
    setError('');
  };
  const addItem = () => {
    const price = parse(item.price);
    if (!item.name.trim() || price <= 0 || !item.people.length) { setError('Nama item, harga, dan minimal satu orang wajib diisi.'); return; }
    setItems((current) => [...current, { id: Date.now(), name: item.name.trim(), price, people: item.people }]);
    setItem({ name: '', price: '', people: ['Gue'] });
    setError('');
  };
  const resetSession = () => { setStep(0); setItems([]); setFriends([]); setFriend(''); setItem({ name: '', price: '', people: ['Gue'] }); setPaid(false); setError(''); };
  const exportTransaction = async () => {
    if (!items.length || !myTotal || saving) return;
    if (!workspaceId) { setError('Workspace belum aktif.'); return; }
    setSaving(true); setSyncing(true); setError('');
    const currentUser = auth.currentUser;
    const addedByUid = currentUser?.uid || uid;
    const addedByName = currentUser?.displayName || currentUser?.email || 'Tidak diketahui';
    const transaction = { id: Date.now(), tanggal: toLocalDateKey(), jenis: 'Pengeluaran', kategori: 'Lainnya', deskripsi: `Split bill (${items.length} item)`, nominal: Math.round(myTotal), account: 'QRIS', addedByUid, addedByName, addedBy: addedByName, source: 'split_bill' };
    try { await saveTx(workspaceId, transaction); setTransactions([...transactions, transaction]); setPaid(true); } catch (cause) { if (['PERMISSION_DENIED', 'permission-denied', 'INVALID_ARGUMENT', 'invalid-argument'].includes(cause?.code)) setError('Split bill ditolak server. Periksa akses dan data transaksi.'); else { await enqueueTx(uid, transaction); setTransactions([...transactions, transaction]); setPaid(true); } } finally { setSaving(false); setSyncing(false); }
  };

  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex items-center justify-between gap-3"><button type="button" className="min-h-11 text-left text-xs text-[var(--accent-weak)]" onClick={() => step > 0 ? setStep((current) => current - 1) : setActiveTab('input')}>{step > 0 ? '← Langkah sebelumnya' : '← Kembali ke Input'}</button><span className="shrink-0 text-xs text-[var(--text-secondary)]">Langkah {step + 1}/3</span></div>
    {step === 0 && <section className="rounded-[var(--radius-card)] border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-5"><h2 className="mb-1 text-lg font-bold">Teman yang ikut</h2><p className="mb-4 text-xs text-[var(--text-secondary)]">Tambahkan orang yang ikut dalam tagihan.</p><div className="flex gap-2"><input className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--border-1)] bg-transparent px-3 text-base text-[var(--text-primary)]" placeholder="Nama teman" value={friend} onChange={(event) => setFriend(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addFriend(); } }} /><button type="button" className="min-h-11 shrink-0 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold" onClick={addFriend}>Tambah</button></div>{error && <p className="mt-3 text-xs text-[var(--error-weak)]" role="alert">{error}</p>}<div className="mt-4 flex flex-wrap gap-2">{people.map((person) => <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/15 px-3 py-2 text-xs text-[var(--accent-weak)]" key={person}>{person}</span>)}</div><button type="button" className="mt-6 min-h-11 w-full rounded-xl bg-[var(--accent)] text-sm font-bold" onClick={() => { setError(''); setStep(1); }}>Lanjut input item</button></section>}
    {step === 1 && <section className="rounded-[var(--radius-card)] border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-5"><h2 className="mb-4 text-lg font-bold">Tambah item</h2><label className="mb-3 block text-xs text-[var(--text-secondary)]" htmlFor="split-name">Nama item<input id="split-name" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-1)] bg-transparent px-3 text-base text-[var(--text-primary)]" placeholder="Kopi, makanan..." value={item.name} onChange={(event) => setItem({ ...item, name: event.target.value })} /></label><label className="mb-3 block text-xs text-[var(--text-secondary)]" htmlFor="split-price">Harga<input id="split-price" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-1)] bg-transparent px-3 text-base text-[var(--text-primary)]" inputMode="numeric" placeholder="Rp 0" value={item.price} onChange={(event) => setItem({ ...item, price: event.target.value })} /></label><div className="mb-3 text-xs font-semibold text-[var(--text-secondary)]">Untuk siapa?</div><div className="flex flex-wrap gap-2">{people.map((person) => <button type="button" key={person} aria-pressed={item.people.includes(person)} className={`rounded-full border px-3 py-2 text-xs ${item.people.includes(person) ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent-weak)]' : 'border-[var(--border-1)] text-[var(--text-secondary)]'}`} onClick={() => setItem({ ...item, people: item.people.includes(person) ? item.people.filter((value) => value !== person) : [...item.people, person] })}>{person}</button>)}</div>{error && <p className="mt-3 text-xs text-[var(--error-weak)]" role="alert">{error}</p>}<button type="button" className="mt-5 min-h-11 w-full rounded-xl border border-[var(--border-1)] text-sm font-bold" onClick={addItem}>Tambah item</button>{items.length > 0 && <><ul className="mt-4 divide-y divide-[var(--border-1)]">{items.map((current) => <li className="flex min-w-0 items-center justify-between gap-3 py-3" key={current.id}><span className="min-w-0 truncate text-sm">{current.name}<small className="block truncate text-xs text-[var(--text-secondary)]">{current.people.join(', ')}</small></span><span className="flex shrink-0 items-center gap-2"><strong className="text-sm">{format(current.price)}</strong><button type="button" aria-label={`Hapus item ${current.name}`} className="text-xs text-[var(--error)]" onClick={() => setItems((list) => list.filter((value) => value.id !== current.id))}>Hapus</button></span></li>)}</ul><button type="button" className="mt-4 min-h-11 w-full rounded-xl bg-[var(--accent)] text-sm font-bold" onClick={() => { setError(''); setStep(2); }}>Lihat ringkasan</button></>}</section>}
    {step === 2 && <section className="rounded-[var(--radius-card)] border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-5"><h2 className="text-lg font-bold">Ringkasan split bill</h2><div className="mt-4 flex justify-between gap-3 text-sm"><span>Total struk</span><strong>{format(items.reduce((sum, current) => sum + current.price, 0))}</strong></div><div className="mt-2 flex justify-between gap-3 text-sm"><span>Porsi Gue</span><strong className="text-[var(--accent-weak)]">{format(Math.round(myTotal))}</strong></div>{paid ? <><p className="mt-5 rounded-xl bg-[var(--success)]/10 p-3 text-center text-sm font-semibold text-[var(--success)]">Sudah dicatat ke transaksi.</p><button type="button" className="mt-4 min-h-11 w-full rounded-xl bg-[var(--accent)] text-sm font-bold" onClick={() => setActiveTab('dashboard')}>Selesai</button></> : <button type="button" disabled={saving} className="mt-5 min-h-11 w-full rounded-xl bg-[var(--accent)] text-sm font-bold disabled:opacity-40" onClick={exportTransaction}>{saving ? 'Menyimpan…' : 'Catat ke Finance Tracker'}</button>}{error && <p className="mt-3 text-xs text-[var(--error-weak)]" role="alert">{error}</p>}<button type="button" className="mt-3 min-h-11 w-full rounded-xl border border-[var(--border-1)] text-sm" onClick={resetSession}>{paid ? 'Buat split bill baru' : 'Reset sesi'}</button></section>}
  </div>;
}
