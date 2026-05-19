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
        answer:   'League rosters and standings sync hourly via automated cron jobs. During the NFL season, matchup scores update more frequently on game days. Player values (DTV/KTC) update daily. You can always trigger a manual refresh from your league overview.',
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
        answer:   'The FiQ Draft Report Card only shows drafts with status "complete" in Sleeper. If your draft is in progress or was abandoned, it won\'t appear. Also confirm you\'re viewing the correct league and have synced recently.',
        tags:     ['draft', 'not showing', 'report', 'complete'],
    },
    {
        id:       'draft-identity',
        category: 'draft-reports',
        question: 'What do the Draft Identity labels mean (Upside Hunter, Value Sniper, etc.)?',
        answer:   'Draft Identity is a v3.4 archetype label that summarizes your drafting pattern:\n• Upside Hunter — you prioritized T1/T2 ceiling picks (≥40% of your picks)\n• Value Sniper — you consistently found value above your pick slot\n• Positional Architect — you filled roster gaps methodically (≥50% need fills)\n• Future-Focused Builder — you invested in young talent (≥40% age ≤22)\n• Balanced Builder — a mixed approach across all dimensions',
        tags:     ['draft identity', 'upside hunter', 'value sniper', 'positional architect', 'future builder', 'archetype'],
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
        answer:   'Some players may not match between our FiQ rankings database and Sleeper\'s player IDs — this happens with obscure undrafted free agents or name mismatches. The report still grades your available picks; missing players are excluded from pool averages.',
        tags:     ['no data', 'missing', 'players', 'report', 'rankings'],
    },

    // ── PRS ──────────────────────────────────────────────────────────────────
    {
        id:       'what-is-prs',
        category: 'prs',
        question: 'What is PRS?',
        answer:   'PRS (Player Reliability Score) measures how consistently a manager fulfills their league commitments — dues payments, trade follow-through, FAAB activity, and overall roster engagement. Scores range 0–100 and are grouped into five tiers: Elite (81–100), Trusted (61–80), Reliable (41–60), Developing (21–40), and Unproven (0–20).',
        tags:     ['prs', 'reliability', 'score', 'members', 'tiers'],
    },
    {
        id:       'how-prs-calculated',
        category: 'prs',
        question: 'How is PRS calculated?',
        answer:   'PRS is computed from several behavioral signals tracked over time: league dues payment history, lineup setting consistency (not leaving players on bye or injured on your bench), trade and FAAB responsiveness, and overall engagement with league activity. The exact formula is proprietary and updates as new signal data arrives.',
        tags:     ['prs', 'calculation', 'formula', 'how', 'score'],
    },
    {
        id:       'low-prs',
        category: 'prs',
        question: 'Why is my PRS low?',
        answer:   'Common causes of a low PRS: (1) recently joined — new accounts start with limited history and build score over time; (2) missed dues payments or late payments in a tracked league; (3) inactive lineup management (leaving injured players, ignoring waivers). PRS improves automatically as positive behavior is recorded.',
        tags:     ['prs', 'low', 'improve', 'score', 'why'],
    },
    {
        id:       'improve-prs',
        category: 'prs',
        question: 'How do I improve my PRS?',
        answer:   'PRS improves over time with consistent behavior: pay dues on time, set your lineup every week, respond to trade offers, and participate in FAAB activity. There\'s no shortcut — the score reflects a track record across your leagues. New users should expect their score to rise over 4–8 weeks of activity.',
        tags:     ['prs', 'improve', 'increase', 'tips', 'score'],
    },

    // ── DTV ──────────────────────────────────────────────────────────────────
    {
        id:       'what-is-dtv',
        category: 'dtv',
        question: 'What is DTV?',
        answer:   'DTV (Dynasty Trade Value) is the KTC (KeepTradeCut) dynasty value for a player — an industry-standard score that reflects the player\'s perceived worth in dynasty trade markets. FantasyiQ Trust uses DTV to measure roster depth, score draft picks, and compute how much value your draft added.',
        tags:     ['dtv', 'dynasty', 'trade value', 'ktc', 'player values'],
    },
    {
        id:       'dtv-vs-ktc',
        category: 'dtv',
        question: 'What is the difference between DTV and KTC?',
        answer:   'They\'re the same underlying data. KeepTradeCut (KTC) is the source; FantasyiQ Trust labels it DTV for clarity inside the app. Superflex leagues use the KTC Superflex value; standard/non-SF leagues use the standard KTC dynasty value.',
        tags:     ['dtv', 'ktc', 'difference', 'keeptradecut', 'superflex'],
    },
    {
        id:       'values-update-frequency',
        category: 'dtv',
        question: 'How often are player values updated?',
        answer:   'Player values sync from KeepTradeCut daily via an automated job. During the NFL season, values can shift quickly after injuries or breakout performances. Check back daily for the freshest data — the last sync timestamp is shown on the Trade Evaluator.',
        tags:     ['values', 'update', 'frequency', 'ktc', 'daily', 'sync'],
    },

    // ── Commissioner Tools ───────────────────────────────────────────────────
    {
        id:       'setup-dues',
        category: 'commissioner-tools',
        question: 'How do I set up dues for my league?',
        answer:   'Open Commissioner Hub and click "Set Up Dues." You\'ll set the buy-in amount, payout structure (champion, runner-up, etc.), and payment method. Once configured, members can pay directly through FantasyiQ Trust and you\'ll see a live payment tracker. FantasyiQ Trust never touches the money — payments go directly between members.',
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
        answer:   'Commissioner Settings (Commissioner Hub → Commissioner Settings) shows your league configuration pulled from Sleeper or ESPN: scoring type, roster positions, total teams, and draft settings. These are read-only views for reference — changes must be made in Sleeper or ESPN and will sync on the next refresh.',
        tags:     ['settings', 'commissioner', 'configuration', 'scoring', 'roster'],
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
        answer:   'Player DTV values of 0 usually mean: (1) the player is below the KTC threshold we sync (we filter out players valued under ~300 to keep the database clean); (2) a name mismatch between our database and Sleeper\'s player records. Rookies who haven\'t entered training camp yet may also show 0 until KTC prices them.',
        tags:     ['values', 'zero', '0', 'player', 'dtv', 'ktc'],
    },
    {
        id:       'espn-sync-fails',
        category: 'troubleshooting',
        question: 'Why does my ESPN league keep failing to sync?',
        answer:   'ESPN credential failures are the most common cause. ESPN sessions expire periodically. Fix: (1) log into ESPN Fantasy in your browser; (2) open Dev Tools (F12) → Application → Cookies → fantasy.espn.com; (3) copy fresh espn_s2 and SWID values; (4) update them in Dashboard → Sync → ESPN. The sync will retry immediately.',
        tags:     ['espn', 'sync', 'fail', 'credentials', 'error', 'swid', 'espn_s2'],
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
