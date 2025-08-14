"use client";
import React, { useState, useRef, useEffect } from 'react';
import { useCredits } from '@/src/components/CreditsRoot';

interface ChatMessage { id?: string; role: string; content: string }
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
    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    // Removed legacy auto-run waiting spinner & deploy polling
    useEffect(() => { setExternalPending(false); }, []);

    async function send() {
        if (!prompt.trim() || loading) return;
        setLoading(true); setError(null); setWasAborted(false);
        const userMsg = { role: 'user', content: prompt };
        setMessages(m => [...m, userMsg]);
        setMessages(m => [...m, { role: 'assistant', content: '⏳ Generating plan & code…' }]);
        const localPrompt = prompt;
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            // Always start with plan phase (backend will spawn background code phase)
            const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: localPrompt, projectId, phase: 'plan' }), signal: controller.signal });
            if (res.ok) {
                const data = await res.json();
                // Remove temporary streaming placeholder(s)
                setMessages(m => m.filter(msg => msg.content !== '⏳ Generating plan & code…'));
                if (Array.isArray(data.steps)) {
                    const systemMsgs = data.steps
                        .filter((s: any) => ['snapshot_complete', 'deploy_result', 'patch_apply', 'diff_summary'].includes(s.type))
                        .map((s: any) => ({ role: 'system', content: s.type.replace(/_/g, ' ') }));
                    setMessages(m => [...m, ...systemMsgs, { role: 'assistant', content: data.displayAssistant || data.messages[1].content }]);
                } else {
                    setMessages(m => [...m, { role: 'assistant', content: data.displayAssistant || data.messages[1].content }]);
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
            if (!wasAborted) setPrompt('');
        }
    }

    function cancel() { if (abortRef.current) abortRef.current.abort(); }

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
                {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)}
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
                    {error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>}
                </div>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </form>
        </div>
    );
}

function Bubble({ role, content }: { role: string; content: string }) {
    const user = role === 'user';
    const system = role === 'system';
    return (
        <div style={{ alignSelf: user ? 'flex-end' : 'flex-start', maxWidth: '70%', background: user ? '#111' : system ? '#e0f2fe' : '#f2f2f2', color: user ? '#fff' : '#111', padding: '.55rem .75rem', borderRadius: 16, fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', fontStyle: system ? 'italic' : 'normal' }}>
            {content}
        </div>
    );
}
