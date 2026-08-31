import { useState, type FormEvent } from 'react';
import { api, UnauthorizedError } from './api';

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/login/request', { method: 'POST' });
      setStep('verify');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      onSuccess();
    } catch (err) {
      setError(
        err instanceof UnauthorizedError
          ? 'Kod hatalı veya süresi doldu'
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-sky-500/10 via-sky-500/3 to-transparent"
      />
      <form
        onSubmit={handleVerify}
        className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl shadow-black/30"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-sky-600 text-sm font-bold text-white shadow-lg shadow-sky-600/25">
            C
          </div>
          <h1 className="text-base font-semibold tracking-tight">Contact Admin</h1>
        </div>

        {step === 'request' ? (
          <>
            <p className="mb-4 text-sm text-zinc-400">
              Giriş için e-posta adresine tek kullanımlık bir kod gönderilir.
            </p>
            {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}
            <button
              type="button"
              onClick={() => void requestCode()}
              disabled={busy}
              className="w-full rounded-lg bg-sky-600 py-2 font-medium transition hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? 'Gönderiliyor…' : 'E-posta ile kod gönder'}
            </button>
          </>
        ) : (
          <>
            <label className="mb-2 block text-sm text-zinc-400" htmlFor="code">
              E-posta adresine gönderilen 6 haneli kod
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
              className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 tracking-[0.4em] outline-none transition focus:border-sky-500"
            />
            {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="w-full rounded-lg bg-sky-600 py-2 font-medium transition hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </button>
            <button
              type="button"
              onClick={() => void requestCode()}
              disabled={busy}
              className="mt-3 w-full text-center text-sm text-zinc-400 transition hover:text-zinc-200 disabled:opacity-50"
            >
              Kodu tekrar gönder
            </button>
          </>
        )}
      </form>
    </div>
  );
}
