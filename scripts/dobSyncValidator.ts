/**
 * DOB Sync Validator
 * ------------------
 * Audits player age/DOB consistency across data sources:
 *   - Sleeper live API     → birth_date (sleeperDOB) + age
 *   - DB: SleeperPlayer    → stored age (Sleeper-sourced, updated daily)
 *   - DB: FantasyCalcValue → ktcAge (KTC-sourced; no DOB available from KTC)
 *
 * NOTE ON dbDOB:
 *   Our database does NOT store a birth_date field for any player.
 *   Both SleeperPlayer and FantasyCalcValue store age (integer/float) only.
 *   dbDOB will be null for all players — this is an architectural gap
 *   that this report surfaces as "Missing DB DOB".
 *
 * NOTE ON ktcDOB:
 *   KTC (FantasyCalc) does not expose birth_date — only age (Float).
 *   ktcDOB is always null; ktcAge is used for cross-source age comparison.
 *
 * Run: pnpm dob:check
 * Output: scripts/output/dob-sync-report.json
 *
 * READ-ONLY — no DB writes, no mutations.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
// Inline age helpers — avoids date-fns dependency in scripts
function parseDate(dob: string): Date | null {
    const d = new Date(dob);
    return isNaN(d.getTime()) ? null : d;
}

function differenceInYears(later: Date, earlier: Date): number {
    let years = later.getFullYear() - earlier.getFullYear();
    const m = later.getMonth() - earlier.getMonth();
    if (m < 0 || (m === 0 && later.getDate() < earlier.getDate())) years--;
    return years;
}
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ── Prisma setup (same adapter pattern as other scripts) ─────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Types ────────────────────────────────────────────────────────────────────
type Issue =
    | 'Missing DB DOB'
    | 'Missing Sleeper DOB'
    | 'No DOB in any source'
    | 'Invalid DOB format'
    | 'Conflicting DOB (DB vs Sleeper)'
    | 'Conflicting DOB (KTC vs others)'
    | 'Age anomaly: too low (<18)'
    | 'Age anomaly: too high (>50)'
    | 'Age anomaly: zero (placeholder or bad DOB)'
    | 'Age conflict: Sleeper DOB vs stored age'
    | 'Age conflict: KTC age vs Sleeper age'
    | 'Stale age field present';

type Severity = 'critical' | 'warning' | 'info';

const ISSUE_SEVERITY: Record<Issue, Severity> = {
    'No DOB in any source':                    'critical',
    'Missing DB DOB':                          'warning',
    'Missing Sleeper DOB':                     'warning',
    'Invalid DOB format':                      'critical',
    'Conflicting DOB (DB vs Sleeper)':         'critical',
    'Conflicting DOB (KTC vs others)':         'warning',
    'Age anomaly: too low (<18)':              'critical',
    'Age anomaly: too high (>50)':             'critical',
    'Age anomaly: zero (placeholder or bad DOB)': 'critical',
    'Age conflict: Sleeper DOB vs stored age': 'warning',
    'Age conflict: KTC age vs Sleeper age':    'info',
    'Stale age field present':                 'info',
};

// Sort order for severity grouping in output
const SEVERITY_ORDER: Record<Issue, number> = {
    'No DOB in any source':                    0,
    'Conflicting DOB (DB vs Sleeper)':         1,
    'Conflicting DOB (KTC vs others)':         2,
    'Invalid DOB format':                      3,
    'Age anomaly: zero (placeholder or bad DOB)': 4,
    'Age anomaly: too low (<18)':              5,
    'Age anomaly: too high (>50)':             6,
    'Age conflict: Sleeper DOB vs stored age': 7,
    'Age conflict: KTC age vs Sleeper age':    8,
    'Missing DB DOB':                          9,
    'Missing Sleeper DOB':                     10,
    'Stale age field present':                 11,
};

interface PlayerRecord {
    playerId:                    string | null;  // Sleeper player ID (if matched)
    name:                        string;
    position:                    string;
    dbDOB:                       string | null;  // SleeperPlayer.birthDate (backfilled from Sleeper API)
    sleeperDOB:                  string | null;  // birth_date from live Sleeper API (source of truth)
    ktcDOB:                      null;           // KTC doesn't expose DOB — always null
    storedSleeperAge:            number | null;  // Our DB: SleeperPlayer.age (pre-calculated by Sleeper)
    ktcAge:                      number | null;  // Our DB: FantasyCalcValue.age (KTC-sourced)
    liveSleeperAge:              number | null;  // Live Sleeper API: age field
    calculatedAgeFromDbDOB:      number | null;  // differenceInYears from SleeperPlayer.birthDate
    calculatedAgeFromSleeperDOB: number | null;  // differenceInYears from live birth_date
    issues:                      Issue[];
}

interface ReportSummary {
    totalPlayers:         number;
    cleanPlayers:         number;
    dobSyncScore:         number;
    criticalCount:        number;
    warningCount:         number;
    infoCount:            number;
    architecturalNote:    string;
    issueCounts:          Partial<Record<Issue, number>>;
    generatedAt:          string;
}

interface Report {
    summary: ReportSummary;
    players: PlayerRecord[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+\b(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i, '')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isValidDOB(dob: string | null | undefined): boolean {
    if (!dob) return false;
    if (dob === '0000-00-00' || dob.trim() === '') return false;
    return parseDate(dob) !== null;
}

function calculateAge(dob: string | null | undefined): number | null {
    if (!isValidDOB(dob)) return null;
    const d = parseDate(dob!);
    if (!d) return null;
    return differenceInYears(new Date(), d);
}

// ── Sleeper live API types ────────────────────────────────────────────────────
interface SleeperRawPlayer {
    active?:          boolean;
    position?:        string;
    full_name?:       string;
    first_name?:      string;
    last_name?:       string;
    birth_date?:      string | null;  // ISO date e.g. "1998-05-15" — now stored as SleeperPlayer.birthDate
    age?:             number | null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    console.log('🔍 DOB Sync Validator starting…\n');

    // 1. Load DB: SleeperPlayer (stored birthDate + age)
    console.log('  Loading SleeperPlayer records from DB…');
    const dbSleeper = await prisma.sleeperPlayer.findMany({
        where:  { active: true, position: { in: ['QB', 'RB', 'WR', 'TE'] } },
        select: { playerId: true, fullName: true, position: true, birthDate: true, age: true },
    });
    const sleeperByNorm = new Map<string, typeof dbSleeper[number]>();
    for (const p of dbSleeper) {
        const key = normalizeName(p.fullName);
        if (!sleeperByNorm.has(key)) sleeperByNorm.set(key, p);
    }
    const withDbDOB = dbSleeper.filter(p => !!p.birthDate).length;
    console.log(`    → ${dbSleeper.length} active skill-position players`);
    console.log(`    → ${withDbDOB} have birthDate in DB (${Math.round(withDbDOB / dbSleeper.length * 100)}%)\n`);

    // 2. Load DB: FantasyCalcValue (KTC age — Float, not DOB)
    console.log('  Loading FantasyCalcValue records from DB…');
    const ktcRows = await prisma.fantasyCalcValue.findMany({
        where: {
            position: { in: ['QB', 'RB', 'WR', 'TE'] },
            OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }],
        },
        select: { playerName: true, nameLower: true, position: true, age: true },
    });
    console.log(`    → ${ktcRows.length} KTC-ranked players\n`);

    // 3. Fetch live Sleeper API for birth_date (field our cron ignores)
    console.log('  Fetching live Sleeper player data for birth_date…');
    const sleeperRes = await fetch('https://api.sleeper.app/v1/players/nfl', {
        headers: { 'User-Agent': 'FantasyIQ-DOB-Validator/1.0' },
    });
    if (!sleeperRes.ok) {
        throw new Error(`Sleeper API error: ${sleeperRes.status} ${sleeperRes.statusText}`);
    }
    const sleeperRaw = await sleeperRes.json() as Record<string, SleeperRawPlayer>;

    // Index live Sleeper data by normalized name
    const liveSleeperByNorm = new Map<string, { playerId: string; dob: string | null; age: number | null }>();
    for (const [id, p] of Object.entries(sleeperRaw)) {
        if (!p.position || !['QB', 'RB', 'WR', 'TE'].includes(p.position)) continue;
        if (!p.active) continue;
        const fullName = p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        if (!fullName) continue;
        const key = normalizeName(fullName);
        if (!liveSleeperByNorm.has(key)) {
            liveSleeperByNorm.set(key, {
                playerId: id,
                dob:      p.birth_date ?? null,
                age:      p.age ?? null,
            });
        }
    }
    console.log(`    → ${liveSleeperByNorm.size} active skill-position players in live Sleeper API`);

    // Count how many have birth_date
    const withDOB = [...liveSleeperByNorm.values()].filter(p => !!p.dob).length;
    console.log(`    → ${withDOB} have birth_date in Sleeper API (${Math.round(withDOB / liveSleeperByNorm.size * 100)}%)\n`);

    // 4. Build combined player records (keyed off KTC universe — same as our canonical universe)
    console.log('  Building player records and validating…');
    const players: PlayerRecord[] = [];

    for (const ktc of ktcRows) {
        const norm        = normalizeName(ktc.nameLower);
        const dbSleeperP  = sleeperByNorm.get(norm) ?? null;
        const liveP       = liveSleeperByNorm.get(norm) ?? null;

        const dbDOB              = dbSleeperP?.birthDate ?? null;
        const sleeperDOB         = liveP?.dob ?? null;
        const storedSleeperAge   = dbSleeperP?.age ?? null;
        const liveSleeperAge     = liveP?.age ?? null;
        const ktcAge             = (ktc.age != null && ktc.age > 0) ? Math.round(ktc.age) : null;
        const calcFromDbDOB      = calculateAge(dbDOB);
        const calcFromSleeperDOB = calculateAge(sleeperDOB);

        const issues: Issue[] = [];

        // a) Missing DOB checks
        if (!dbDOB) issues.push('Missing DB DOB');
        if (!sleeperDOB) issues.push('Missing Sleeper DOB');

        if (!dbDOB && !sleeperDOB) {
            // Escalate: remove both individual flags, replace with combined
            const i1 = issues.indexOf('Missing DB DOB');
            const i2 = issues.indexOf('Missing Sleeper DOB');
            if (i1 >= 0) issues.splice(i1, 1);
            const i2b = issues.indexOf('Missing Sleeper DOB');
            if (i2b >= 0) issues.splice(i2b, 1);
            void i2; // suppress unused warning
            issues.push('No DOB in any source');
        }

        // b) Invalid DOB format
        if (dbDOB && !isValidDOB(dbDOB)) issues.push('Invalid DOB format');
        if (sleeperDOB && !isValidDOB(sleeperDOB)) issues.push('Invalid DOB format');

        // c) Conflicting DOB (DB vs live Sleeper)
        if (dbDOB && sleeperDOB && dbDOB !== sleeperDOB) {
            issues.push('Conflicting DOB (DB vs Sleeper)');
        }

        // d) Runtime age anomalies — use DB DOB as primary, live as secondary
        const calcAge = calcFromDbDOB ?? calcFromSleeperDOB;
        if (calcAge !== null) {
            if (calcAge === 0) {
                issues.push('Age anomaly: zero (placeholder or bad DOB)');
            } else if (calcAge < 18) {
                issues.push('Age anomaly: too low (<18)');
            } else if (calcAge > 50) {
                issues.push('Age anomaly: too high (>50)');
            }
        }

        // Cross-source age conflicts
        // e) DOB-derived age vs stored Sleeper age (stale pre-calculated field)
        const calcAgeForConflict = calcFromDbDOB ?? calcFromSleeperDOB;
        if (calcAgeForConflict !== null && storedSleeperAge !== null) {
            if (Math.abs(calcAgeForConflict - storedSleeperAge) > 1) {
                issues.push('Age conflict: Sleeper DOB vs stored age');
            }
        }

        // e) KTC age vs Sleeper age (use live age or stored age, prefer live)
        const referenceSleeperAge = liveSleeperAge ?? storedSleeperAge;
        if (ktcAge !== null && referenceSleeperAge !== null) {
            if (Math.abs(ktcAge - referenceSleeperAge) > 1) {
                issues.push('Age conflict: KTC age vs Sleeper age');
            }
        }

        // f) Stale age field: universe player has a stored age field
        const universeAge = storedSleeperAge ?? ktcAge;
        if (universeAge !== null) {
            issues.push('Stale age field present');
        }

        players.push({
            playerId:                    liveP?.playerId ?? dbSleeperP?.playerId ?? null,
            name:                        ktc.playerName,
            position:                    ktc.position,
            dbDOB,
            sleeperDOB,
            ktcDOB:                      null,
            storedSleeperAge,
            ktcAge,
            liveSleeperAge,
            calculatedAgeFromDbDOB:      calcFromDbDOB,
            calculatedAgeFromSleeperDOB: calcFromSleeperDOB,
            issues,
        });
    }

    // 5. Sort by severity (worst first)
    function worstSeverity(issues: Issue[]): number {
        if (!issues.length) return 999;
        return Math.min(...issues.map(i => SEVERITY_ORDER[i] ?? 999));
    }

    players.sort((a, b) => worstSeverity(a.issues) - worstSeverity(b.issues));

    // 6. Compute summary
    const issueCounts: Partial<Record<Issue, number>> = {};
    let criticalCount = 0;
    let warningCount  = 0;
    let infoCount     = 0;

    for (const p of players) {
        for (const issue of p.issues) {
            issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
            const sev = ISSUE_SEVERITY[issue];
            if (sev === 'critical') criticalCount++;
            else if (sev === 'warning') warningCount++;
            else infoCount++;
        }
    }

    // Clean = has sleeperDOB, no critical issues, no age conflicts
    const cleanPlayers = players.filter(p =>
        (p.dbDOB || p.sleeperDOB) &&
        isValidDOB(p.dbDOB ?? p.sleeperDOB) &&
        !p.issues.some(i => ISSUE_SEVERITY[i] === 'critical') &&
        !p.issues.includes('Age conflict: Sleeper DOB vs stored age') &&
        !p.issues.includes('Age conflict: KTC age vs Sleeper age') &&
        !p.issues.includes('Conflicting DOB (DB vs Sleeper)')
    ).length;

    const totalPlayers  = players.length;
    const dobSyncScore  = totalPlayers > 0 ? Math.round((cleanPlayers / totalPlayers) * 100) : 0;

    const summary: ReportSummary = {
        totalPlayers,
        cleanPlayers,
        dobSyncScore,
        criticalCount,
        warningCount,
        infoCount,
        architecturalNote: [
            'dbDOB = SleeperPlayer.birthDate (added in DOB architecture fix, backfilled from Sleeper API).',
            'sleeperDOB = birth_date from live Sleeper API call (source of truth for conflict detection).',
            'ktcDOB is null for all players: KTC (FantasyCalc) does not expose birth_date.',
            'storedSleeperAge = SleeperPlayer.age (pre-calculated by Sleeper, kept as fallback).',
            '"Missing DB DOB" fires for players where Sleeper has no birth_date (new rookies, older players).',
            '"Stale age field present" tracks remaining usage of stored age fields instead of DOB-derived age.',
        ].join(' '),
        issueCounts,
        generatedAt: new Date().toISOString(),
    };

    const report: Report = { summary, players };

    // 7. Write JSON report
    const outDir  = path.resolve(__dirname, 'output');
    const outPath = path.join(outDir, 'dob-sync-report.json');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Report written to ${outPath}\n`);

    // 8. Console summary
    console.log('═══════════════════════════════════════════════════════');
    console.log(' DOB Sync Validation Report');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Players audited:  ${totalPlayers}`);
    console.log(`  Clean players:    ${cleanPlayers}`);
    console.log(`\n  DOB Sync Score:   ${dobSyncScore}% (${cleanPlayers}/${totalPlayers})`);
    console.log(`\n  Critical issues:  ${criticalCount}`);
    console.log(`  Warnings:         ${warningCount}`);
    console.log(`  Info:             ${infoCount}`);

    console.log('\n─── Issue Breakdown ──────────────────────────────────');
    const sortedIssues = (Object.entries(issueCounts) as [Issue, number][])
        .sort((a, b) => (SEVERITY_ORDER[a[0]] ?? 999) - (SEVERITY_ORDER[b[0]] ?? 999));

    for (const [issue, count] of sortedIssues) {
        const sev   = ISSUE_SEVERITY[issue];
        const emoji = sev === 'critical' ? '🔴' : sev === 'warning' ? '🟡' : '🔵';
        console.log(`  ${emoji} ${issue.padEnd(45)} ${String(count).padStart(4)}`);
    }

    console.log('\n─── Top Issues (first 10 players with critical/warning) ──');
    const topIssues = players
        .filter(p => p.issues.some(i => ISSUE_SEVERITY[i] !== 'info'))
        .slice(0, 10);
    for (const p of topIssues) {
        const critWarn = p.issues.filter(i => ISSUE_SEVERITY[i] !== 'info');
        console.log(`  ${p.name.padEnd(28)} [${p.position}]  ${critWarn.slice(0, 2).join(', ')}`);
    }

    console.log('\n─── Architectural Note ───────────────────────────────');
    console.log('  dbDOB = SleeperPlayer.birthDate (backfilled from Sleeper API).');
    console.log('  "Missing DB DOB" = Sleeper has no birth_date for this player (rookies, edge cases).');
    console.log('  "Stale age field present" = player still has a stored age field alongside birthDate.');
    console.log('  "Age conflict: DOB vs stored age" = stored age is stale vs what the DOB calculates.\n');

    await prisma.$disconnect();
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
