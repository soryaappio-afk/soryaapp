import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';

export async function GET() {
    const session = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: session.user });
}
