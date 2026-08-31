import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { SiteStats, VisitorSession, VisitorsResponse } from './types';

const DEVICE_TR: Record<string, string> = {
  mobile: 'Mobil',
  tablet: 'Tablet',
  desktop: 'Masaüstü',
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const fmtNum = (n: number) => n.toLocaleString('tr-TR');

const timeOpts: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', timeOpts);
const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString('tr-TR', { ...timeOpts, second: '2-digit' });

/** Human label for a device/browser token; empty and "Other" collapse to "Diğer". */
function label(value: string, tr?: Record<string, string>): string {
  if (!value || value === 'Other') return 'Diğer';
  return tr?.[value] ?? value;
}

function place(country: string, region: string): string {
  if (!country) return 'Bilinmiyor';
  return region ? `${country}/${region}` : country;
}

interface Props {
  stats: SiteStats[];
}

export default function Visitors({ stats }: Props) {
  const siteOptions = useMemo(() => stats.map((s) => s.site), [stats]);
  const [site, setSite] = useState(siteOptions[0] ?? '');
  const [day, setDay] = useState(ymd(new Date()));
  const [data, setData] = useState<VisitorsResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [session, setSession] = useState<VisitorSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!site && siteOptions.length > 0) setSite(siteOptions[0]);
  }, [siteOptions, site]);

  const minDay = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 89);
    return ymd(d);
  }, []);
  const maxDay = ymd(new Date());

  const load = useCallback(async () => {
    if (!site) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);
    setSession(null);
    try {
      const params = new URLSearchParams({ site, day });
      setData(await api<VisitorsResponse>(`/api/pageview/stats/visitors?${params}`));
    } catch (err) {
      setError((err as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [site, day]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSession = useCallback(
    async (hash: string) => {
      setSelected(hash);
      setSession(null);
      setError(null);
      try {
        const params = new URLSearchParams({ site, day });
        setSession(await api<VisitorSession>(`/api/pageview/stats/visitors/${hash}?${params}`));
      } catch (err) {
        setError((err as Error).message);
        setSelected(null);
      }
    },
    [site, day],
  );

  const visitors = data?.visitors ?? [];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ziyaretçiler</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Seçilen güne ait tekil ziyaretçiler ve sayfa gezinmeleri
          </p>
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
        <input
          type="date"
          value={day}
          min={minDay}
          max={maxDay}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none transition focus:border-sky-500 [color-scheme:dark]"
        />
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {data?.stale && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Bu tarih 90 günlük saklama penceresinin dışında — ham ziyaretçi kayıtları özetlere
          taşınmış olabilir.
        </p>
      )}

      {selected ? (
        <Session
          hash={selected}
          session={session}
          onBack={() => {
            setSelected(null);
            setSession(null);
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 text-sm">
            <span className="font-medium text-zinc-300">
              {visitors.length > 0
                ? `${fmtNum(visitors.length)} tekil ziyaretçi`
                : 'Ziyaretçiler'}
            </span>
            <span className="text-xs text-zinc-600">{day} · UTC</span>
          </div>
          {visitors.length === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-500">
              {loading ? 'Yükleniyor…' : 'Bu güne ait ziyaretçi yok'}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {visitors.map((v) => (
                <li key={v.hash}>
                  <button
                    onClick={() => void openSession(v.hash)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left transition hover:bg-zinc-800/50 sm:flex-nowrap"
                  >
                    <span className="shrink-0 font-mono text-xs text-sky-300">
                      {v.hash.slice(0, 10)}
                    </span>
                    <span className="shrink-0 text-sm text-zinc-400">
                      {place(v.country, v.region)}
                    </span>
                    <span className="hidden shrink-0 text-sm text-zinc-500 sm:inline">
                      {label(v.device, DEVICE_TR)} · {label(v.browser)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">
                      {fmtTime(v.firstSeen)} – {fmtTime(v.lastSeen)}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-zinc-500 tabular-nums">
                      {fmtNum(v.views)} görüntülenme · {fmtNum(v.paths)} sayfa
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-zinc-600">
        Ziyaretçi kimliği günlük dönen anonim bir karma — aynı kişi ertesi gün farklı görünür, IP
        veya tarayıcı bilgisi saklanmaz. En fazla 500 ziyaretçi listelenir.
      </p>
    </div>
  );
}

function Session({
  hash,
  session,
  onBack,
}: {
  hash: string;
  session: VisitorSession | null;
  onBack: () => void;
}) {
  const first = session?.hits[0];
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-zinc-800 px-2.5 py-1 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
        >
          ← Geri
        </button>
        <span className="truncate font-mono text-xs text-sky-300">{hash}</span>
      </div>

      {!session ? (
        <p className="p-8 text-center text-sm text-zinc-500">Yükleniyor…</p>
      ) : (
        <ol className="divide-y divide-zinc-800">
          {session.hits.map((h, i) => (
            <li
              key={`${h.at}-${i}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 p-3"
            >
              <span className="shrink-0 text-xs text-zinc-600 tabular-nums">{fmtClock(h.at)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{h.path}</span>
              {h.referrer && (
                <span className="w-full truncate text-xs text-zinc-600 sm:w-auto sm:max-w-[40%]">
                  ← {h.referrer}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {first && (
        <div className="border-t border-zinc-800 px-4 py-2.5 text-xs text-zinc-600">
          {label(first.device, DEVICE_TR)} · {label(first.browser)} ·{' '}
          {place(first.country, first.region)} · {fmtNum(session!.hits.length)} görüntülenme
        </div>
      )}
    </div>
  );
}
