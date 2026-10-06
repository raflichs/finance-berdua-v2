export const koreksiSelisih = (target, currentQRIS) => target - currentQRIS;

export const buildKoreksiTx = ({ target, currentQRIS, id, tanggal, addedByUid, addedByName }) => {
  const selisih = target - currentQRIS;
  if (selisih === 0) return null;
  return {
    id, tanggal,
    jenis: selisih > 0 ? 'Pemasukan' : 'Pengeluaran',
    kategori: 'Lainnya',
    deskripsi: 'Penyesuaian Saldo QRIS',
    nominal: Math.abs(selisih),
    account: 'QRIS',
    addedByUid, addedByName, addedBy: addedByName,
  };
};
