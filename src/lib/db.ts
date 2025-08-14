import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

const DATABASE_URL = process.env.DATABASE_URL;

let prismaInstance: PrismaClient | undefined = globalForPrisma.prisma;
if (!prismaInstance && DATABASE_URL) {
    prismaInstance = new PrismaClient({
        datasources: { db: { url: DATABASE_URL } },
        log: ['warn', 'error']
    });
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaInstance;
}

if (!DATABASE_URL && !(global as any).__PRISMA_DB_WARNED) {
    console.warn('[db] DATABASE_URL missing – running in bypass mode (prisma unavailable)');
    (global as any).__PRISMA_DB_WARNED = true;
}

export const prisma = prismaInstance; // may be undefined in bypass mode
export const prismaAvailable = !!prismaInstance;
