"use client";
import { signIn } from 'next-auth/react';
import OAuthButton from '@/src/app/components/OAuthButton';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/src/app/components/Toast';

export default function LoginPage() {
    const { push } = useToast();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        const res = await signIn('credentials', { email, password, redirect: false });
        setLoading(false);
        if (res?.ok) router.push('/dashboard');
        else {
            push({ kind: 'error', message: 'Login failed. If you registered with email/password, use that form not Google/GitHub.' });
        }
    }

    return (
        <div className="auth-shell">
            <div className="auth-left">
                <div className="auth-panel">
                    <h1>Welcome back</h1>
                    <p className="sub">Access your AI-generated projects.</p>
                    <form onSubmit={onSubmit}>
                        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} type="email" required />
                        <input placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} type="password" required />
                        <button disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                            <OAuthButton provider="github" label="Continue with GitHub" onClick={() => signIn('github', { callbackUrl: '/dashboard' })} />
                            <OAuthButton provider="google" label="Continue with Google" onClick={() => signIn('google', { callbackUrl: '/dashboard' })} />
                        </div>
                        <div className="alt-link">No account? <a href="/register">Create one</a></div>
                    </form>
                </div>
            </div>
            <div className="auth-right">
                <div className="auth-gradient-bg" />
                <div className="auth-overlay" />
                <div className="auth-right-inner">
                    <div className="auth-brand">Sorya</div>
                    <div className="auth-hero-copy">
                        <h2>Ship ideas instantly</h2>
                        <p>Describe your product. Watch the repo scaffold itself and iterate in real-time.</p>
                    </div>
                    <div className="auth-footer">© {new Date().getFullYear()} Sorya. All rights reserved.</div>
                </div>
            </div>
        </div>
    );
}
