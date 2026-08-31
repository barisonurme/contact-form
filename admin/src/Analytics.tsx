import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { PageviewGroupBy, PageviewStats, SiteStats } from './types';

const RANGES = [
  { label: 'Son 7 gün', days: 7 },
  { label: 'Son 30 gün', days: 30 },
  { label: 'Son 90 gün', days: 90 },
];

const GROUPS: { id: PageviewGroupBy; label: string }[] = [
  { id: 'path', label: 'Sayfa' },
  { id: 'referrer', label: 'Kaynak' },
  { id: 'country', label: 'Ülke' },
  { id: 'region', label: 'Bölge' },
  { id: 'device', label: 'Cihaz' },
  { id: 'browser', label: 'Tarayıcı' },
  { id: 'day', label: 'Gün' },
];

const DEVICE_TR: Record<string, string> = {
  mobile: 'Mobil',
  tablet: 'Tablet',
  desktop: 'Masaüstü',
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const fmtNum = (n: number) => n.toLocaleString('tr-TR');

function fmtKey(key: string, groupBy: PageviewGroupBy): string {
  if (groupBy === 'referrer') return key === '' ? 'Doğrudan' : key;
  if (groupBy === 'country' || groupBy === 'region') return key === '' ? 'Bilinmiyor' : key;
  if (groupBy === 'device') return DEVICE_TR[key] ?? key;
  if (groupBy === 'browser') return key === '' || key === 'Other' ? 'Diğer' : key;
  if (groupBy === 'day') {
    return new Date(`${key}T00:00:00Z`).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
    });
  }
  return key;
}

const pill = (active: boolean) =>
  `rounded-md px-3 py-1 text-sm font-medium transition ${
    active ? 'bg-sky-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
  }`;

function StatTile({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</div>
      <div
        className={`mt-1.5 text-2xl font-semibold tabular-nums ${loading ? 'animate-pulse text-zinc-700' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

interface Props {
  stats: SiteStats[];
}

export default function Analytics({ stats }: Props) {
  const siteOptions = useMemo(() => stats.map((s) => s.site), [stats]);
  const [site, setSite] = useState(siteOptions[0] ?? '');
  const [rangeDays, setRangeDays] = useState(30);
  const [groupBy, setGroupBy] = useState<PageviewGroupBy>('path');
  const [data, setData] = useState<PageviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!site && siteOptions.length > 0) setSite(siteOptions[0]);
  }, [siteOptions, site]);

  const { from, to } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - rangeDays + 1);
    return { from: ymd(start), to: ymd(now) };
  }, [rangeDays]);

  const load = useCallback(async () => {
    if (!site) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ site, from, to, groupBy });
      setData(await api<PageviewStats>(`/api/pageview/stats?${params}`));
    } catch (err) {
      setError((err as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [site, from, to, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const list = data?.breakdown ?? [];
    if (groupBy === 'day') return [...list].sort((a, b) => a.key.localeCompare(b.key));
    return list.slice(0, 50);
  }, [data, groupBy]);

  const maxViews = rows.reduce((m, r) => Math.max(m, r.views), 0) || 1;
  const perVisitor =
    data && data.uniqueVisitors > 0 ? (data.totalViews / data.uniqueVisitors).toFixed(1) : '—';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analitik</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Sayfa görüntülenmeleri ve tekil ziyaretçiler</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
        >
          <span className={loading ? 'inline-block animate-spin' : undefined}>↻</span>
          Yenile
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {siteOptions.length > 0 ? (
          <select
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none transition focus:border-sky-500"
          >
            {siteOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="site id"
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none transition focus:border-sky-500"
          />
        )}

        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setRangeDays(r.days)} className={pill(rangeDays === r.days)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Görüntülenme" value={data ? fmtNum(data.totalViews) : '—'} loading={loading} />
        <StatTile
          label="Tekil ziyaretçi"
          value={data ? fmtNum(data.uniqueVisitors) : '—'}
          loading={loading}
        />
        <StatTile label="Ziyaretçi başına" value={perVisitor} loading={loading} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <span className="text-sm font-medium text-zinc-300">Dağılım</span>
          <div className="flex flex-wrap gap-0.5 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
            {GROUPS.map((g) => (
              <button key={g.id} onClick={() => setGroupBy(g.id)} className={pill(groupBy === g.id)}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-2">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              {loading ? 'Yükleniyor…' : 'Bu aralıkta veri yok'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {rows.map((r) => (
                <li
                  key={r.key || '∅'}
                  className="relative flex items-center gap-3 overflow-hidden rounded-lg px-2.5 py-2"
                >
                  <div
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-lg bg-sky-500/10"
                    style={{ width: `${(r.views / maxViews) * 100}%` }}
                  />
                  <span className="relative min-w-0 flex-1 truncate text-sm text-zinc-300">
                    {fmtKey(r.key, groupBy)}
                  </span>
                  <span className="relative shrink-0 text-sm font-medium tabular-nums">
                    {fmtNum(r.views)}
                  </span>
                  <span className="relative w-20 shrink-0 text-right text-xs text-zinc-500 tabular-nums">
                    {fmtNum(r.uniques)} tekil
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-zinc-600">
        {from} – {to} · UTC · ilk 50 satır · 90 günden eski veri günlük özetlerden gelir
      </p>
    </div>
  );
}
