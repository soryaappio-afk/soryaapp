import { NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';

// Diagnostic logging + fallback: if lastSnapshotId missing but snapshots exist, repair.

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { projectId: string } }) {
    const projectId = params.projectId;
    try {
        const session: any = await getServerSession(authOptions as any);
        if (!session?.user) return NextResponse.json({ snapshotId: null, error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;
        if (!prisma || !prismaAvailable) {
            console.warn('[api/projects/latest-snapshot] prisma unavailable');
            return NextResponse.json({ snapshotId: null, bypassed: true }, { status: 200 });
        }
        const p = await prisma.project.findFirst({
            where: { id: projectId, userId },
            select: { lastSnapshotId: true }
        });
        if (!p) return NextResponse.json({ snapshotId: null, error: 'Not found' }, { status: 404 });
        if (p?.lastSnapshotId) {
            return NextResponse.json({ snapshotId: p.lastSnapshotId });
        }
        // Fallback: find latest snapshot directly
        const latest = await prisma.projectSnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
        if (latest && !p?.lastSnapshotId) {
            console.log('[api/projects/latest-snapshot] repairing missing lastSnapshotId', { projectId, snapshotId: latest.id });
            try { await prisma.project.update({ where: { id: projectId }, data: { lastSnapshotId: latest.id } }); } catch (e) { console.warn('[api/projects/latest-snapshot] repair update failed', (e as any)?.message); }
            return NextResponse.json({ snapshotId: latest.id, repaired: true });
        }
        console.log('[api/projects/latest-snapshot] none', { projectId });
        return NextResponse.json({ snapshotId: null });
    } catch (e: any) {
        console.error('[api/projects/latest-snapshot] error', e?.message);
        return NextResponse.json({ snapshotId: null, error: 'unavailable', message: e?.message }, { status: 200 });
    }
}
