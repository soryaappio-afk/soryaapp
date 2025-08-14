"use client";
import Link from 'next/link';
import React from 'react';
import { signOut } from 'next-auth/react';

interface Props {
    credits?: number;
    session?: any;
    minimal?: boolean; // if we later want to reuse on auth pages etc
}

export default function Navbar({ credits, session, minimal }: Props) {
    return (
        <nav style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '0.85rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-alt)',
            position: 'sticky',
            top: 0,
            zIndex: 40
        }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', lineHeight: 0 }}>
                <img src="/sorya-logo.png" alt="Sorya" className="brand-logo" style={{ height: 32, width: 'auto', display: 'block' }} />
            </Link>
            {!minimal && (
                <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                    <Link href="/dashboard">Dashboard</Link>
                    <Link href="/projects">Projects</Link>
                </div>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
                {typeof credits === 'number' && (
                    <div style={{ fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', padding: '.35rem .6rem', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ opacity: .65 }}>Credits</span>
                        <strong style={{ fontSize: 12 }}>{credits}</strong>
                    </div>
                )}
                {session?.user && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, opacity: .75, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.user.email}</span>
                        <button type="button" onClick={() => signOut()} style={{ fontSize: 11, padding: '.4rem .7rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer' }}>Sign out</button>
                    </div>
                )}
                {!session?.user && (
                    <Link href="/login" style={{ fontSize: 12 }}>Sign in</Link>
                )}
            </div>
        </nav>
    );
}
