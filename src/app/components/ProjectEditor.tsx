'use client';
/** Minimal live file viewer that subscribes to pusher and refetches files */
import { useEffect, useMemo, useState } from 'react';
import Pusher from 'pusher-js';

type FileEntry = { path: string; content: string };

export default function ProjectEditor({
    projectId,
    pusherKey,
    pusherCluster
}: { projectId: string; pusherKey: string; pusherCluster: string }) {
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [activePath, setActivePath] = useState<string>('');
    const active = useMemo(
        () => files.find(f => f.path === activePath)?.content ?? '',
        [files, activePath]
    );

    async function loadLatest() {
        const latest = await fetch(`/api/projects/${projectId}/latest-snapshot`, { cache: 'no-store' }).then(r => r.json());
        if (!latest?.snapshotId) return;
        const data = await fetch(`/api/projects/${projectId}/snapshots/${latest.snapshotId}`, { cache: 'no-store' }).then(r => r.json());
        if (Array.isArray(data?.files)) {
            setFiles(data.files);
            if (!activePath && data.files.length) setActivePath(data.files[0].path);
        }
    }

    useEffect(() => {
        if (!projectId) return;
        loadLatest();
        const p = new Pusher(pusherKey, { cluster: pusherCluster });
        const ch = p.subscribe(`project-${projectId}`);
        ch.bind('files.updated', async (e: { snapshotId: string }) => {
            const data = await fetch(`/api/projects/${projectId}/snapshots/${e.snapshotId}`, { cache: 'no-store' }).then(r => r.json());
            if (Array.isArray(data?.files)) {
                setFiles(data.files);
                if (!activePath && data.files.length) setActivePath(data.files[0].path);
            }
        });
        return () => { ch.unbind_all(); ch.unsubscribe(); p.disconnect(); };
    }, [projectId]);

    return (
        <div className="flex h-full">
            <aside className="w-72 border-r overflow-auto">
                <div className="p-3 text-sm font-semibold">Files</div>
                <ul className="text-sm">
                    {files.map(f => (
                        <li key={f.path}>
                            <button
                                className={`w-full text-left px-3 py-1.5 hover:bg-zinc-100 ${activePath === f.path ? 'bg-zinc-100' : ''}`}
                                onClick={() => setActivePath(f.path)}
                            >
                                {f.path}
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>
            <main className="flex-1 overflow-auto">
                <div className="flex items-center justify-between px-4 py-2 border-b">
                    <div className="font-mono text-xs opacity-70">{activePath}</div>
                    <button className="text-xs underline" onClick={loadLatest}>Refresh</button>
                </div>
                <pre className="p-4 text-sm overflow-auto"><code>{active}</code></pre>
            </main>
        </div>
    );
}
