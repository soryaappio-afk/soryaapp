export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import NextAuth from 'next-auth';
import { authOptions } from '@/src/lib/auth';

const nextAuthHandler = NextAuth(authOptions as any);

function bypassResponse() {
    return new Response('Auth temporarily disabled (NEXTAUTH_URL missing)', { status: 503 });
}

export const GET = (req: Request) => {
    if (!process.env.NEXTAUTH_URL) return bypassResponse();
    return nextAuthHandler(req as any, {} as any);
};

export const POST = (req: Request) => {
    if (!process.env.NEXTAUTH_URL) return bypassResponse();
    return nextAuthHandler(req as any, {} as any);
};
