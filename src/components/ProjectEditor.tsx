"use client";
import React, { useEffect, useState, useCallback } from 'react';
import Pusher from 'pusher-js';

type FileRec = { path: string; content: string };

interface ProjectEditorProps {
    projectId: string;
    publicKey: string;
    cluster: string;
}

/** Lightweight realtime project file viewer. */
export default function ProjectEditor({ projectId, publicKey, cluster }: ProjectEditorProps) {
    const [files, setFiles] = useState<FileRec[]>([]);
    const [activePath, setActivePath] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [snapshotId, setSnapshotId] = useState<string | null>(null);

    const fetchLatest = useCallback(async () => {
        if (!projectId) return;
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
            console.warn('ProjectEditor fetchLatest error', (e as any)?.message);
        } finally {
            setLoading(false);
        }
    }, [projectId, snapshotId, activePath]);

    // Initial load
    useEffect(() => { fetchLatest(); }, [fetchLatest]);

    // Pusher subscription
    useEffect(() => {
        if (!publicKey || !cluster || !projectId) return;
        const p = new Pusher(publicKey, { cluster });
        const channel = p.subscribe(`project-${projectId}`);
        const handler = (data: any) => {
            if (data?.snapshotId && data.projectId === projectId) {
                fetchLatest();
            }
        };
        channel.bind('files.updated', handler);
        return () => {
            channel.unbind('files.updated', handler);
            p.disconnect();
        };
    }, [publicKey, cluster, projectId, fetchLatest]);

    return (
        <div style={{ display: 'flex', border: '1px solid #444', borderRadius: 6, overflow: 'hidden', fontSize: 14, height: 400 }}>
            <div style={{ width: 220, background: '#111', color: '#ddd', overflowY: 'auto', padding: '0.5rem' }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Files {loading ? '…' : ''}</div>
                {files.map(f => (
                    <div key={f.path} onClick={() => setActivePath(f.path)} style={{ cursor: 'pointer', padding: '2px 4px', borderRadius: 4, background: f.path === activePath ? '#333' : 'transparent' }}>{f.path}</div>
                ))}
                {!files.length && !loading && <div style={{ opacity: 0.6 }}>No files yet.</div>}
            </div>
            <div style={{ flex: 1, background: '#1b1b1b', color: '#eee', position: 'relative', fontFamily: 'var(--font-mono, monospace)', overflow: 'auto' }}>
                {activePath ? (
                    <pre style={{ margin: 0, padding: '0.75rem', lineHeight: 1.4 }}>
                        {files.find(f => f.path === activePath)?.content || ''}
                    </pre>
                ) : (
                    <div style={{ padding: '1rem', opacity: 0.7 }}>Select a file.</div>
                )}
                <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: 11, opacity: 0.6 }}>Snapshot: {snapshotId ? snapshotId.slice(0, 8) : '—'}</div>
            </div>
        </div>
    );
}
