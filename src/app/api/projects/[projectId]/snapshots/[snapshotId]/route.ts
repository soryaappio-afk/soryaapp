import { NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { authOptions } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { projectId: string; snapshotId: string } }) {
    try {
        if ((authOptions as any).adapter === undefined) {
            return NextResponse.json({ bypassed: true, files: [] }, { status: 200 });
        }
        if (!prisma || !prismaAvailable) {
            return NextResponse.json({ bypassed: true, files: [] }, { status: 200 });
        }
        const snap: any = await prisma.projectSnapshot.findFirst({
            where: { id: params.snapshotId, projectId: params.projectId }
        });
        if (!snap) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ files: snap.files, planMeta: snap.planMeta || null, createdAt: snap.createdAt });
    } catch (e: any) {
        return NextResponse.json({ error: 'unavailable', message: e?.message }, { status: 200 });
    }
}
