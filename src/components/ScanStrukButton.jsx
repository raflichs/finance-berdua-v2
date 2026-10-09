import { useRef, useState } from 'react';
import { compressImage, scanStruk } from '../lib/scanStruk';

// Tombol foto struk: input capture → kompres → OCR → onScan(result).
export default function ScanStrukButton({ onScan }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || loading) return;
    setLoading(true);
    setError('');
    try {
      const { base64, mediaType } = await compressImage(file);
      const result = await scanStruk({ base64, mediaType });
      onScan(result);
    } catch (err) {
      setError(err?.message || 'Scan gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-w-0">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <button
        type="button"
        disabled={loading}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-sm font-bold text-[var(--accent-weak)] disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">photo_camera</span>
        {loading ? 'Membaca struk…' : 'Foto struk (otomatis isi)'}
      </button>
      {error && <p className="mt-2 text-xs text-[var(--error-weak)]" role="alert">{error}</p>}
    </div>
  );
}
