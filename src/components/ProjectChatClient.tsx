"use client";
import React, { useState, useRef, useEffect } from 'react';
import { useCredits } from '@/src/components/CreditsRoot';

interface ChatMessage { id?: string; role: string; content: string; snapshotId?: string }
interface Props {
    projectId: string;
    initialMessages: ChatMessage[];
    initialCredits: number | null;
    deploymentUrl?: string | null;
    projectName: string;
}

export default function ProjectChatClient({ projectId, initialMessages, initialCredits, deploymentUrl, projectName }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { balance, setBalance } = (() => { try { return useCredits(); } catch { return { balance: null as number | null, setBalance: (_: number | null) => { } } as any; } })();
    const [credits, setCredits] = useState<number | null>(initialCredits ?? balance);
    const [wasAborted, setWasAborted] = useState(false);
    const [externalPending, setExternalPending] = useState(false); // deprecated spinner state
    const abortRef = useRef<AbortController | null>(null);
    const idleRef = useRef<any>(null);
    const [autoEnrich, setAutoEnrich] = useState(false);
    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    // Removed legacy auto-run waiting spinner & deploy polling
    useEffect(() => { setExternalPending(false); }, []);

    async function send(override?: { phase?: 'plan' | 'code' | 'enrich'; prompt?: string }) {
        const usePrompt = override?.prompt ?? prompt;
        if (!usePrompt.trim() || loading) return;
        setLoading(true); setError(null); setWasAborted(false);
        const userMsg = { role: 'user', content: usePrompt };
        setMessages(m => [...m, userMsg]);
        setMessages(m => [...m, { role: 'assistant', content: '⏳ Generating plan & code…' }]);
        const localPrompt = usePrompt;
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            // Determine phase (default plan, unless explicit enrich override)
            const phase = override?.phase || 'plan';
            const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: localPrompt, projectId, phase }), signal: controller.signal });
            if (res.ok) {
                const data = await res.json();
                // Remove temporary streaming placeholder(s)
                setMessages(m => m.filter(msg => msg.content !== '⏳ Generating plan & code…'));
                if (Array.isArray(data.steps)) {
                    const systemMsgs = data.steps
                        .filter((s: any) => ['snapshot_complete', 'deploy_result', 'patch_apply', 'diff_summary'].includes(s.type))
                        .map((s: any) => ({ role: 'system', content: s.type.replace(/_/g, ' ') }));
                    setMessages(m => [...m, ...systemMsgs, { role: 'assistant', content: data.displayAssistant || data.messages[1].content, snapshotId: data.snapshotId }]);
                } else {
                    setMessages(m => [...m, { role: 'assistant', content: data.displayAssistant || data.messages[1].content, snapshotId: data.snapshotId }]);
                }
                if (data.fullGenerationPending) {
                    // Indicate background code phase running
                    setMessages(m => [...m, { role: 'system', content: 'Background code generation started…' }]);
                }
                setExternalPending(false);
                if (typeof data.balance === 'number') { setCredits(data.balance); setBalance(data.balance); }
                if (data.snapshotId) {
                    // Dispatch custom event so LiveProjectPreview updates immediately
                    try { window.dispatchEvent(new CustomEvent('sorya:snapshot-updated', { detail: { projectId } })); } catch { }
                }
            } else {
                if (res.status === 401) {
                    setMessages(m => [...m, { role: 'assistant', content: 'Unauthorized.' }]);
                } else {
                    const data = await res.json().catch(() => ({}));
                    const msg = data.error || 'Error generating.';
                    setMessages(m => [...m, { role: 'assistant', content: msg }]);
                    setError(msg);
                }
            }
        } catch (e: any) {
            if (e?.name === 'AbortError') {
                setWasAborted(true);
                setMessages(m => m.filter(msg => msg.content !== '⏳ Generating plan & code…'));
            } else {
                setMessages(m => m.filter(msg => msg.content !== '⏳ Generating plan & code…'));
                setMessages(m => [...m, { role: 'assistant', content: 'Generation failed.' }]);
                setError('Generation failed');
            }
        } finally {
            setLoading(false);
            abortRef.current = null;
            if (!wasAborted && !override?.prompt) setPrompt('');
        }
    }

    function cancel() { if (abortRef.current) abortRef.current.abort(); }

    // Idle enrichment trigger (60s) when enabled
    useEffect(() => {
        if (!autoEnrich) { if (idleRef.current) clearTimeout(idleRef.current); return; }
        if (loading) return;
        if (idleRef.current) clearTimeout(idleRef.current);
        idleRef.current = setTimeout(() => {
            const last = [...messages].reverse().find(m => m.role !== 'system');
            if (last && last.role === 'assistant') {
                send({ phase: 'enrich', prompt: 'Enrich current project with incremental improvements' });
            }
        }, 60000);
        return () => { if (idleRef.current) clearTimeout(idleRef.current); };
    }, [messages, autoEnrich, loading]);

    function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!loading) send(); else cancel(); }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: '0 0 .25rem', fontSize: 22 }}>{projectName}</h1>
                    {deploymentUrl && <div style={{ fontSize: 12 }}><a href={deploymentUrl} target="_blank">Deployment</a></div>}
                </div>
                {credits != null && <div style={{ fontSize: 12, color: credits <= 200 ? '#b45309' : '#555' }}>{credits} credits left</div>}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 300, maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
                {/* externalPending spinner removed */}
                {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} snapshotId={m.snapshotId} projectId={projectId} />)}
                <div ref={bottomRef} />
            </div>
            <form onSubmit={e => { e.preventDefault(); if (!loading) send(); else cancel(); }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={'Continue building...'}
                    style={{ width: '100%', resize: 'none', fontSize: 14, padding: '.8rem .9rem', borderRadius: 12, border: '1px solid #ccc', minHeight: 80 }}
                    disabled={loading && !wasAborted}
                />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button type="submit" disabled={!prompt.trim() && !loading} style={{ background: loading ? '#b91c1c' : '#111', color: '#fff', border: 'none', padding: '.6rem 1.2rem', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {loading && <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />}
                        {loading ? 'Stop' : 'Send'}
                    </button>
                    <button type="button" onClick={() => send({ phase: 'enrich', prompt: prompt || 'Enrich current project' })} disabled={loading} style={{ background: '#312e81', color: '#fff', border: 'none', padding: '.6rem .95rem', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>Enrich</button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: '#555' }}>
                        <input type="checkbox" checked={autoEnrich} onChange={e => setAutoEnrich(e.target.checked)} /> Auto
                    </label>
                    {error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>}
                </div>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </form>
        </div>
    );
}

function Bubble({ role, content, snapshotId, projectId }: { role: string; content: string; snapshotId?: string; projectId?: string }) {
    const user = role === 'user';
    const system = role === 'system';
    const [showDiff, setShowDiff] = React.useState(false);
    const [diff, setDiff] = React.useState<any | null>(null);
    async function loadDiff() {
        if (!snapshotId || !projectId) return;
        try {
            const r = await fetch(`/api/projects/${projectId}/snapshots/${snapshotId}/diff`);
            if (r.ok) setDiff(await r.json());
        } catch { }
    }
    useEffect(() => { if (showDiff && !diff) loadDiff(); }, [showDiff, diff]);
    return (
        <div style={{ alignSelf: user ? 'flex-end' : 'flex-start', maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ background: user ? '#111' : system ? '#e0f2fe' : '#f2f2f2', color: user ? '#fff' : '#111', padding: '.55rem .75rem', borderRadius: 16, fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', fontStyle: system ? 'italic' : 'normal' }}>{content}</div>
            {snapshotId && role === 'assistant' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setShowDiff(s => !s)} style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155', fontSize: 10, padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}>{showDiff ? 'Hide Diff' : 'Diff'}</button>
                </div>
            )}
            {showDiff && diff && (
                <div style={{ border: '1px solid #334155', borderRadius: 10, background: '#0f1115', padding: 10, fontSize: 11, color: '#e2e8f0', maxHeight: 360, overflow: 'auto' }}>
                    <div style={{ fontSize: 10, opacity: .7, marginBottom: 6 }}>Base: {diff.baseSnapshotId ? diff.baseSnapshotId.slice(0, 8) : '—'} → Target: {diff.targetSnapshotId.slice(0, 8)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <Section title="Created" emptyText="None" items={diff.created} renderItem={(p: string) => <code key={p} style={{ display: 'block' }}>{p}</code>} />
                        <div>
                            <h4 style={{ margin: '0 0 .3rem', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: '#93c5fd' }}>Updated</h4>
                            {diff.updated?.length ? diff.updated.map((u: any) => (
                                <div key={u.path} style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, opacity: .8, marginBottom: 4 }}>{u.path}</div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <pre style={{ flex: 1, margin: 0, background: '#111827', padding: 6, borderRadius: 6, overflow: 'auto' }}><code>{u.beforeExcerpt}</code></pre>
                                        <pre style={{ flex: 1, margin: 0, background: '#1e293b', padding: 6, borderRadius: 6, overflow: 'auto' }}><code>{u.afterExcerpt}</code></pre>
                                    </div>
                                </div>
                            )) : <div style={{ opacity: .5 }}>None</div>}
                        </div>
                        <Section title="Deleted" emptyText="None" items={diff.deleted} renderItem={(p: string) => <code key={p} style={{ display: 'block' }}>{p}</code>} />
                    </div>
                </div>
            )}
        </div>
    );
}

function Section<T>({ title, items, emptyText, renderItem }: { title: string; items?: T[]; emptyText: string; renderItem: (item: T) => React.ReactNode }) {
    return (
        <div>
            <h4 style={{ margin: '0 0 .3rem', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: '#93c5fd' }}>{title}</h4>
            {items && items.length ? items.map(renderItem) : <div style={{ opacity: .5 }}>{emptyText}</div>}
        </div>
    );
}
