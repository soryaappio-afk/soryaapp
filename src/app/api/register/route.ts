import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const BodySchema = z.object({ email: z.string().email(), password: z.string().min(6) });

export async function POST(req: NextRequest) {
    const json = await req.json();
    const parse = BodySchema.safeParse(json);
    if (!parse.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
    const { email, password } = parse.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'Exists' }, { status: 409 });
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { email, passwordHash } });
    return NextResponse.json({ ok: true });
}
