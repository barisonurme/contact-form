import type { ReactNode } from 'react';

export type Tab = 'messages' | 'analytics' | 'visitors';

const TABS: { id: Tab; label: string }[] = [
  { id: 'messages', label: 'Mesajlar' },
  { id: 'analytics', label: 'Analitik' },
  { id: 'visitors', label: 'Ziyaretçiler' },
];

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  onLogout: () => void;
  unread: number;
  children: ReactNode;
}

export default function Layout({ tab, onTab, onLogout, unread, children }: Props) {
  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-sky-500/10 via-sky-500/3 to-transparent"
      />
      <div className="relative mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-sky-600 text-sm font-bold text-white shadow-lg shadow-sky-600/25">
              C
            </div>
            <span className="text-base font-semibold tracking-tight">Contact Admin</span>
          </div>
          <button
            onClick={onLogout}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            Çıkış
          </button>
        </header>

        <nav className="mb-6 inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
              {t.id === 'messages' && unread > 0 && (
                <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-xs font-semibold text-sky-300">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
