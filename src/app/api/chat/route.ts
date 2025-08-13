import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/db';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { ensureRepo, pushSnapshot } from '@/src/lib/github';
import { addCreditEntry, getCreditBalance, ensureInitialGrant } from '@/src/lib/credits';


// Placeholder OpenAI call (mock) for speed. Replace with real later.
async function generateAssistantReply(prompt: string, opts?: { diffSummary?: any }) {
    if (opts?.diffSummary) {
        const { added = [], modified = [], removed = [], unchangedCount } = opts.diffSummary;
        return `Updated app based on request: "${prompt}"\nDiff Summary -> Added: ${added.length ? added.join(', ') : 'none'} | Modified: ${modified.length ? modified.join(', ') : 'none'} | Removed: ${removed.length ? removed.join(', ') : 'none'} | Unchanged files: ${unchangedCount}`;
    }
    return `Generated app scaffold for: ${prompt}`;
}

// Simple AI name generator (placeholder) - ensures consistent slug
function deriveAppName(prompt: string) {
    const base = prompt.split(/[.!?\n]/)[0].slice(0, 40).trim();
    if (!base) return 'App';
    // Capitalize words, remove unsafe chars
    return base.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'App';
}

function toRepoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'app';
}

// Code generator using derived name
function generateFiles(appName: string, prompt: string) {
    const page = `export default function GeneratedPage(){return <div style={{padding:'2rem'}}><h1>${appName}</h1><p>${prompt}</p></div>}`;
    return [
        { path: 'package.json', content: JSON.stringify({ name: toRepoSlug(appName), version: '0.0.1' }, null, 2) },
        { path: 'app/page.tsx', content: page }
    ];
}

const BodySchema = z.object({
    prompt: z.string().min(3),
    projectId: z.string().optional()
});

// Simple classification heuristic
type ClassificationResult = { type: string; confidence: number };

// Placeholder model classification call (stub). Replace with real LLM or classifier.
async function classifyPrompt(prompt: string): Promise<ClassificationResult> {
    // Reuse heuristic for now but assign pseudo confidence distribution
    const map: { tag: string; keywords: string[] }[] = [
        { tag: 'Internal tools', keywords: ['internal', 'dashboard', 'admin', 'ops', 'backoffice'] },
        { tag: 'Website', keywords: ['landing', 'marketing', 'website', 'portfolio'] },
        { tag: 'Personal', keywords: ['personal', 'journal', 'diary', 'habit'] },
        { tag: 'Consumer App', keywords: ['social', 'mobile', 'chat', 'consumer', 'feed'] },
        { tag: 'B2B App', keywords: ['saas', 'crm', 'b2b', 'enterprise', 'invoice', 'billing'] },
        { tag: 'Prototype', keywords: ['prototype', 'mvp', 'test', 'demo', 'experiment'] }
    ];
    const lower = prompt.toLowerCase();
    for (const m of map) {
        if (m.keywords.some(k => lower.includes(k))) {
            // Confidence heuristic: more keyword hits => higher
            const hits = m.keywords.filter(k => lower.includes(k)).length;
            const confidence = Math.min(0.5 + hits * 0.1, 0.95);
            return { type: m.tag, confidence };
        }
    }
    return { type: 'Prototype', confidence: 0.4 };
}

const GENERATION_CREDIT_COST = 50;

