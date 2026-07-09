import { useCallback, useEffect, useState } from 'react';
import { api, UnauthorizedError } from './api';
import Login from './Login';
import Messages from './Messages';
import type { SiteStats } from './types';

type AuthState = 'checking' | 'in' | 'out';

export default function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [stats, setStats] = useState<SiteStats[]>([]);

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

  if (auth === 'checking') {
    return <div className="flex min-h-screen items-center justify-center text-zinc-500">Yükleniyor…</div>;
  }

  if (auth === 'out') {
    return <Login onSuccess={() => void refreshStats()} />;
  }

  return (
    <Messages
      stats={stats}
      onStatsChange={() => void refreshStats()}
      onLogout={() => setAuth('out')}
    />
  );
}
