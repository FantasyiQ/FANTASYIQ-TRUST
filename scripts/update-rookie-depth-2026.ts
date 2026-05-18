/**
 * scripts/update-rookie-depth-2026.ts
 *
 * Manually set depth chart roles for 2026 rookies.
 * Run: npx tsx scripts/update-rookie-depth-2026.ts
 *
 * Labels:
 *   'Starter'     — clear Day 1 starter
 *   'Co-Starter'  — split role, timeshare, slot rotation
 *   'Role Player' — defined usage but not a starter
 *   'Backup'      — developmental, clear path if starter goes down
 *   '3rd String'  — limited immediate role, practice squad candidate
 *   null          — no data / clear override, rely on Sleeper only
 *
 * Once Sleeper populates real depth charts (training camp, July–Aug),
 * the cron will automatically use Sleeper data instead of these values.
 */

import { prisma } from '../src/lib/prisma';

const SEASON = '2026';

type DepthLabel = 'Starter' | 'Co-Starter' | 'Role Player' | 'Backup' | '3rd String' | null;

const LABEL_TO_ORDER: Record<string, number> = {
    'Starter':     1,
    'Co-Starter':  2,
    'Role Player': 3,
    'Backup':      4,
    '3rd String':  5,
};

// ── Depth Chart Assignments ───────────────────────────────────────────────────

