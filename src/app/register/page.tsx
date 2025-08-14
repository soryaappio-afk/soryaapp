"use client";
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import OAuthButton from '@/src/app/components/OAuthButton';
import { useToast } from '@/src/app/components/Toast';

export default function RegisterPage() {
    const { push } = useToast();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (password !== confirm) { setError('Passwords do not match'); return; }
        setLoading(true);
        const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        setLoading(false);
        if (res.ok) {
            // Auto-login immediately after registration
            const loginRes = await signIn('credentials', { email, password, redirect: false });
            if (loginRes?.ok) window.location.href = '/dashboard';
            else window.location.href = '/login';
        } else {
            const data = await res.json().catch(() => ({}));
            if (data.error === 'Exists') {
                push({ kind: 'warning', message: 'Account already exists. Sign in with your email & password (not Google/GitHub).' });
            }
            setError(data.error || 'Failed');
        }
    }

    return (
        <div className="auth-shell">
            <div className="auth-left">
                <div className="auth-panel">
                    <h1>Create account</h1>
                    <p className="sub">Start generating full-stack apps in seconds.</p>
                    <form onSubmit={onSubmit}>
                        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} type="email" required />
                        <input placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={6} />
                        <input placeholder="Confirm Password" value={confirm} onChange={e => setConfirm(e.target.value)} type="password" required minLength={6} />
                        {error && <div className="error">{error}</div>}
                        <button disabled={loading}>{loading ? 'Creating…' : 'Create account'}</button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                            <OAuthButton provider="github" label="Continue with GitHub" onClick={() => signIn('github', { callbackUrl: '/dashboard' })} />
                            <OAuthButton provider="google" label="Continue with Google" onClick={() => signIn('google', { callbackUrl: '/dashboard' })} />
                        </div>
                        <div className="alt-link">Already have an account? <a href="/login">Sign in</a></div>
                    </form>
                </div>
            </div>
            <div className="auth-right">
                <div className="auth-gradient-bg" />
                <div className="auth-overlay" />
                <div className="auth-right-inner">
                    <div className="auth-brand">Sorya</div>
                    <div className="auth-hero-copy">
                        <h2>From idea to repo</h2>
                        <p>Your prompt is all you need. Generate, preview, iterate, deploy.</p>
                    </div>
                    <div className="auth-footer">© {new Date().getFullYear()} Sorya. All rights reserved.</div>
                </div>
            </div>
        </div>
    );
}
