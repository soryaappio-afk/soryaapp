import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/db';

export async function GET(_: Request, { params }: { params: { projectId: string; snapshotId: string } }) {
    /** fetch files for a given snapshot */
    const snap = await prisma.projectSnapshot.findFirst({
        where: { id: params.snapshotId, projectId: params.projectId }
    });
    if (!snap) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ files: snap.files });
}
