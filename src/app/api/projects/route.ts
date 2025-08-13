import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';

export async function GET() {
    const session: any = await getServerSession(authOptions as any);
    if (!session || !session.user) return NextResponse.json({ projects: [] }, { status: 401 });
    const userId = session.user.id;
    const projects = await prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ projects });
}
