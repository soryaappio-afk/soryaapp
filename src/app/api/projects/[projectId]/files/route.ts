import { NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';

// Returns a lightweight file tree (paths only or with optional sizes) for latest snapshot
// Added features:
// - search=substring (case-insensitive) filters paths
// - status=created,updated (comma-separated) filters by last routine diff metadata
// - Each file now optionally includes a status field: created | updated | unchanged
export async function GET(req: Request, { params }: { params: { projectId: string } }) {
    if (!prismaAvailable || !prisma) return NextResponse.json({ error: 'db_unavailable' }, { status: 503 });
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const { projectId } = params;
    const url = new URL(req.url);
    const includeSizes = url.searchParams.get('sizes') === '1';
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const statusParam = (url.searchParams.get('status') || '').trim().toLowerCase();
    const statusFilters = statusParam ? new Set(statusParam.split(',').map(s => s.trim()).filter(Boolean)) : null;
    try {
        const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { lastSnapshotId: true } });
        if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        if (!project.lastSnapshotId) return NextResponse.json({ files: [] });
        const snap: any = await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } });
        if (!snap) return NextResponse.json({ files: [] });
        // Fetch latest routine for diff metadata to tag statuses
        let createdSet = new Set<string>();
        let updatedSet = new Set<string>();
        try {
            const routine: any = await prisma.routine.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' } });
            if (routine) {
                const createdArr = Array.isArray(routine.createdFiles) ? routine.createdFiles : [];
                const updatedArr = Array.isArray(routine.updatedFiles) ? routine.updatedFiles : [];
                createdArr.forEach((p: string) => createdSet.add(p));
                updatedArr.forEach((p: string) => updatedSet.add(p));
            }
        } catch { /* ignore */ }
        let files = (snap.files as any[]).map(f => {
            const status = createdSet.has(f.path) ? 'created' : updatedSet.has(f.path) ? 'updated' : 'unchanged';
            return includeSizes ? { path: f.path, bytes: (f.content || '').length, status } : { path: f.path, status };
        });
        if (search) files = files.filter(f => f.path.toLowerCase().includes(search));
        if (statusFilters && statusFilters.size > 0) files = files.filter(f => statusFilters.has((f as any).status));
        // Sort: created first, then updated, then unchanged, then alpha
        const order: Record<string, number> = { created: 0, updated: 1, unchanged: 2 };
        files.sort((a: any, b: any) => {
            const oa = order[a.status] ?? 9; const ob = order[b.status] ?? 9;
            if (oa !== ob) return oa - ob;
            return a.path.localeCompare(b.path);
        });
        return NextResponse.json({ snapshotId: snap.id, files });
    } catch (e: any) {
        return NextResponse.json({ error: 'file_tree_error', message: e?.message }, { status: 500 });
    }
}
