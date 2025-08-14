"use client";
import React, { createContext, useContext, useState, useCallback } from 'react';

interface CreditsCtx {
    balance: number | null;
    setBalance: (n: number | null) => void;
    applyDelta: (d: number) => void;
}

const Ctx = createContext<CreditsCtx | null>(null);

export function useCredits() {
    const c = useContext(Ctx);
    if (!c) throw new Error('useCredits outside provider');
    return c;
}

export default function CreditsRoot({ children }: { children: React.ReactNode }) {
    const [balance, setBalance] = useState<number | null>(null);
    const applyDelta = useCallback((d: number) => setBalance(b => (typeof b === 'number' ? b + d : b)), []);
    return <Ctx.Provider value={{ balance, setBalance, applyDelta }}>{children}</Ctx.Provider>;
}
