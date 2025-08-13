"use client";
import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import GridViewIcon from '@mui/icons-material/GridView';
import SiteHeader from '@/src/components/SiteHeader';

const STATUSES = ['NEW', 'DEPLOYING', 'LIVE', 'ERROR'] as const;
const TAGS = ['Internal tools', 'Website', 'Personal', 'Consumer App', 'B2B App', 'Prototype'];

interface Project { id: string; name: string; type?: string | null; typeConfidence?: number | null; deploymentUrl?: string | null; status?: string | null }
interface Props { projects: Project[]; credits: number; session: any }

export default function DashboardClient({ projects, credits, session }: Props) {
    const [filter, setFilter] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [laneMode, setLaneMode] = useState(false);
    const filtered = useMemo(() => {
        let base = projects;
        if (filter) base = base.filter(p => (p.type || '').toLowerCase() === filter.toLowerCase());
        if (statusFilter) base = base.filter(p => (p.status || 'NEW') === statusFilter);
        return base;
    }, [projects, filter, statusFilter]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <SiteHeader credits={credits} session={session} />
            <div style={{ display: 'flex', alignItems: 'center', padding: '.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg)', gap: 16, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 12, letterSpacing: '.5px' }}>Type:</strong>
                <FilterPill active={!filter} label="All" onClick={() => setFilter(null)} />
                {TAGS.map(t => <FilterPill key={t} active={filter === t} label={t} onClick={() => setFilter(t)} />)}
                <strong style={{ fontSize: 12, letterSpacing: '.5px', marginLeft: 12 }}>Status:</strong>
                <FilterPill active={!statusFilter} label="All" onClick={() => setStatusFilter(null)} />
                {STATUSES.map(s => <FilterPill key={s} active={statusFilter === s} label={s} onClick={() => setStatusFilter(s)} />)}
                <button type="button" onClick={() => setLaneMode(m => !m)} style={{ fontSize: 11, padding: '.4rem .7rem', borderRadius: 20, border: '1px solid var(--border)', background: laneMode ? 'var(--primary)' : 'var(--bg-alt)', color: laneMode ? '#fff' : 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                    {laneMode ? <GridViewIcon sx={{ fontSize: 14 }} /> : <ViewWeekIcon sx={{ fontSize: 14 }} />}
                    {laneMode ? 'Grid' : 'Lanes'}
                </button>
            </div>
            <main style={{ flex: 1, padding: '1.5rem 1.25rem 3rem', maxWidth: 1400, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
                {!laneMode && (
                    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>
                        {filtered.map(p => <ProjectCard key={p.id} project={p} />)}
                        {filtered.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No projects</div>}
                    </div>
                )}
                {laneMode && (
                    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', overflowX: 'auto' }}>
                        {TAGS.map(t => {
                            const laneProjects = filtered.filter(p => (p.type || 'Prototype') === t);
                            return (
                                <div key={t} style={{ minWidth: 230, flex: '0 0 230px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', padding: '.25rem .4rem' }}>{t}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {laneProjects.map(p => <ProjectCard key={p.id} project={p} />)}
                                        {laneProjects.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return <button type="button" onClick={onClick} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', padding: '.3rem .6rem', borderRadius: 20, background: active ? 'var(--primary)' : 'var(--bg-alt)', color: active ? '#fff' : 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>{label}</button>;
}

function ProjectCard({ project }: { project: Project }) {
    return (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '.85rem .9rem', background: 'var(--bg-alt)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13, lineHeight: 1.2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}><Link href={`/projects/${project.id}`}>{project.name}</Link></strong>
                <ProjectStatus status={project.status || 'NEW'} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minHeight: 20 }}>
                {project.type && <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', padding: '.25rem .55rem', borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--border)' }}>{project.type}{project.typeConfidence != null && <span style={{ marginLeft: 4, opacity: .7 }}>{Math.round(project.typeConfidence * 100)}%</span>}</span>}
                {project.deploymentUrl && <a style={{ fontSize: 11 }} target="_blank" href={project.deploymentUrl}>Preview</a>}
            </div>
        </div>
    );
}

function ProjectStatus({ status }: { status: string }) {
    const map: Record<string, { bg: string; color: string; label: string }> = {
        NEW: { bg: '#eee', color: '#333', label: 'NEW' },
        DEPLOYING: { bg: '#ffecb3', color: '#8a5d00', label: 'DEPLOYING' },
        LIVE: { bg: '#d1fae5', color: '#065f46', label: 'LIVE' },
        ERROR: { bg: '#ffe4e6', color: '#9f1239', label: 'ERROR' }
    };
    const v = map[status] || map.NEW;
    return <span style={{ background: v.bg, color: v.color, fontSize: 10, padding: '.2rem .45rem', borderRadius: 8, fontWeight: 600 }}>{v.label}</span>;
}
