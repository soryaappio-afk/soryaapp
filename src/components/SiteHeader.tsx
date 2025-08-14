"use client";
import React, { useState, useEffect, useRef } from 'react';
import DashboardIcon from '@mui/icons-material/DashboardCustomize';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpCenterIcon from '@mui/icons-material/HelpCenter';
import LogoutIcon from '@mui/icons-material/Logout';
import PaletteIcon from '@mui/icons-material/Palette';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';
import { signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';

interface Props {
    session: any;
    credits: number | null;
}

const LOW_CREDIT_THRESHOLD = 200;

export default function SiteHeader({ session, credits }: Props) {
    const pathname = usePathname();
    function segmentLabel(seg: string) {
        if (!seg) return '';
        return seg.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    const segments = pathname?.split('/').filter(Boolean) || [];
    const primary = segments[0] || '';
    const pageMap: Record<string, string> = { dashboard: 'Dashboard', projects: 'Projects', register: 'Register', login: 'Login' };
    const pageLabel = pageMap[primary] || (primary ? segmentLabel(primary) : '');
    const showBack = pathname && pathname !== '/' && pathname !== '';
    const [open, setOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const balance = credits;
    const low = typeof balance === 'number' && balance <= LOW_CREDIT_THRESHOLD;
    const INITIAL_GRANT = typeof window !== 'undefined' ? (parseInt(process.env.NEXT_PUBLIC_CREDIT_INITIAL_GRANT || '1000', 10)) : 1000;
    const used = typeof balance === 'number' ? INITIAL_GRANT - balance : null;
    const pct = typeof balance === 'number' ? Math.max(0, Math.min(100, (balance / INITIAL_GRANT) * 100)) : 0;
    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(typeof window !== 'undefined' && (window.localStorage.getItem('theme') as any) || 'system');
    const [appearanceOpen, setAppearanceOpen] = useState(false);

    useEffect(() => {
        const root = document.documentElement;
        const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const finalTheme = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme;
        root.setAttribute('data-theme', finalTheme);
        window.localStorage.setItem('theme', theme);
    }, [theme]);
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        function l() { if (theme === 'system') setTheme('system'); }
        mq.addEventListener('change', l); return () => mq.removeEventListener('change', l);
    }, [theme]);
    useEffect(() => {
        function onDoc(e: MouseEvent) { if (!menuRef.current) return; if (!menuRef.current.contains(e.target as Node)) setOpen(false); }
        if (open) document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const ThemeOption = ({ value, label }: { value: 'light' | 'dark' | 'system'; label: string }) => {
        const Icon = value === 'light' ? LightModeIcon : value === 'dark' ? DarkModeIcon : BrightnessAutoIcon;
        return (
            <button onClick={() => setTheme(value)} style={{ ...menuItemStyle, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: theme === value ? 'var(--accent)' : 'var(--text)' }}>
                <Icon sx={{ fontSize: 16 }} />
                <span style={{ flex: 1 }}>{label}</span>
                {theme === value && <span style={{ fontSize: 12 }}>•</span>}
            </button>
        );
    };

    return (
        <>
            <header style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-alt)', position: 'sticky', top: 0, zIndex: 50, gap: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
                    <a href="/" style={{ display: 'flex', alignItems: 'center', lineHeight: 0 }}>
                        <img src="/sorya-logo.png" alt="Sorya" className="brand-logo" style={{ height: 30, width: 'auto', display: 'block' }} />
                    </a>
                    {showBack && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, textDecoration: 'none', color: 'var(--text-dim)', padding: '.3rem .55rem', border: '1px solid var(--border)', borderRadius: 20 }}>
                                <ArrowBackIcon sx={{ fontSize: 14 }} /> Home
                            </a>
                            {pageLabel && <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 140 }}>{pageLabel}{segments.length > 1 && segments[1] ? ' / ' + segmentLabel(segments[1]) : ''}</div>}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', position: 'relative' }} ref={menuRef}>
                    {!session?.user && (
                        <>
                            <a href="/login" style={{ fontSize: 14, fontWeight: 500 }}>Login</a>
                            <a href="/register" style={{ background: '#111', color: '#fff', padding: '.55rem .95rem', borderRadius: 6, fontSize: 14, fontWeight: 600 }}>Get Started</a>
                        </>
                    )}
                    {session?.user && (
                        <>
                            <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border)', padding: '.35rem .55rem .35rem .45rem', borderRadius: 30, cursor: 'pointer' }}>
                                <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#111', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{(session.user.email || '?')[0].toUpperCase()}</span>
                                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.email}</span>
                                <span style={{ fontSize: 10 }}>▾</span>
                            </button>
                            {open && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 14, minWidth: 270, boxShadow: '0 8px 28px rgba(0,0,0,0.25)', padding: '.65rem .65rem .75rem', display: 'flex', flexDirection: 'column', zIndex: 60, gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.25rem .35rem .4rem' }}>
                                        <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#111', color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{(session.user.email || '?')[0].toUpperCase()}</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{session.user.email}</span>
                                            {credits != null && <span style={{ fontSize: 11, color: low ? '#b45309' : 'var(--text-dim)' }}>{credits} credits left</span>}
                                        </div>
                                    </div>
                                    {credits != null && (
                                        <div style={{ padding: '.3rem .4rem .55rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <div style={{ height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                                                <div style={{ width: pct + '%', background: low ? '#f59e0b' : '#111', height: '100%', transition: 'width .3s' }} />
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Used {used}</span>
                                                <span>{credits}/{INITIAL_GRANT}</span>
                                            </div>
                                        </div>
                                    )}
                                    <MenuLink href="/dashboard" icon={<DashboardIcon sx={{ fontSize: 18 }} />} label="Dashboard" />
                                    <button onClick={() => { setShowSettings(true); setOpen(false); }} style={{ ...menuItemStyle, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}><SettingsIcon sx={{ fontSize: 18 }} /><span style={{ flex: 1 }}>Settings</span></button>
                                    <MenuLink href="/help" icon={<HelpCenterIcon sx={{ fontSize: 18 }} />} label="Help Center" />
                                    <div style={{ position: 'relative' }}>
                                        <button onClick={() => setAppearanceOpen(o => !o)} style={{ ...menuItemStyle, width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <PaletteIcon sx={{ fontSize: 18 }} />
                                            <span style={{ flex: 1 }}>Appearance</span>
                                            <span style={{ fontSize: 11 }}>{appearanceOpen ? '▾' : '▸'}</span>
                                        </button>
                                        {appearanceOpen && (
                                            <div style={{ marginLeft: 30, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <ThemeOption value='light' label='Light' />
                                                <ThemeOption value='dark' label='Dark' />
                                                <ThemeOption value='system' label='System' />
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ height: 1, background: 'var(--border)', margin: '.25rem 0' }} />
                                    <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ ...menuItemStyle, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <LogoutIcon sx={{ fontSize: 18 }} />
                                        <span style={{ flex: 1 }}>Logout</span>
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </header>
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </>
    );
}

function MenuLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return <a href={href} style={{ ...menuItemStyle, display: 'flex', alignItems: 'center', gap: 10 }}>{icon}<span style={{ flex: 1 }}>{label}</span></a>;
}

function SettingsModal({ onClose }: { onClose: () => void }) {
    const [tab, setTab] = useState<'tokens' | 'password'>('tokens');
    const [githubToken, setGithubToken] = useState('');
    const [vercelToken, setVercelToken] = useState('');
    const [savingTokens, setSavingTokens] = useState(false);
    const [tokensSaved, setTokensSaved] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [savingPass, setSavingPass] = useState(false);
    const [passSaved, setPassSaved] = useState(false);
    const [passError, setPassError] = useState<string | null>(null);

    async function saveTokens() {
        setSavingTokens(true); setTokensSaved(false);
        try {
            const res = await fetch('/api/settings/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ githubToken, vercelToken }) });
            if (res.ok) setTokensSaved(true);
        } finally { setSavingTokens(false); }
    }
    async function changePassword() {
        setSavingPass(true); setPassSaved(false); setPassError(null);
        try {
            const res = await fetch('/api/settings/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
            if (res.ok) { setPassSaved(true); setCurrentPassword(''); setNewPassword(''); }
            else { const data = await res.json().catch(() => ({})); setPassError(data.error || 'Error changing password'); }
        } finally { setSavingPass(false); }
    }

    return (
        <div style={overlayStyle}>
            <div style={{ ...modalStyle, maxWidth: 720, width: '100%', flexDirection: 'row', padding: 0 }}>
                <div style={{ width: 180, borderRight: '1px solid #eee', padding: '1rem .75rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={() => setTab('tokens')} style={{ ...settingsTabStyle, background: tab === 'tokens' ? '#111' : 'transparent', color: tab === 'tokens' ? '#fff' : '#111' }}>Integration Tokens</button>
                    <button onClick={() => setTab('password')} style={{ ...settingsTabStyle, background: tab === 'password' ? '#111' : 'transparent', color: tab === 'password' ? '#fff' : '#111' }}>Change Password</button>
                    <div style={{ flex: 1 }} />
                    <button onClick={onClose} style={{ ...settingsTabStyle, marginTop: 'auto', background: '#f5f5f5', color: '#111' }}>Close</button>
                </div>
                <div style={{ flex: 1, padding: '1.25rem 1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {tab === 'tokens' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <h3 style={{ margin: 0 }}>Integration Tokens</h3>
                            <div>
                                <label style={labelStyle}>GitHub Personal Access Token (repo scope)</label>
                                <input value={githubToken} onChange={e => setGithubToken(e.target.value)} placeholder="ghp_..." style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Vercel Token</label>
                                <input value={vercelToken} onChange={e => setVercelToken(e.target.value)} placeholder="vercel_..." style={inputStyle} />
                            </div>
                            <div style={{ fontSize: 11, color: '#666' }}>Tokens stored server-side. (Future: encrypted). Never shared with other users.</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button onClick={saveTokens} disabled={savingTokens} style={{ ...primaryBtnStyle, opacity: savingTokens ? .7 : 1 }}>{savingTokens ? 'Saving...' : tokensSaved ? 'Saved' : 'Save Tokens'}</button>
                            </div>
                        </div>
                    )}
                    {tab === 'password' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <h3 style={{ margin: 0 }}>Change Password</h3>
                            <div>
                                <label style={labelStyle}>Current Password</label>
                                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>New Password (min 8 chars)</label>
                                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} />
                            </div>
                            {passError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{passError}</div>}
                            {passSaved && <div style={{ fontSize: 12, color: '#065f46' }}>Password updated.</div>}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button onClick={changePassword} disabled={savingPass || !currentPassword || !newPassword} style={{ ...primaryBtnStyle, opacity: savingPass ? .7 : 1 }}>{savingPass ? 'Saving...' : passSaved ? 'Saved' : 'Update Password'}</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Styles
const menuItemStyle: React.CSSProperties = { fontSize: 13, padding: '.55rem .75rem', color: 'var(--text)', textDecoration: 'none', display: 'block', borderRadius: 8 };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-alt)', borderRadius: 14, padding: '1.5rem 1.4rem 1.25rem', width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', color: 'var(--text)' };
const primaryBtnStyle: React.CSSProperties = { background: '#111', color: '#fff', textDecoration: 'none', padding: '.55rem .95rem', borderRadius: 8, fontSize: 13, fontWeight: 600 };
const settingsTabStyle: React.CSSProperties = { border: 'none', borderRadius: 6, padding: '.55rem .6rem', fontSize: 12, textAlign: 'left', cursor: 'pointer' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 600 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '.55rem .7rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 13 };
