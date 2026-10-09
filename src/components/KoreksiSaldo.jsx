import { useEffect, useRef, useState } from 'react';
import useStore from '../store/useStore';
import { formatRp, koreksiSelisih, formatThousands } from '../lib/dashboard';

export default function KoreksiSaldo({ open, onClose, currentQRIS, onSaved, triggerRef }) {
  const { parseMoney } = useStore();
  const [saldoMbanking, setSaldoMbanking] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const triggerButton = triggerRef?.current;

    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(panel.querySelectorAll(selector));
    
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const els = getFocusable();
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      triggerButton?.focus();
    };
  }, [open, onClose, triggerRef]);

  const target = parseMoney(saldoMbanking);
  const selisih = koreksiSelisih(target, currentQRIS);
  const validationError = !saldoMbanking.trim() ? 'Saldo M-banking wajib diisi' : '';
  const isValid = !validationError;
  const selisihDisplay = selisih === 0 ? '— sudah balance ✅' : selisih > 0 ? `akan +Pemasukan` : `akan -Pengeluaran`;
  const selisihColor = selisih === 0 ? 'text-[var(--success)]' : 'text-[var(--text-primary)]';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!isValid || saving) return;

    setSaving(true);
    setError('');
    try {
      await onSaved(target);
      onClose();
    } catch (err) {
      console.error('Koreksi saldo gagal:', err);
      setError('Koreksi gagal disimpan. Periksa koneksi atau akses, lalu coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--overlay-strong)] p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="koreksi-title"
      onClick={onClose}
    >
      <form
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="max-h-[calc(100dvh-32px)] w-full max-w-[480px] overflow-y-auto rounded-t-[var(--radius-modal)] border border-[var(--border-1)] bg-[var(--bg-modal)] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] sm:rounded-[var(--radius-modal)] sm:pb-5"
        noValidate
      >
        <h2 id="koreksi-title" className="text-lg font-bold">Koreksi Saldo QRIS</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          QRIS sekarang {formatRp(currentQRIS)} — masukkan saldo M-banking yang benar
        </p>

        <label className="mt-4 block text-xs font-semibold text-[var(--text-secondary)]" htmlFor="saldo-mbanking">
          Saldo M-banking
        </label>
        <input
           ref={inputRef}
           id="saldo-mbanking"
           type="text"
           inputMode="numeric"
           autoFocus
           placeholder="Rp 0"
value={formatThousands(saldoMbanking)}
            onChange={(e) => {
              setSaldoMbanking(e.target.value);
              setError('');
            }}
           onBlur={() => setTouched(true)}
          aria-invalid={Boolean(touched && validationError)}
          aria-describedby={touched && validationError ? 'saldo-error' : undefined}
          className={`mt-1 min-h-12 w-full rounded-[var(--radius-input)] border bg-[var(--bg-surface-1)] px-4 text-base text-[var(--text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent-weak)] ${
            touched && validationError ? 'border-[var(--error)]' : 'border-[var(--border-1)]'
          }`}
        />
         {touched && validationError && (
           <p id="saldo-error" className="mt-1 text-xs text-[var(--error-weak)]" role="alert">
             {validationError}
           </p>
         )}

         <div className="mt-4 rounded-xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-3">
           <p className={`text-xs font-semibold ${selisihColor}`}>
             Selisih: {formatRp(Math.abs(selisih))} {selisihDisplay}
           </p>
         </div>

         {error && (
           <p className="mt-4 text-xs text-[var(--error-weak)]" role="alert">
             {error}
           </p>
         )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="pill-control flex-1 !rounded-xl !min-h-11 !text-sm"
            onClick={onClose}
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={!isValid || saving}
            className="min-h-11 flex-1 rounded-xl bg-[var(--accent)] text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Menyimpan...' : 'Simpan Koreksi'}
          </button>
        </div>
      </form>
    </div>
  );
}
