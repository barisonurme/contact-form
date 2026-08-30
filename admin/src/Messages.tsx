import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Message, MessagesResponse, SiteStats } from './types';

const BADGE_COLORS = [
  'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
];

function siteBadgeClass(site: string): string {
  let hash = 0;
  for (const ch of site) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  stats: SiteStats[];
  onStatsChange: () => void;
}

export default function Messages({ stats, onStatsChange }: Props) {
  const [data, setData] = useState<MessagesResponse | null>(null);
  const [page, setPage] = useState(1);
  const [site, setSite] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const totalUnread = stats.reduce((sum, s) => sum + s.unread, 0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (site) params.set('site', site);
    if (unreadOnly) params.set('unread', 'true');
    try {
      setData(await api<MessagesResponse>(`/api/admin/messages?${params}`));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [page, site, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    await api(`/api/admin/messages/${id}/read`, { method: 'PATCH' });
    await load();
    onStatsChange();
  }

  async function remove(id: string) {
    if (!confirm('Bu mesaj silinsin mi?')) return;
    await api(`/api/admin/messages/${id}`, { method: 'DELETE' });
    if (expandedId === id) setExpandedId(null);
    await load();
    onStatsChange();
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
      onStatsChange();
    } finally {
      setRefreshing(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mesajlar</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {totalUnread > 0 ? `${totalUnread} okunmamış mesaj` : 'Tüm mesajlar okundu'}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
        >
          <span className={refreshing ? 'inline-block animate-spin' : undefined}>↻</span>
          Yenile
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={site}
          onChange={(e) => {
            setSite(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none transition focus:border-sky-500"
        >
          <option value="">Tüm siteler</option>
          {stats.map((s) => (
            <option key={s.site} value={s.site}>
              {s.site} ({s.unread}/{s.total})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => {
              setUnreadOnly(e.target.checked);
              setPage(1);
            }}
            className="accent-sky-500"
          />
          Sadece okunmamış
        </label>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {data?.items.length === 0 && (
          <li className="p-8 text-center text-sm text-zinc-500">Mesaj yok</li>
        )}
        {data?.items.map((msg: Message) => {
          const expanded = expandedId === msg.id;
          return (
            <li key={msg.id}>
              <button
                onClick={() => setExpandedId(expanded ? null : msg.id)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left transition hover:bg-zinc-800/50 sm:flex-nowrap"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${msg.read ? 'bg-transparent' : 'bg-sky-400'}`}
                />
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${siteBadgeClass(msg.site)}`}
                >
                  {msg.site}
                </span>
                <span className={`shrink-0 text-sm ${msg.read ? 'text-zinc-400' : 'font-medium'}`}>
                  {msg.name}
                </span>
                <span className="hidden shrink-0 text-sm text-zinc-500 sm:inline">{msg.email}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">{msg.message}</span>
                <span className="ml-auto shrink-0 text-xs text-zinc-600">
                  {formatDate(msg.createdAt)}
                </span>
              </button>
              {expanded && (
                <div className="border-t border-zinc-800/70 bg-zinc-950/50 p-4">
                  <div className="mb-3 text-sm text-zinc-400">
                    <a href={`mailto:${msg.email}`} className="text-sky-400 hover:underline">
                      {msg.email}
                    </a>
                    {msg.ip && <span className="ml-3 text-zinc-600">IP: {msg.ip}</span>}
                  </div>
                  <p className="mb-4 text-sm whitespace-pre-wrap">{msg.message}</p>
                  <div className="flex gap-2">
                    {!msg.read && (
                      <button
                        onClick={() => void markRead(msg.id)}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium transition hover:bg-sky-500"
                      >
                        Okundu işaretle
                      </button>
                    )}
                    <button
                      onClick={() => void remove(msg.id)}
                      className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-sm text-rose-400 transition hover:bg-rose-500/10"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {data && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 transition hover:bg-zinc-900 disabled:opacity-40"
          >
            ← Önceki
          </button>
          <span>
            Sayfa {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 transition hover:bg-zinc-900 disabled:opacity-40"
          >
            Sonraki →
          </button>
        </div>
      )}
    </div>
  );
}
