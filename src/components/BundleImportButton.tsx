"use client";
import React, { useState } from 'react';
import { validateAppBundle } from '@/src/types/appBundle';

export default function BundleImportButton({ projectId }: { projectId?: string }) {
    const [value, setValue] = useState('');
    const [status, setStatus] = useState<string>('');
    const importBundle = async () => {
        setStatus('Parsing...');
        let json: any;
        try { json = JSON.parse(value); } catch { setStatus('Invalid JSON'); return; }
        const v = validateAppBundle(json);
        if (!v.ok) { setStatus('Schema errors: ' + v.errors?.slice(0, 4).join('; ')); return; }
        setStatus('Uploading...');
        const r = await fetch('/api/projects/import-bundle', { method: 'POST', body: JSON.stringify({ bundle: json, projectId }) });
        const j = await r.json();
        if (!r.ok) { setStatus(j.error || 'Failed'); return; }
        setStatus('Imported snapshot ' + j.snapshotId.slice(0, 8));
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#13161b', padding: '0.75rem', border: '1px solid #2a2f38', borderRadius: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Import AppBundle JSON</div>
            <textarea value={value} onChange={e => setValue(e.target.value)} placeholder='Paste AppBundle JSON here' rows={5} style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical', background: '#0f1115', color: '#fff', border: '1px solid #2d2f37', borderRadius: 6, padding: '.5rem' }} />
            <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={importBundle} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '.45rem .9rem', fontSize: 12, cursor: 'pointer' }}>Import</button>
                <span style={{ fontSize: 11, opacity: 0.75 }}>{status}</span>
            </div>
        </div>
    );
}
