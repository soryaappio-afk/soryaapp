import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import HomeClient from '@/src/components/HomeClient';
import { getCreditBalance, ensureInitialGrant } from '@/src/lib/credits';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
    const session: any = await getServerSession(authOptions as any);
    let projects: any[] = [];
    let credits: number | null = null;
    if (session?.user) {
        const userId = session.user.id;
        await ensureInitialGrant(userId);
        const balance = await getCreditBalance(userId);
        const [proj] = await Promise.all([
            prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
        ]);
        projects = proj;
        credits = balance;
    }
    return <HomeClient session={session} projects={projects} credits={credits} />;
}
