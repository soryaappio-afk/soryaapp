import { prisma, prismaAvailable } from '@/src/lib/db';
import { ensureVercelProject, createDeployment } from '@/src/lib/vercel';
import { suggestFixFromError } from '@/src/lib/fixerAgent';
import { ensureInitialGrant, getCreditBalance, addCreditEntry } from '@/src/lib/credits';

const DEPLOYMENT_CREDIT_COST = 20;
const MAX_FIX_ATTEMPTS = 2;

function parseFirstError(log: string): string | null {
    const lines = log.split(/\r?\n/);
    return lines.find(l => /error|failed|exception/i.test(l)) || null;
}

function buildPatchFromError(errorLine: string | null, projectName: string, attempt: number) {
    const suggestions: string[] = [];
    if (errorLine) {
        if (/next\/config|next\.config/i.test(errorLine)) suggestions.push('Add basic next.config.js to satisfy import.');
        if (/module not found/i.test(errorLine)) suggestions.push('Add placeholder module export to avoid build break.');
    }
    if (!suggestions.length) suggestions.push('General patch: add diagnostic comment.');
    return {
        note: suggestions.join(' '),
        genFile: /next\/config|next\.config/i.test(errorLine || '') ? {
            path: 'next.config.js',
            content: `// Auto-generated patch attempt ${attempt}\nmodule.exports = { reactStrictMode: true };\n`
        } : null,
        banner: `\n\n// Patch attempt ${attempt} for ${projectName}: ${errorLine || 'no specific error parsed'} -> ${suggestions.join(' ')}`
    };
}

