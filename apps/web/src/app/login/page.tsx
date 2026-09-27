'use client';

import { FormEvent, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import './login.css';
import './connection.css';

const apiUrl = API_BASE_URL;

export default function LoginPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    fetch(`${apiUrl}/health`, { credentials: 'include' }).then(response => setApiStatus(response.ok ? 'online' : 'offline')).catch(() => setApiStatus('offline'));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const response = await fetch(`${apiUrl}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Sign in failed.');
      if (body.token) {
        document.cookie = `sanode_access=${body.token}; path=/; max-age=28800; SameSite=Lax; Secure`;
        try { localStorage.setItem('sanode_token', body.token); } catch {}
      }
      window.location.href = '/';
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign in failed.');
    } finally { setBusy(false); }
  }

  return <main className="login-page"><section className="login-card"><div className="brand login-brand"><div className="brand-mark">S</div><span>Sanode<span className="brand-muted">Ops</span></span></div><p className="eyebrow">Secure workspace</p><h1>Welcome back</h1><p className="login-copy">Sign in to manage stock, batches, dispatches, and MR samples.</p><div className={`api-status api-${apiStatus}`}><span />{apiStatus === 'checking' ? 'Checking service connection…' : apiStatus === 'online' ? 'Service connected' : 'Web app is online; API/database is not connected'}</div><form onSubmit={submit}><label>Work email<input name="email" type="email" autoComplete="email" placeholder="admin@sanodehealthcare.com" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><p className="form-message" aria-live="polite">{error}</p><button className="submit-button login-submit" disabled={busy || apiStatus === 'offline'}>{busy ? 'Signing in…' : apiStatus === 'offline' ? 'Start API to sign in' : 'Sign in'}</button></form>{apiStatus === 'offline' && process.env.NODE_ENV !== 'production' && <a className="preview-link" href="/">Open preview workspace</a>}</section></main>;
}
