import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { validateAppBundle } from '@/src/types/appBundle';
import { addCreditEntry, getCreditBalance, ensureInitialGrant } from '@/src/lib/credits';
import { pusher } from '@/src/lib/realtime';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    if ((authOptions as any).adapter === undefined) return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
    if (!prisma || !prismaAvailable) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const { bundle, projectId, name } = body || {};
    const MAX_FILES = 40;
    const MAX_TOTAL_KB = 300; // 300KB raw text
    if (bundle?.files) {
        if (bundle.files.length > MAX_FILES) return NextResponse.json({ error: 'Too many files', limit: MAX_FILES }, { status: 400 });
        const totalBytes = bundle.files.reduce((a: number, f: any) => a + (f.content?.length || 0), 0);
        if (totalBytes / 1024 > MAX_TOTAL_KB) return NextResponse.json({ error: 'Bundle too large', limitKB: MAX_TOTAL_KB }, { status: 400 });
    }
    // Simple in-memory throttle (non-durable) using globalThis
    const key = 'bundleRate:' + userId;
    const now = Date.now();
    const g: any = globalThis as any;
    g.__bundleRate || (g.__bundleRate = {});
    const arr: number[] = g.__bundleRate[key] || (g.__bundleRate[key] = []);
    // keep last 15 minutes
    while (arr.length && now - arr[0] > 15 * 60 * 1000) arr.shift();
    if (arr.length >= 20) return NextResponse.json({ error: 'Rate limit: 20 bundle imports per 15m' }, { status: 429 });
    arr.push(now);
    if (!bundle) return NextResponse.json({ error: 'Missing bundle' }, { status: 400 });
    const v = validateAppBundle(bundle);
    if (!v.ok) return NextResponse.json({ error: 'Bundle invalid', details: v.errors }, { status: 400 });
    let project;
    if (projectId) {
        project = await prisma.project.findFirst({ where: { id: projectId, userId } });
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    } else {
        project = await prisma.project.create({ data: { userId, name: name || (bundle.title || 'Generated App') } });
    }
    const snapshot = await prisma.projectSnapshot.create({ data: { projectId: project.id, files: bundle.files, summary: bundle.title || null } });
    await prisma.chatMessage.create({ data: { userId, projectId: project.id, role: 'system', content: `Bundle import: ${bundle.files.length} files (${bundle.runtime}) -> snapshot ${snapshot.id}` } });
    await prisma.project.update({ where: { id: project.id }, data: { lastSnapshotId: snapshot.id, status: 'LIVE' } });
    try {
        await ensureInitialGrant(userId);
        await addCreditEntry(userId, -25, 'bundle_import', { projectId: project.id, snapshotId: snapshot.id });
    } catch { }
    let balance: number | null = null;
    try { balance = await getCreditBalance(userId); } catch { }
    try {
        if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY) {
            await pusher.trigger(`project-${project.id}`, 'files.updated', { projectId: project.id, snapshotId: snapshot.id });
        }
    } catch { }
    return NextResponse.json({ projectId: project.id, snapshotId: snapshot.id, balance });
}
