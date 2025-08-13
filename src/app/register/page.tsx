"use client";
import { useState } from 'react';

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (password !== confirm) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        setLoading(false);
        if (res.ok) window.location.href = '/login';
        else {
            const data = await res.json().catch(() => ({}));
            setError(data.error || 'Failed');
        }
    }

    return (
        <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
            <form onSubmit={onSubmit} style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h1>Create your account</h1>
                <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} type="email" required />
                <input placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={6} />
                <input placeholder="Confirm Password" value={confirm} onChange={e => setConfirm(e.target.value)} type="password" required minLength={6} />
                {error && <div style={{ color: 'crimson', fontSize: 12 }}>{error}</div>}
                <button disabled={loading}>{loading ? '...' : 'Create account'}</button>
                <p style={{ fontSize: 12 }}>Already have an account? <a href="/login">Login</a></p>
            </form>
        </main>
    );
}
