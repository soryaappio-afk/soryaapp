"use client";
import React, { useEffect, useState } from 'react';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';

// Cycles through: system -> light -> dark -> system
export default function ThemeToggle({ style }: { style?: React.CSSProperties }) {
  const [mode, setMode] = useState<'system' | 'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('theme') as any) || 'system';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function apply() {
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const finalTheme = mode === 'system' ? (sysDark ? 'dark' : 'light') : mode;
      document.documentElement.setAttribute('data-theme', finalTheme);
      localStorage.setItem('theme', mode);
    }
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => { if (mode === 'system') apply(); };
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [mode]);

  function cycle() {
    setMode(m => m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system');
  }

  const Icon = mode === 'system' ? BrightnessAutoIcon : mode === 'light' ? LightModeIcon : DarkModeIcon;
  const label = `Theme: ${mode}`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label + ' (click to change)'}
      onClick={cycle}
      style={{
        background: 'var(--bg-alt)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        width: 38,
        height: 38,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        ...style
      }}
    >
      <Icon sx={{ fontSize: 18 }} />
    </button>
  );
}
