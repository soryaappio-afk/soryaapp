"use client";
import React, { useState, useMemo } from 'react';

interface FileItem { path: string; content: string }
interface Props { files: FileItem[] }

export default function ProjectPreviewPanel({ files }: Props) {
    const [activePath, setActivePath] = useState<string | null>(files[0]?.path || null);
    const active = useMemo(() => files.find(f => f.path === activePath), [files, activePath]);

    if (!files.length) {
        return <div style={panelStyle}>No snapshot yet.</div>;
    }

    return (
        <div style={panelStyle}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                {files.map(f => (
                    <button key={f.path} onClick={() => setActivePath(f.path)} style={{
                        border: '1px solid var(--border)',
                        background: f.path === activePath ? 'var(--hero-start)' : 'var(--bg-alt)',
                        color: f.path === activePath ? '#fff' : 'var(--text)',
                        fontSize: 11,
                        padding: '.35rem .6rem',
                        borderRadius: 6,
                        cursor: 'pointer'
                    }}>{f.path}</button>
                ))}
            </div>
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 320 }}>
                {active && (
                    <pre style={{
                        margin: 0,
                        flex: 1,
                        background: 'var(--bg-alt)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '1rem',
                        fontSize: 12,
                        lineHeight: 1.45,
                        overflow: 'auto',
                        maxHeight: '70vh'
                    }}>
                        <code>{active.content}</code>
                    </pre>
                )}
            </div>
        </div>
    );
}

const panelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%'
};
