"use client";
import React, { useEffect, useState, useCallback } from 'react';
import Pusher from 'pusher-js';

interface FileRec { path: string; content: string }
interface Props {
    projectId: string;
    initialFiles: FileRec[];
    publicKey?: string;
    cluster?: string;
}

export default function LiveProjectPreview({ projectId, initialFiles, publicKey, cluster }: Props) {
    const [files, setFiles] = useState<FileRec[]>(initialFiles);
    const [activePath, setActivePath] = useState<string | null>(initialFiles[0]?.path || null);
    const [snapshotId, setSnapshotId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [polling, setPolling] = useState(false);
    const [mode, setMode] = useState<'preview' | 'files'>('preview');
    const [iframeKey, setIframeKey] = useState(0);
    const [previewLoading, setPreviewLoading] = useState(true);

    const fetchLatest = useCallback(async (force: boolean = false) => {
        try {
            setLoading(true);
            const r = await fetch(`/api/projects/${projectId}/latest-snapshot`);
            const j = await r.json();
            if (j.snapshotId && (j.snapshotId !== snapshotId || force)) {
                if (j.snapshotId !== snapshotId) console.log('[LiveProjectPreview] new snapshotId detected', j.snapshotId);
                const s = await fetch(`/api/projects/${projectId}/snapshots/${j.snapshotId}`);
                const sj = await s.json();
                if (Array.isArray(sj.files)) {
                    setFiles(sj.files);
                    console.log('[LiveProjectPreview] loaded files', sj.files.map((f: any) => ({ path: f.path, len: (f.content || '').length })));
                    setSnapshotId(j.snapshotId);
                    if (!activePath && sj.files.length) setActivePath(sj.files[0].path);
                    const hasPreview = sj.files.some((f: any) => f.path === 'preview.html');
                    if (hasPreview) setMode('preview');
                    setIframeKey(k => k + 1);
                    setPreviewLoading(true); // when new snapshot arrives, show loader until iframe loads
                    setPolling(false);
                    return true;
                }
            }
        } catch (e) {
            console.warn('LiveProjectPreview fetchLatest error', (e as any)?.message);
        } finally {
            setLoading(false);
        }
        return false;
    }, [projectId, snapshotId, activePath]);

    useEffect(() => { fetchLatest(); }, [fetchLatest]);

    // Poll until first snapshot appears (for environments without realtime)
    useEffect(() => {
        if (snapshotId || files.length > 0 || polling) return;
        let attempts = 0;
        setPolling(true);
        const interval = setInterval(async () => {
            attempts += 1;
            const got = await fetchLatest();
            if (got || attempts >= 15) { // stop after ~30s (15 * 2s)
                clearInterval(interval);
                setPolling(false);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [snapshotId, files.length, fetchLatest, polling]);

    // Custom event listener from ProjectAutoRunner fallback
    useEffect(() => {
        function onSnap(e: any) {
            if (e?.detail?.projectId === projectId) {
                console.log('[LiveProjectPreview] received custom snapshot update event (force refresh)');
                fetchLatest(true); // force refresh even if snapshot id unchanged
            }
        }
        window.addEventListener('sorya:snapshot-updated', onSnap as any);
        return () => window.removeEventListener('sorya:snapshot-updated', onSnap as any);
    }, [projectId, fetchLatest]);

    useEffect(() => {
        if (!publicKey || !cluster) return; // allow working without realtime
        const p = new Pusher(publicKey, { cluster });
        const channel = p.subscribe(`project-${projectId}`);
        const handler = (data: any) => {
            if (data?.snapshotId) fetchLatest();
        };
        channel.bind('files.updated', handler);
        return () => { channel.unbind('files.updated', handler); p.disconnect(); };
    }, [publicKey, cluster, projectId, fetchLatest]);

    const previewFile = files.find(f => f.path === 'preview.html');
    const codeFile = activePath ? files.find(f => f.path === activePath) : null;
    const hasPreview = !!previewFile;
    const showPreview = mode === 'preview' && hasPreview;
    const showLoader = showPreview && (previewLoading || !previewFile);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setMode('preview')} style={modeBtnStyle(mode === 'preview')}>Preview</button>
                <button onClick={() => setMode('files')} style={modeBtnStyle(mode === 'files')}>Files</button>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 11, opacity: 0.6 }}>Snapshot: {snapshotId ? snapshotId.slice(0, 8) : '—'}</div>
            </div>
            {/* PREVIEW MODE */}
            {mode === 'preview' && (
                <div style={{ position: 'relative', border: '1px solid var(--border, #333)', borderRadius: 10, background: '#0f1115', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {showPreview && previewFile && (
                        <iframe
                            key={iframeKey}
                            title="preview"
                            style={{ flex: 1, width: '100%', border: 'none', background: '#fff', opacity: showLoader ? 0 : 1, transition: 'opacity .35s ease' }}
                            srcDoc={previewFile.content}
                            onLoad={() => setPreviewLoading(false)}
                            sandbox="allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals" />
                    )}
                    {showLoader && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'linear-gradient(135deg,#111,#1a1d22)' }}>
                            <div style={{ width: 48, height: 48, border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
                            <div style={{ fontSize: 12, color: '#ccc', letterSpacing: 0.5 }}>Generating preview…</div>
                            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                        </div>
                    )}
                    <div style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 11, opacity: 0.5, pointerEvents: 'none' }}>Preview</div>
                </div>
            )}
            {/* FILES MODE */}
            {mode === 'files' && (
                <div style={{ display: 'flex', border: '1px solid var(--border, #333)', borderRadius: 10, background: '#0f1115', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ width: 220, background: '#13161b', borderRight: '1px solid #222', overflowY: 'auto', padding: '0.5rem' }}>
                        <div style={{ fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 6 }}>Files {loading ? '…' : ''}</div>
                        {files.map(f => (
                            <div key={f.path} onClick={() => setActivePath(f.path)} style={{ cursor: 'pointer', padding: '4px 6px', borderRadius: 6, fontSize: 12, background: f.path === activePath ? '#1f2937' : 'transparent', color: f.path === activePath ? '#fff' : '#cbd5e1', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.path}</div>
                        ))}
                        {!files.length && !loading && <div style={{ fontSize: 12, opacity: 0.6 }}>No files yet.</div>}
                    </div>
                    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        {codeFile ? (
                            <pre style={{ margin: 0, padding: '0.9rem 1rem', flex: 1, overflow: 'auto', fontSize: 12, lineHeight: 1.45, fontFamily: 'var(--font-mono, monospace)', color: '#e2e8f0' }}><code>{codeFile.content}</code></pre>
                        ) : (
                            <div style={{ padding: '1rem', fontSize: 12, opacity: 0.6 }}>Select a file to view its contents.</div>
                        )}
                        <div style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 11, opacity: 0.5 }}>File: {activePath || '—'}</div>
                    </div>
                </div>
            )}
        </div>
    );
}

function modeBtnStyle(active: boolean): React.CSSProperties {
    return {
        background: active ? '#1e293b' : '#111827',
        color: active ? '#fff' : '#a0aec0',
        border: '1px solid #1f2937',
        fontSize: 11,
        padding: '.4rem .75rem',
        borderRadius: 8,
        cursor: 'pointer',
        fontWeight: 500,
        letterSpacing: '.03em'
    };
}
