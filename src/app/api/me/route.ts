import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    // If auth is bypassed, just return null user (allows build & basic runtime without DB)
    if ((authOptions as any).adapter === undefined) {
        return NextResponse.json({ user: null, bypassed: true }, { status: 200 });
    }
    const session: any = await getServerSession(authOptions as any);
    if (!session || !session.user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: session.user });
}
