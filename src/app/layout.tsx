import React from 'react';
import './globals.css';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Sorya',
    description: 'AI project generator'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
