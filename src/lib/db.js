import { db, ref, get, set, push, remove, update, runTransaction, onValue, off } from '../config/firebase';

// V2 path: users/{uid}/...
const userPath = (uid, path) => `finance_berdua_v2/users/${uid}/${path}`;
const workspacePath = (workspaceId, path) => `finance_berdua_v2/workspaces/${workspaceId}/${path}`;

// Additive workspace refs. Existing user-scoped refs remain unchanged until App integration is safe.
export const workspaceTxRef = (workspaceId) => ref(db, workspacePath(workspaceId, 'transactions'));
export const workspaceDebtRef = (workspaceId) => ref(db, workspacePath(workspaceId, 'debts'));
export const workspaceWeddingRef = (workspaceId) => ref(db, workspacePath(workspaceId, 'wedding_settings'));

export const txRef = (uid) => ref(db, userPath(uid, 'transactions'));
export const txItemRef = (uid, id) => ref(db, userPath(uid, `transactions/${id}`));
export const debtRef = (uid) => ref(db, userPath(uid, 'debts'));
export const debtItemRef = (uid, id) => ref(db, userPath(uid, `debts/${id}`));
export const weddingRef = (uid) => ref(db, userPath(uid, 'wedding_settings'));
export const heartbeatRef = (uid) => ref(db, `finance_berdua_v2/heartbeats/${uid}`);
export const notifRef = (uid) => ref(db, `finance_berdua_v2/notifs/${uid}`);
export const sheetUrlRef = (uid) => ref(db, userPath(uid, 'sheetUrl'));

// Per-tx write (bukan set whole object — fix race V1)
export const saveTx = (uid, tx) => set(txItemRef(uid, tx.id), tx);
export const saveCashMove = (uid, move, adminTx) => {
  const writes = {
    [userPath(uid, `transactions/${move.id}`)]: move,
  };
  if (adminTx) writes[userPath(uid, `transactions/${adminTx.id}`)] = adminTx;
  return update(ref(db), writes);
};
export const removeTx = (uid, id) => remove(txItemRef(uid, id));
export const saveDebt = (uid, debt) => set(debtItemRef(uid, debt.id), debt);
export const saveWeddingSettings = (uid, settings) => set(weddingRef(uid), settings);
export const saveDebtPayment = async (uid, debt, transaction) => {
  const payment = { id: transaction.cicilanId, nominal: transaction.nominal, tanggal: transaction.tanggal, catatan: transaction.catatan || '', txId: transaction.id };
  const transactionPath = userPath(uid, `transactions/${transaction.id}`);
  const paymentTransaction = { ...transaction, paymentOperationId: transaction.cicilanId };
  const result = await runTransaction(debtItemRef(uid, debt.id), (value) => {
    if (!value) return;
    const payments = Array.isArray(value.cicilan) ? value.cicilan : Object.values(value.cicilan || {});
    const existing = payments.find((item) => item.id === transaction.cicilanId);
    if (existing) {
      if (existing.txId !== transaction.id || Number(existing.nominal) !== Number(transaction.nominal)) return;
      return value;
    }
    const remaining = Math.max(0, Number(value.total || 0) - Number(value.paid || 0));
    if (transaction.nominal < 0 || transaction.nominal > remaining) return;
    return { ...value, paid: Number(value.paid || 0) + transaction.nominal, cicilan: [...payments, payment] };
  });
  const committedValue = result.snapshot?.val();
  const committedPayments = Array.isArray(committedValue?.cicilan)
    ? committedValue.cicilan
    : Object.values(committedValue?.cicilan || {});
  const paymentApplied = committedPayments.some((item) => item.id === transaction.cicilanId && item.txId === transaction.id && Number(item.nominal) === Number(transaction.nominal));
  if (!result.committed && !paymentApplied) throw new Error('Debt payment not committed');
  return update(ref(db), { [transactionPath]: paymentTransaction });
};
export const removeDebt = (uid, id) => remove(debtItemRef(uid, id));
export const replaceUserData = (uid, data) => update(ref(db), {
  [userPath(uid, 'transactions')]: data.transactions,
  [userPath(uid, 'debts')]: data.debts,
  [userPath(uid, 'wedding_settings')]: data.weddingSettings,
});

export { get, set, push, remove, update, onValue, off };
