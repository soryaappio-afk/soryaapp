"use client";
import React from 'react';

interface Props { provider: 'github' | 'google'; label: string; onClick: () => void; }

const iconMap: Record<string, JSX.Element> = {
    github: (
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.7.4-1.1.7-1.4-2.6-.3-5.4-1.3-5.4-5.9 0-1.3.5-2.3 1.1-3.2-.1-.3-.5-1.5.1-3 0 0 1-.3 3.3 1.1a11.4 11.4 0 0 1 6 0c2.3-1.4 3.3-1.1 3.3-1.1.6 1.5.2 2.7.1 3 .7.9 1.1 1.9 1.1 3.2 0 4.6-2.8 5.6-5.4 5.9.4.3.7.9.7 1.8v2.6c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.6 18.3.5 12 .5Z" />
        </svg>
    ),
    google: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.2 2.8-2.6 3.6v3h4.2c2.4-2.2 3.8-5.4 3.8-8.7Z" /><path fill="#34A853" d="M12 24c3.6 0 6.6-1.2 8.8-3.3l-4.2-3c-1.2.8-2.7 1.3-4.6 1.3-3.5 0-6.5-2.3-7.6-5.5H.1v3.1A12 12 0 0 0 12 24Z" /><path fill="#FBBC05" d="M4.4 13.5c-.3-1-.4-2-.4-3s.1-2 .4-3V4.4H.1A12 12 0 0 0 0 10.5c0 1.9.4 3.8 1.1 5.5l3.3-2.5Z" /><path fill="#EA4335" d="M12 4.8c1.9 0 3.6.6 5 1.7l3.7-3.7C18.6 1.2 15.6 0 12 0A12 12 0 0 0 1.1 4.4l3.3 2.5C5.5 7 8.5 4.8 12 4.8Z" /></svg>
    )
};

export function OAuthButton({ provider, label, onClick }: Props) {
    return (
        <button type="button" onClick={onClick} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            border: '1px solid var(--border)', background: 'var(--bg-alt)', color: 'var(--text)',
            padding: '.65rem .9rem', borderRadius: 10, fontSize: '.85rem', fontWeight: 500
        }}>
            {iconMap[provider]} {label}
        </button>
    );
}

export default OAuthButton;
