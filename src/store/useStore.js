import { create } from 'zustand';

// Verbatim dari V1 data-model.md §4
const parseMoney = val => {
  if (typeof val === "number") return Number.isFinite(val) ? Math.round(val) : 0;
  const digits = String(val ?? "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
};

const pad2 = n => String(n).padStart(2, "0");
const toLocalDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const toLocalMonthKey = (date = new Date()) => toLocalDateKey(date).slice(0, 7);

const accountLabel = account => account === "Cash" ? "Cash" : "QRIS";
const txAccount = t => accountLabel(t.account || t.paymentMethod || "QRIS");
const txSign = t => t.jenis === "Pemasukan" ? 1 : t.jenis === "Pengeluaran" ? -1 : 0;

const KATEGORI = {
  Pemasukan: ["Gaji", "Bonus", "Lainnya"],
  Pengeluaran: ["Makan", "Transport", "Belanja", "Tagihan", "Nongkrong", "Hiburan", "Tabungan", "Pulsa/Kuota", "Lainnya"],
};

const calcWallet = (transactions) => {
  return transactions.reduce((acc, t) => {
    const nominal = Number(t.nominal) || 0;
    if (t.jenis === "Pemasukan") acc[txAccount(t)] += nominal;
    if (t.jenis === "Pengeluaran") acc[txAccount(t)] -= nominal;
    if (t.jenis === "CashMove") {
      acc[accountLabel(t.fromAccount)] -= nominal;
      acc[accountLabel(t.toAccount)] += nominal;
    }
    acc.total = acc.QRIS + acc.Cash;
    return acc;
  }, { QRIS: 0, Cash: 0, total: 0 });
};

const useStore = create((set) => ({
  // Auth
  uid: null,
  myName: '',
  partnerName: '',
  setAuth: (uid, myName) => set({ uid, myName }),
  setPartnerName: (partnerName) => set({ partnerName }),

  // Workspace
  workspaceId: null,
  workspace: null,
  workspaceLoading: false,
  workspaceError: '',
  setWorkspace: (workspaceId, workspace = null) => set({ workspaceId, workspace, workspaceError: '' }),
  setWorkspaceLoading: (loading) => set({ workspaceLoading: loading }),
  setWorkspaceError: (error) => set({ workspaceError: error }),
  clearWorkspace: () => set({ workspaceId: null, workspace: null, workspaceError: '', workspaceLoading: false, partnerName: '' }),

  // Transactions
  transactions: [],
  setTransactions: (txs) => set(state => ({ transactions: typeof txs === 'function' ? txs(state.transactions) : txs })),

  // Debts
  debts: [],
  setDebts: (debts) => set(state => ({ debts: typeof debts === 'function' ? debts(state.debts) : debts })),

  // Wedding
  weddingSettings: null,
  setWeddingSettings: (ws) => set({ weddingSettings: ws }),

  // UI
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  syncing: false,
  syncError: '',
  lastSyncedAt: null,
  syncStale: false,
  setSyncing: (v) => set({ syncing: v }),
  setSyncError: (message) => set({ syncError: message }),
  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp, syncStale: false }),
  setSyncStale: (v) => set({ syncStale: v }),
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  setOnline: (v) => set({ online: v }),

  // Constants
  KATEGORI,
  parseMoney,
  toLocalDateKey,
  toLocalMonthKey,
  accountLabel,
  txAccount,
  txSign,
}));

export default useStore;
export { parseMoney, toLocalDateKey, toLocalMonthKey, accountLabel, txAccount, txSign, KATEGORI, calcWallet };
