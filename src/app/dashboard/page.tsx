import { prisma } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { redirect } from 'next/navigation';
import DashboardClient from '@/src/components/DashboardClient';
import { ensureInitialGrant, getCreditBalance } from '@/src/lib/credits';

export default async function DashboardPage() {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) redirect('/login');
    const userId = session.user.id;
    await ensureInitialGrant(userId);
    const balance = await getCreditBalance(userId);
    const projects = await prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return <DashboardClient projects={projects as any[]} credits={balance} session={session} />;
}
