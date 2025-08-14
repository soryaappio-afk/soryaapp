import { prisma, prismaAvailable } from '@/src/lib/db';

const INITIAL_GRANT = parseInt(process.env.CREDIT_INITIAL_GRANT || '1000', 10);

export async function getCreditBalance(userId: string) {
    // In bypass / early deploy mode (DB absent) return generous initial grant so features remain usable.
    if (!prismaAvailable || !prisma) return INITIAL_GRANT;
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
    if (!prismaAvailable || !prisma) return; // no-op in bypass mode
    await prisma.creditLedger.create({ data: { userId, delta, reason, meta } });
}

export async function ensureInitialGrant(userId: string) {
    if (!prismaAvailable || !prisma) return; // bypass mode: balance function supplies grant
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return;
    const existing = await prisma.creditLedger.findFirst({ where: { userId } });
    if (!existing) await addCreditEntry(userId, INITIAL_GRANT, 'initial_grant');
}
