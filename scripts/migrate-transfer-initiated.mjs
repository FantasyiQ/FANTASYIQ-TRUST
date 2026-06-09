/**
 * One-time: mark all transfer_initiated items as paid_out.
 * The transfer is synchronous — if it was initiated it landed.
 *
 * Run with: node --env-file=.env.local scripts/migrate-transfer-initiated.mjs
 */
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool   = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

try {
    const { count } = await prisma.payoutProposalItem.updateMany({
        where: { status: 'transfer_initiated' },
        data:  { status: 'paid_out' },
    });
    console.log(`Updated ${count} item(s) from transfer_initiated → paid_out`);
} finally {
    await prisma.$disconnect();
    await pool.end();
}
