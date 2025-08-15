"use client";
import React, { useEffect, useState, useCallback } from 'react';
import Pusher from 'pusher-js';

interface FileRec { path: string; content: string; status?: 'created' | 'updated' | 'unchanged' }
interface PlanMeta { planLines?: string[]; summary?: string; proposed?: string[]; pitfalls?: string[]; todos?: string[] }
interface Props {
    projectId: string;
    initialFiles: FileRec[];
    publicKey?: string;
    cluster?: string;
    deploymentUrl?: string | null;
    initialProjectStatus?: string | null;
}

export default function LiveProjectPreview({ projectId, initialFiles, publicKey, cluster, deploymentUrl: initialDeploymentUrl, initialProjectStatus }: Props) {
    const [files, setFiles] = useState<FileRec[]>(initialFiles);
    const [fileSearch, setFileSearch] = useState('');
    const [statusFilters, setStatusFilters] = useState<string[]>([]); // created, updated
    const [activePath, setActivePath] = useState<string | null>(initialFiles[0]?.path || null);
    const [snapshotId, setSnapshotId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [polling, setPolling] = useState(false);
    const [mode, setMode] = useState<'preview' | 'files' | 'plan' | 'diff' | 'history'>('preview');
    const [diffData, setDiffData] = useState<any | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [iframeKey, setIframeKey] = useState(0);
    const [previewLoading, setPreviewLoading] = useState(true);
    const [planMeta, setPlanMeta] = useState<PlanMeta | null>(null);
    const [deploymentUrl, setDeploymentUrl] = useState<string | null>(initialDeploymentUrl || null);
    const [projectStatus, setProjectStatus] = useState<string | null>(initialProjectStatus || null);
    const [deployLog, setDeployLog] = useState<string | null>(null);
    const [deployError, setDeployError] = useState<string | null>(null);
    const [showLog, setShowLog] = useState(false);

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
                    setPlanMeta(sj.planMeta || null);
                    console.log('[LiveProjectPreview] loaded files', sj.files.map((f: any) => ({ path: f.path, len: (f.content || '').length })));
                    setSnapshotId(j.snapshotId);
                    if (!activePath && sj.files.length) setActivePath(sj.files[0].path);
                    const hasPreview = sj.files.some((f: any) => f.path === 'preview.html');
                    if (hasPreview) setMode('preview');
                    setIframeKey(k => k + 1);
                    setPreviewLoading(true); // when new snapshot arrives, show loader until iframe loads
                    setPolling(false);
                    // Refresh project status + deployment URL lightweight (avoid heavy data)
                    try {
                        const pr = await fetch(`/api/projects/${projectId}`);
                        if (pr.ok) {
                            const pj = await pr.json();
                            if (pj?.project) {
                                setProjectStatus(pj.project.status || null);
                                if (pj.project.deploymentUrl) setDeploymentUrl(pj.project.deploymentUrl);
                            }
                        }
                    } catch { /* ignore */ }
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

    // Refetch file tree with search / status filters when in files mode
    useEffect(() => {
        if (mode !== 'files') return;
        const controller = new AbortController();
        const params = new URLSearchParams();
        if (fileSearch.trim()) params.set('search', fileSearch.trim());
        if (statusFilters.length) params.set('status', statusFilters.join(','));
        const url = `/api/projects/${projectId}/files?${params.toString()}`;
        (async () => {
            try {
                const r = await fetch(url, { signal: controller.signal });
                if (!r.ok) return; const j = await r.json();
                if (Array.isArray(j.files)) {
                    // Files response now includes status
                    const enriched = j.files.map((f: any) => ({ path: f.path, status: f.status, content: files.find(ff => ff.path === f.path)?.content || '' }));
                    setFiles(prev => {
                        // Preserve existing content where possible
                        return enriched.map((e: any) => ({ ...e }));
                    });
                }
            } catch { }
        })();
        return () => controller.abort();
    }, [fileSearch, statusFilters, mode, projectId]);

    // Fetch diff when switching to diff tab
    useEffect(() => {
        (async () => {
            if (mode !== 'diff' || !snapshotId) return;
            try {
                const r = await fetch(`/api/projects/${projectId}/snapshots/${snapshotId}/diff`);
                if (r.ok) setDiffData(await r.json());
            } catch { }
        })();
    }, [mode, snapshotId, projectId]);

    // Fetch history when switching to history tab
    useEffect(() => {
        (async () => {
            if (mode !== 'history') return;
            setHistoryLoading(true);
            try { const r = await fetch(`/api/projects/${projectId}/snapshots`); if (r.ok) { const j = await r.json(); setHistory(j.snapshots || []); } } catch { }
            setHistoryLoading(false);
        })();
    }, [mode, projectId]);

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

    // Poll deployment status & logs while DEPLOYING
    useEffect(() => {
        if (projectStatus !== 'DEPLOYING') return;
        let cancelled = false;
        let attempts = 0;
        const interval = setInterval(async () => {
            attempts += 1;
            try {
                const r = await fetch(`/api/projects/${projectId}/deploy`);
                if (!r.ok) return;
                const j = await r.json();
                if (cancelled) return;
                if (j?.projectStatus) setProjectStatus(j.projectStatus);
                if (j?.deployment?.url) setDeploymentUrl(j.deployment.url);
                if (j?.deployment?.buildLogExcerpt) {
                    setDeployLog(j.deployment.buildLogExcerpt);
                }
                if (j?.projectStatus === 'ERROR') {
                    setDeployError(j?.deployment?.buildLogExcerpt || 'Deployment failed');
                }
                if (j?.projectStatus === 'LIVE' || j?.projectStatus === 'ERROR') {
                    clearInterval(interval);
                    setIframeKey(k => k + 1); // force refresh
                }
            } catch (e) {
                if (attempts > 10) clearInterval(interval);
            }
        }, 3000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [projectStatus, projectId]);

    const previewFile = files.find(f => f.path === 'preview.html');
    const codeFile = activePath ? files.find(f => f.path === activePath) : null;
    const hasPreview = !!previewFile;
    const liveReady = projectStatus === 'LIVE' && deploymentUrl;
    const liveMockFallback = projectStatus === 'LIVE' && !deploymentUrl && hasPreview; // LIVE status but mock env (no external URL)
    const showPreview = mode === 'preview' && (hasPreview || liveReady);
    const showLoader = showPreview && (previewLoading || !previewFile);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setMode('preview')} style={modeBtnStyle(mode === 'preview')}>Preview</button>
                <button onClick={() => setMode('files')} style={modeBtnStyle(mode === 'files')}>Files</button>
                <button onClick={() => setMode('plan')} style={modeBtnStyle(mode === 'plan')}>Plan</button>
                <button onClick={() => setMode('diff')} style={modeBtnStyle(mode === 'diff')}>Diff</button>
                <button onClick={() => setMode('history')} style={modeBtnStyle(mode === 'history')}>History</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 14, background: projectStatus === 'LIVE' ? '#065f46' : projectStatus === 'DEPLOYING' ? '#92400e' : projectStatus === 'ERROR' ? '#7f1d1d' : '#374151', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {projectStatus || 'NEW'}
                        {projectStatus === 'DEPLOYING' && <span style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />}
                    </span>
                    {projectStatus === 'ERROR' && (
                        <button onClick={() => setShowLog(s => !s)} style={{ background: '#374151', color: '#fff', border: '1px solid #4b5563', fontSize: 10, padding: '2px 6px', borderRadius: 6, cursor: 'pointer' }}>{showLog ? 'Hide Log' : 'View Log'}</button>
                    )}
                </div>
                <button
                    onClick={async () => {
                        try {
                            setDeployError(null); setDeployLog(null); setShowLog(false);
                            const r = await fetch(`/api/projects/${projectId}/redeploy`, { method: 'POST' });
                            if (!r.ok) {
                                console.warn('Redeploy failed');
                            } else {
                                setProjectStatus('DEPLOYING');
                            }
                        } catch (e) { console.warn('redeploy err', (e as any)?.message); }
                    }}
                    style={{ background: '#2563eb', color: '#fff', border: '1px solid #1d4ed8', fontSize: 11, padding: '.4rem .75rem', borderRadius: 8, cursor: 'pointer', fontWeight: 500, letterSpacing: '.03em' }}
                    disabled={projectStatus === 'DEPLOYING'}
                >{projectStatus === 'DEPLOYING' ? 'Deploying…' : (projectStatus === 'LIVE' ? 'Redeploy' : 'Deploy')}</button>
                <div style={{ fontSize: 11, opacity: 0.6, alignSelf: 'center' }}>Snapshot: {snapshotId ? snapshotId.slice(0, 8) : '—'}</div>
            </div>
            {projectStatus === 'ERROR' && deployError && (
                <div style={{ background: '#2d1f1f', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '0.75rem 1rem', fontSize: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontWeight: 600 }}>Deployment Failed</div>
                    <div style={{ whiteSpace: 'pre-wrap', opacity: 0.85, maxHeight: showLog ? 260 : 60, overflow: 'auto' }}>{showLog ? (deployLog || deployError) : deployError.slice(0, 160) + (deployError.length > 160 ? '…' : '')}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowLog(s => !s)} style={{ background: '#374151', color: '#fff', border: '1px solid #4b5563', fontSize: 11, padding: '.35rem .7rem', borderRadius: 6, cursor: 'pointer' }}>{showLog ? 'Collapse Log' : 'Expand Log'}</button>
                        <button onClick={async () => { setDeployError(null); setDeployLog(null); setShowLog(false); setProjectStatus('DEPLOYING'); await fetch(`/api/projects/${projectId}/redeploy`, { method: 'POST' }); }} style={{ background: '#2563eb', color: '#fff', border: '1px solid #1d4ed8', fontSize: 11, padding: '.35rem .7rem', borderRadius: 6, cursor: 'pointer' }}>Retry</button>
                    </div>
                </div>
            )}
            {/* PREVIEW MODE */}
            {mode === 'preview' && (
                <div style={{ position: 'relative', border: '1px solid var(--border, #333)', borderRadius: 10, background: '#0f1115', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {showPreview && (
                        liveReady ? (
                            <iframe
                                key={iframeKey + '-live'}
                                title="live-deployment"
                                style={{ flex: 1, width: '100%', border: 'none', background: '#fff', opacity: showLoader ? 0 : 1, transition: 'opacity .35s ease' }}
                                src={deploymentUrl || undefined}
                                onLoad={() => setPreviewLoading(false)}
                                sandbox="allow-same-origin allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals"
                            />
                        ) : previewFile && (
                            <iframe
                                key={iframeKey}
                                title="preview"
                                style={{ flex: 1, width: '100%', border: 'none', background: '#fff', opacity: showLoader ? 0 : 1, transition: 'opacity .35s ease' }}
                                srcDoc={previewFile.content}
                                onLoad={() => setPreviewLoading(false)}
                                sandbox="allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals" />
                        )
                    )}
                    {showLoader && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '1.25rem', gap: 12, background: 'linear-gradient(135deg,#0d0f13,#161b21)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div className="shimmer" style={{ width: 140, height: 16, borderRadius: 6 }} />
                                <div className="shimmer" style={{ width: 80, height: 16, borderRadius: 6 }} />
                                <div className="shimmer" style={{ width: 60, height: 16, borderRadius: 6 }} />
                            </div>
                            <div className="shimmer" style={{ width: '55%', height: 32, borderRadius: 8 }} />
                            <div className="shimmer" style={{ width: '70%', height: 14, borderRadius: 6 }} />
                            <div className="shimmer" style={{ width: '65%', height: 14, borderRadius: 6 }} />
                            <div className="shimmer" style={{ width: '40%', height: 14, borderRadius: 6 }} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                                <div className="shimmer" style={{ width: '100%', height: 140, borderRadius: 10 }} />
                                <div className="shimmer" style={{ width: '100%', height: 140, borderRadius: 10 }} />
                            </div>
                            <div style={{ position: 'absolute', bottom: 14, left: 16, fontSize: 11, letterSpacing: '.05em', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} /> Generating preview…
                            </div>
                            <style>{`
                            .shimmer{position:relative;overflow:hidden;background:linear-gradient(90deg,#1e242b 0%,#242c34 40%,#1e242b 80%);background-size:200% 100%;animation:sh 1.4s linear infinite;border:1px solid #1f252c}
                            @keyframes sh{0%{background-position:-120% 0}100%{background-position:120% 0}}
                            .pulse-dot{animation:pulse 1.2s ease-in-out infinite}
                            @keyframes pulse{0%,100%{transform:scale(.6);opacity:.4}50%{transform:scale(1);opacity:1}}
                            `}</style>
                        </div>
                    )}
                    <div style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 11, opacity: 0.5, pointerEvents: 'none' }}>{liveReady ? 'Live' : 'Preview'}</div>
                    {liveMockFallback && (
                        <div style={{ position: 'absolute', top: 8, right: 8, background: '#1e293b', border: '1px solid #334155', padding: '4px 8px', borderRadius: 6, fontSize: 10, color: '#cbd5e1', maxWidth: 240, lineHeight: 1.3 }}>
                            Deployment simulated (no Vercel token). Using generated preview instead.
                        </div>
                    )}
                </div>
            )}
            {/* FILES MODE */}
            {mode === 'files' && (
                <div style={{ display: 'flex', border: '1px solid var(--border, #333)', borderRadius: 10, background: '#0f1115', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ width: 250, background: '#13161b', borderRight: '1px solid #222', overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', opacity: 0.7 }}>Files {loading ? '…' : ''}</div>
                            <input value={fileSearch} onChange={e => setFileSearch(e.target.value)} placeholder="Search…" style={{ background: '#0f1419', border: '1px solid #1f2937', color: '#e2e8f0', fontSize: 11, padding: '4px 6px', borderRadius: 6 }} />
                            <div style={{ display: 'flex', gap: 4 }}>
                                {['created', 'updated'].map(tag => {
                                    const active = statusFilters.includes(tag);
                                    return <button key={tag} onClick={() => setStatusFilters(s => active ? s.filter(x => x !== tag) : [...s, tag])} style={{ background: active ? (tag === 'created' ? '#065f46' : '#92400e') : '#1e2530', color: '#fff', border: '1px solid #243040', fontSize: 10, padding: '3px 6px', borderRadius: 6, cursor: 'pointer' }}>{tag}</button>;
                                })}
                                {statusFilters.length > 0 && <button onClick={() => setStatusFilters([])} style={{ background: '#374151', color: '#fff', border: '1px solid #4b5563', fontSize: 10, padding: '3px 6px', borderRadius: 6, cursor: 'pointer' }}>×</button>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
                            {files.map(f => {
                                // Attempt to infer status from ordering or highlight markers: created/updated earlier sorted first via API; we can store status in data-status attribute when returned.
                                const status = (f as any).status;
                                const color = status === 'created' ? '#065f46' : status === 'updated' ? '#92400e' : 'transparent';
                                return (
                                    <div key={f.path} onClick={() => setActivePath(f.path)} style={{ cursor: 'pointer', padding: '4px 6px', borderRadius: 6, fontSize: 12, background: f.path === activePath ? '#1f2937' : 'transparent', color: f.path === activePath ? '#fff' : '#cbd5e1', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'relative' }}>
                                        {status !== 'unchanged' && <span style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', width: 6, height: 6, borderRadius: '50%', background: color }} />}
                                        <span style={{ marginLeft: status !== 'unchanged' ? 10 : 0 }}>{f.path}</span>
                                    </div>
                                );
                            })}
                            {!files.length && !loading && <div style={{ fontSize: 12, opacity: 0.6 }}>No files yet.</div>}
                        </div>
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
            {mode === 'plan' && (
                <div style={{ border: '1px solid var(--border, #333)', borderRadius: 10, background: '#0f1115', flex: 1, padding: '1rem', overflow: 'auto', fontSize: 12, lineHeight: 1.5 }}>
                    {planMeta ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <h3 style={{ margin: '0 0 .4rem', fontSize: 14, letterSpacing: '.05em', textTransform: 'uppercase', color: '#e2e8f0' }}>File Plan</h3>
                                {planMeta.planLines && planMeta.planLines.length ? (
                                    <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{planMeta.planLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                                ) : <div style={{ opacity: .6 }}>No plan lines.</div>}
                            </div>
                            {(planMeta.summary) && (
                                <div>
                                    <h4 style={{ margin: '0 0 .3rem', fontSize: 13, letterSpacing: '.05em', textTransform: 'uppercase', color: '#cbd5e1' }}>Summary</h4>
                                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{planMeta.summary}</p>
                                </div>
                            )}
                            {planMeta.proposed && planMeta.proposed.length > 0 && (
                                <div>
                                    <h4 style={{ margin: '0 0 .3rem', fontSize: 13, letterSpacing: '.05em', textTransform: 'uppercase', color: '#cbd5e1' }}>Proposed Changes</h4>
                                    <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{planMeta.proposed.map((p, i) => <li key={i}>{p}</li>)}</ul>
                                </div>
                            )}
                            {planMeta.pitfalls && planMeta.pitfalls.length > 0 && (
                                <div>
                                    <h4 style={{ margin: '0 0 .3rem', fontSize: 13, letterSpacing: '.05em', textTransform: 'uppercase', color: '#cbd5e1' }}>Potential Pitfalls</h4>
                                    <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{planMeta.pitfalls.map((p, i) => <li key={i}>{p}</li>)}</ul>
                                </div>
                            )}
                            {planMeta.todos && planMeta.todos.length > 0 && (
                                <div>
                                    <h4 style={{ margin: '0 0 .3rem', fontSize: 13, letterSpacing: '.05em', textTransform: 'uppercase', color: '#cbd5e1' }}>Next TODOs</h4>
                                    <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{planMeta.todos.map((p, i) => <li key={i}>{p}</li>)}</ul>
                                </div>
                            )}
                            {!planMeta.summary && !planMeta.planLines?.length && <div style={{ opacity: .6 }}>No plan metadata stored.</div>}
                        </div>
                    ) : (
                        <div style={{ opacity: .6 }}>No plan metadata.</div>
                    )}
                    <div style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 11, opacity: 0.5 }}>Plan</div>
                </div>
            )}
            {mode === 'diff' && (
                <div style={{ border: '1px solid var(--border, #333)', borderRadius: 10, background: '#0f1115', flex: 1, padding: '1rem', overflow: 'auto', fontSize: 12 }}>
                    {!snapshotId && <div style={{ opacity: .6 }}>No snapshot to diff.</div>}
                    {snapshotId && !diffData && <div style={{ opacity: .6 }}>Loading diff…</div>}
                    {diffData && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ fontSize: 11, opacity: .7 }}>Base: {diffData.baseSnapshotId ? diffData.baseSnapshotId.slice(0, 8) : '—'} → Target: {diffData.targetSnapshotId.slice(0, 8)}</div>
                            <section>
                                <h4 style={{ margin: '0 0 .4rem', fontSize: 13, letterSpacing: '.05em', textTransform: 'uppercase', color: '#e2e8f0' }}>Created</h4>
                                {diffData.created?.length ? <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{diffData.created.map((p: string) => <li key={p}>{p}</li>)}</ul> : <div style={{ opacity: .5 }}>None</div>}
                            </section>
                            <section>
                                <h4 style={{ margin: '0 0 .4rem', fontSize: 13, letterSpacing: '.05em', textTransform: 'uppercase', color: '#e2e8f0' }}>Updated</h4>
                                {diffData.updated?.length ? diffData.updated.map((u: any) => (
                                    <div key={u.path} style={{ marginBottom: 10, border: '1px solid #1f2937', borderRadius: 8 }}>
                                        <div style={{ background: '#1e293b', padding: '4px 8px', fontSize: 11 }}>{u.path}</div>
                                        <div style={{ display: 'flex', flexDirection: 'row', fontSize: 11 }}>
                                            <pre style={{ flex: 1, margin: 0, padding: 8, overflow: 'auto', background: '#111827', color: '#94a3b8' }}><code>{u.beforeExcerpt}</code></pre>
                                            <pre style={{ flex: 1, margin: 0, padding: 8, overflow: 'auto', background: '#0f172a', color: '#e2e8f0' }}><code>{u.afterExcerpt}</code></pre>
                                        </div>
                                    </div>
                                )) : <div style={{ opacity: .5 }}>None</div>}
                            </section>
                            <section>
                                <h4 style={{ margin: '0 0 .4rem', fontSize: 13, letterSpacing: '.05em', textTransform: 'uppercase', color: '#e2e8f0' }}>Deleted</h4>
                                {diffData.deleted?.length ? <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>{diffData.deleted.map((p: string) => <li key={p}>{p}</li>)}</ul> : <div style={{ opacity: .5 }}>None</div>}
                            </section>
                        </div>
                    )}
                    <div style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 11, opacity: 0.5 }}>Diff</div>
                </div>
            )}
            {mode === 'history' && (
                <div style={{ border: '1px solid var(--border, #333)', borderRadius: 10, background: '#0f1115', flex: 1, padding: '1rem', overflow: 'auto', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {historyLoading && <div style={{ opacity: .6 }}>Loading history…</div>}
                    {!historyLoading && !history.length && <div style={{ opacity: .6 }}>No snapshots.</div>}
                    {!historyLoading && history.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead><tr style={{ textAlign: 'left', background: '#1e293b' }}><th style={{ padding: 6 }}>ID</th><th style={{ padding: 6 }}>Created</th><th style={{ padding: 6 }}>Files</th><th style={{ padding: 6 }}>Actions</th></tr></thead>
                            <tbody>
                                {history.map(h => (
                                    <tr key={h.id} style={{ borderTop: '1px solid #1f2937' }}>
                                        <td style={{ padding: 6, fontFamily: 'var(--font-mono, monospace)' }}>{h.id.slice(0, 8)}</td>
                                        <td style={{ padding: 6 }}>{new Date(h.createdAt).toLocaleTimeString()}</td>
                                        <td style={{ padding: 6 }}>{h.fileCount}</td>
                                        <td style={{ padding: 6, display: 'flex', gap: 6 }}>
                                            <button onClick={async () => { setActivePath(null); setMode('files'); setSnapshotId(h.id); try { const s = await fetch(`/api/projects/${projectId}/snapshots/${h.id}`); const sj = await s.json(); if (Array.isArray(sj.files)) { setFiles(sj.files); setPlanMeta(sj.planMeta || null); } } catch { } }} style={histBtnStyle()}>Open</button>
                                            <button onClick={async () => { try { const r = await fetch(`/api/projects/${projectId}/snapshots/${h.id}/diff`); if (r.ok) { setDiffData(await r.json()); setMode('diff'); } } catch { } }} style={histBtnStyle()}>Diff</button>
                                            <button onClick={async () => { if (!confirm('Rollback to this snapshot?')) return; try { const r = await fetch(`/api/projects/${projectId}/snapshots/${h.id}/rollback`, { method: 'POST' }); if (r.ok) { const j = await r.json(); if (j.snapshotId) { window.dispatchEvent(new CustomEvent('sorya:snapshot-updated', { detail: { projectId, snapshotId: j.snapshotId } })); setMode('preview'); } } } catch { } }} style={{ ...histBtnStyle(), background: '#7f1d1d', borderColor: '#7f1d1d' }}>Rollback</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <div style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 11, opacity: 0.5 }}>History</div>
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

function histBtnStyle(): React.CSSProperties {
    return { background: '#1e293b', color: '#fff', border: '1px solid #334155', fontSize: 10, padding: '4px 6px', borderRadius: 6, cursor: 'pointer' } as any;
}
