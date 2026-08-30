import { useCallback, useEffect, useState } from 'react';
import { api, UnauthorizedError } from './api';
import Analytics from './Analytics';
import Layout, { type Tab } from './Layout';
import Login from './Login';
import Messages from './Messages';
import type { SiteStats } from './types';

type AuthState = 'checking' | 'in' | 'out';

export default function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [stats, setStats] = useState<SiteStats[]>([]);
  const [tab, setTab] = useState<Tab>('messages');

  const refreshStats = useCallback(async () => {
    try {
      const { stats } = await api<{ stats: SiteStats[] }>('/api/admin/stats');
      setStats(stats);
      setAuth('in');
    } catch (err) {
      if (err instanceof UnauthorizedError) setAuth('out');
      else throw err;
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  async function logout() {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    setAuth('out');
  }

  if (auth === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Yükleniyor…
      </div>
    );
  }

  if (auth === 'out') {
    return <Login onSuccess={() => void refreshStats()} />;
  }

  const totalUnread = stats.reduce((sum, s) => sum + s.unread, 0);

  return (
    <Layout tab={tab} onTab={setTab} onLogout={() => void logout()} unread={totalUnread}>
      {tab === 'messages' ? (
        <Messages stats={stats} onStatsChange={() => void refreshStats()} />
      ) : (
        <Analytics stats={stats} />
      )}
    </Layout>
  );
}
