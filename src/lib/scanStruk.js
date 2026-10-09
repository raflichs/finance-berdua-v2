// DOM + network layer untuk scan struk. Fungsi murni ada di scanStrukHelpers.js.
import { extractGeminiText, parseScanResult } from './scanStrukHelpers';

export { parseScanResult, extractGeminiText, taxShare, personTotal } from './scanStrukHelpers';

// Kompres foto di <canvas>: batasi sisi terpanjang, jpeg quality 0.8.
export const compressImage = (file, maxSide = 1600, quality = 0.8) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca gambar.'));
    };
    img.src = url;
  });

// Kirim ke Worker, balikin hasil ter-parse.
export const scanStruk = async ({ base64, mediaType }) => {
  let res;
  try {
    res = await fetch('/api/scan-struk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mediaType }),
    });
  } catch {
    throw new Error('Tidak bisa menghubungi server scan. Cek koneksi.');
  }
  if (res.status === 404) throw new Error('Scan butuh Worker (finance-app-v2) ter-deploy.');
  const data = await res.json().catch(() => null);
  if (res.status === 500 && String(data?.error || '').includes('GEMINI_API_KEY')) {
    throw new Error('Scan butuh GEMINI_API_KEY di Worker.');
  }
  if (!res.ok) throw new Error(`Scan gagal (${res.status}).`);
  return parseScanResult(extractGeminiText(data));
};
