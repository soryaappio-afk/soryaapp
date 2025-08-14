import { NextRequest, NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authOptions } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ email: z.string().email(), password: z.string().min(6) });

export async function POST(req: NextRequest) {
    try {
        if ((authOptions as any).adapter === undefined) {
            return NextResponse.json({ bypassed: true }, { status: 200 });
        }
        if (!prisma || !prismaAvailable) {
            return NextResponse.json({ bypassed: true, error: 'Database unavailable' }, { status: 200 });
        }
        const json = await req.json().catch(() => null);
        const parse = BodySchema.safeParse(json);
        if (!parse.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
        const { email, password } = parse.data;
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return NextResponse.json({ error: 'Exists' }, { status: 409 });
        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.user.create({ data: { email, passwordHash } });
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: 'unavailable', message: e?.message }, { status: 200 });
    }
}
