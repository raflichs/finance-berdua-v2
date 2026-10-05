import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createLinkedAccount, loginWithEmail, logout, resetPassword } from '../config/firebase';
import useStore from '../store/useStore';
import { createBackup, parseBackup } from '../lib/backup';
import { replaceUserData } from '../lib/db';

const errorMessage = (error) => ({
  'auth/invalid-credential': 'Email atau password salah.',
  'auth/email-already-in-use': 'Email sudah digunakan.',
  'auth/weak-password': 'Password minimal 6 karakter.',
  'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
}[error.code] || 'Auth gagal. Periksa data dan koneksi.');

const defaultModeFor = (user) => (user?.isAnonymous ? 'link' : 'login');

export default function AccountPanel({ user, pendingCount = 0 }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const { transactions, debts, weddingSettings, setTransactions, setDebts, setWeddingSettings } = useStore();
  const [modeOverride, setModeOverride] = useState(null);
  const mode = modeOverride || defaultModeFor(user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(user?.displayName || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const identityRef = useRef(null);

  const identityKey = `${user?.uid ?? ''}|${user?.isAnonymous ? 'anon' : 'linked'}`;

  useEffect(() => {
    if (identityKey === identityRef.current) return;
    identityRef.current = identityKey;
    setModeOverride(null);
    setEmail('');
    setPassword('');
    setName(user?.displayName || '');
    setMessage('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(panel.querySelectorAll(selector));
    getFocusable()[0]?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === 'Tab') {
        const els = getFocusable();
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    const onPointerDown = (event) => {
      if (panel.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

   const submit = async (event) => {
     event.preventDefault(); setBusy(true); setMessage('');
     try {
       if (mode === 'link') await createLinkedAccount(email, password, name);
       else await loginWithEmail(email, password);
       setModeOverride(null); setOpen(false); setPassword('');
       triggerRef.current?.focus();
     } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
   };

  const switchAccount = (nextMode) => {
    if (pendingCount) { setMessage('Selesaikan sinkronisasi pending sebelum ganti akun.'); return; }
    setMessage(''); setModeOverride(nextMode);
  };

   const doLogout = async () => {
     if (pendingCount) { setMessage('Selesaikan sinkronisasi pending sebelum logout.'); return; }
     setBusy(true); setMessage('');
     try { await logout(); setModeOverride(null); setOpen(false); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
   };

  const exportBackup = () => {
    try {
      const blob = new Blob([createBackup({ transactions, debts, weddingSettings })], { type: 'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `finance-berdua-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
      setMessage('Backup berhasil diekspor.');
    } catch (error) { setMessage(error.message); }
  };
  const importBackup = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (pendingCount) { setMessage('Selesaikan sinkronisasi pending sebelum import.'); return; }
    if (!window.confirm('Import akan mengganti seluruh data saat ini. Lanjutkan?')) return;
    setBusy(true); setMessage('');
    try {
      const backup = parseBackup(await file.text());
      await replaceUserData(user.uid, backup);
      setTransactions(backup.transactions); setDebts(backup.debts); setWeddingSettings(backup.weddingSettings);
      setMessage('Backup berhasil diimport.');
    } catch (error) { setMessage(error.message || 'Import backup gagal.'); } finally { setBusy(false); }
  };

  const forgotPassword = async () => {
    if (!email.trim()) { setMessage('Isi email untuk reset password.'); return; }
    setBusy(true); setMessage('');
    try { await resetPassword(email); setMessage('Link reset password dikirim ke email.'); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  };

   return (
     <>
       <button ref={triggerRef} type="button" className="min-h-11 rounded-full border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-3 text-xs font-semibold text-[var(--text-secondary)]" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" aria-controls="account-panel">
         {user?.isAnonymous ? 'Akun sementara' : (user?.displayName || 'Akun linked')}
       </button>
       {open && createPortal(
         <>
           <div className="fixed inset-0 z-40 bg-[var(--overlay-strong)]" onClick={() => setOpen(false)} aria-hidden="true" />
           <div
             ref={panelRef}
             id="account-panel"
             role="dialog"
             aria-label={mode === 'link' ? 'Simpan akun di dua HP' : 'Login akun linked'}
             aria-modal="true"
             className="fixed inset-x-0 bottom-0 z-50 max-h-[min(85dvh,calc(100dvh-16px))] overflow-y-auto rounded-t-[var(--radius-modal)] border border-[var(--border-1)] bg-[var(--bg-modal)] p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-12 sm:max-h-[calc(100dvh-80px)] sm:w-[min(360px,calc(100vw-32px))] sm:rounded-2xl sm:pb-4"
           >
             <div className="mb-3 flex items-center justify-between gap-3">
               <div className="text-sm font-semibold">{mode === 'link' ? 'Simpan akun di dua HP' : 'Login akun linked'}</div>
               <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-1)] text-xs text-[var(--text-secondary)] sm:hidden" onClick={() => setOpen(false)} aria-label="Tutup panel">✕</button>
             </div>
             <p className="mb-3 text-xs leading-5 text-[var(--text-secondary)]">{mode === 'link' ? 'Link akun ini agar data dapat dibuka di HP kedua.' : 'Gunakan email dan password dari HP pertama.'}</p>
             <form className="flex flex-col gap-2" onSubmit={submit}>
               {mode === 'link' && <input className="min-h-11 rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-3 text-sm text-[var(--text-primary)]" placeholder="Nama tampilan" value={name} onChange={(event) => setName(event.target.value)} />}
               <input required type="email" className="min-h-11 rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-3 text-sm text-[var(--text-primary)]" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
               <input required minLength="6" type="password" className="min-h-11 rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] px-3 text-sm text-[var(--text-primary)]" placeholder="Password minimal 6 karakter" value={password} onChange={(event) => setPassword(event.target.value)} />
               <button disabled={busy} className="min-h-11 rounded-xl bg-[var(--accent)] text-sm font-bold disabled:opacity-40" type="submit">{busy ? 'Memproses…' : mode === 'link' ? 'Link akun' : 'Login'}</button>
             </form>
             {mode === 'login' && <button type="button" disabled={busy} className="mt-2 min-h-9 text-xs font-semibold text-[var(--accent-weak)]" onClick={forgotPassword}>Lupa password?</button>}
             <div className="mt-4 border-t border-[var(--border-1)] pt-3">
               <p className="mb-2 text-xs font-semibold">Backup data</p>
               <div className="flex gap-2">
                 <button type="button" disabled={busy} className="min-h-11 flex-1 rounded-xl border border-[var(--border-1)] text-xs font-semibold" onClick={exportBackup}>Export JSON</button>
                 <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-[var(--border-1)] text-xs font-semibold">
                   Import JSON
                   <input type="file" accept="application/json,.json" className="sr-only" onChange={importBackup} disabled={busy} />
                 </label>
               </div>
             </div>
             {message && <p className="mt-3 rounded-xl bg-[var(--bg-surface-1)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]" role="alert">{message}</p>}
             <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-[var(--border-1)] pt-3 text-xs font-semibold text-[var(--text-secondary)]">
               {user?.isAnonymous ? <button type="button" className="min-h-9 text-left text-[var(--accent-weak)]" onClick={() => switchAccount('login')}>Sudah punya akun? Login</button> : <button type="button" className="min-h-9 text-left text-[var(--accent-weak)]" onClick={() => switchAccount('link')}>Link akun baru</button>}
               <button type="button" disabled={busy} className="min-h-9 rounded-full border border-[var(--border-1)] px-3" onClick={doLogout}>Logout</button>
             </div>
           </div>
         </>,
         document.body
       )}
     </>
   );
}
