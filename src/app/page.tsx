import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import HomeClient from '@/src/components/HomeClient';
import nextDynamic from 'next/dynamic';

const ProjectEditor = nextDynamic(() => import('@/src/components/ProjectEditor'), { ssr: false });
import { getCreditBalance, ensureInitialGrant } from '@/src/lib/credits';
// Ensure this page is always dynamic (no static optimization)
export const dynamic = 'force-dynamic';

export default async function HomePage() {
    const session: any = await getServerSession(authOptions as any);
    let projects: any[] = [];
    let credits: number | null = null;
    if (session?.user && prisma) {
        const userId = session.user.id;
        await ensureInitialGrant(userId);
        const balance = await getCreditBalance(userId);
        try {
            const [proj] = await Promise.all([
                prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
            ]);
            projects = proj;
            credits = balance;
        } catch {
            // swallow if prisma temporarily unavailable
        }
    }
    const firstProject = projects[0];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <HomeClient session={session} projects={projects} credits={credits} />
            {session?.user && firstProject && process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER && (
                <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Live Project Files (auto-updating)</h2>
                    <ProjectEditor projectId={firstProject.id} publicKey={process.env.NEXT_PUBLIC_PUSHER_KEY} cluster={process.env.NEXT_PUBLIC_PUSHER_CLUSTER} />
                </div>
            )}
        </div>
    );
}
