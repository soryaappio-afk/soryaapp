import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in environment (.env)');
}

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        datasources: { db: { url: DATABASE_URL } },
        log: ['warn', 'error']
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
