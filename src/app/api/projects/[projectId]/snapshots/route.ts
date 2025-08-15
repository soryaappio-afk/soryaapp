import { NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { projectId: string } }) {
    if (!prismaAvailable || !prisma) return NextResponse.json({ snapshots: [] });
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { projectId } = params;
    const userId = session.user.id;
    try {
        const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
        if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        const snaps: any[] = await prisma.projectSnapshot.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take: 30 });
        return NextResponse.json({ snapshots: snaps.map(s => ({ id: s.id, createdAt: s.createdAt, fileCount: Array.isArray(s.files) ? s.files.length : 0 })) });
    } catch (e: any) {
        return NextResponse.json({ error: 'list_error', message: e?.message }, { status: 500 });
    }
}
