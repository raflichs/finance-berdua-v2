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

const POCKET_PREFIX = "p_";
const isPocketId = id => typeof id === "string" && id.startsWith(POCKET_PREFIX);

// Akun valid: QRIS, Cash, atau id kantong (p_*). Selain itu fallback QRIS (legacy paymentMethod).
const accountLabel = account => account === "Cash" ? "Cash" : isPocketId(account) ? account : "QRIS";
const txAccount = t => accountLabel(t.account || t.paymentMethod || "QRIS");
const txSign = t => t.jenis === "Pemasukan" ? 1 : t.jenis === "Pengeluaran" ? -1 : 0;

const KATEGORI = {
  Pemasukan: ["Gaji", "Bonus", "Lainnya"],
  Pengeluaran: ["Makan", "Transport", "Belanja", "Tagihan", "Nongkrong", "Hiburan", "Tabungan", "Pulsa/Kuota", "Lainnya"],
};

// Kantong = akun ketiga. Saldonya turunan dari transaksi, bukan angka tersimpan.
// `total` tetap QRIS + Cash (duit bebas pakai) — uang kantong keluar dari total, tapi tetap kelacak di `pockets`.
// Id `p_*` yang belum ada di daftar kantong tetap dapat bucket sendiri, bukan dilempar ke QRIS —
// jadi QRIS nggak pernah keracunan kalau transaksi sampai sebelum daftar kantong kelar dimuat.
const calcWallet = (transactions, pockets = []) => {
  const wallet = { QRIS: 0, Cash: 0, total: 0, pockets: {} };
  pockets.forEach(p => { if (isPocketId(p.id)) wallet.pockets[p.id] = 0; });
  const add = (account, delta) => {
    if (account === "Cash") wallet.Cash += delta;
    else if (isPocketId(account)) wallet.pockets[account] = (wallet.pockets[account] || 0) + delta;
    else wallet.QRIS += delta;
  };
  transactions.forEach(t => {
    const nominal = Number(t.nominal) || 0;
    if (t.jenis === "Pemasukan") add(txAccount(t), nominal);
    else if (t.jenis === "Pengeluaran") add(txAccount(t), -nominal);
    else if (t.jenis === "CashMove") { add(t.fromAccount, -nominal); add(t.toAccount, nominal); }
  });
  wallet.total = wallet.QRIS + wallet.Cash;
  return wallet;
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

  // Pockets (kantong alokasi dana)
  pockets: [],
  setPockets: (pockets) => set(state => ({ pockets: typeof pockets === 'function' ? pockets(state.pockets) : pockets })),

  // Wedding
  weddingSettings: null,
  setWeddingSettings: (ws) => set({ weddingSettings: ws }),

  // UI
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  // Draft input sekali pakai: Kantong kirim intent ke form, form bersihin setelah dipakai.
  inputDraft: null,
  setInputDraft: (draft) => set({ inputDraft: draft }),
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
export { parseMoney, toLocalDateKey, toLocalMonthKey, accountLabel, txAccount, txSign, KATEGORI, calcWallet, POCKET_PREFIX, isPocketId };