export async function runDeploymentRoutine(options: { projectId: string; userId: string; auto?: boolean }) {
    const { projectId, userId } = options;
    if (!prismaAvailable || !prisma) throw new Error('Database unavailable');
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new Error('Project not found');
    if (project.status === 'DEPLOYING') {
        const recent = await prisma.deployment.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' } });
        if (recent && Date.now() - recent.createdAt.getTime() < 30_000) {
            return { skipped: true, reason: 'already_deploying_recently' };
        }
    }
    await ensureInitialGrant(userId);
    const balance = await getCreditBalance(userId);
    if (balance < DEPLOYMENT_CREDIT_COST) {
        return { skipped: true, reason: 'insufficient_credits', balance };
    }
    await addCreditEntry(userId, -DEPLOYMENT_CREDIT_COST, 'deployment_attempt_trigger', { projectId, auto: !!options.auto });
    const routine = await prisma.routine.create({ data: { userId, projectId, kind: 'DEPLOYMENT', status: 'RUNNING', steps: [] } });
    const steps: any[] = [];
    await prisma.project.update({ where: { id: projectId }, data: { status: 'DEPLOYING' } });
    let finalState: string = 'PENDING';
    let deploymentUrl: string | undefined;
    let attempt = 0;
    const realMode = !!process.env.VERCEL_TOKEN;
    while (attempt < MAX_FIX_ATTEMPTS) {
        attempt += 1;
        steps.push({ type: 'deploy_attempt_start', attempt, ts: Date.now(), auto: !!options.auto });
        const latestSnapshot = project.lastSnapshotId ? await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } }) : null;
        const files = (latestSnapshot?.files as any[]) || [];
        let mockError = false;
        if (!realMode && attempt === 1) mockError = true;
        await ensureVercelProject(project.id, project.name);
        let buildLog = '';
        let depState: 'READY' | 'ERROR' = 'READY';
        if (mockError) {
            depState = 'ERROR';
            buildLog = 'Step 3/10: Building application...\nError: Module not found: Cannot resolve "next/config" in /app/src';
        } else {
            const vercelDep = await createDeployment(project.id, files);
            depState = vercelDep.state === 'READY' ? 'READY' : 'ERROR';
            deploymentUrl = vercelDep.url;
            buildLog = depState === 'READY' ? 'Build succeeded' : `Deployment state: ${vercelDep.state}`;
        }
        const deployment = await prisma.deployment.create({ data: { projectId, state: depState === 'READY' ? 'READY' : 'ERROR', attempt, buildLogExcerpt: buildLog.slice(0, 240), url: deploymentUrl } });
        steps.push({ type: 'build_log_capture', attempt, ts: Date.now(), excerpt: deployment.buildLogExcerpt });
        if (depState === 'READY') {
            steps.push({ type: 'deploy_attempt_result', attempt, ts: Date.now(), state: 'SUCCESS', url: deploymentUrl });
            finalState = 'LIVE';
            break;
        } else {
            const parsed = parseFirstError(buildLog);
            steps.push({ type: 'deploy_attempt_result', attempt, ts: Date.now(), state: 'ERROR', parsedError: parsed });
            if (attempt >= MAX_FIX_ATTEMPTS) {
                finalState = 'ERROR';
                break;
            }
            const latestSnapReload = project.lastSnapshotId ? await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } }) : null;
            if (latestSnapReload) {
                // Ask fixer agent for patch first (model or heuristic) then fall back to legacy patch pattern
                let patchSuggestion = await suggestFixFromError(project.name, parsed, (latestSnapReload.files as any[]) || []);
                if (!patchSuggestion || (!patchSuggestion.addedFiles.length && !patchSuggestion.mutations.length)) {
                    const legacy = buildPatchFromError(parsed, project.name, attempt);
                    patchSuggestion = { note: legacy.note, addedFiles: legacy.genFile ? [legacy.genFile] : [], mutations: legacy.banner ? [{ path: 'app/page.tsx', append: legacy.banner }] : [] };
                }
                steps.push({ type: 'patch_suggest', attempt, ts: Date.now(), parsedError: parsed, suggestion: patchSuggestion.note, addedFiles: patchSuggestion.addedFiles.map(f => f.path), mutations: patchSuggestion.mutations.map(m => m.path) });
                const filesArr = [...(latestSnapReload.files as any[])].map(f => ({ path: f.path, content: f.content }));
                // Apply mutations
                for (const mut of patchSuggestion.mutations) {
                    const i = filesArr.findIndex(f => f.path === mut.path);
                    if (i >= 0) filesArr[i] = { path: filesArr[i].path, content: filesArr[i].content + mut.append };
                }
                // Add new files
                for (const nf of patchSuggestion.addedFiles) {
                    if (!filesArr.some(f => f.path === nf.path)) filesArr.push(nf);
                }
                const newSnapshot = await prisma.projectSnapshot.create({ data: { projectId: project.id, files: filesArr } });
                await prisma.project.update({ where: { id: project.id }, data: { lastSnapshotId: newSnapshot.id } });
                try {
                    const snaps = await prisma.projectSnapshot.findMany({ where: { projectId: project.id }, select: { id: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
                    if (snaps.length > 4) {
                        const toDelete = snaps.slice(4).map(s => s.id);
                        await prisma.projectSnapshot.deleteMany({ where: { id: { in: toDelete } } });
                        steps.push({ type: 'snapshot_prune', ts: Date.now(), removed: toDelete.length });
                    }
                } catch (e: any) {
                    steps.push({ type: 'snapshot_prune_error', ts: Date.now(), error: e?.message?.slice(0, 160) });
                }
                steps.push({ type: 'patch_apply', attempt, ts: Date.now(), snapshotId: newSnapshot.id, note: patchSuggestion.note });
            }
        }
    }
    await prisma.project.update({ where: { id: projectId }, data: { status: finalState, deploymentUrl: deploymentUrl || project.deploymentUrl } });
    await prisma.routine.update({ where: { id: routine.id }, data: { steps, status: finalState === 'LIVE' ? 'SUCCESS' : 'ERROR', finishedAt: new Date() } });
    const newBalance = await getCreditBalance(userId);
    return { routineId: routine.id, finalState, deploymentUrl, steps, balance: newBalance };
}
