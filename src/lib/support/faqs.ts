// FantasyiQ Trust — Support Center FAQ Data v1

export type FAQCategoryId =
    | 'account'
    | 'league-sync'
    | 'draft-reports'
    | 'prs'
    | 'dtv'
    | 'commissioner-tools'
    | 'calendar-playoffs'
    | 'troubleshooting';

export interface FAQItem {
    id:       string;
    category: FAQCategoryId;
    question: string;
    answer:   string;
    tags?:    string[];
}

export const CATEGORIES: { id: FAQCategoryId; label: string; icon: string }[] = [
    { id: 'account',            label: 'Account & Login',       icon: '👤' },
    { id: 'league-sync',        label: 'League Syncing',        icon: '🔄' },
    { id: 'draft-reports',      label: 'Draft Reports',         icon: '📊' },
    { id: 'prs',                label: 'PRS & Member Profiles', icon: '⭐' },
    { id: 'dtv',                label: 'DTV & Player Values',   icon: '💰' },
    { id: 'commissioner-tools', label: 'Commissioner Tools',    icon: '🏆' },
    { id: 'calendar-playoffs',  label: 'Calendar & Playoffs',   icon: '📅' },
    { id: 'troubleshooting',    label: 'Troubleshooting',       icon: '🔧' },
];

