import { lazy, Suspense, useEffect, useState } from 'react';
import useStore from './store/useStore';
import { auth, loginWithEmail, onAuthStateChanged, prepareAuth } from './config/firebase';
import Bnav from './components/Bnav';
import { subscribeToWorkspaceData } from './lib/sync';
import { countQueuedTxs, resetQueuedAttempts } from './lib/offlineQueue';
import { flushTxQueue } from './lib/queueSync';
import { resolveUserWorkspace } from './lib/workspace';
import AccountPanel from './components/AccountPanel';

const Dashboard = lazy(() => import('./components/Dashboard'));
const InputTransaction = lazy(() => import('./components/InputTransaction'));
const History = lazy(() => import('./components/History'));
const Debt = lazy(() => import('./components/Debt'));
const Savings = lazy(() => import('./components/Savings'));
const SplitBill = lazy(() => import('./components/SplitBill'));

const TAB_TITLES = {
  dashboard: 'Dashboard',
  history: 'Riwayat',
  input: 'Tambah transaksi',
  debt: 'Hutang & Piutang',
  savings: 'Dana Nikah',
  split: 'Split Bill',
};

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { activeTab, setAuth, uid, online, syncing, syncError, lastSyncedAt, syncStale, setTransactions, setDebts, setWeddingSettings, setSyncing, setSyncError, setLastSyncedAt, setSyncStale, workspaceId, workspaceLoading, workspaceError, setWorkspace, setWorkspaceLoading, setWorkspaceError, clearWorkspace } = useStore();

  useEffect(() => {
    let cancelled = false;
    prepareAuth().catch(() => undefined);
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (cancelled) return;
      setUser(nextUser);
      if (nextUser) {
        setAuth(nextUser.uid, nextUser.displayName || '');
        setWorkspaceLoading(true);
        try {
          const resolved = await resolveUserWorkspace(nextUser.uid);
          if (cancelled) return;
          if (resolved) {
            setWorkspace(resolved.workspaceId, resolved.workspace);
          } else {
            clearWorkspace();
            setWorkspaceError('Akun belum terhubung ke workspace. Hubungi administrator.');
          }
        } catch {
          // eslint-disable-next-line no-empty
          if (!cancelled) setWorkspaceError('Gagal memuat workspace.');
        } finally {
          if (!cancelled) setWorkspaceLoading(false);
        }
      } else {
        setAuth(null, '');
        clearWorkspace();
      }
      setAuthReady(true);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [setAuth, setWorkspace, clearWorkspace, setWorkspaceLoading, setWorkspaceError]);

  useEffect(() => {
    if (!uid || !workspaceId) return undefined;

    setSyncing(true);
    setLastSyncedAt(null);
    return subscribeToWorkspaceData(workspaceId, {
      onTransactions: setTransactions,
      onDebts: setDebts,
      onWeddingSettings: setWeddingSettings,
       onSyncing: setSyncing,
       onSnapshot: setLastSyncedAt,
       onError: setSyncError,
    });
  }, [uid, workspaceId, setDebts, setLastSyncedAt, setSyncError, setSyncing, setTransactions, setWeddingSettings]);

  useEffect(() => {
    if (!lastSyncedAt) return undefined;
    const checkStale = () => setSyncStale(Date.now() - lastSyncedAt > 300000);
    checkStale();
    const timer = window.setInterval(checkStale, 60000);
    return () => window.clearInterval(timer);
  }, [lastSyncedAt, setSyncStale]);

  useEffect(() => {
    const onl = () => useStore.getState().setOnline(true);
    const off = () => useStore.getState().setOnline(false);
    window.addEventListener('online', onl);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', onl); window.removeEventListener('offline', off); };
  }, []);

   useEffect(() => {
     if (!uid || !workspaceId) return undefined;
     const flush = async () => {
       const result = await flushTxQueue(uid, workspaceId, () => setPendingCount((count) => Math.max(0, count - 1)));
       setPendingCount(await countQueuedTxs(uid));
       if (result.failed > 0 || result.skipped > 0) {
         const errorDetails = result.errors.map(e => `${e.code}`).join(', ');
         setSyncError(`${result.failed + result.skipped} belum tersinkron (${errorDetails}). Coba Retry.`);
       }
     };
     countQueuedTxs(uid).then(setPendingCount).catch(() => setPendingCount(0));
     if (online) flush();
     return undefined;
   }, [online, uid, workspaceId, setSyncError]);

  if (!authReady || (uid && workspaceLoading)) {
    return <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--bg)] text-[var(--text-primary)]" role="status" aria-live="polite"><span className="material-symbols-outlined animate-spin text-4xl" aria-hidden="true">progress_activity</span><span className="text-sm text-[var(--text-secondary)]">{workspaceLoading ? 'Memuat workspace…' : 'Memuat akun…'}</span></div>;
  }

  // Bnav obstruction: height 72 + bottom offset 16 + content gap 16
  // Explicit bottom padding prevents content hiding behind floating Bnav on all viewports.
  const hideBnav = activeTab === 'input' || activeTab === 'split';

  if (!uid) {
    return <AuthScreen />;
  }

  if (workspaceError || !workspaceId) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] p-4 text-[var(--text-primary)]">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-5 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--warning)]" aria-hidden="true">no_accounts</span>
          <h1 className="mt-3 text-lg font-bold">Akses Belum Dikonfigurasi</h1>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{workspaceError || 'Akun berhasil login, tetapi belum terhubung ke workspace. Hubungi administrator untuk menyelesaikan konfigurasi akun.'}</p>
          <button type="button" className="mt-5 min-h-11 w-full rounded-xl border border-[var(--border-1)] text-xs font-semibold" onClick={() => auth.signOut()}>Logout</button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell flex min-h-dvh w-full flex-col bg-[var(--bg)] text-[var(--text-primary)] font-[Inter]">
      <div className="app-container mx-auto flex w-full max-w-[var(--content-max-mobile)] flex-1 flex-col lg:max-w-[var(--content-max-desktop)]">
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
      {/* Header */}
      <header
        className="app-header sticky top-0 z-30 flex min-h-14 min-w-0 items-end justify-between gap-3 border-b border-[var(--border-1)]"
        style={{
          paddingTop: 'calc(14px + env(safe-area-inset-top))',
          paddingBottom: '12px',
          backdropFilter: 'blur(var(--blur-base)) saturate(180%)',
          WebkitBackdropFilter: 'blur(var(--blur-base)) saturate(180%)',
          background: 'var(--bg-header)',
        }}
      >
         <div className="min-w-0">
           <p className="truncate text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>Finance Berdua</p>
           <h1 className="truncate text-[17px] font-bold tracking-tight">{TAB_TITLES[activeTab]}</h1>
        </div>
                 <div className="flex shrink-0 items-center gap-2"><span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-bold ${online ? 'border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]' : 'border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning-weak)]'}`} role="status" aria-live="polite"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{online ? (pendingCount ? `${pendingCount} belum tersinkron` : syncing ? 'Menyinkronkan' : 'Online') : (pendingCount ? `${pendingCount} belum tersinkron` : 'Offline')}</span><AccountPanel user={user} pendingCount={pendingCount} />{(pendingCount > 0 || syncError) && <button type="button" className="min-h-7 rounded-full border border-[var(--border-1)] px-2 text-[10px] font-bold text-[var(--accent-weak)]" onClick={async () => { if (!uid || !workspaceId) return; await resetQueuedAttempts(uid); if (online) await flushTxQueue(uid, workspaceId); setPendingCount(await countQueuedTxs(uid)); setSyncError(''); }}>Retry</button>}</div>
      </header>
       {!online && <div className="border-b border-[var(--warning)]/20 bg-[var(--warning)]/10 px-3 py-2 text-center text-xs font-semibold text-[var(--warning-weak)]" role="status" aria-live="polite">Offline — transaksi baru masuk antrean lokal.</div>}
        {syncError && <div className="border-b border-[var(--error)]/20 bg-[var(--error)]/10 px-3 py-2 text-center text-xs font-semibold text-[var(--error-weak)]" role="alert">{syncError}</div>}
        {!syncError && syncStale && <div className="border-b border-[var(--warning)]/20 bg-[var(--warning)]/10 px-3 py-2 text-center text-xs font-semibold text-[var(--warning-weak)]" role="status" aria-live="polite">Data mungkin belum terbaru{lastSyncedAt ? ` \u00B7 terakhir disinkronkan ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}.</div>}
       {online && lastSyncedAt && !syncStale && !syncError && <div className="px-3 py-1 text-right text-[10px] text-[var(--text-tertiary)]" role="status" aria-live="polite">Terakhir disinkronkan {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}

      {/* Content - hide Bnav on form flows so inputs/submit never get covered */}
      <main id="main-content" tabIndex="-1" className={`app-main flex-1 overflow-y-auto py-4 ${hideBnav ? 'pb-[calc(16px+env(safe-area-inset-bottom))]' : 'pb-[calc(var(--bnav-height)+32px+env(safe-area-inset-bottom))]'}`}>
        <Suspense fallback={<div className="rounded-[var(--radius-card)] border border-[var(--border-1)] p-5 text-sm text-[var(--text-secondary)]" role="status" aria-live="polite">Memuat fitur…</div>}>
          {activeTab === 'dashboard' ? <Dashboard /> : activeTab === 'input' ? <InputTransaction /> : activeTab === 'history' ? <History /> : activeTab === 'debt' ? <Debt /> : activeTab === 'savings' ? <Savings /> : activeTab === 'split' ? <SplitBill /> : (
            <div className="rounded-[var(--radius-card)] border border-[var(--border-1)] p-5" style={{ background: 'var(--bg-surface-1)' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{activeTab} — segera hadir</p>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>UID: {uid.slice(0, 8)}...</p>
            </div>
          )}
        </Suspense>
      </main>

      {!hideBnav && <Bnav />}
      </div>
    </div>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await loginWithEmail(email, password); } catch { setError('Email atau password salah.'); } finally { setBusy(false); }
  };
  return <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] p-4 text-[var(--text-primary)]"><form className="w-full max-w-sm rounded-2xl border border-[var(--border-1)] bg-[var(--bg-surface-1)] p-5" onSubmit={submit}><h1 className="text-lg font-bold">Login Finance Berdua</h1><p className="mt-2 text-xs text-[var(--text-secondary)]">Login untuk membuka data akun linked.</p><label className="mt-5 block text-xs font-semibold text-[var(--text-secondary)]">Email<input required type="email" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-1)] bg-transparent px-3 text-sm" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="mt-3 block text-xs font-semibold text-[var(--text-secondary)]">Password<input required type="password" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border-1)] bg-transparent px-3 text-sm" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="mt-3 text-xs text-[var(--error-weak)]" role="alert">{error}</p>}<button disabled={busy} className="mt-4 min-h-11 w-full rounded-xl bg-[var(--accent)] text-sm font-bold disabled:opacity-40" type="submit">{busy ? 'Memproses…' : 'Login'}</button></form></main>;
}

export default App;
