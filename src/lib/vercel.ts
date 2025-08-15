// Vercel integration utility (real API + graceful mock fallback)
// If VERCEL_TOKEN is absent we remain in mock mode (no external calls).
import { prisma } from '@/src/lib/db';

export interface EnsureProjectResult { projectId: string; vercelProjectSlug: string; created: boolean; }
export interface VercelDeploymentResult { deploymentId: string; url: string; state: 'BUILDING' | 'READY' | 'ERROR'; readyState?: string; }

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID; // optional

function vercelHeaders() {
    return {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json'
    };
}

async function vercelFetch(path: string, init?: RequestInit) {
    const teamQS = VERCEL_TEAM_ID ? (path.includes('?') ? '&' : '?') + 'teamId=' + VERCEL_TEAM_ID : '';
    const url = `https://api.vercel.com${path}${teamQS}`;
    const res = await fetch(url, { ...init, headers: { ...(init?.headers || {}), ...vercelHeaders() } });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Vercel API ${path} ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
}

export async function ensureVercelProject(appProjectId: string, name: string): Promise<EnsureProjectResult> {
    if (!VERCEL_TOKEN || !prisma) {
        return { projectId: appProjectId, vercelProjectSlug: `mock-${appProjectId.slice(0, 8)}`, created: false };
    }
    const project = await prisma.project.findUnique({ where: { id: appProjectId } });
    const p: any = project;
    if (p?.vercelProjectId && p?.vercelProjectSlug) {
        return { projectId: p.vercelProjectId, vercelProjectSlug: p.vercelProjectSlug, created: false };
    }
    const body = { name: `sorya-${appProjectId.slice(0, 8)}`, framework: 'nextjs' };
    const created = await vercelFetch('/v10/projects', { method: 'POST', body: JSON.stringify(body) });
    await prisma.project.update({ where: { id: appProjectId }, data: { vercelProjectId: created.id, vercelProjectSlug: created.name } as any });
    return { projectId: created.id, vercelProjectSlug: created.name, created: true };
}

export async function createDeployment(appProjectId: string, files: { path: string; content: string }[]): Promise<VercelDeploymentResult> {
    if (!VERCEL_TOKEN || !prisma) {
        // Mock mode: no real external deployment. Provide empty URL so UI stays on preview.html.
        const ts = Date.now().toString(36);
        return { deploymentId: `mock_${appProjectId.slice(0, 6)}_${ts}`, url: '', state: 'READY' };
    }
    const project = await prisma.project.findUnique({ where: { id: appProjectId } });
    const p: any = project;
    if (!p?.vercelProjectId) await ensureVercelProject(appProjectId, p?.name || 'app');
    const preview = files.find(f => f.path === 'preview.html');
    if (preview && !files.some(f => f.path === 'index.html')) {
        files.push({ path: 'index.html', content: preview.content }); // fallback root
    }
    const payloadFiles = files.map(f => ({ file: f.path, data: Buffer.from(f.content).toString('base64'), encoding: 'base64' }));
    const depBody: any = { files: payloadFiles, project: (p as any)?.vercelProjectId };
    const created = await vercelFetch('/v13/deployments', { method: 'POST', body: JSON.stringify(depBody) });
    let state: string = created.readyState || created.state || 'BUILDING';
    let final: any = created;
    let attempts = 0;
    while (['QUEUED', 'BUILDING'].includes(state) && attempts < 15) {
        await new Promise(r => setTimeout(r, 2000));
        attempts += 1;
        try {
            final = await vercelFetch(`/v13/deployments/${created.id}`);
            state = final.readyState || final.state;
            if (state === 'ERROR') break;
        } catch { break; }
    }
    const ready = state === 'READY';
    return { deploymentId: created.id, url: final.url ? `https://${final.url}` : '', state: ready ? 'READY' : (state === 'ERROR' ? 'ERROR' : 'BUILDING'), readyState: state };
}
