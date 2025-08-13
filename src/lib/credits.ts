import { prisma } from '@/src/lib/db';

const INITIAL_GRANT = parseInt(process.env.CREDIT_INITIAL_GRANT || '1000', 10);

export async function getCreditBalance(userId: string) {
    // If no ledger entries yet fall back to legacy field; otherwise sum deltas (even if zero)
    const entryCount = await prisma.creditLedger.count({ where: { userId } });
    if (entryCount === 0) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
        return user?.credits ?? 0;
    }
    const total = await prisma.creditLedger.aggregate({ _sum: { delta: true }, where: { userId } });
    return total._sum.delta ?? 0;
}

export async function addCreditEntry(userId: string, delta: number, reason: string, meta?: any) {
    // Assumes caller already validated user existence
    await prisma.creditLedger.create({ data: { userId, delta, reason, meta } });
}

export async function ensureInitialGrant(userId: string) {
    // Verify user exists (session might be stale after reset)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return; // Let caller handle missing user (likely treat as unauthorized)
    const existing = await prisma.creditLedger.findFirst({ where: { userId } });
    if (!existing) {
        await addCreditEntry(userId, INITIAL_GRANT, 'initial_grant');
    }
}
