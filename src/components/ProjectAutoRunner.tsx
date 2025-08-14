"use client";
import { useEffect, useState } from 'react';

interface Props { projectId: string }

export default function ProjectAutoRunner({ projectId }: Props) {
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>('Initializing...');

    useEffect(() => {
        // Check localStorage flag
        let data: any = null;
        try { const raw = localStorage.getItem('sorya:auto-gen'); if (raw) data = JSON.parse(raw); } catch { }
        if (!data || data.projectId !== projectId) return;
        console.log('[ProjectAutoRunner] auto-gen flag detected', data);
        // Remove flag so it doesn't re-run later
        localStorage.removeItem('sorya:auto-gen');
        const userPrompt = data.prompt as string;
        setRunning(true);
        setProgress('Generating...');
        (async () => {
            try {
                console.log('[ProjectAutoRunner] calling /api/chat', { projectId, promptPreview: userPrompt.slice(0, 140) });
                const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: userPrompt, projectId }) });
                console.log('[ProjectAutoRunner] /api/chat response', { status: res.status });
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    console.warn('[ProjectAutoRunner] generation failed', { status: res.status, body: d });
                    setError(d.error || 'Generation failed');
                    setProgress('Failed');
                    setRunning(false);
                    return;
                }
                const body = await res.json().catch(() => null);
                console.log('[ProjectAutoRunner] generation success', { snapshotId: body?.snapshotId, routineId: body?.routineId });
                if (body?.snapshotId) {
                    try { window.dispatchEvent(new CustomEvent('sorya:snapshot-updated', { detail: { projectId, snapshotId: body.snapshotId } })); } catch { }
                }
                // success - the project page will refetch on next navigation or user interaction; optionally we could force reload.
                setProgress('Completed');
                setTimeout(() => setRunning(false), 2000);
            } catch (e: any) {
                console.error('[ProjectAutoRunner] generation error', e?.message);
                setError('Generation failed');
                setProgress('Failed');
                setRunning(false);
            }
        })();
    }, [projectId]);

    if (!running && !error) return null;

    return (
        <div style={{ marginTop: 8, padding: '.6rem .7rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-alt)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            {running && <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: 'var(--text)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />}
            <span>{error ? error : progress}</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}
