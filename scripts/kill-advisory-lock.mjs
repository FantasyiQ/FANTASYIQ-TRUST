/**
 * Terminates the backend holding the Prisma migrate advisory lock.
 * Run with: node --env-file=.env.local scripts/kill-advisory-lock.mjs
 */
import pg from 'pg';

const rawUrl = process.env.DATABASE_URL ?? '';
const directUrl = rawUrl.replace(/-pooler\./, '.');
const pool = new pg.Pool({ connectionString: directUrl, max: 1 });

try {
    // Find all connections holding advisory lock 72707369
    const { rows: holders } = await pool.query(`
        SELECT l.pid, l.granted, a.usename, a.application_name, a.state, a.query
        FROM pg_locks l
        JOIN pg_stat_activity a ON l.pid = a.pid
        WHERE l.locktype = 'advisory' AND l.objid = 72707369
    `);
    console.log('Lock holders:', holders);

    for (const h of holders) {
        console.log(`Terminating PID ${h.pid} (${h.application_name}, ${h.state})...`);
        const { rows } = await pool.query(`SELECT pg_terminate_backend($1) AS terminated`, [h.pid]);
        console.log(`Result: ${rows[0].terminated}`);
    }

    if (holders.length === 0) {
        console.log('No lock holders found.');
    }
} finally {
    await pool.end();
}
