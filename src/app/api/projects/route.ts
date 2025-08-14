import { NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    if ((authOptions as any).adapter === undefined) {
        return NextResponse.json({ projects: [], bypassed: true }, { status: 200 });
    }
    if (!prisma || !prismaAvailable) {
        return NextResponse.json({ projects: [], bypassed: true, db: false }, { status: 200 });
    }
    const session: any = await getServerSession(authOptions as any);
    if (!session || !session.user) return NextResponse.json({ projects: [] }, { status: 401 });
    const userId = session.user.id;
    const projects = await prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ projects });
}
