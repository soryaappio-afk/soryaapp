import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { ensureRepo, pushSnapshot } from '@/src/lib/github';

// Publish (or republish) project snapshot to GitHub
export async function PATCH(req: NextRequest, { params }: { params: { projectId: string } }) {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const projectId = params.projectId;
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.githubToken) return NextResponse.json({ error: 'No GitHub token' }, { status: 400 });
    const snapshot = project.lastSnapshotId ? await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } }) : null;
    if (!snapshot) return NextResponse.json({ error: 'No snapshot to publish' }, { status: 400 });

    // Ensure repo & push
    const repoName = project.name.replace(/\s+/g, '-').toLowerCase();
    const repo = await ensureRepo(user.githubToken, repoName);
    const files = (snapshot.files as any[]).map(f => ({ path: f.path, content: f.content }));
    const push = await pushSnapshot(user.githubToken, repo.repoFullName, files, 'Initial snapshot');
    await prisma.project.update({ where: { id: project.id }, data: { status: 'LIVE', repoFullName: repo.repoFullName } });
    return NextResponse.json({ repo: repo.repoFullName, commit: push.commitSha, url: push.url });
}
