import { prisma } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import nextDynamic from 'next/dynamic';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ProjectChatClient = nextDynamic(() => import('@/src/components/ProjectChatClient'), { ssr: false });
const ProjectAutoRunner = nextDynamic(() => import('@/src/components/ProjectAutoRunner'), { ssr: false });
const LiveProjectPreview = nextDynamic(() => import('@/src/components/LiveProjectPreview'), { ssr: false });

interface Props { params: { projectId: string } }

export default async function ProjectPage({ params }: Props) {
    if ((authOptions as any).adapter === undefined || !prisma) {
        return <div style={{ padding: '2rem', fontFamily: 'system-ui,sans-serif' }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Project view unavailable</h2>
            <p style={{ marginTop: 10, fontSize: 14 }}>Authentication / database not configured yet.</p>
        </div>;
    }
    const session = await getServerSession(authOptions as any) as any;
    if (!session?.user) redirect('/login');
    const userId = (session.user as any).id as string;
    const projectId = params.projectId;
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) return <div style={{ padding: '2rem' }}>Not found</div>;
    const messages = await prisma.chatMessage.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
    let files: { path: string; content: string }[] = [];
    if (project.lastSnapshotId) {
        const snap = await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } });
        if (snap) files = (snap.files as any[]) as { path: string; content: string }[];
    }
    let credits: number | null = null;
    try {
        const ledger = await prisma.creditLedger.aggregate({ _sum: { delta: true }, where: { userId } });
        if (ledger._sum.delta != null) credits = ledger._sum.delta; else {
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
            credits = user?.credits ?? null;
        }
    } catch { }
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    return (
        <main style={{ display: 'flex', width: '100%', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ flex: '0 0 25%', maxWidth: '25%', minWidth: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '1rem .9rem', gap: 12 }}>
                <div style={{ fontSize: 11, marginBottom: 4 }}><Link href="/dashboard" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Dashboard</Link></div>
                <ProjectChatClient projectId={project.id} projectName={project.name} deploymentUrl={project.deploymentUrl} initialMessages={messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content }))} initialCredits={credits} />
                <ProjectAutoRunner projectId={project.id} />
            </div>
            <div style={{ flex: '1 1 75%', maxWidth: '75%', padding: '1rem 1.25rem', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <LiveProjectPreview projectId={project.id} initialFiles={files} publicKey={pusherKey} cluster={pusherCluster} />
                </div>
            </div>
        </main>
    );
}