export const FAQ_ITEMS: FAQItem[] = [
    // ── Account & Login ──────────────────────────────────────────────────────
    {
        id:       'create-account',
        category: 'account',
        question: 'How do I create an account?',
        answer:   'Go to fantasyiqtrust.com and click Sign Up. You can register with Google or an email address. Once signed in, sync your first league from the dashboard.',
        tags:     ['signup', 'register', 'account', 'login'],
    },
    {
        id:       'connect-sleeper',
        category: 'account',
        question: 'How do I connect my Sleeper account?',
        answer:   'From your dashboard, click "Sync a League" and enter your Sleeper username. FantasyiQ Trust will fetch your leagues automatically. No password is required — we use Sleeper\'s public API.',
        tags:     ['sleeper', 'sync', 'connect', 'account'],
    },
    {
        id:       'connect-espn',
        category: 'account',
        question: 'How do I connect an ESPN league?',
        answer:   'Go to Dashboard → Sync → ESPN. You\'ll need your ESPN league ID plus your espn_s2 and SWID cookies (found in your browser\'s dev tools while logged into ESPN). Private leagues require these credentials; public leagues only need the league ID.',
        tags:     ['espn', 'credentials', 'swid', 'espn_s2', 'connect'],
    },
    {
        id:       'invite-members',
        category: 'account',
        question: 'How do I invite league members to FantasyiQ Trust?',
        answer:   'Open your league in the dashboard, go to Commissioner Hub → Invite Members. Copy the invite link and share it with your leaguemates. When they join, their PRS scores will appear on your Members card.',
        tags:     ['invite', 'members', 'link', 'commissioner'],
    },

    // ── League Syncing ───────────────────────────────────────────────────────
    {
        id:       'sync-sleeper-league',
        category: 'league-sync',
        question: 'How do I sync my Sleeper league?',
        answer:   'From the dashboard, click "Sync Leagues" and enter your Sleeper username. Select the leagues you want to track. Your rosters, picks, and matchup data sync automatically every hour. You can also trigger a manual refresh from the league overview page.',
        tags:     ['sync', 'sleeper', 'refresh', 'league'],
    },
    {
        id:       'espn-not-showing',
        category: 'league-sync',
        question: 'Why isn\'t my ESPN league showing up?',
        answer:   'ESPN leagues require valid espn_s2 and SWID credentials for private leagues. Common issues: (1) expired cookies — log out and back into ESPN to refresh them; (2) wrong league ID — check the URL on ESPN Fantasy; (3) whitespace in credentials — the system strips it automatically, but double-check your copy-paste.',
        tags:     ['espn', 'private', 'credentials', 'not showing', 'league'],
    },
    {
        id:       'sync-frequency',
        category: 'league-sync',
        question: 'How often does league data update?',
        answer:   'League rosters and standings sync hourly via automated cron jobs. During the NFL season, matchup scores update more frequently on game days. Player values (DTV) update daily. You can always trigger a manual refresh from your league overview.',
        tags:     ['sync', 'frequency', 'update', 'refresh', 'cron'],
    },
    {
        id:       'stale-data',
        category: 'league-sync',
        question: 'Why does my league show stale data?',
        answer:   'If your league shows outdated rosters or standings, try a manual refresh from the league overview page (the ↺ button near the league header). If the issue persists, verify your Sleeper username is correct or that your ESPN credentials haven\'t expired.',
        tags:     ['stale', 'outdated', 'refresh', 'data', 'sync'],
    },

    // ── Draft Reports ────────────────────────────────────────────────────────
    {
        id:       'draft-not-showing',
        category: 'draft-reports',
        question: 'Why is my draft not showing in the Report Card?',
        answer:   'Your draft may not appear if:\n• Your league hasn\'t synced since the draft completed\n• Your league platform hasn\'t finalized the draft results\n• Your draft occurred before FiQ began tracking your league\n• Your league is missing required roster or pick data\n\nTrigger a manual sync from your league overview page to refresh.',
        tags:     ['draft', 'not showing', 'report', 'complete', 'sync'],
    },
    {
        id:       'draft-identity',
        category: 'draft-reports',
        question: 'What do the Draft Identity labels mean?',
        answer:   'Draft Identity labels describe your drafting style based on:\n• Value gained relative to DTV\n• Positional balance\n• Risk vs stability\n• Age curve alignment\n• Roster construction strategy\n\nExamples include Upside Hunter, Value Sniper, Win-Now Builder, and Future Architect.',
        tags:     ['draft identity', 'upside hunter', 'value sniper', 'win-now builder', 'future architect', 'archetype'],
    },
    {
        id:       'trajectory-windows',
        category: 'draft-reports',
        question: 'What does Competitive Window / Growth Window / Rebuild Window mean?',
        answer:   'These are your Franchise Window labels derived from your roster\'s age curve, pick capital, and starter quality:\n• Competitive Window — your window to win is open now (strong starters, aging core)\n• Growth Window — you\'re ascending toward a peak in 1–2 years\n• Stable Window — a balanced roster with no urgent direction\n• Rebuild Window — you\'re accumulating assets and capital for a future surge',
        tags:     ['competitive window', 'growth window', 'rebuild window', 'stable window', 'trajectory', 'franchise'],
    },
    {
        id:       'no-data-players',
        category: 'draft-reports',
        question: 'Why does my report show "No data" for some players?',
        answer:   'This occurs when:\n• The player has no current DTV\n• The player is not recognized in FiQ\'s player database\n• The draft platform exported incomplete data\n• The player is a placeholder or unranked rookie\n\nValues populate automatically once the player enters the dynasty market.',
        tags:     ['no data', 'missing', 'players', 'report', 'rankings'],
    },

    // ── PRS ──────────────────────────────────────────────────────────────────
    {
        id:       'what-is-prs',
        category: 'prs',
        question: 'What is DSS?',
        answer:   'DSS (Dynasty Skill Score) measures your long-term dynasty performance using:\n• Roster strength\n• Draft efficiency\n• Trade impact\n• Lineup optimization\n• Season-over-season improvement\n\nIt is a holistic score designed to reflect dynasty skill, not just win totals.',
        tags:     ['dss', 'dynasty skill', 'score', 'members', 'tiers', 'dynasty'],
    },
    {
        id:       'how-prs-calculated',
        category: 'prs',
        question: 'How is DSS calculated?',
        answer:   'DSS blends multiple weighted components:\n• DTV-based roster value\n• Draft value added\n• Trade efficiency\n• Lineup decisions\n• Playoff performance\n• Consistency over time\n\nEach component updates automatically as your league syncs.',
        tags:     ['dss', 'dynasty skill', 'calculation', 'formula', 'how', 'score'],
    },
    {
        id:       'low-prs',
        category: 'prs',
        question: 'Why is my PRS low?',
        answer:   'Common reasons include:\n• Low roster value relative to league average\n• Negative draft value added\n• Trades that lost value\n• Inconsistent lineup optimization\n• Rebuilding roster strategy\n\nPRS improves as your roster strengthens and your decisions add value.',
        tags:     ['prs', 'low', 'improve', 'score', 'why'],
    },
    {
        id:       'improve-prs',
        category: 'prs',
        question: 'How do I improve my PRS?',
        answer:   'PRS improves as your dynasty decisions pay off over time:\n• Build roster DTV through smart drafting and trading\n• Add value in trades — target positive-DTV swaps\n• Set optimal lineups consistently\n• Make deep playoff runs\n• Improve season-over-season\n\nThere is no shortcut — the score reflects your cumulative dynasty track record.',
        tags:     ['prs', 'improve', 'increase', 'tips', 'score'],
    },

    // ── DTV ──────────────────────────────────────────────────────────────────
    {
        id:       'what-is-dtv',
        category: 'dtv',
        question: 'What is DTV?',
        answer:   'DTV (Dynasty Trade Value) is FantasyiQ Trust\'s unified dynasty value score for every player. It reflects a player\'s perceived worth in dynasty trade markets and powers FiQ features such as:\n• Roster strength evaluation\n• Draft pick scoring\n• Trade balance calculations\n• Draft impact analysis\n• Positional value modeling\n\nDTV updates daily and adapts to market movement, positional scarcity, and league format.',
        tags:     ['dtv', 'dynasty', 'trade value', 'player values', 'roster'],
    },
    {
        id:       'dtv-vs-ktc',
        category: 'dtv',
        question: 'Does FiQ use an external value source?',
        answer:   'FantasyiQ Trust uses one value system across the entire platform: DTV.\n\nFiQ automatically adjusts DTV based on your league format:\n• Superflex leagues use Superflex-adjusted DTV\n• 1QB leagues use Standard DTV\n\nThis ensures all values, trade scores, and draft grades are aligned with your league type.',
        tags:     ['dtv', 'values', 'superflex', '1qb', 'format', 'external'],
    },
    {
        id:       'values-update-frequency',
        category: 'dtv',
        question: 'How often are player values updated?',
        answer:   'DTV updates daily to reflect changes in:\n• Player performance\n• Market sentiment\n• Positional scarcity\n• Depth chart movement\n• Injury impact\n• League-format adjustments\n\nUpdates are automatic and require no action from you.',
        tags:     ['values', 'update', 'frequency', 'daily', 'sync'],
    },

    // ── Commissioner Tools ───────────────────────────────────────────────────
    {
        id:       'setup-dues',
        category: 'commissioner-tools',
        question: 'How do I set up dues for my league?',
        answer:   'You can configure league dues from Commissioner Settings → Dues.\nSet the amount, due date, and payment method.\nMembers will see dues reminders on their dashboard.',
        tags:     ['dues', 'setup', 'commissioner', 'buy-in', 'payouts'],
    },
    {
        id:       'announcements',
        category: 'commissioner-tools',
        question: 'How do I post an announcement to my league?',
        answer:   'Go to Commissioner Hub → Announcements Manager. You can create a new post, pin important announcements to the top, and attach documents (PDFs, images). All league members who have joined FantasyiQ Trust will see announcements on their league dashboard.',
        tags:     ['announcements', 'post', 'commissioner', 'pin', 'documents'],
    },
    {
        id:       'commissioner-settings',
        category: 'commissioner-tools',
        question: 'What can I manage in Commissioner Settings?',
        answer:   'Commissioner Settings allow you to manage:\n• League dues\n• Announcements\n• Playoff structure\n• Scoring rules\n• Roster settings\n• League metadata\n\nChanges sync automatically across FiQ.',
        tags:     ['settings', 'commissioner', 'configuration', 'scoring', 'roster', 'playoff'],
    },

    // ── Calendar & Playoffs ──────────────────────────────────────────────────
    {
        id:       'set-playoff-weeks',
        category: 'calendar-playoffs',
        question: 'How do I set my playoff weeks?',
        answer:   'Open Commissioner Hub → Calendar Manager. At the top of the page, you\'ll see the Playoff Schedule section. Enter your Playoff Start Week (e.g. 15) and Championship Week (e.g. 17), then click Save. Sleeper leagues auto-populate these values when available; ESPN leagues must be set manually.',
        tags:     ['playoffs', 'calendar', 'commissioner', 'weeks', 'schedule'],
    },
    {
        id:       'wrong-phase',
        category: 'calendar-playoffs',
        question: 'Why does my league show the wrong season phase (e.g. "Playoffs" when it\'s regular season)?',
        answer:   'Season phase is derived from your configured playoff weeks and the current NFL week. If phase detection is wrong: (1) check that Playoff Start Week and Championship Week are set correctly in Calendar Manager; (2) Sleeper leagues auto-populate these but you can override them; (3) if no weeks are configured, the system falls back to NFL defaults (Week 14 = Playoffs, Week 15+ = Championship).',
        tags:     ['phase', 'playoffs', 'season', 'wrong', 'regular season', 'detection'],
    },
    {
        id:       'auto-synced-playoffs',
        category: 'calendar-playoffs',
        question: 'What does "Auto-synced from Sleeper" mean on my playoff settings?',
        answer:   'When Sleeper provides playoff start week data for your league, FantasyiQ Trust automatically fills in your Playoff Start Week and Championship Week. The "Auto-synced from Sleeper" badge confirms the values came from Sleeper. You can override them manually at any time — the badge will change to "Manual override" when you do.',
        tags:     ['auto-sync', 'sleeper', 'playoffs', 'badge', 'override'],
    },

    // ── Troubleshooting ──────────────────────────────────────────────────────
    {
        id:       'report-blank',
        category: 'troubleshooting',
        question: 'Why is my FiQ Report Card blank or loading forever?',
        answer:   'A few causes: (1) the draft may not be marked "complete" in Sleeper yet; (2) the league hasn\'t synced recently — try a manual refresh; (3) your roster may have players with no matching FiQ data (the report will still load but some picks may show reduced data). If it spins for more than 30 seconds, refresh the page and try again.',
        tags:     ['report card', 'loading', 'blank', 'error', 'troubleshoot'],
    },
    {
        id:       'player-values-zero',
        category: 'troubleshooting',
        question: 'Why are some player values showing 0?',
        answer:   'A player may show 0 DTV when:\n• They are not currently active on an NFL roster\n• They have no measurable dynasty market activity\n• They are on IR/PUP with no projected return\n• They are a depth-chart player with no dynasty relevance\n• They are a placeholder or unranked rookie\n\nValues update automatically when new data becomes available.',
        tags:     ['values', 'zero', '0', 'player', 'dtv'],
    },
    {
        id:       'espn-sync-fails',
        category: 'troubleshooting',
        question: 'Why does my ESPN league keep failing to sync?',
        answer:   'Common causes:\n• Expired ESPN session\n• Missing espn_s2 or SWID\n• Extension not installed\n• Logged into ESPN in a different browser\n• Private league access blocked\n• Corporate device blocking extensions\n\nLog into ESPN in the same browser and retry. Use the FiQ ESPN Connector extension for the easiest fix.',
        tags:     ['espn', 'sync', 'fail', 'credentials', 'error', 'swid', 'espn_s2', 'extension'],
    },
    {
        id:       'unauthorized-error',
        category: 'troubleshooting',
        question: 'I see "Unauthorized" errors — what should I do?',
        answer:   'Unauthorized errors mean your session has expired. Sign out and sign back in. If the error persists on a specific league page, the league may belong to a different account — make sure you\'re signed in with the account that originally synced that league.',
        tags:     ['unauthorized', 'error', 'session', 'login', 'sign in'],
    },
];

// ── Search helper ─────────────────────────────────────────────────────────────

export function searchFAQs(query: string): FAQItem[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return FAQ_ITEMS.filter(item =>
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.tags?.some(t => t.toLowerCase().includes(q))
    );
}

export function findBestFAQMatch(query: string): FAQItem | null {
    const results = searchFAQs(query);
    return results[0] ?? null;
}
