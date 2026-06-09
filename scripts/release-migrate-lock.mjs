/**
 * Releases a stuck Prisma migrate advisory lock.
 * Run with: node -r dotenv/config scripts/release-migrate-lock.mjs
 * or:       node --env-file=.env.local scripts/release-migrate-lock.mjs
 */
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
    const { rows } = await pool.query(`SELECT pg_advisory_unlock(72707369) AS released`);
    console.log('pg_advisory_unlock(72707369):', rows[0].released);
} finally {
    await pool.end();
}
