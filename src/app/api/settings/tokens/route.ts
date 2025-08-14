import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ githubToken: z.string().optional(), vercelToken: z.string().optional() });

export async function POST(req: NextRequest) {
    try {
        if ((authOptions as any).adapter === undefined) {
            return NextResponse.json({ bypassed: true }, { status: 200 });
        }
        const session: any = await getServerSession(authOptions as any);
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const json = await req.json().catch(() => null);
        const parse = BodySchema.safeParse(json);
        if (!parse.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
        const { githubToken, vercelToken } = parse.data;
        await prisma.user.update({ where: { id: session.user.id }, data: { githubToken: githubToken || null, vercelToken: vercelToken || null } });
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: 'unavailable', message: e?.message }, { status: 200 });
    }
}
