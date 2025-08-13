import { prisma } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Prisma } from '@prisma/client';

interface Props { params: { id: string } }

const ProjectChatClient = dynamic(() => import('@/src/components/ProjectChatClient'), { ssr: false });

export default async function ProjectPage({ params }: Props) {
    const session = await getServerSession(authOptions as any) as any;
    if (!session?.user) redirect('/login');
    const userId = (session.user as any).id as string;
    const project = await prisma.project.findFirst({ where: { id: params.id, userId } });
    if (!project) return <div style={{ padding: '2rem' }}>Not found</div>;
    const messages = await prisma.chatMessage.findMany({ where: { projectId: params.id }, orderBy: { createdAt: 'asc' } });
    // Fetch credits balance
    let credits: number | null = null;
    try {
        const ledger = await prisma.creditLedger.aggregate({ _sum: { delta: true }, where: { userId } });
        if (ledger._sum.delta != null) credits = ledger._sum.delta; else {
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
            credits = user?.credits ?? null;
        }
    } catch { }

    return (
        <main style={{ padding: '1.5rem 1.25rem 3rem', fontFamily: 'system-ui, sans-serif', maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link href="/dashboard" style={{ fontSize: 12, color: 'var(--accent)' }}>← Back to Dashboard</Link>
            </div>
            <ProjectChatClient projectId={project.id} projectName={project.name} deploymentUrl={project.deploymentUrl} initialMessages={messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content }))} initialCredits={credits} />
        </main>
    );
}
