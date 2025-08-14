import React from 'react';
import './globals.css';
import { Metadata } from 'next';
import CreditsRoot from '../components/CreditsRoot';
import { ToastProvider } from './components/Toast';

export const metadata: Metadata = {
    title: 'Sorya',
    description: 'AI project generator'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <ToastProvider>
                    <CreditsRoot>{children}</CreditsRoot>
                </ToastProvider>
            </body>
        </html>
    );
}
