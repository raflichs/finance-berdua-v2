const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const BACKUP_FORMAT = 'finance-berdua-backup';
export const BACKUP_VERSION = 1;

const isDate = (value) => !value || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const isId = (value) => (typeof value === 'string' || typeof value === 'number') && String(value).length > 0 && String(value).length <= 128;
const amount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const list = (value) => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

const validateTransaction = (tx) => {
  if (!tx || !isId(tx.id) || !isDate(tx.tanggal) || !amount(tx.nominal)) throw new Error('Transaksi tidak valid.');
};
const validateDebt = (debt) => {
  if (!debt || !isId(debt.id) || !amount(debt.total) || !amount(debt.paid) || debt.paid > debt.total || !isDate(debt.jatuhTempo)) throw new Error('Hutang tidak valid.');
  const payments = list(debt.cicilan);
  payments.forEach((payment) => {
    if (!payment || !isId(payment.id) || !isDate(payment.tanggal) || !amount(payment.nominal)) throw new Error('Cicilan tidak valid.');
  });
  if (payments.reduce((sum, payment) => sum + payment.nominal, 0) !== debt.paid) throw new Error('Jumlah cicilan tidak sama dengan total dibayar.');
};

export const createBackup = ({ transactions = [], debts = [], weddingSettings = null }) => {
  transactions.forEach(validateTransaction);
  debts.forEach(validateDebt);
  const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), transactions, debts, weddingSettings };
  const json = JSON.stringify(backup);
  if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES) throw new Error('Backup melebihi batas 10MB.');
  return json;
};

export const parseBackup = (json) => {
  if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES) throw new Error('File backup terlalu besar.');
  let backup;
  try { backup = JSON.parse(json); } catch { throw new Error('JSON backup tidak valid.'); }
  if (backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION || !Array.isArray(backup.transactions) || !Array.isArray(backup.debts)) throw new Error('Format atau versi backup tidak didukung.');
  backup.transactions.forEach(validateTransaction);
  backup.debts.forEach(validateDebt);
  if (backup.weddingSettings !== null && (typeof backup.weddingSettings !== 'object' || Array.isArray(backup.weddingSettings))) throw new Error('Pengaturan pernikahan tidak valid.');
  return backup;
};

export const MAX_BACKUP_SIZE = MAX_BACKUP_BYTES;
