const DB_NAME = 'finance_berdua_v2';
const STORE = 'tx_queue';
const DB_VERSION = 2;

let queueMutex = Promise.resolve();

const withQueueMutex = (task) => {
  const next = queueMutex.then(task, task);
  queueMutex = next.catch(() => {});
  return next;
};

const entityKeyFor = (operation) => {
  if (operation.type === 'transaction' || operation.type === 'removeTransaction') return `transaction:${operation.tx?.id || operation.id}`;
  if (operation.type === 'debt' || operation.type === 'removeDebt') return `debt:${operation.debt?.id || operation.id}`;
  if (operation.type === 'weddingSettings') return 'weddingSettings';
  return operation.entityKey || operation.type;
};

const openQueue = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'operationId' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const queuedId = (uid, operationId) => `${uid}:${operationId}`;

export const enqueueOperation = async (uid, operationId, operation) => withQueueMutex(async () => {
  const db = await openQueue();
  await new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const key = queuedId(uid, operationId);
    const request = store.get(key);
    request.onsuccess = () => {
      const previous = request.result;
      const normalizedDependencies = (operation.dependsOn || []).map((dep) => queuedId(uid, dep));
      const item = {
        operationId: key,
        uid,
        operation,
        entityKey: entityKeyFor(operation),
        dependsOn: normalizedDependencies,
        attempts: previous?.attempts || 0,
        createdAt: previous?.createdAt || Date.now(),
        updatedAt: Date.now(),
        tombstone: operation.type === 'removeTransaction' || operation.type === 'removeDebt',
      };
      const put = store.put(item);
      put.onsuccess = resolve;
      put.onerror = () => reject(put.error);
    };
    request.onerror = () => reject(request.error);
  });
});

export const enqueueTx = (uid, tx) => enqueueOperation(uid, `tx:${tx.id}`, { type: 'transaction', tx });
export const enqueueRemoveTx = (uid, id) => enqueueOperation(uid, `remove-tx:${id}`, { type: 'removeTransaction', id });
export const enqueueDebt = (uid, debt) => enqueueOperation(uid, `debt:${debt.id}`, { type: 'debt', debt });
export const enqueueRemoveDebt = (uid, id) => enqueueOperation(uid, `remove-debt:${id}`, { type: 'removeDebt', id });
export const enqueueWeddingSettings = (uid, settings) => enqueueOperation(uid, 'wedding-settings', { type: 'weddingSettings', settings });
export const getQueuedOperations = async (uid) => {
  const db = await openQueue();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result
      .filter((item) => item.uid === uid)
      .sort((a, b) => (a.createdAt - b.createdAt) || a.operationId.localeCompare(b.operationId)));
    request.onerror = () => reject(request.error);
  });
};
export const resetQueuedAttempts = async (uid) => withQueueMutex(async () => {
  const db = await openQueue();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => request.result.filter((item) => item.uid === uid && item.attempts).forEach((item) => { item.attempts = 0; item.updatedAt = Date.now(); store.put(item); });
    request.onerror = () => reject(request.error);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
});

export const updateQueuedAttempts = async (operationId, attempts) => withQueueMutex(async () => {
  const db = await openQueue();
  await new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const getRequest = store.get(operationId);
    getRequest.onsuccess = () => { const item = getRequest.result; if (!item) return resolve(); item.attempts = attempts; store.put(item).onsuccess = resolve; };
    getRequest.onerror = () => reject(getRequest.error);
  });
});

export const removeQueuedOperation = async (operationId) => withQueueMutex(async () => {
  const db = await openQueue();
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(operationId);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
});
export const countQueuedTxs = async (uid) => (await getQueuedOperations(uid)).length;
