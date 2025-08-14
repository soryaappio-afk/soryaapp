"use client";
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { validateAppBundle, AppBundle } from '@/src/types/appBundle';

function tryExtractJSON(buffer: string): { json?: any } {
    const start = buffer.indexOf('{');
    const end = buffer.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return {};
    const candidate = buffer.slice(start, end + 1);
    let depth = 0;
    for (let i = 0; i < candidate.length; i++) {
        if (candidate[i] === '{') depth++;
        else if (candidate[i] === '}') depth--;
        if (depth === 0 && i < candidate.length - 1) return {};
    }
    if (depth !== 0) return {};
    try { return { json: JSON.parse(candidate) }; } catch { return {}; }
}

function buildStandaloneHTML(bundle: AppBundle): string {
    const map = new Map(bundle.files.map(f => [f.path, f]));
    const resolveContent = (path: string): string => {
        const file = map.get(path);
        if (!file) return `<!-- missing: ${path} -->`;
        return file.content;
    };
    let entry = resolveContent(bundle.entry);
    const assetBlobs: Record<string, string> = {};
    for (const f of bundle.files) {
        if (f.mime === 'text/css' || f.mime === 'text/javascript') {
            const blob = new Blob([f.content], { type: f.mime });
            assetBlobs[f.path] = URL.createObjectURL(blob);
        }
    }
    entry = entry.replace(/<(script)\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/g, (m, tag, src) => assetBlobs[src] ? `<script src="${assetBlobs[src]}"></script>` : m)
        .replace(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/g, (m, href) => assetBlobs[href] ? `<link rel="stylesheet" href="${assetBlobs[href]}">` : m);
    return entry;
}

export default function AppBundleGenerator() {
    const [brief, setBrief] = useState("Create a portfolio site with a hero and grid");
    const [runtimeLock, setRuntimeLock] = useState(true);
    const [status, setStatus] = useState("Idle");
    const [error, setError] = useState<string | null>(null);
    const [bundle, setBundle] = useState<AppBundle | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const [importing, setImporting] = useState(false);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [projects, setProjects] = useState<any[]>([]);

    useEffect(() => { (async () => { try { const r = await fetch('/api/projects'); if (r.ok) { const j = await r.json(); if (Array.isArray(j.projects)) setProjects(j.projects); } } catch { } })(); }, []);

    const run = useCallback(async () => {
        if (abortRef.current) abortRef.current.abort();
        setError(null); setBundle(null); setStatus("Requesting...");
        const ctrl = new AbortController(); abortRef.current = ctrl;
        const res = await fetch('/api/app-bundle', { method: 'POST', body: JSON.stringify({ brief, runtimeLock: runtimeLock ? 'web-standalone' : undefined }), signal: ctrl.signal });
        if (!res.body) { setError('No body'); return; }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += dec.decode(value, { stream: true });
            setStatus(`Streaming ${(buffer.length / 1024).toFixed(1)}KB`);
            const { json } = tryExtractJSON(buffer);
            if (json) {
                const v = validateAppBundle(json);
                if (!v.ok) { setError(v.errors?.join('; ') || 'Invalid'); setStatus('Validation failed'); }
                else {
                    const locked = runtimeLock ? { ...json, runtime: 'web-standalone' } : json;
                    setBundle(locked); setStatus('Ready');
                    renderPreview(locked);
                }
            }
        }
        setStatus(s => s === 'Ready' ? s : 'Complete');
    }, [brief, runtimeLock]);

    const renderPreview = (b: AppBundle) => {
        if (!iframeRef.current) return;
        if (b.runtime === 'web-vite') { setError('web-vite preview (WebContainers) not implemented yet'); return; }
        const html = buildStandaloneHTML(b);
        const blob = new Blob([html], { type: 'text/html' });
        iframeRef.current.src = URL.createObjectURL(blob);
    };

    const importToProject = async () => {
        if (!bundle) return;
        setImporting(true); setError(null);
        try {
            const r = await fetch('/api/projects/import-bundle', { method: 'POST', body: JSON.stringify({ bundle, projectId: projectId || undefined }) });
            const j = await r.json();
            if (!r.ok) { setError(j.error || 'Import failed'); }
            else { setStatus(`Imported snapshot ${j.snapshotId.slice(0, 8)}`); }
        } catch (e: any) { setError(e?.message || 'Import error'); }
        finally { setImporting(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 960, margin: '0 auto', fontFamily: 'system-ui,sans-serif', padding: '1.5rem' }}>
            <h2 style={{ margin: 0 }}>App Bundle Generator</h2>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Brief</span>
                <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3} style={{ resize: 'vertical', background: '#0f1115', color: '#fff', border: '1px solid #2d2f37', borderRadius: 8, padding: '.75rem', fontFamily: 'inherit' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={runtimeLock} onChange={e => setRuntimeLock(e.target.checked)} /> Force web-standalone runtime
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={run} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '.6rem 1.1rem', borderRadius: 8, cursor: 'pointer' }}>Generate</button>
                <button onClick={() => { setBrief('Create a portfolio site with a hero and grid'); run(); }} style={{ background: '#374151', color: '#fff', border: 'none', padding: '.6rem 1.1rem', borderRadius: 8, cursor: 'pointer' }}>Test Action</button>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{status}</div>
            </div>
            {bundle && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={projectId || ''} onChange={e => setProjectId(e.target.value || null)} style={{ background: '#0f1115', color: '#fff', border: '1px solid #2d2f37', borderRadius: 6, padding: '.45rem .55rem', fontSize: 12 }}>
                        <option value=''>New Project</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button onClick={importToProject} disabled={importing} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '.55rem .9rem', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>{importing ? 'Importing...' : 'Import Bundle'}</button>
                </div>
            )}
            {error && <div style={{ background: '#3f1d28', color: '#ffb4c4', padding: '.55rem .7rem', borderRadius: 6, fontSize: 12 }}>{error}</div>}
            <div style={{ border: '1px solid #2d2f37', borderRadius: 12, background: '#0b0d10', minHeight: 480, overflow: 'hidden' }}>
                <iframe ref={iframeRef} title="preview" sandbox="allow-scripts" style={{ width: '100%', height: 480, border: 'none', background: '#111' }} />
            </div>
            {bundle && <details style={{ fontSize: 12 }}><summary style={{ cursor: 'pointer' }}>Bundle JSON</summary><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, background: '#111', padding: '1rem', borderRadius: 8, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(bundle, null, 2)}</pre></details>}
        </div>
    );
}
