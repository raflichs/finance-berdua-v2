import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { logout, resetPassword } from '../config/firebase';
import { parseBackup } from '../lib/backup';

const errorMessage = (error) => ({
  'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
}[error.code] || 'Operasi gagal. Periksa koneksi.');

export default function AccountPanel({ user, pendingCount = 0 }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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

  const doLogout = async () => {
    if (pendingCount) { setMessage('Selesaikan sinkronisasi pending sebelum logout.'); return; }
    setBusy(true); setMessage('');
    try { await logout(); setOpen(false); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  };

  const exportBackup = () => {
    setMessage('Backup belum tersedia pada fase ini.');
  };
  const importBackup = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (pendingCount) { setMessage('Selesaikan sinkronisasi pending sebelum import.'); return; }
    if (!window.confirm('Import akan mengganti seluruh data saat ini. Lanjutkan?')) return;
    setBusy(true); setMessage('');
    try {
      await parseBackup(await file.text());
      // ponytail: import backup akan diupdate di Tahap 3 untuk workspace path
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
        {user?.displayName || 'Akun'}
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40 bg-[var(--overlay-strong)]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={panelRef}
            id="account-panel"
            role="dialog"
            aria-label="Panel akun"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[min(85dvh,calc(100dvh-16px))] overflow-y-auto rounded-t-[var(--radius-modal)] border border-[var(--border-1)] bg-[var(--bg-modal)] p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-12 sm:max-h-[calc(100dvh-80px)] sm:w-[min(360px,calc(100vw-32px))] sm:rounded-2xl sm:pb-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Akun</div>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-1)] text-xs text-[var(--text-secondary)] sm:hidden" onClick={() => setOpen(false)} aria-label="Tutup panel">✕</button>
            </div>
            <p className="mb-3 text-xs leading-5 text-[var(--text-secondary)]">{user?.email}</p>
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
              <button type="button" className="min-h-9 text-left text-[var(--accent-weak)]" onClick={() => setEmail(user?.email || '')}>Reset password</button>
              <button type="button" disabled={busy} className="min-h-9 rounded-full border border-[var(--border-1)] px-3" onClick={doLogout}>Logout</button>
            </div>
            {email && (
              <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); forgotPassword(); }}>
                <p className="text-xs text-[var(--text-secondary)]">Reset password untuk {email}</p>
                <button disabled={busy} className="min-h-11 rounded-xl bg-[var(--accent)] text-sm font-bold disabled:opacity-40" type="submit">{busy ? 'Memproses…' : 'Kirim link reset'}</button>
              </form>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
