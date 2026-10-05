import { removeDebt, removeTx, saveCashMove, saveDebt, saveDebtPayment, saveTx, saveWeddingSettings } from './db';
import { getQueuedOperations, removeQueuedOperation, updateQueuedAttempts } from './offlineQueue';

let flushMutex = Promise.resolve();

const withFlushMutex = (task) => {
  const next = flushMutex.then(task, task);
  flushMutex = next.catch(() => {});
  return next;
};

const applyOperation = (workspaceId, operation) => {
   if (operation.type === 'transaction') return saveTx(workspaceId, operation.tx);
   if (operation.type === 'cashMove') return saveCashMove(workspaceId, operation.move, operation.adminTx);
   if (operation.type === 'debtPayment') {
     const debt = { ...operation.debt, cicilan: Array.isArray(operation.debt.cicilan) ? operation.debt.cicilan : [] };
     return saveDebtPayment(workspaceId, debt, { ...operation.transaction, paymentOperationId: operation.transaction.cicilanId });
   }
   if (operation.type === 'removeTransaction') return removeTx(workspaceId, operation.id);
   if (operation.type === 'debt') return saveDebt(workspaceId, operation.debt);
   if (operation.type === 'removeDebt') return removeDebt(workspaceId, operation.id);
   if (operation.type === 'weddingSettings') return saveWeddingSettings(workspaceId, operation.settings);
   throw new Error(`Unknown queued operation: ${operation.type}`);
 };

export const flushTxQueue = async (uid, workspaceId, onProgress) => withFlushMutex(async () => {
  if (!navigator.onLine || !workspaceId) return { flushed: 0, failed: 0, skipped: 0, errors: [] };
  const queued = await getQueuedOperations(uid);
  const result = { flushed: 0, failed: 0, skipped: 0, errors: [] };
  const failedIds = new Set();
  for (const item of queued) {
    const dependencies = item.dependsOn || item.operation.dependsOn || [];
    if (dependencies.some((dependency) => failedIds.has(dependency))) {
      result.skipped += 1;
      continue;
    }
    try {
      await applyOperation(workspaceId, item.operation);
      await removeQueuedOperation(item.operationId);

      result.flushed += 1;
      onProgress?.();
    } catch (error) {
      result.failed += 1;
      const errorCode = error.code || error.message || 'UNKNOWN';
      console.error(`[Queue Sync] Operation ${item.operationId} failed:`, { code: errorCode, message: error.message, operation: item.operation });
      result.errors.push({ operationId: item.operationId, code: errorCode, message: error.message });
      failedIds.add(item.operationId);
      await updateQueuedAttempts(item.operationId, item.attempts + 1);
    }
  }
  return result;
});
