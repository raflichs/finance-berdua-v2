const TRANSIENT_ERRORS = [
  'NETWORK_ERROR',
  'TIMEOUT',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
];

export const isTransientError = (error) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = error?.code?.toUpperCase() || error?.message?.toUpperCase() || '';
  return TRANSIENT_ERRORS.some((transient) => code.includes(transient));
};

export const errorMessage = (error) => {
  const code = error?.code || error?.message || 'UNKNOWN_ERROR';
  if (code === 'PERMISSION_DENIED') return 'Akses ditolak. Periksa izin Firebase.';
  if (code === 'INVALID_ARGUMENT') return 'Data tidak sesuai format. Periksa input.';
  if (code === 'UNAUTHENTICATED') return 'Autentikasi gagal. Login ulang.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Offline. Perubahan disimpan untuk tersinkron nanti.';
  return `Sinkronisasi gagal: ${code}. Coba lagi.`;
};
