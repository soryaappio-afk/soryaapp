import { prisma } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Prisma } from '@prisma/client';

const ProjectChatClient = dynamic(() => import('@/src/components/ProjectChatClient'), { ssr: false });
const ProjectAutoRunner = dynamic(() => import('@/src/components/ProjectAutoRunner'), { ssr: false });
const LiveProjectPreview = dynamic(() => import('@/src/components/LiveProjectPreview'), { ssr: false });

interface Props { params: { id: string } }

export default async function ProjectPage({ params }: Props) {
    const session = await getServerSession(authOptions as any) as any;
    if (!session?.user) redirect('/login');
    const userId = (session.user as any).id as string;
    const project = await prisma.project.findFirst({ where: { id: params.id, userId } });
    if (!project) return <div style={{ padding: '2rem' }}>Not found</div>;
    const messages = await prisma.chatMessage.findMany({ where: { projectId: params.id }, orderBy: { createdAt: 'asc' } });
    // Get latest snapshot files
    let files: { path: string; content: string }[] = [];
    if (project.lastSnapshotId) {
        const snap = await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } });
        if (snap) files = (snap.files as any[]) as { path: string; content: string }[];
    }
    // Fetch credits balance
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
            <div style={{ flex: '0 0 30%', maxWidth: '30%', minWidth: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '1rem .9rem', gap: 12 }}>
                <div style={{ fontSize: 11, marginBottom: 4 }}><Link href="/dashboard" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Dashboard</Link></div>
                <ProjectChatClient projectId={project.id} projectName={project.name} deploymentUrl={project.deploymentUrl} initialMessages={messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content }))} initialCredits={credits} />
                <ProjectAutoRunner projectId={project.id} />
            </div>
            <div style={{ flex: '1 1 70%', maxWidth: '70%', padding: '1rem 1.25rem', overflow: 'auto' }}>
                <LiveProjectPreview projectId={project.id} initialFiles={files} publicKey={pusherKey} cluster={pusherCluster} />
            </div>
        </main>
    );
}
