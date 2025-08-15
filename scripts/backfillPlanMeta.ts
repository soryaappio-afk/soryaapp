#!/usr/bin/env ts-node
/**
 * Backfill script: populate ProjectSnapshot.planMeta using existing assistant messages.
 * Strategy:
 * 1. For each snapshot lacking planMeta, find the most recent assistant ChatMessage created <= snapshot.createdAt for that project.
 * 2. Parse plan sections (File Plan + numbered sections) using the same parsePlanSections logic (duplicated lightweight here to avoid deep imports).
 * 3. Update snapshot.planMeta.
 *
 * Run once after adding planMeta column:
 *  npx ts-node scripts/backfillPlanMeta.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function parsePlanSections(text: string) {
    const planMatch = text.match(/File Plan:\n([\s\S]*?)(?:\n\n1\)|\n1\)|$)/i);
    const planLines = planMatch ? planMatch[1].split('\n').map(l => l.trim()).filter(Boolean) : [];
    const secMatch = text.match(/\n1\)\s*Summary[\s\S]*/i);
    let summary = ''; let proposedRaw = ''; let pitfallsRaw = ''; let todosRaw = '';
    if (secMatch) {
        const blocks = text.split(/\n(?=[1-4]\))/).slice(1);
        for (const b of blocks) {
            if (/^1\)/.test(b)) summary = b.replace(/^1\)\s*Summary of intent\s*/i, '').trim();
            else if (/^2\)/.test(b)) proposedRaw = b.replace(/^2\)\s*Proposed changes.*\n?/i, '').trim();
            else if (/^3\)/.test(b)) pitfallsRaw = b.replace(/^3\)\s*Potential pitfalls\s*/i, '').trim();
            else if (/^4\)/.test(b)) todosRaw = b.replace(/^4\)\s*Next TODO bullets\s*/i, '').trim();
        }
    }
    const bulletize = (raw: string) => raw.split(/\n|\r/).map(l => l.replace(/^[-*+]\s*/, '').trim()).filter(l => l.length > 0).slice(0, 40);
    return { planLines, summary, proposed: bulletize(proposedRaw), pitfalls: bulletize(pitfallsRaw), todos: bulletize(todosRaw) };
}

async function main() {
    // Until Prisma client is regenerated with planMeta, use raw query
    // WARNING: Assumes MySQL provider.
    const raw: any[] = await (prisma as any).$queryRawUnsafe("SELECT id, projectId, createdAt FROM ProjectSnapshot WHERE planMeta IS NULL");
    const snapshots = raw.map(r => ({ id: r.id as string, projectId: r.projectId as string, createdAt: new Date(r.createdAt) }));
    console.log('Snapshots to backfill:', snapshots.length);
    let updated = 0;
    for (const snap of snapshots) {
        const assistantMsg = await prisma.chatMessage.findFirst({
            where: { projectId: snap.projectId, role: 'assistant', createdAt: { lte: snap.createdAt } },
            orderBy: { createdAt: 'desc' }
        });
        if (!assistantMsg) continue;
        const parsed = parsePlanSections(assistantMsg.content);
        if (parsed.planLines.length === 0 && !parsed.summary && !parsed.proposed.length) continue; // nothing to store
        await (prisma as any).$executeRawUnsafe("UPDATE ProjectSnapshot SET planMeta = ? WHERE id = ?", JSON.stringify(parsed), snap.id);
        updated += 1;
        if (updated % 10 === 0) console.log('Updated', updated);
    }
    console.log('Backfill complete. Updated', updated, 'snapshots.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
