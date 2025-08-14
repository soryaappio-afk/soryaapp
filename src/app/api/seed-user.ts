// Temporary script-like route to create a user for early testing (remove later)
import { NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import bcrypt from 'bcryptjs';

export async function POST() {
    if (!prismaAvailable || !prisma) {
        return NextResponse.json({ bypassed: true, db: false }, { status: 200 });
    }
    const existing = await prisma.user.findFirst({ where: { email: 'test@example.com' } });
    if (existing) return NextResponse.json({ userId: existing.id });
    const passwordHash = await bcrypt.hash('password', 10);
    const user = await prisma.user.create({ data: { email: 'test@example.com', passwordHash, name: 'Test User' } });
    return NextResponse.json({ userId: user.id });
}
