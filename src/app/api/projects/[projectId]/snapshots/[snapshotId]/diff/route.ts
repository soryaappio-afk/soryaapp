import { NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { computeSnapshotDiff } from '@/src/lib/diff';

export const dynamic = 'force-dynamic';

// Returns structured diff between given snapshot and its immediate previous snapshot (by createdAt)
// Shape: { baseSnapshotId, targetSnapshotId, created: string[], updated: { path: string, beforeExcerpt: string, afterExcerpt: string }[], deleted: string[] }
export async function GET(_: Request, { params }: { params: { projectId: string; snapshotId: string } }) {
    if (!prismaAvailable || !prisma) return NextResponse.json({ error: 'db_unavailable' }, { status: 503 });
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const { projectId, snapshotId } = params;
    try {
        const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
        if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        const target = await prisma.projectSnapshot.findFirst({ where: { id: snapshotId, projectId } });
        if (!target) return NextResponse.json({ error: 'snapshot_not_found' }, { status: 404 });
        const prev = await prisma.projectSnapshot.findFirst({ where: { projectId, createdAt: { lt: target.createdAt } }, orderBy: { createdAt: 'desc' } });
        const diff = computeSnapshotDiff(prev ? (prev.files as any[]) : null, target.files as any[]);
        if (!prev) return NextResponse.json({ baseSnapshotId: null, targetSnapshotId: target.id, ...diff });
        return NextResponse.json({ baseSnapshotId: prev.id, targetSnapshotId: target.id, ...diff });
    } catch (e: any) {
        return NextResponse.json({ error: 'diff_error', message: e?.message }, { status: 500 });
    }
}