const DEPTH_UPDATES: [string, DepthLabel][] = [
    // ── QBs ──
    ['Fernando Mendoza',        'Starter'    ],
    ['Ty Simpson',              'Backup'     ],
    ['Carson Beck',             'Backup'     ],
    ['Drew Allar',              'Backup'     ],
    ['Cade Klubnik',            'Backup'     ],
    ['Taylen Green',            '3rd String' ],
    ['Cole Payton',             'Backup'     ],
    ['Garrett Nussmeier',       '3rd String' ],
    ['Behren Morton',           '3rd String' ],
    ['Diego Pavia',             null         ],
    ['Haynes King',             '3rd String' ],
    ['Athan Kaliakmanis',       '3rd String' ],
    ['Jalon Daniels',           '3rd String' ],
    ['Joey Aguilar',            null         ],
    ['Sawyer Robertson',        null         ],
    ['Joe Fagnano',             null         ],
    ['Luke Altmyer',            null         ],

    // ── RBs ──
    ['Jeremiyah Love',          'Starter'    ],
    ['Jadarian Price',          'Co-Starter' ],
    ['Jonah Coleman',           'Role Player'],
    ['Mike Washington Jr',      'Role Player'],
    ['Nicholas Singleton',      'Role Player'],
    ['Emmett Johnson',          'Role Player'],
    ['Adam Randall',            'Role Player'],
    ['Kaelon Black',            'Backup'     ],
    ['Kaytron Allen',           'Role Player'],
    ['Demond Claiborne',        '3rd String' ],
    ['Eli Heidenreich',         '3rd String' ],
    ['Seth McGowan',            '3rd String' ],
    ['CJ Donaldson',            '3rd String' ],
    ['Jam Miller',              '3rd String' ],
    ["Le'Veon Moss",            '3rd String' ],
    ['Dean Connors',            '3rd String' ],
    ["J'Mari Taylor",           '3rd String' ],
    ['Chip Trayanum',           '3rd String' ],
    ['Rahsul Faison',           '3rd String' ],
    ['Noah Whittington',        '3rd String' ],
    ['Jaydn Ott',               null         ],
    ['Roman Hemby',             null         ],
    ['Jamal Haynes',            null         ],
    ['Sam Scott',               null         ],
    ['Barika Kpeenu',           null         ],
    ['Davon Booth',             null         ],
    ['Al-Jay Henderson',        null         ],
    ['Robert Henry Jr',         null         ],
    ['Kentrel Bullock',         null         ],
    ['Desmond Reid',            null         ],

    // ── WRs ──
    ['Jordyn Tyson',            'Starter'    ],
    ['Carnell Tate',            'Starter'    ],
    ['Makai Lemon',             'Starter'    ],
    ['Omar Cooper Jr.',         'Starter'    ],
    ['KC Concepcion',           'Starter'    ],
    ['Denzel Boston',           'Co-Starter' ],
    ["De'Zhaun Stribling",      'Co-Starter' ],
    ['Germie Bernard',          'Role Player'],
    ['Zachariah Branch',        'Role Player'],
    ['Chris Brazzell II',       'Role Player'],
    ['Antonio Williams',        'Role Player'],
    ['Malachi Fields',          'Role Player'],
    ['Chris Bell',              'Role Player'],
    ["Ja'Kobi Lane",            'Role Player'],
    ['Ted Hurst',               'Role Player'],
    ['Bryce Lance',             'Backup'     ],
    ['Elijah Sarratt',          'Backup'     ],
    ['Skyler Bell',             'Backup'     ],
    ['Caleb Douglas',           'Backup'     ],
    ['Brenen Thompson',         'Backup'     ],
    ['Zavion Thomas',           'Backup'     ],
    ['Colbie Young',            'Backup'     ],
    ['Kendrick Law',            'Backup'     ],
    ['Reggie Virgil',           'Backup'     ],
    ['Deion Burks',             'Backup'     ],
    ['Kaden Wetjen',            'Backup'     ],
    ['Barion Brown',            'Backup'     ],
    ['Josh Cameron',            'Backup'     ],
    ['Malik Benson',            'Backup'     ],
    ['CJ Daniels',              'Backup'     ],
    ['Kevin Coleman Jr.',       'Backup'     ],
    ['Jeff Caldwell',           null         ],
    ['Emmanuel Henderson Jr.',  null         ],
    ['J. Michael Sturdivant',   null         ],
    ['Dillon Bell',             null         ],
    ['Eric McAlister',          null         ],

    // ── TEs ──
    ['Kenyon Sadiq',            'Starter'    ],
    ['Eli Stowers',             'Co-Starter' ],
    ['Max Klare',               'Role Player'],
    ['Oscar Delp',              'Role Player'],
    ['Sam Roush',               'Role Player'],
    ['Nate Boerkircher',        'Role Player'],
    ['Justin Joly',             'Role Player'],
    ['Eli Raridon',             'Role Player'],
    ['Jack Endries',            'Backup'     ],
    ['Joe Royer',               'Backup'     ],
    ['Will Kacmarek',           'Backup'     ],
    ['Riley Nowakowski',        'Backup'     ],
    ['Marlin Klein',            'Backup'     ],
    ['Jaren Kanak',             'Backup'     ],
    ['Josh Cuevas',             '3rd String' ],
    ['Matthew Hibner',          '3rd String' ],
    ['Tanner Koziol',           '3rd String' ],
    ['Dallen Bentley',          '3rd String' ],
    ['Bauer Sharp',             '3rd String' ],
];

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`Updating depth roles for ${DEPTH_UPDATES.length} players (season ${SEASON})...\n`);

    let updated = 0;
    let notFound = 0;

    for (const [playerName, label] of DEPTH_UPDATES) {
        const player = await prisma.rookieRankingsPlayer.findUnique({
            where: { season_playerName: { season: SEASON, playerName } },
        });

        if (!player) {
            console.log(`  ✗  NOT FOUND: ${playerName}`);
            notFound++;
            continue;
        }

        const depthOrder = label !== null ? (LABEL_TO_ORDER[label] ?? null) : null;

        await prisma.rookieRankingsPlayer.update({
            where: { id: player.id },
            data:  { manualDepthOrder: depthOrder },
        });

        console.log(`  ✓  ${playerName.padEnd(30)} → ${label ?? '—'}`);
        updated++;
    }

    console.log(`\n✅  Done — ${updated} updated, ${notFound} not found.`);
    console.log(`\nRun the opportunity sync cron to apply scores:`);
    console.log(`  curl -H "Authorization: Bearer $CRON_SECRET" https://fantasyiq-trust.vercel.app/api/cron/rookie-opportunity-sync`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
