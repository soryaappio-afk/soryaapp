import { prisma } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { redirect } from 'next/navigation';
import DashboardClient from '@/src/components/DashboardClient';
import { ensureInitialGrant, getCreditBalance } from '@/src/lib/credits';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    // If auth is bypassed or prisma missing, render placeholder (avoids build crash)
    if ((authOptions as any).adapter === undefined || !prisma) {
        return <div style={{ padding: '2rem', fontFamily: 'system-ui,sans-serif' }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Dashboard unavailable</h2>
            <p style={{ marginTop: 12, fontSize: 14 }}>Authentication / database not configured yet. Set NEXTAUTH_URL & DATABASE_URL (and remove AUTH_BYPASS) then redeploy.</p>
        </div>;
    }
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) redirect('/login');
    const userId = session.user.id;
    await ensureInitialGrant(userId);
    const balance = await getCreditBalance(userId);
    const projects = await prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return <DashboardClient projects={projects as any[]} credits={balance} session={session} />;
}
