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

    const fetchLatest = useCallback(async () => {
        try {
            setLoading(true);
            const r = await fetch(`/api/projects/${projectId}/latest-snapshot`);
            const j = await r.json();
            if (j.snapshotId && j.snapshotId !== snapshotId) {
                const s = await fetch(`/api/projects/${projectId}/snapshots/${j.snapshotId}`);
                const sj = await s.json();
                if (Array.isArray(sj.files)) {
                    setFiles(sj.files);
                    setSnapshotId(j.snapshotId);
                    if (!activePath && sj.files.length) setActivePath(sj.files[0].path);
                }
            }
        } catch (e) {
            console.warn('LiveProjectPreview fetchLatest error', (e as any)?.message);
        } finally {
            setLoading(false);
        }
    }, [projectId, snapshotId, activePath]);

    useEffect(() => { fetchLatest(); }, [fetchLatest]);

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Live Files {loading && '…'}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {files.map(f => (
                    <button key={f.path} onClick={() => setActivePath(f.path)} style={{
                        border: '1px solid var(--border, #333)',
                        background: f.path === activePath ? 'var(--accent, #6366f1)' : 'var(--bg-alt, #111)',
                        color: '#fff', fontSize: 11, padding: '.4rem .65rem', borderRadius: 6, cursor: 'pointer'
                    }}>{f.path}</button>
                ))}
                {!files.length && <span style={{ fontSize: 12, opacity: 0.6 }}>No files yet.</span>}
            </div>
            <div style={{ position: 'relative', border: '1px solid var(--border, #333)', borderRadius: 10, background: '#0f1115', minHeight: 320, overflow: 'auto' }}>
                {activePath && <pre style={{ margin: 0, padding: '1rem', fontSize: 12, lineHeight: 1.45 }}><code>{files.find(f => f.path === activePath)?.content || ''}</code></pre>}
                <div style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 11, opacity: 0.5 }}>Snap: {snapshotId ? snapshotId.slice(0, 8) : '—'}</div>
            </div>
        </div>
    );
}
