import { db, ref, get, set, push, remove, update, runTransaction, onValue, off } from '../config/firebase';

const userPath = (uid, path) => `finance_berdua_v2/users/${uid}/${path}`;
const workspacePath = (workspaceId, path) => `finance_berdua_v2/workspaces/${workspaceId}/${path}`;

// Membership index: finance_berdua_v2/memberships/{uid}/{workspaceId}
export const membershipRef = (uid) => ref(db, `finance_berdua_v2/memberships/${uid}`);
export const workspaceMembershipRef = (uid, workspaceId) => ref(db, `finance_berdua_v2/memberships/${uid}/${workspaceId}`);

// Workspace refs (authoritative data scope)
export const workspaceRef = (workspaceId) => ref(db, `finance_berdua_v2/workspaces/${workspaceId}`);
export const workspaceMembersRef = (workspaceId) => ref(db, workspacePath(workspaceId, 'members'));
export const workspaceMemberRef = (workspaceId, uid) => ref(db, workspacePath(workspaceId, `members/${uid}`));

export const workspaceTxRef = (workspaceId) => ref(db, workspacePath(workspaceId, 'transactions'));
export const workspaceTxItemRef = (workspaceId, id) => ref(db, workspacePath(workspaceId, `transactions/${id}`));
export const workspaceDebtRef = (workspaceId) => ref(db, workspacePath(workspaceId, 'debts'));
export const workspaceDebtItemRef = (workspaceId, id) => ref(db, workspacePath(workspaceId, `debts/${id}`));
export const workspaceWeddingRef = (workspaceId) => ref(db, workspacePath(workspaceId, 'wedding_settings'));

// Legacy user-scoped refs. Data lama tetap ada di Firebase tapi TIDAK dipakai flow baru (PRD §5, §14.4).
export const txRef = (uid) => ref(db, userPath(uid, 'transactions'));
export const txItemRef = (uid, id) => ref(db, userPath(uid, `transactions/${id}`));
export const debtRef = (uid) => ref(db, userPath(uid, 'debts'));
export const debtItemRef = (uid, id) => ref(db, userPath(uid, `debts/${id}`));
export const weddingRef = (uid) => ref(db, userPath(uid, 'wedding_settings'));
export const heartbeatRef = (uid) => ref(db, `finance_berdua_v2/heartbeats/${uid}`);
export const notifRef = (uid) => ref(db, `finance_berdua_v2/notifs/${uid}`);
export const sheetUrlRef = (uid) => ref(db, userPath(uid, 'sheetUrl'));

// Workspace write helpers. First arg selalu workspaceId; actor metadata sudah ada di payload.
export const saveTx = (workspaceId, tx) => set(workspaceTxItemRef(workspaceId, tx.id), tx);
export const saveCashMove = (workspaceId, move, adminTx) => {
  const writes = {
    [workspacePath(workspaceId, `transactions/${move.id}`)]: move,
  };
  if (adminTx) writes[workspacePath(workspaceId, `transactions/${adminTx.id}`)] = adminTx;
  return update(ref(db), writes);
};
export const removeTx = (workspaceId, id) => remove(workspaceTxItemRef(workspaceId, id));
export const saveDebt = (workspaceId, debt) => set(workspaceDebtItemRef(workspaceId, debt.id), debt);
export const saveWeddingSettings = (workspaceId, settings) => set(workspaceWeddingRef(workspaceId), settings);
export const saveDebtPayment = async (workspaceId, debt, transaction) => {
  const payment = { id: transaction.cicilanId, nominal: transaction.nominal, tanggal: transaction.tanggal, catatan: transaction.catatan || '', txId: transaction.id };
  const transactionPath = workspacePath(workspaceId, `transactions/${transaction.id}`);
  const paymentTransaction = { ...transaction, paymentOperationId: transaction.cicilanId };
  const result = await runTransaction(workspaceDebtItemRef(workspaceId, debt.id), (value) => {
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
export const removeDebt = (workspaceId, id) => remove(workspaceDebtItemRef(workspaceId, id));

export const replaceWorkspaceData = (workspaceId, data) => update(ref(db), {
  [workspacePath(workspaceId, 'transactions')]: data.transactions,
  [workspacePath(workspaceId, 'debts')]: data.debts,
  [workspacePath(workspaceId, 'wedding_settings')]: data.weddingSettings,
});

export { get, set, push, remove, update, onValue, off };
