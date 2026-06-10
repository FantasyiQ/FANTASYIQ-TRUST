import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createClient() {
    // In serverless environments each function instance should hold at most
    // 1 connection so we don't exhaust the pgBouncer pool on Neon.
    // connection_limit=1 is also embedded in the URL as a belt-and-suspenders
    // hint for any path that bypasses the Pool object.
    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL!,
        max:                    1,      // 1 connection per function instance
        idleTimeoutMillis:  10_000,     // release idle connections after 10 s
        connectionTimeoutMillis: 15_000, // allow time for cold-start DB wake
    });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
