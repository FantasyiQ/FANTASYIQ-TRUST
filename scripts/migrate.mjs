/**
 * Safe migration runner for Vercel builds.
 *
 * On the very first deploy after switching from `prisma db push` to
 * `prisma migrate deploy`, the production database already has the full
 * schema but no migration history. Running `migrate deploy` directly
 * fails with P3005 ("database schema is not empty").
 *
 * This script catches that specific error, marks 0001_init as already
 * applied (without executing its SQL), then retries `migrate deploy`.
 * On every subsequent deploy it just runs `migrate deploy` cleanly.
 */

import { execSync, spawnSync } from 'child_process';

function run(cmd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
}

// Attempt migrate deploy; capture output to detect P3005.
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: ['inherit', 'inherit', 'pipe'],
    encoding: 'utf8',
});

const stderr = result.stderr ?? '';

if (result.status === 0) {
    // Success — nothing else to do.
    process.exit(0);
}

if (stderr.includes('P3005') || stderr.includes('database schema is not empty')) {
    console.log('[migrate] P3005 detected — baselining 0001_init (schema already exists in DB)');
    run('npx prisma migrate resolve --applied 0001_init');
    // Now deploy for real — any migrations beyond the baseline will apply.
    run('npx prisma migrate deploy');
    process.exit(0);
}

// Any other error — print stderr and fail the build.
process.stderr.write(stderr);
process.exit(result.status ?? 1);
