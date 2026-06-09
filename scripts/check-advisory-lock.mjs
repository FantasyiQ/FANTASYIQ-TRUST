/**
 * Check and release the Prisma migrate advisory lock.
 * Run with: node --env-file=.env.local scripts/check-advisory-lock.mjs
 */
import pg from 'pg';

// Use direct URL (strip -pooler) to get accurate lock info
const rawUrl = process.env.DATABASE_URL ?? '';
const directUrl = rawUrl.replace(/-pooler\./, '.');
console.log('Connecting to direct URL:', directUrl.replace(/:([^@]+)@/, ':****@'));

const pool = new pg.Pool({ connectionString: directUrl, max: 1 });

try {
    // Check all advisory locks currently held
    const { rows: locks } = await pool.query(`
        SELECT pid, usename, application_name, state,
               query_start, wait_event_type, wait_event, query
        FROM pg_stat_activity
        WHERE state != 'idle'
        ORDER BY query_start
    `);
    console.log('\nActive connections:', locks);

    // Check specifically for advisory lock 72707369
    const { rows: advLocks } = await pool.query(`
        SELECT l.pid, l.granted, a.usename, a.application_name, a.state, a.query
        FROM pg_locks l
        JOIN pg_stat_activity a ON l.pid = a.pid
        WHERE l.locktype = 'advisory' AND l.objid = 72707369
    `);
    console.log('\nAdvisory lock 72707369 holders:', advLocks);

    // Try to release it
    const { rows: release } = await pool.query(`SELECT pg_advisory_unlock(72707369) AS released`);
    console.log('\npg_advisory_unlock result:', release[0]);
} finally {
    await pool.end();
}
