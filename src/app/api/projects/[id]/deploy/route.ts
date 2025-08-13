import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { z } from 'zod';
import { ensureVercelProject, createDeployment } from '@/src/lib/vercel';
import { ensureInitialGrant, getCreditBalance, addCreditEntry } from '@/src/lib/credits';

const ParamsSchema = z.object({ id: z.string() });
const DEPLOYMENT_CREDIT_COST = 20; // flat cost per deployment attempt trigger
const MAX_FIX_ATTEMPTS = 2; // initial attempt + one fix attempt

function parseFirstError(log: string): string | null {
    const lines = log.split(/\r?\n/);
    const errLine = lines.find(l => /error|failed|exception/i.test(l));
    return errLine || null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parse = ParamsSchema.safeParse(params);
    if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    const projectId = parse.data.id;
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Credits
    await ensureInitialGrant(session.user.id);
    const balance = await getCreditBalance(session.user.id);
    if (balance < DEPLOYMENT_CREDIT_COST) {
        return NextResponse.json({ error: 'Insufficient credits for deployment', required: DEPLOYMENT_CREDIT_COST, balance }, { status: 402 });
    }
    await addCreditEntry(session.user.id, -DEPLOYMENT_CREDIT_COST, 'deployment_attempt_trigger', { projectId });

    // Routine for deployment + fix loop
    const routine = await prisma.routine.create({ data: { userId: session.user.id, projectId, kind: 'DEPLOYMENT', status: 'RUNNING', steps: [] } });
    const steps: any[] = [];

    await prisma.project.update({ where: { id: projectId }, data: { status: 'DEPLOYING' } });

    let finalState: string = 'PENDING';
    let deploymentUrl: string | undefined;
    let attempt = 0;

    while (attempt < MAX_FIX_ATTEMPTS) {
        attempt += 1;
        steps.push({ type: 'deploy_attempt_start', attempt, ts: Date.now() });

        // Use current snapshot
        const latestSnapshot = project.lastSnapshotId ? await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } }) : null;
        const files = (latestSnapshot?.files as any[]) || [];

        // Simulate one failure on first attempt (mock scenario)
        let mockError = false;
        if (attempt === 1) mockError = true; // force first attempt failure to exercise loop

        // Ensure (mock) project and create (mock) deployment
        await ensureVercelProject(project.id, project.name);
        let buildLog = '';
        let depState: 'BUILDING' | 'READY' | 'ERROR' = 'READY';
        if (mockError) {
            depState = 'ERROR';
            buildLog = 'Step 3/10: Building application...\nError: Module not found: Cannot resolve \"next/config\" in /app/src';
        } else {
            const vercelDep = await createDeployment(project.id, files);
            depState = vercelDep.state;
            deploymentUrl = vercelDep.url;
            buildLog = 'Build succeeded';
        }

        const deployment = await prisma.deployment.create({ data: { projectId, state: depState === 'READY' ? 'READY' : 'ERROR', attempt, buildLogExcerpt: buildLog.slice(0, 240), url: deploymentUrl } });

        steps.push({ type: 'build_log_capture', attempt, ts: Date.now(), excerpt: deployment.buildLogExcerpt });

        if (depState === 'READY') {
            steps.push({ type: 'deploy_attempt_result', attempt, ts: Date.now(), state: 'SUCCESS', url: deploymentUrl });
            finalState = 'LIVE';
            break;
        } else {
            const parsed = parseFirstError(buildLog);
            steps.push({ type: 'deploy_attempt_result', attempt, ts: Date.now(), state: 'ERROR', parsedError: parsed });
            if (attempt >= MAX_FIX_ATTEMPTS) {
                finalState = 'ERROR';
                break;
            }
            // Apply simple patch to try fix (append comment to app/page.tsx)
            if (latestSnapshot) {
                const filesArr = [...files].map(f => ({ path: f.path, content: f.content }));
                const idx = filesArr.findIndex(f => f.path === 'app/page.tsx');
                const fixBanner = `\n\n// Automated fix attempt ${attempt} at ${new Date().toISOString()} addressing: ${parsed || 'unknown error'}`;
                if (idx >= 0) filesArr[idx] = { path: 'app/page.tsx', content: filesArr[idx].content + fixBanner + '\n// TODO: implement real fix' };
                else filesArr.push({ path: 'app/page.tsx', content: `export default function GeneratedPage(){return <div>Patched attempt for ${project.name}</div>}` });
                const newSnapshot = await prisma.projectSnapshot.create({ data: { projectId: project.id, files: filesArr } });
                await prisma.project.update({ where: { id: project.id }, data: { lastSnapshotId: newSnapshot.id } });
                steps.push({ type: 'patch_apply', attempt, ts: Date.now(), snapshotId: newSnapshot.id, note: 'Mock fix patch appended.' });
            }
        }
    }

    await prisma.project.update({ where: { id: projectId }, data: { status: finalState, deploymentUrl: deploymentUrl || project.deploymentUrl } });
    await prisma.routine.update({ where: { id: routine.id }, data: { steps, status: finalState === 'LIVE' ? 'SUCCESS' : 'ERROR', finishedAt: new Date() } });

    const newBalance = await getCreditBalance(session.user.id);
    return NextResponse.json({ routineId: routine.id, finalState, deploymentUrl, steps, balance: newBalance });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parse = ParamsSchema.safeParse(params);
    if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    const projectId = parse.data.id;
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const latest = await prisma.deployment.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ deployment: latest, projectStatus: project.status });
}
