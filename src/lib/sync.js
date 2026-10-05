import { debtRef, onValue, off, txRef, weddingRef } from './db';

const values = (data) => data ? Object.values(data) : [];
const errorMessage = (error) => error?.code === 'PERMISSION_DENIED' ? 'Akses database ditolak. Periksa akun atau RTDB Rules.' : 'Sinkronisasi gagal. Periksa koneksi internet.';

export const subscribeToUserData = (uid, handlers) => {
  let active = true;
  const initialResources = new Set();
  const failedResources = new Set();
  const markSnapshot = (resource) => {
    handlers.onSnapshot?.(Date.now());
    initialResources.add(resource);
    if (initialResources.size + failedResources.size === subscriptions.length) {
      handlers.onSyncing?.(false);
      if (!failedResources.size) handlers.onError?.('');
    }
  };
   const subscriptions = [
     ['transactions', txRef(uid), (snapshot) => handlers.onTransactions(values(snapshot.val()))],
     ['debts', debtRef(uid), (snapshot) => handlers.onDebts(values(snapshot.val()).map((debt) => {
       const cicilan = debt.cicilan || {};
       return { ...debt, cicilan: Array.isArray(cicilan) ? cicilan : values(cicilan) };
     }))],
     ['wedding', weddingRef(uid), (snapshot) => handlers.onWeddingSettings(snapshot.val())],
   ];
  const listeners = [];
  subscriptions.forEach(([resource, databaseRef, callback]) => {
    const onError = (error) => {
      if (!active) return;
      failedResources.add(resource);
      handlers.onSyncing?.(initialResources.size + failedResources.size < subscriptions.length);
      handlers.onError?.(errorMessage(error));
    };
    const listener = (snapshot) => {
      if (!active) return;
      try {
         callback(snapshot);
         markSnapshot(resource);
      } catch (error) {
         failedResources.add(resource);
         handlers.onSyncing?.(false);
         handlers.onError?.(errorMessage(error));
      }
    };
    listeners.push([databaseRef, listener]);
    onValue(databaseRef, listener, onError);
  });
  return () => {
    if (!active) return;
    active = false;
    listeners.forEach(([databaseRef, listener]) => off(databaseRef, 'value', listener));
  };
};
