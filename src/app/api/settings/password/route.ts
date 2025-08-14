import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ currentPassword: z.string().min(6), newPassword: z.string().min(8) });

export async function POST(req: NextRequest) {
    try {
        if ((authOptions as any).adapter === undefined) {
            return NextResponse.json({ bypassed: true }, { status: 200 });
        }
        if (!prisma || !prismaAvailable) {
            return NextResponse.json({ bypassed: true, db: false }, { status: 200 });
        }
        const session: any = await getServerSession(authOptions as any);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const json = await req.json().catch(() => null);
        const parse = BodySchema.safeParse(json);
        if (!parse.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
        const { currentPassword, newPassword } = parse.data;
        const user = await prisma.user.findUnique({ where: { id: session.user.id } });
        if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        if (!user.passwordHash) {
            return NextResponse.json({ error: 'No existing password. Set one by linking email credentials first.' }, { status: 400 });
        }
        const ok = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!ok) return NextResponse.json({ error: 'Current password incorrect' }, { status: 400 });
        const hash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: 'unavailable', message: e?.message }, { status: 200 });
    }
}
