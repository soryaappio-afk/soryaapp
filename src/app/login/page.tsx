"use client";
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
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
        else alert('Login failed');
    }

    return (
        <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
            <form onSubmit={onSubmit} style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h1>Login</h1>
                <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} type="email" required />
                <input placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} type="password" required />
                <button disabled={loading}>{loading ? '...' : 'Login'}</button>
            </form>
        </main>
    );
}
