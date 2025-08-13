import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/db';

export async function GET(_: Request, { params }: { params: { projectId: string } }) {
    /** returns last snapshot id or null */
    const p = await prisma.project.findUnique({
        where: { id: params.projectId },
        select: { lastSnapshotId: true }
    });
    return NextResponse.json({ snapshotId: p?.lastSnapshotId ?? null });
}
