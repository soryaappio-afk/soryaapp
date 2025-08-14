import { NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { projectId: string } }) {
    try {
        if (!prisma || !prismaAvailable) {
            return NextResponse.json({ snapshotId: null, bypassed: true }, { status: 200 });
        }
        const p = await prisma.project.findUnique({
            where: { id: params.projectId },
            select: { lastSnapshotId: true }
        });
        return NextResponse.json({ snapshotId: p?.lastSnapshotId ?? null });
    } catch (e: any) {
        return NextResponse.json({ snapshotId: null, error: 'unavailable', message: e?.message }, { status: 200 });
    }
}
