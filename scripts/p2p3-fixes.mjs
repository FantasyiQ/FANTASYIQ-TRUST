#!/usr/bin/env node
/**
 * P2/P3 batch fixes:
 * 1. Add checkMutationLimit to mutation API routes
 * 2. Add captureError try/catch to cron routes
 * 3. Create loading.tsx files for dashboard routes
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, basename } from 'path';

// ─── 1. RATE LIMITING ────────────────────────────────────────────────────────

const RL_IMPORT = `import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';`;
const RL_CHECK  = `\n    const rl = await checkMutationLimit(getClientIp(request));\n    if (rl.limited) return rl.response!;\n`;

const mutationFiles = [
    // /api/dues/
    'src/app/api/dues/future-dues/bulk/route.ts',
    'src/app/api/dues/future-dues/pay-on-behalf/route.ts',
    'src/app/api/dues/future-dues/route.ts',
    'src/app/api/dues/[duesId]/collect/route.ts',
    'src/app/api/dues/[duesId]/member-status/route.ts',
    'src/app/api/dues/[duesId]/announcements/[announcementId]/route.ts',
    'src/app/api/dues/[duesId]/announcements/route.ts',
    'src/app/api/dues/[duesId]/announcements/upload/route.ts',
    'src/app/api/dues/[duesId]/proposal/reject/route.ts',
    'src/app/api/dues/[duesId]/proposal/approve/route.ts',
    'src/app/api/dues/[duesId]/proposal/generate/route.ts',
    'src/app/api/dues/[duesId]/sync-members/route.ts',
    'src/app/api/dues/[duesId]/documents/[docId]/route.ts',
    'src/app/api/dues/[duesId]/documents/route.ts',
    'src/app/api/dues/[duesId]/documents/upload/route.ts',
    'src/app/api/dues/[duesId]/payouts/route.ts',
    'src/app/api/dues/[duesId]/poll/close/route.ts',
    'src/app/api/dues/follow-on/route.ts',
    'src/app/api/dues/members/pay-on-behalf/route.ts',
    'src/app/api/dues/league-init/route.ts',
    'src/app/api/dues/poll/vote/route.ts',
    // /api/leagues/
    'src/app/api/leagues/[leagueId]/start-sit/route.ts',
    'src/app/api/leagues/[leagueId]/calendar/route.ts',
    'src/app/api/leagues/[leagueId]/calendar/[eventId]/route.ts',
    'src/app/api/leagues/[leagueId]/phase-settings/route.ts',
    'src/app/api/leagues/[leagueId]/announcements/[announcementId]/route.ts',
    'src/app/api/leagues/[leagueId]/announcements/route.ts',
    'src/app/api/leagues/[leagueId]/announcements/upload/route.ts',
    'src/app/api/leagues/[leagueId]/invite/route.ts',
    'src/app/api/leagues/[leagueId]/assign/route.ts',
    'src/app/api/leagues/[leagueId]/payouts/mark-paid/route.ts',
    'src/app/api/leagues/[leagueId]/payouts/route.ts',
    'src/app/api/leagues/route.ts',
    // /api/lf/
    'src/app/api/lf/join-requests/[id]/route.ts',
    'src/app/api/lf/commissioners/route.ts',
    'src/app/api/lf/commissioners/[id]/route.ts',
    'src/app/api/lf/commissioners/[id]/claim/route.ts',
    'src/app/api/lf/leagues/route.ts',
    'src/app/api/lf/leagues/[id]/seasons/route.ts',
    'src/app/api/lf/leagues/[id]/join-request/route.ts',
    'src/app/api/lf/seasons/[id]/route.ts',
    'src/app/api/lf/reviews/route.ts',
    'src/app/api/lf/reviews/[id]/vote/route.ts',
    'src/app/api/lf/reviews/[id]/reply/route.ts',
];

function addRateLimit(src) {
    if (src.includes('checkMutationLimit')) return null; // already done

    const MUTATION_RE = /export async function (POST|PUT|PATCH|DELETE)\b/;
    if (!MUTATION_RE.test(src)) return null; // no mutations

    // Add import after last import line
    const lines = src.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i])) lastImport = i;
    }
    if (lastImport >= 0) {
        lines.splice(lastImport + 1, 0, RL_IMPORT);
    } else {
        lines.unshift(RL_IMPORT);
    }
    src = lines.join('\n');

    // Insert RL check after function body opening `{`
    // We look for lines ending with `): Promise<Response> {` or `): Response {`
    // or `): Promise<NextResponse> {` etc., which mark the body opening in multi-line sigs.
    // Also handle single-line function sigs ending with `) {`
    src = src.replace(
        /(\nexport async function (?:POST|PUT|PATCH|DELETE)\b[^\n]*\{)(\s*\n)/g,
        (match, funcLine, ws) => {
            // Only add once per function (the opening brace we just matched)
            return funcLine + '\n' + RL_CHECK + ws.replace('\n', '');
        }
    );

    // For multi-line signatures, the body opening is on a line like `): Promise<Response> {`
    // and the export function line above won't have the `{`
    // Handle these: lines ending with `> {` or `) {` that follow the function declaration
    src = src.replace(
        /(^\): (?:Promise<(?:Response|NextResponse)>|Response) \{$)/mg,
        (match) => match + '\n' + RL_CHECK
    );

    return src;
}

console.log('\n=== 1. Rate Limiting ===');
for (const rel of mutationFiles) {
    try {
        const full = `${process.cwd()}/${rel}`;
        const original = readFileSync(full, 'utf8');
        const updated  = addRateLimit(original);
        if (updated === null) {
            console.log(`  SKIP: ${rel}`);
        } else {
            writeFileSync(full, updated, 'utf8');
            console.log(`  OK:   ${rel}`);
        }
    } catch (e) {
        console.log(`  ERR:  ${rel} — ${e.message}`);
    }
}

// ─── 2. SENTRY FOR CRON ROUTES ───────────────────────────────────────────────

const SENTRY_IMPORT = `import { captureError } from '@/lib/sentry';`;

const UNAUTH_BLOCK = `if (request.headers.get('authorization') !== \`Bearer \${process.env.CRON_SECRET}\`) {\n        return Response.json({ error: 'Unauthorized' }, { status: 401 });\n    }`;

const cronFiles = [
    'src/app/api/cron/churn-prevention/route.ts',
    'src/app/api/cron/commissioner-activation/route.ts',
    'src/app/api/cron/dfs-score/route.ts',
    'src/app/api/cron/drafttype-health/route.ts',
    'src/app/api/cron/espn-sync/route.ts',
    'src/app/api/cron/fantasycalc-sync/route.ts',
    'src/app/api/cron/feature-intelligence/route.ts',
    'src/app/api/cron/league-health/route.ts',
    'src/app/api/cron/messaging/route.ts',
    'src/app/api/cron/power-rankings/route.ts',
    'src/app/api/cron/predictive-models/route.ts',
    'src/app/api/cron/rookie-opportunity-sync/route.ts',
    'src/app/api/cron/sleeper-players/route.ts',
    'src/app/api/cron/sleeper-projections/route.ts',
    'src/app/api/cron/upsell-engine/route.ts',
];

function addSentry(src, cronName) {
    if (src.includes('captureError')) return null; // already done

    // Add import after last import line
    const lines = src.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i])) lastImport = i;
    }
    if (lastImport >= 0) {
        lines.splice(lastImport + 1, 0, SENTRY_IMPORT);
    } else {
        lines.unshift(SENTRY_IMPORT);
    }
    src = lines.join('\n');

    // After the auth check block, wrap the rest in try/catch
    // Find: "    }\n\n" or "    }\n" that follows the unauthorized return
    const authBlockEnd = `return Response.json({ error: 'Unauthorized' }, { status: 401 });\n    }`;
    const idx = src.indexOf(authBlockEnd);
    if (idx === -1) return src; // can't find pattern, add import only

    const insertAt = idx + authBlockEnd.length;

    // Find the last line of the function (the closing `\n}`)
    // The function always ends with `\n}` as the last two chars (or `\n}\n`)
    const lastBrace = src.lastIndexOf('\n}');

    if (lastBrace <= insertAt) return src; // unexpected structure

    const body  = src.slice(insertAt, lastBrace);
    const after = src.slice(lastBrace);

    const wrapped =
        '\n\n    try {' +
        body.replace(/\n/g, '\n    ') +  // indent body by 4 spaces
        '\n    } catch (err) {\n' +
        `        captureError(err, { cron: '${cronName}' });\n` +
        '        return Response.json({ error: \'Cron failed\' }, { status: 500 });\n' +
        '    }';

    return src.slice(0, insertAt) + wrapped + after;
}

console.log('\n=== 2. Sentry for Crons ===');
for (const rel of cronFiles) {
    try {
        const full    = `${process.cwd()}/${rel}`;
        const cronName = rel.split('/').slice(-2)[0]; // e.g. "churn-prevention"
        const original = readFileSync(full, 'utf8');
        const updated  = addSentry(original, cronName);
        if (updated === null) {
            console.log(`  SKIP: ${rel}`);
        } else {
            writeFileSync(full, updated, 'utf8');
            console.log(`  OK:   ${rel}`);
        }
    } catch (e) {
        console.log(`  ERR:  ${rel} — ${e.message}`);
    }
}

// ─── 3. LOADING STATES ───────────────────────────────────────────────────────

const FULL_PAGE_LOADING = `export default function Loading() {
    return (
        <div className="min-h-screen bg-gray-950 pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="h-4 w-40 bg-gray-800 rounded animate-pulse" />
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />
                    ))}
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-10 bg-gray-800 rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
        </div>
    );
}
`;

const CONTENT_LOADING = `export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="h-4 w-40 bg-gray-800 rounded animate-pulse" />
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />
                ))}
            </div>
        </div>
    );
}
`;

// top-level pages (no parent layout that renders the main chrome)
const fullPageDirs = [
    'src/app/dashboard',
    'src/app/dashboard/account',
    'src/app/dashboard/commissioner',
    'src/app/dashboard/commissioner/announcements',
    'src/app/dashboard/commissioner/calendar',
    'src/app/dashboard/commissioner/dues',
    'src/app/dashboard/commissioner/dues/setup',
    'src/app/dashboard/commissioner/settings',
    'src/app/dashboard/notifications',
    'src/app/dashboard/notifications/preferences',
    'src/app/dashboard/plan/player',
    'src/app/dashboard/sync',
    'src/app/dashboard/sync/espn',
    'src/app/dashboard/sync/nfl',
    'src/app/dashboard/sync/yahoo',
    'src/app/dashboard/trade',
    'src/app/dashboard/upgrade',
];

// commissioner/calendar/[leagueId] and commissioner/dues/[duesId]/* have full layouts
const moreFullPageDirs = [
    'src/app/dashboard/commissioner/calendar/[leagueId]',
    'src/app/dashboard/commissioner/dues/[duesId]',
    'src/app/dashboard/commissioner/dues/[duesId]/future-dues',
    'src/app/dashboard/commissioner/dues/[duesId]/payouts',
    'src/app/dashboard/commissioner/dues/[duesId]/poll',
    'src/app/dashboard/commissioner/dues/[duesId]/proposal',
    'src/app/dashboard/plan/commissioner/[subId]',
];

// inside the league [id] layout — show content skeleton only
const contentDirs = [
    'src/app/dashboard/league/[id]/calendar',
    'src/app/dashboard/league/[id]/commissioner',
    'src/app/dashboard/league/[id]/commissioner/invite',
    'src/app/dashboard/league/[id]/dfs',
    'src/app/dashboard/league/[id]/dues',
    'src/app/dashboard/league/[id]/dues/pay',
    'src/app/dashboard/league/[id]/fantasyiq',
    'src/app/dashboard/league/[id]/fantasyiq/dfs',
    'src/app/dashboard/league/[id]/fantasyiq/draft-assistant',
    'src/app/dashboard/league/[id]/fantasyiq/draft-report',
    'src/app/dashboard/league/[id]/fantasyiq/draft-strategy',
    'src/app/dashboard/league/[id]/fantasyiq/rankings',
    'src/app/dashboard/league/[id]/fantasyiq/start-sit',
    'src/app/dashboard/league/[id]/overview',
    'src/app/dashboard/league/[id]/payouts',
    'src/app/dashboard/league/[id]/payouts/history',
    'src/app/dashboard/league/[id]/projections',
    'src/app/dashboard/league/[id]/rankings',
    'src/app/dashboard/league/[id]/start-sit',
    'src/app/dashboard/league/[id]/trade',
];

function createLoadingFile(dir, content) {
    const full = `${process.cwd()}/${dir}/loading.tsx`;
    if (existsSync(full)) {
        return 'EXISTS';
    }
    writeFileSync(full, content, 'utf8');
    return 'OK';
}

console.log('\n=== 3. Loading States ===');
for (const dir of [...fullPageDirs, ...moreFullPageDirs]) {
    const result = createLoadingFile(dir, FULL_PAGE_LOADING);
    console.log(`  ${result}: ${dir}/loading.tsx`);
}
for (const dir of contentDirs) {
    const result = createLoadingFile(dir, CONTENT_LOADING);
    console.log(`  ${result}: ${dir}/loading.tsx`);
}

console.log('\nDone!');