export async function POST(req: NextRequest) {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Ensure user exists (DB might have been reset)
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userExists) {
        return NextResponse.json({ error: 'Session user no longer exists (reset?)' }, { status: 401 });
    }

    const json = await req.json();
    const parse = BodySchema.safeParse(json);
    if (!parse.success) {
        return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { prompt, projectId } = parse.data;

    // Fetch user credits (derived)
    await ensureInitialGrant(userId);
    const currentBalance = await getCreditBalance(userId);
    if (currentBalance < GENERATION_CREDIT_COST) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    let project = projectId
        ? await prisma.project.findFirst({ where: { id: projectId, userId } })
        : null;
    const isNew = !project;
    let previousSnapshot: any = null;
    if (!project) {
        const { type, confidence } = await classifyPrompt(prompt);
        const appName = deriveAppName(prompt);
        project = await prisma.project.create({ data: { userId, name: appName, type, typeConfidence: confidence } });
    } else if (project.lastSnapshotId) {
        previousSnapshot = await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } });
    }
    // Create routine row
    const routine = await prisma.routine.create({ data: { userId, projectId: project.id, kind: 'GENERATION', status: 'RUNNING', steps: [] } });

    // Debit credits via ledger
    await addCreditEntry(userId, -GENERATION_CREDIT_COST, 'generation');
    const newBalance = await getCreditBalance(userId);

    const steps: any[] = [];
    steps.push({ type: 'code_gen_start', ts: Date.now(), prompt });

    // DIFF CONTEXT (improved code generation placeholder)
    if (previousSnapshot) {
        const prevFiles = previousSnapshot.files as any[];
        steps.push({ type: 'diff_context_prepare', ts: Date.now(), previousSnapshotId: previousSnapshot.id, prevFileCount: prevFiles.length });
    }

    const userMessage = await prisma.chatMessage.create({ data: { userId, projectId: project.id, role: 'user', content: prompt } });

    steps.push({ type: 'snapshot_start', ts: Date.now() });
    // Generate or patch files
    let files: { path: string; content: string }[] = [];
    let diffSummary: any = null;
    let patchApplied = false;
    if (previousSnapshot) {
        const prevFilesArray = (previousSnapshot.files as any[]).map(f => ({ path: f.path, content: f.content }));
        const pageIndex = prevFilesArray.findIndex(f => f.path === 'app/page.tsx');
        const timestamp = new Date().toISOString();
        const patchBanner = `\n\n// Patch applied at ${timestamp} for new instruction: ${prompt.replace(/\n/g, ' ')}\n`;
        if (pageIndex >= 0) {
            prevFilesArray[pageIndex] = { path: 'app/page.tsx', content: prevFilesArray[pageIndex].content + patchBanner + `// (Incremental) appended content placeholder.` };
        } else {
            prevFilesArray.push({ path: 'app/page.tsx', content: `export default function GeneratedPage(){return <div style={{padding:'2rem'}}><h1>${prompt}</h1><p>Generated by Sorya MVP.</p></div>}` });
        }
        // Compute diff vs original previous snapshot
        const prevMap: Record<string, string> = {};
        (previousSnapshot.files as any[]).forEach((f: any) => { prevMap[f.path] = f.content; });
        const added: string[] = [];
        const modified: string[] = [];
        const unchanged: string[] = [];
        for (const f of prevFilesArray) {
            if (!(f.path in prevMap)) added.push(f.path); else if (prevMap[f.path] !== f.content) modified.push(f.path); else unchanged.push(f.path);
        }
        const removed: string[] = []; // patch flow does not remove files yet
        diffSummary = { added, modified, removed, unchangedCount: unchanged.length };
        patchApplied = modified.length > 0 || added.length > 0;
        files = prevFilesArray;
        steps.push({ type: 'diff_summary', ts: Date.now(), diff: diffSummary });
    } else {
        const appName = project.name;
        files = generateFiles(appName, prompt);
    }

    // Assistant reply (diff-aware)
    const assistantContent = await generateAssistantReply(prompt, diffSummary ? { diffSummary } : undefined);
    steps.push({ type: 'code_gen_complete', ts: Date.now() });
    const assistantMessage = await prisma.chatMessage.create({ data: { userId, projectId: project.id, role: 'assistant', content: assistantContent } });

    const snapshot = await prisma.projectSnapshot.create({ data: { projectId: project.id, files } });
    steps.push({ type: 'snapshot_complete', ts: Date.now(), snapshotId: snapshot.id });

    // Deployment routine steps (mock for now)
    steps.push({ type: 'deploy_start', ts: Date.now(), target: 'mock_vercel' });
    const deploymentUrl = `https://preview.sorya.dev/p/${project.id}`;
    await prisma.project.update({ where: { id: project.id }, data: { deploymentUrl, lastSnapshotId: snapshot.id, status: 'LIVE' } });
    steps.push({ type: 'deploy_result', ts: Date.now(), url: deploymentUrl, state: 'LIVE', mode: 'mock' });

    if (patchApplied && !isNew) {
        steps.push({ type: 'patch_apply', ts: Date.now(), changedFiles: diffSummary.modified, addedFiles: diffSummary.added });
        // If project published to GitHub, push incremental commit (stub)
        if (project.repoFullName) {
            const userForToken = await prisma.user.findUnique({ where: { id: userId }, select: { githubToken: true } });
            if (userForToken?.githubToken) {
                try {
                    const pushRes = await pushSnapshot(userForToken.githubToken, project.repoFullName, files, 'Incremental patch');
                    steps.push({ type: 'github_commit', ts: Date.now(), commit: pushRes.commitSha });
                } catch (e) {
                    steps.push({ type: 'github_commit_error', ts: Date.now(), error: (e as any)?.message || 'push_failed' });
                }
            }
        }
    }

    await prisma.routine.update({ where: { id: routine.id }, data: { steps, status: 'SUCCESS', finishedAt: new Date() } });

    return NextResponse.json({ projectId: project.id, projectName: project.name, projectType: project.type, typeConfidence: project.typeConfidence, deploymentUrl, messages: [userMessage, assistantMessage], snapshotId: snapshot.id, creditsDeducted: GENERATION_CREDIT_COST, balance: newBalance, routineId: routine.id, steps });
}
