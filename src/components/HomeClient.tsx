"use client";
import { useState, useMemo, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import SiteHeader from '@/src/components/SiteHeader';
// icons for runtime UI not moved to SiteHeader remained
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { useRouter } from 'next/navigation';

interface Project { id: string; name: string; type?: string | null; typeConfidence?: number | null; typeManualOverride?: boolean; deploymentUrl?: string | null; createdAt: string; status?: string | null }
interface Props { session: any; projects: Project[]; credits: number | null }

const STATUSES = ['NEW', 'DEPLOYING', 'LIVE', 'ERROR'] as const; // moved to dashboard (status filter hidden on landing)
const TAGS = ['Internal tools', 'Website', 'Personal', 'Consumer App', 'B2B App', 'Prototype'];

export default function HomeClient({ session, projects, credits }: Props) {
    // convert incoming projects to state for live updates
    const [projectList, setProjectList] = useState<Project[]>(projects);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [wasAborted, setWasAborted] = useState(false);
    const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
    const [filter, setFilter] = useState<string | null>(null); // type filter
    // status filter removed from landing page; reserved for dashboard
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [laneMode, setLaneMode] = useState<boolean>(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creditBalance, setCreditBalance] = useState<number | null>(credits);
    const router = useRouter();
    const [activeSteps, setActiveSteps] = useState<any[]>([]);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const promptRef = useRef<HTMLTextAreaElement | null>(null);
    const [isFocused, setIsFocused] = useState(false);
    // responsive mobile detection
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        function handleResize() { setIsMobile(window.innerWidth <= 640); }
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    // amount of project panel revealed (desktop only)
    const [revealHeight, setRevealHeight] = useState(0);
    useEffect(() => {
        if (!isMobile) {
            setRevealHeight(Math.round(window.innerHeight * 0.20)); // 20% of viewport
        } else {
            setRevealHeight(0);
        }
    }, [isMobile]);
    const phrases = [
        'Create a dApp to mint ERC-721 NFTs with royalty support...',
        'Build a DeFi dashboard showing wallet balances, staking APY & gas fees...',
        'Create a DAO governance portal with proposal creation & on-chain voting...',
        'Build a token-gated community site using ERC-1155 access passes...',
        'Create a cross-chain portfolio tracker for Ethereum, Polygon & Solana...',
        'Build a decentralized crowdfunding platform with milestone releases...',
        'Create an NFT analytics explorer with floor price charts & trait filters...'
    ];
    const [typedPlaceholder, setTypedPlaceholder] = useState('');
    const [phraseIndex, setPhraseIndex] = useState(0);
    const typingDirectionRef = useRef<'forward' | 'backward'>('forward');
    const charRef = useRef(0);
    const holdTimeoutRef = useRef<any>(null);

    // typing placeholder effect (type -> hold -> delete -> next)
    useEffect(() => {
        if (prompt.length > 0) { setTypedPlaceholder(''); return; }
        let active = true;
        function schedule(nextDelay: number) { if (!active) return; setTimeout(step, nextDelay); }
        function step() {
            if (!active) return;
            const phrase = phrases[phraseIndex];
            if (typingDirectionRef.current === 'forward') {
                if (charRef.current <= phrase.length) {
                    setTypedPlaceholder(phrase.slice(0, charRef.current));
                    charRef.current += 1;
                    if (charRef.current <= phrase.length) schedule(32); else { // reached end
                        holdTimeoutRef.current = setTimeout(() => { typingDirectionRef.current = 'backward'; schedule(20); }, 1200); // short hold
                    }
                }
            } else { // deleting
                if (charRef.current >= 0) {
                    setTypedPlaceholder(phrase.slice(0, charRef.current));
                    charRef.current -= 1;
                    if (charRef.current >= 0) schedule(18); else {
                        typingDirectionRef.current = 'forward';
                        charRef.current = 0;
                        setPhraseIndex(i => (i + 1) % phrases.length);
                        schedule(50);
                    }
                }
            }
        }
        schedule(200);
        return () => { active = false; if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current); };
    }, [phraseIndex, prompt]);

    // auto-resize textarea
    useEffect(() => {
        const el = promptRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 260) + 'px';
    }, [prompt]);

    const filtered = useMemo(() => {
        let base = projectList;
        if (filter) base = base.filter(p => (p.type || '').toLowerCase() === filter.toLowerCase());
        if (statusFilter) base = base.filter(p => (p.status || 'NEW') === statusFilter);
        return base;
    }, [projectList, filter, statusFilter]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function sendPrompt() {
        if (!session?.user) { setShowAuthModal(true); return; }
        if (!prompt.trim()) return;
        setLoading(true);
        setError(null);
        setWasAborted(false);
        const currentPrompt = prompt;
        try {
            // 1. Fast init project
            const initRes = await fetch('/api/projects/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: currentPrompt }) });
            if (!initRes.ok) {
                if (initRes.status === 401) { setShowAuthModal(true); } else { const d = await initRes.json().catch(() => ({})); setError(d.error || 'Init failed'); }
                setLoading(false);
                return;
            }
            const initData = await initRes.json();
            const pid = initData.projectId;
            // Mark that generation should start automatically after redirect
            if (pid) {
                try { localStorage.setItem('sorya:auto-gen', JSON.stringify({ projectId: pid, prompt: currentPrompt, ts: Date.now() })); } catch { }
                // Immediate redirect
                window.location.href = `/projects/${pid}`;
            }
        } catch (e: any) {
            setError('Init failed');
            setLoading(false);
        }
    }

    function cancelGeneration() {
        if (abortRef.current) {
            abortRef.current.abort();
        }
    }

    function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPrompt();
        }
    }

    // Poll deployments for DEPLOYING projects
    useEffect(() => {
        if (!session?.user) return;
        const hasDeploying = projectList.some(p => p.status === 'DEPLOYING');
        if (!hasDeploying) return;
        const interval = setInterval(async () => {
            try {
                const updates = await Promise.all(projectList.filter(p => p.status === 'DEPLOYING').map(async p => {
                    const res = await fetch(`/api/projects/${p.id}/deploy`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    return { id: p.id, status: data.projectStatus as string, deploymentUrl: data.deployment?.url as string | undefined };
                }));
                let changed = false;
                const newList = projectList.map(p => {
                    const u = updates.find(x => x && x.id === p.id);
                    if (u) { changed = true; return { ...p, status: u.status, deploymentUrl: u.deploymentUrl || p.deploymentUrl }; }
                    return p;
                });
                if (changed) setProjectList(newList);
            } catch (_) { /* ignore */ }
        }, 2000);
        return () => clearInterval(interval);
    }, [projectList, session?.user]);

    async function triggerDeploy(id: string) {
        if (!session?.user) { setShowAuthModal(true); return; }
        setProjectList(list => list.map(p => p.id === id ? { ...p, status: 'DEPLOYING' } : p));
        try {
            const res = await fetch(`/api/projects/${id}/deploy`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                if (typeof data.balance === 'number') setCreditBalance(data.balance);
            } else {
                setProjectList(list => list.map(p => p.id === id ? { ...p, status: 'ERROR' } : p));
            }
        } catch {
            setProjectList(list => list.map(p => p.id === id ? { ...p, status: 'ERROR' } : p));
        }
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', position: 'relative' }}>
            <SiteHeader session={session} credits={credits} />
            <div className="hero-gradient-wrapper" />
            {error && <div style={toastStyle} onClick={() => setError(null)}>{error}</div>}
            {/* Hero / Prompt centered */}
            <div style={{ minHeight: 'calc(100vh - 90px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: `1.25rem 1rem ${!isMobile && revealHeight ? (revealHeight + 32) + 'px' : '0'}`, position: 'relative', zIndex: 2 }}>
                <div style={{ width: '100%', maxWidth: 880, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
                    <div style={{ textAlign: 'center' }}>
                        <h1 style={{ margin: 0, fontSize: 'clamp(2.6rem,5.4vw,3.3rem)', lineHeight: 1.05, background: 'linear-gradient(90deg,var(--hero-start),var(--hero-end))', WebkitBackgroundClip: 'text', color: 'transparent', fontWeight: 700, letterSpacing: '-.55px' }}>
                            Sorya - AI-Powered No-Code<br />Web3 Creation Platform
                        </h1>
                        <p style={{ margin: '0.9rem 0 0', fontSize: 15, color: 'var(--text-dim)', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
                            Sorya lets anyone build secure, scalable websites and applications in minutes—no coding needed. Just share your idea, and our AI handles design, development, and launch. By automating the full creation process, Sorya enables creators, entrepreneurs, and businesses to bring their visions to life faster than ever.
                        </p>
                    </div>
                    <form onSubmit={e => { e.preventDefault(); if (!loading) sendPrompt(); else cancelGeneration(); }} style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>
                        <div style={{ position: 'relative', borderRadius: 28, border: '1px solid var(--border)', background: 'var(--bg-alt)', boxShadow: '0 3px 14px -6px rgba(0,0,0,0.15)', padding: isMobile ? '0px 0px 0px 0px' : '0.55rem 0.75rem 0.75rem', transition: 'border-color .25s', width: '100%' }}>
                            <textarea
                                ref={promptRef}
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                onKeyDown={onKey}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
                                aria-label="Describe your app"
                                placeholder={''}
                                disabled={!session?.user}
                                style={{ width: '100%', resize: 'none', fontSize: 15, padding: '0.35rem 3.4rem 0.35rem .6rem', border: 'none', background: 'transparent', color: 'var(--text)', lineHeight: 1.5, outline: 'none', minHeight: 54, maxHeight: 260, overflow: 'auto', fontFamily: 'inherit' }}
                            />
                            {(!prompt && !isFocused) && (
                                <div style={{ position: 'absolute', left: 24, top: 14, right: 70, pointerEvents: 'none', fontSize: 15, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word', maxWidth: 'calc(100% - 110px)', lineHeight: 1.5, opacity: .9 }}>
                                    {typedPlaceholder}
                                    <span style={{ display: 'inline-block', width: 8, background: 'transparent', animation: 'blink 1s steps(1) infinite' }}>|</span>
                                </div>
                            )}
                            <button type="submit" disabled={!session?.user || (!loading && !prompt.trim())} aria-label="Create project" style={{ position: 'absolute', bottom: 8, right: 8, width: 48, height: 48, borderRadius: 28, border: 'none', background: loading ? '#b91c1c' : 'linear-gradient(135deg,var(--hero-start),var(--hero-end))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, boxShadow: '0 4px 18px -6px rgba(0,0,0,0.35)', cursor: 'pointer', transition: 'background .25s, transform .15s', outline: 'none' }}>
                                {loading ? (
                                    <span style={{ width: 18, height: 18, border: '3px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                                ) : (
                                    <ArrowUpwardIcon sx={{ fontSize: 22 }} />
                                )}
                            </button>
                            <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes blink{50%{opacity:0}}`}</style>
                        </div>
                    </form>
                </div>
            </div>
            {/* Project previews section (overlap from bottom: top sits at 80% viewport) */}
            <div style={{ marginTop: isMobile ? 0 : '-20vh', width: '100%', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: 1100, borderRadius: 28, border: '1px solid var(--border)', background: 'var(--bg-alt)', boxShadow: '0 3px 14px -6px rgba(0,0,0,0.15)', padding: isMobile ? '0.9rem .85rem 1.2rem' : '1.2rem 1.1rem 1.7rem', display: 'flex', flexDirection: 'column', gap: 22, minHeight: isMobile ? 280 : 300, position: 'relative', top: isMobile ? `-10vh` : `-15vh`, zIndex: 2 }}>
                    {!isMobile && revealHeight > 0 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, background: 'linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0))', pointerEvents: 'none' }} />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 11, letterSpacing: '.5px' }}>Type:</strong>
                        <FilterPill active={!filter} label="All" onClick={() => setFilter(null)} />
                        {TAGS.map(t => <FilterPill key={t} active={filter === t} label={t} onClick={() => setFilter(t)} />)}
                        <button type="button" onClick={() => setLaneMode(m => !m)} style={{ marginLeft: 'auto', fontSize: 11, padding: '.4rem .7rem', borderRadius: 20, border: '1px solid var(--border)', background: laneMode ? '#111' : 'var(--bg-alt)', color: laneMode ? '#fff' : 'var(--text)', cursor: 'pointer' }}>{laneMode ? 'Grid View' : 'Lane View'}</button>
                    </div>
                    {!laneMode && (
                        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
                            {filtered.map(p => <ProjectCard key={p.id} project={p} onDeploy={triggerDeploy} onAbort={cancelGeneration} canDeploy={!!session?.user} />)}
                            {filtered.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No projects yet</div>}
                        </div>
                    )}
                    {laneMode && (
                        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', overflowX: 'auto' }}>
                            {TAGS.map(t => {
                                const laneProjects = filtered.filter(p => (p.type || 'Prototype') === t);
                                return (
                                    <div key={t} style={{ minWidth: 220, flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{t}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {laneProjects.map(p => <ProjectCard key={p.id} project={p} onDeploy={triggerDeploy} onAbort={cancelGeneration} canDeploy={!!session?.user} />)}
                                            {laneProjects.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            {
                showAuthModal && (
                    <div style={overlayStyle}>
                        <div style={modalStyle}>
                            <h3 style={{ margin: '0 0 .75rem', fontSize: 18 }}>Login required</h3>
                            <p style={{ fontSize: 13, color: '#555', margin: '0 0 1rem' }}>You need an account to start generating projects.</p>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <button onClick={() => setShowAuthModal(false)} style={secondaryBtnStyle}>Close</button>
                                <a href="/login" style={primaryBtnStyle}>Login</a>
                                <a href="/register" style={outlineBtnStyle}>Register</a>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 600 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '.55rem .7rem', borderRadius: 8, border: '1px solid #ccc', fontSize: 13 };

function ChatBubble({ role, content }: { role: string; content: string }) {
    const user = role === 'user';
    const system = role === 'system';
    return (
        <div style={{ alignSelf: user ? 'flex-end' : 'flex-start', maxWidth: '70%', background: user ? '#111' : system ? '#e0f2fe' : '#f2f2f2', color: user ? '#fff' : '#111', padding: '.6rem .75rem', borderRadius: 16, fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', fontStyle: system ? 'italic' : 'normal' }}>
            {content}
        </div>
    );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} style={{ ...pillStyle, background: active ? '#111' : '#f1f1f1', color: active ? '#fff' : '#333', border: 'none', cursor: 'pointer' }}>{label}</button>
    );
}

function ProjectCard({ project, onDeploy, onAbort, canDeploy }: { project: Project; onDeploy: (id: string) => void; onAbort: () => void; canDeploy: boolean }) {
    const status = project.status || 'NEW';
    const showDeployBtn = ['NEW', 'ERROR'].includes(status) && canDeploy;
    return (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '.8rem .85rem', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13, lineHeight: 1.2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</strong>
                <StatusChip status={status} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minHeight: 20 }}>
                {project.type && <span style={pillStyle}>{project.type}{project.typeConfidence != null && <span style={{ marginLeft: 4, opacity: .7 }}>{Math.round(project.typeConfidence * 100)}%</span>}</span>}
                {project.deploymentUrl && <a style={{ fontSize: 11 }} target="_blank" href={project.deploymentUrl}>Preview</a>}
            </div>
            {showDeployBtn && <button onClick={() => onDeploy(project.id)} style={{ ...deployBtnStyle }}>Deploy</button>}
        </div>
    );
}

function StatusChip({ status }: { status: string }) {
    const map: Record<string, { bg: string; color: string; label: string }> = {
        NEW: { bg: '#eee', color: '#333', label: 'NEW' },
        DEPLOYING: { bg: '#ffecb3', color: '#8a5d00', label: 'DEPLOYING' },
        LIVE: { bg: '#d1fae5', color: '#065f46', label: 'LIVE' },
        ERROR: { bg: '#ffe4e6', color: '#9f1239', label: 'ERROR' }
    };
    const v = map[status] || map.NEW;
    return <span style={{ background: v.bg, color: v.color, fontSize: 10, padding: '.2rem .45rem', borderRadius: 8, fontWeight: 600 }}>{v.label}</span>;
}

const pillStyle: React.CSSProperties = {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '.5px',
    padding: '.25rem .55rem',
    borderRadius: 20,
    background: '#f1f1f1',
    color: '#000',
};

const menuItemStyle: React.CSSProperties = { fontSize: 13, padding: '.55rem .75rem', color: 'var(--text)', textDecoration: 'none', display: 'block', borderRadius: 8 };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modalStyle: React.CSSProperties = { background: 'var(--bg-alt)', borderRadius: 14, padding: '1.5rem 1.4rem 1.25rem', width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', color: 'var(--text)' };
const primaryBtnStyle: React.CSSProperties = { background: '#111', color: '#fff', textDecoration: 'none', padding: '.55rem .95rem', borderRadius: 8, fontSize: 13, fontWeight: 600 };
const outlineBtnStyle: React.CSSProperties = { background: 'var(--bg-alt)', color: 'var(--text)', textDecoration: 'none', padding: '.55rem .95rem', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid var(--border)' };
const secondaryBtnStyle: React.CSSProperties = { background: 'var(--bg)', color: 'var(--text)', padding: '.55rem .95rem', borderRadius: 8, fontSize: 13, fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer' };
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 20, right: 20, background: '#111', color: '#fff', padding: '.6rem .9rem', borderRadius: 8, fontSize: 12, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', maxWidth: 260 };
const deployBtnStyle: React.CSSProperties = { fontSize: 11, padding: '.35rem .6rem', borderRadius: 6, border: '1px solid #111', background: '#111', color: '#fff', cursor: 'pointer', alignSelf: 'flex-start' };
const settingsTabStyle: React.CSSProperties = { border: 'none', borderRadius: 6, padding: '.55rem .6rem', fontSize: 12, textAlign: 'left', cursor: 'pointer' };
