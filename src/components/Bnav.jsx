import useStore from '../store/useStore';

const TABS = [
  { id: 'dashboard', icon: 'home', label: 'Dashboard' },
  { id: 'input', icon: 'add', label: '', fab: true },
  { id: 'history', icon: 'receipt_long', label: 'History' },
];

export default function Bnav() {
  const { activeTab, setActiveTab } = useStore();

  return (
    <nav
      className="nav-shell fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-[398px] h-[var(--bnav-height)] flex items-center justify-around rounded-[var(--bnav-radius)] border border-[var(--border-2)] z-50"
      style={{
        background: 'var(--bg-nav)',
        backdropFilter: 'blur(var(--blur-hero)) saturate(180%)',
        WebkitBackdropFilter: 'blur(var(--blur-hero)) saturate(180%)',
      }}
      aria-label="Navigasi utama"
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        if (tab.fab) {
          return (
            <button
              key={tab.id}
              type="button"
              aria-label="Tambah transaksi"
              onClick={() => setActiveTab(tab.id)}
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-[var(--text-primary)] shadow-lg self-center"
              style={{
                background: 'linear-gradient(135deg, var(--gradient-fab-start), var(--gradient-fab-end))',
                boxShadow: 'var(--shadow-fab)',
                minWidth: 'var(--tap-min)',
                minHeight: 'var(--tap-min)',
              }}
            >
              <span className="material-symbols-outlined text-2xl">add</span>
            </button>
          );
        }
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
            className="flex flex-col items-center gap-0.5 px-2 py-1 transition-colors"
            style={{
              color: active ? 'var(--accent-weak)' : 'var(--text-tertiary)',
              minWidth: 'var(--tap-min)',
              minHeight: 'var(--tap-min)',
            }}
          >
            <span className="material-symbols-outlined text-2xl" aria-hidden="true">{tab.icon}</span>
            <span className="text-[10px] font-semibold">{tab.label}</span>
            {active && <span className="w-1 h-1 rounded-full bg-[var(--accent-weak)]" />}
          </button>
        );
      })}
    </nav>
  );
}
