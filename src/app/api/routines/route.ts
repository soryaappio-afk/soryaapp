import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';

export async function GET(req: NextRequest) {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ routines: [] }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const where: any = { userId: session.user.id };
    if (projectId) where.projectId = projectId;
    const routines = await prisma.routine.findMany({ where, orderBy: { startedAt: 'desc' }, take: 20 });
    return NextResponse.json({ routines });
}
