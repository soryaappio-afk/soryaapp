import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma, prismaAvailable } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        if ((authOptions as any).adapter === undefined) {
            return NextResponse.json({ routines: [], bypassed: true }, { status: 200 });
        }
        if (!prisma || !prismaAvailable) {
            return NextResponse.json({ routines: [], bypassed: true, db: false }, { status: 200 });
        }
        const session: any = await getServerSession(authOptions as any);
        if (!session?.user) return NextResponse.json({ routines: [] }, { status: 401 });
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get('projectId');
        const where: any = { userId: session.user.id };
        if (projectId) where.projectId = projectId;
        const routines = await prisma.routine.findMany({ where, orderBy: { startedAt: 'desc' }, take: 20 });
        return NextResponse.json({ routines });
    } catch (e: any) {
        return NextResponse.json({ routines: [], error: 'unavailable', message: e?.message }, { status: 200 });
    }
}
