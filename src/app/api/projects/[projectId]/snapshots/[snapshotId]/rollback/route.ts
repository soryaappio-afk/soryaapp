import { NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { runDeploymentRoutine } from '@/lib/deploy';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: { projectId: string; snapshotId: string } }) {
    if (!prismaAvailable || !prisma) return NextResponse.json({ error: 'db_unavailable' }, { status: 503 });
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const { projectId, snapshotId } = params;
    try {
        const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
        if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        const snap = await prisma.projectSnapshot.findFirst({ where: { id: snapshotId, projectId } });
        if (!snap) return NextResponse.json({ error: 'snapshot_not_found' }, { status: 404 });
        await prisma.project.update({ where: { id: projectId }, data: { lastSnapshotId: snapshotId, status: 'LIVE' } });
        const routine = await prisma.routine.create({ data: { userId, projectId, kind: 'ROLLBACK', status: 'SUCCESS', steps: [{ type: 'rollback_applied', ts: Date.now(), snapshotId }], finishedAt: new Date() } });
        if (process.env.AUTO_DEPLOY_ON_GENERATION === 'true' && process.env.VERCEL_TOKEN) {
            setTimeout(() => { runDeploymentRoutine({ projectId, userId, auto: true }).catch(e => console.warn('[rollback] auto-deploy error', e?.message)); }, 50);
        }
        return NextResponse.json({ ok: true, snapshotId, routineId: routine.id });
    } catch (e: any) {
        return NextResponse.json({ error: 'rollback_error', message: e?.message }, { status: 500 });
    }
}
