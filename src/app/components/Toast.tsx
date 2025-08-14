"use client";
import React, { createContext, useCallback, useContext, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
  kind?: 'info' | 'error' | 'success' | 'warning';
  ttl?: number; // ms
}

interface ToastCtx {
  push: (t: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    const toast: Toast = { id, ttl: 5000, kind: 'info', ...t };
    setToasts(prev => [...prev, toast]);
    if (toast.ttl) setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), toast.ttl);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.kind === 'error' ? '#7a1f1f' : t.kind === 'success' ? '#14532d' : t.kind === 'warning' ? '#78350f' : '#1f2937',
            color: 'white', padding: '10px 14px', borderRadius: 8, fontSize: '.8rem', boxShadow: '0 4px 12px rgba(0,0,0,.4)',
            border: '1px solid rgba(255,255,255,.1)'
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
