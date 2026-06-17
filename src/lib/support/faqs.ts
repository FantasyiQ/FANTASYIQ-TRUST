// FantasyiQ Trust — Support Center FAQ Data v2

export type FAQCategoryId =
    | 'account'
    | 'billing'
    | 'league-sync'
    | 'commissioner-tools'
    | 'dues-payouts'
    | 'draft-reports'
    | 'dss'
    | 'dtv'
    | 'leaguefinder'
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
    { id: 'account',            label: 'Account & Login',        icon: '👤' },
    { id: 'billing',            label: 'Plans & Billing',        icon: '💳' },
    { id: 'league-sync',        label: 'League Syncing',         icon: '🔄' },
    { id: 'commissioner-tools', label: 'Commissioner Tools',     icon: '🏆' },
    { id: 'dues-payouts',       label: 'Dues & Payouts',         icon: '💰' },
    { id: 'draft-reports',      label: 'Draft Reports',          icon: '📊' },
    { id: 'dss',                label: 'DSS & Member Profiles',  icon: '⭐' },
    { id: 'dtv',                label: 'DTV & Player Values',    icon: '📈' },
    { id: 'leaguefinder',       label: 'League Finder',          icon: '🔍' },
    { id: 'calendar-playoffs',  label: 'Calendar & Playoffs',    icon: '📅' },
    { id: 'troubleshooting',    label: 'Troubleshooting',        icon: '🔧' },
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
        id:       'invite-members',
        category: 'account',
        question: 'How do I invite league members?',
        answer:   'Open your league in the dashboard and click "Copy Invite Link" in the league header. Share the link with your leaguemates via group chat or Sleeper.\n\nMembers who open the link will see your league documents (if any) before signing up, then get redirected to the dues page after joining. Their DSS scores will appear on your Members card once they\'re connected.',
        tags:     ['invite', 'members', 'link', 'commissioner'],
    },
    {
        id:       'forgot-password',
        category: 'account',
        question: 'I forgot my password. How do I reset it?',
        answer:   'On the sign-in page, click "Forgot password?" and enter your email. You\'ll receive a reset link within a few minutes. Check your spam folder if it doesn\'t arrive. If you signed up with Google, you\'ll need to use "Sign in with Google" — there is no password to reset.',
        tags:     ['password', 'reset', 'forgot', 'email', 'login'],
    },
    {
        id:       'change-email',
        category: 'account',
        question: 'Can I change my email address?',
        answer:   'Yes. Go to Dashboard → Account Settings and update your email. You\'ll need to verify the new address before it takes effect.',
        tags:     ['email', 'change', 'account', 'settings'],
    },

    // ── Plans & Billing ──────────────────────────────────────────────────────
    {
        id:       'plans-overview',
        category: 'billing',
        question: 'What plans does FantasyiQ Trust offer?',
        answer:   'FiQ has two plan types:\n\n• Player Plans — for individual players who want analytics across their leagues (DSS, DTV, Draft Reports, Start/Sit). Plans: PRO, ALL-PRO, ELITE. All billed annually.\n\n• Commissioner Plans — for league commissioners who want dues collection, payout management, reminders, and the full commissioner hub. Plans are per-league: Commissioner PRO, ALL-PRO, and ELITE. All billed annually.\n\nVisit /pricing for the full feature breakdown and current pricing.',
        tags:     ['plans', 'pricing', 'commissioner', 'player', 'tiers'],
    },
    {
        id:       'free-account',
        category: 'billing',
        question: 'Is there a free account?',
        answer:   'You can create a free account and get access to League Finder — browse leagues, view commissioner profiles, and submit join requests. To access league syncing, analytics, commissioner tools, or dues management, you\'ll need a paid plan. Visit /pricing to see what\'s included.',
        tags:     ['free', 'cost', 'account', 'plan', 'league finder'],
    },
    {
        id:       'how-to-upgrade',
        category: 'billing',
        question: 'How do I upgrade my plan?',
        answer:   'Go to Dashboard → Account → Upgrade, or visit /pricing and click the plan you want. You\'ll be taken to a secure Stripe checkout. Your new features activate immediately after payment. All plans are billed annually.',
        tags:     ['upgrade', 'plan', 'stripe', 'checkout', 'billing'],
    },
    {
        id:       'how-to-cancel',
        category: 'billing',
        question: 'How do I cancel my subscription?',
        answer:   'Go to Dashboard → Account → Manage Subscription. Click "Cancel Plan" and confirm. Your access continues until the end of your annual billing period.',
        tags:     ['cancel', 'subscription', 'billing'],
    },
    {
        id:       'when-billed',
        category: 'billing',
        question: 'When am I charged?',
        answer:   'Subscriptions are billed annually on the date you first subscribed. You\'ll receive an email receipt after each payment. You can view your billing history under Dashboard → Billing.',
        tags:     ['billed', 'charge', 'annual', 'yearly', 'receipt', 'billing history'],
    },
    {
        id:       'refund-policy',
        category: 'billing',
        question: 'Do you offer refunds?',
        answer:   'All sales are final. We do not offer refunds on annual subscriptions. If you have a billing issue or were charged in error, open the FiQ Assistant and we\'ll look into it.',
        tags:     ['refund', 'charge', 'billing', 'final', 'no refund'],
    },
    {
        id:       'commissioner-vs-player-plan',
        category: 'billing',
        question: 'Do I need both a Player plan and a Commissioner plan?',
        answer:   'Not necessarily. Commissioner plans cover your league-level tools (dues, payouts, commissioner hub). Player plans cover your personal analytics (DSS, DTV, Draft Reports) across all leagues you play in.\n\nIf you\'re just running dues for your league, a Commissioner plan is all you need. If you also want personal analytics, you\'ll want a Player plan too.',
        tags:     ['commissioner', 'player', 'plan', 'both', 'difference'],
    },

    // ── League Syncing ───────────────────────────────────────────────────────
    {
        id:       'chrome-extension',
        category: 'league-sync',
        question: 'What is the FantasyiQ Trust Chrome Extension?',
        answer:   'The FantasyiQ Trust Chrome Extension makes connecting your ESPN league effortless. Once installed, it automatically captures your ESPN credentials while you browse ESPN Fantasy — no manual token copying needed.\n\nTo install:\n1. Visit the Chrome Web Store and search for "FantasyiQ Trust"\n2. Click "Add to Chrome"\n3. Log into ESPN Fantasy in your browser\n4. The extension will detect your league and prompt you to connect it to FiQ\n\nThe extension is free and works with all ESPN private leagues.',
        tags:     ['chrome', 'extension', 'espn', 'install', 'browser', 'credentials', 'google'],
    },
    {
        id:       'sync-sleeper-league',
        category: 'league-sync',
        question: 'How do I sync my Sleeper league?',
        answer:   'From the dashboard, click "Sync Leagues" and enter your Sleeper username. Select the leagues you want to track. Your rosters, picks, and matchup data sync automatically every hour. You can also trigger a manual refresh from the league overview page.',
        tags:     ['sync', 'sleeper', 'refresh', 'league'],
    },
    {
        id:       'connect-yahoo',
        category: 'league-sync',
        question: 'How do I connect a Yahoo Fantasy league?',
        answer:   'Go to Dashboard → Sync → Yahoo. You\'ll be redirected to Yahoo to authorize the connection — no manual credentials needed. Once authorized, select the leagues you want to import and hit Connect.\n\nIf your Yahoo session expires, you may need to reconnect from the same page.',
        tags:     ['yahoo', 'sync', 'connect', 'authorize', 'oauth'],
    },
    {
        id:       'connect-nfl-fantasy',
        category: 'league-sync',
        question: 'How do I connect an NFL Fantasy league?',
        answer:   'Go to Dashboard → Sync → NFL Fantasy. Enter your NFL Fantasy league ID (found in the URL when you\'re on your league page at fantasy.nfl.com). Public leagues connect automatically. If your league is private, you may need to provide your NFL.com login credentials to authorize access.',
        tags:     ['nfl', 'nfl fantasy', 'sync', 'connect', 'league'],
    },
    {
        id:       'espn-not-showing',
        category: 'league-sync',
        question: 'Why isn\'t my ESPN league showing up?',
        answer:   'ESPN leagues require valid espn_s2 and SWID tokens for private leagues. Common fixes:\n\n1. Tokens expired — log out and back into ESPN to refresh them, then re-enter them on FiQ\n2. Wrong league ID — check the URL on ESPN Fantasy (it\'s the number after /ffl/leagues/)\n3. Make sure you\'re copying the tokens without extra spaces\n\nPublic ESPN leagues only need the league ID.',
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
        answer:   'If your league shows outdated rosters or standings, try a manual refresh from the league overview page (the ↺ button near the league header). If the issue persists, verify your Sleeper username is correct or that your ESPN/Yahoo credentials haven\'t expired.',
        tags:     ['stale', 'outdated', 'refresh', 'data', 'sync'],
    },
    {
        id:       'multiple-leagues',
        category: 'league-sync',
        question: 'Can I sync multiple leagues at once?',
        answer:   'Yes. You can sync leagues from multiple platforms simultaneously — Sleeper, ESPN, Yahoo, and NFL Fantasy all in one dashboard. The number of leagues you can connect depends on your plan. Check /pricing for league limits per tier.',
        tags:     ['multiple', 'leagues', 'platforms', 'limit', 'sync'],
    },

    // ── Commissioner Tools ───────────────────────────────────────────────────
    {
        id:       'announcements',
        category: 'commissioner-tools',
        question: 'How do I post an announcement to my league?',
        answer:   'Go to Commissioner Hub → Announcements Manager. You can create a new post and pin important announcements to the top. All league members who have joined FantasyiQ Trust will see announcements on their league dashboard.',
        tags:     ['announcements', 'post', 'commissioner', 'pin'],
    },
    {
        id:       'league-documents',
        category: 'commissioner-tools',
        question: 'How do I share league documents (bylaws, rulebook)?',
        answer:   'Go to Commissioner Hub → Announcements Manager → League Documents. Click "+ Add Document" to upload a file (PDF, Word, Excel, images — up to 10 MB) or paste a link to an external file.\n\nUploaded documents appear:\n• On your league overview page so members can always access them\n• On the member invite page so prospects can read the rules before signing up\n\nYou can label each document (e.g. "Hall Hogzz Bylaws 2025") and remove old ones at any time.',
        tags:     ['documents', 'bylaws', 'rulebook', 'upload', 'files', 'rules', 'commissioner', 'pdf'],
    },
    {
        id:       'commissioner-settings',
        category: 'commissioner-tools',
        question: 'What can I manage in Commissioner Settings?',
        answer:   'Commissioner Settings let you manage:\n• League dues setup\n• Payout structure\n• Announcements\n• Playoff schedule\n• Scoring rules\n• Roster settings\n• League metadata\n\nChanges sync automatically across FiQ.',
        tags:     ['settings', 'commissioner', 'configuration', 'scoring', 'roster', 'playoff'],
    },
    {
        id:       'invite-members-comm',
        category: 'commissioner-tools',
        question: 'How do I get my league members to join FiQ?',
        answer:   'From Commissioner Hub → Invite Members, copy your unique invite link and share it in your league group chat or Sleeper.\n\nWhen a member opens the link they\'ll see:\n• What FantasyiQ Trust offers their league\n• Any league documents you\'ve uploaded (bylaws, rulebook, etc.)\n• Sign-in and sign-up buttons\n\nAfter they join, they\'re automatically connected to your league and taken directly to the dues page to pay. You can track who has joined from the Members dashboard.',
        tags:     ['invite', 'members', 'join', 'link', 'commissioner', 'dues'],
    },
    {
        id:       'my-roster',
        category: 'commissioner-tools',
        question: 'Where can I see my roster and player values?',
        answer:   'Open your league and click the "My Roster" tab (second tab in the league navigation). Your roster is organized by position (QB → RB → WR → TE → K → DEF) with players sorted by DTV within each group.\n\nAt the top you\'ll see slot summary cards:\n• Starters — how many starter spots are filled vs. allowed\n• Bench — bench players vs. bench slots\n• Taxi — taxi squad count vs. allowed (dynasty leagues)\n• IR — injured reserve count vs. slots\n• Total DTV — your combined dynasty roster value\n\nPlayer DTV values match your Team Rankings to the cent.',
        tags:     ['roster', 'my roster', 'dtv', 'player values', 'starters', 'bench', 'taxi', 'ir', 'dynasty'],
    },

    // ── Dues & Payouts ───────────────────────────────────────────────────────
    {
        id:       'setup-dues',
        category: 'dues-payouts',
        question: 'How do I set up dues for my league?',
        answer:   'Go to Commissioner Hub → Dues and click "Set Up Dues Tracker." Enter your buy-in amount, team count, and any notes. FiQ will calculate the full pot automatically. Members get notified to pay and can track their status from their dashboard.\n\nOnce all dues are collected, you\'ll be able to generate a payout proposal.',
        tags:     ['dues', 'setup', 'commissioner', 'buy-in', 'tracker'],
    },
    {
        id:       'how-members-pay',
        category: 'dues-payouts',
        question: 'How do members pay their dues?',
        answer:   'FiQ tracks dues status but members pay through your existing method (Venmo, Cash App, Zelle, etc.) — you mark members as paid as you receive it, or members can self-report payment.\n\nThis keeps everything in one place without FiQ touching the money. Your league controls the payment method.',
        tags:     ['pay', 'dues', 'venmo', 'cash app', 'zelle', 'members', 'payment'],
    },
    {
        id:       'dues-reminders',
        category: 'dues-payouts',
        question: 'How do auto-reminders work?',
        answer:   'Once dues are set up, FiQ automatically sends reminders to members who haven\'t paid. Reminders go out via in-app notification and email (for members who have joined FiQ). You can also manually trigger a reminder blast from the Dues dashboard.',
        tags:     ['reminders', 'notifications', 'auto', 'dues', 'unpaid'],
    },
    {
        id:       'pot-full',
        category: 'dues-payouts',
        question: 'What happens when all dues are collected?',
        answer:   'Once the pot is complete (all members marked as paid), you\'ll see a "Generate Payout Proposal" button in your Dues dashboard. Click it to create a draft payout breakdown. You assign each payout spot to the correct winner, then approve the proposal to send out payment links.',
        tags:     ['pot', 'full', 'collected', 'payout', 'proposal', 'generate'],
    },
    {
        id:       'payout-process',
        category: 'dues-payouts',
        question: 'How do payouts work?',
        answer:   'Once the commissioner approves a payout proposal, each winner receives a unique "Claim Your Winnings" link — sent to the email on your FiQ account (your Google email if you signed up with Google) and as a notification in your FiQ dashboard.\n\nWinners click the link and complete a short Stripe onboarding (~5 minutes):\n1. Enter your name and last 4 digits of your SSN (required by federal KYC law)\n2. Connect your bank account\n3. FiQ initiates the transfer — Stripe deposits the money directly to your bank\n\nFiQ covers the Stripe instant payout fee as part of every commissioner plan, so all leagues on FiQ offer instant payouts — your money arrives within minutes of completing onboarding.',
        tags:     ['payout', 'winners', 'payment', 'approve', 'stripe', 'claim', 'bank', 'deposit', 'instant'],
    },
    {
        id:       'claim-winnings',
        category: 'dues-payouts',
        question: 'I won — how do I claim my payout?',
        answer:   'After your commissioner approves the payout proposal, you\'ll receive a "Claim Your Winnings" link — check the email on your FiQ account (your Google email if you use Google sign-in) and your in-app notifications (the bell icon in the FiQ dashboard).\n\n1. Click "Claim Your Winnings"\n2. Enter your name and last 4 of your SSN (federal KYC requirement)\n3. Connect your bank account\n4. FiQ initiates the transfer — Stripe deposits it to your bank\n\nFiQ covers the Stripe instant payout fee on all leagues, so funds arrive within minutes. The link expires after 90 days.',
        tags:     ['claim', 'winnings', 'payout', 'won', 'prize', 'stripe', 'bank', 'how to', 'instant'],
    },
    {
        id:       'instant-payouts',
        category: 'dues-payouts',
        question: 'How fast do I get paid after winning?',
        answer:   'Instant — within minutes of completing your Stripe onboarding.\n\nFiQ covers the 1.5% Stripe instant payout fee on every league as part of the commissioner plan cost. This lets FiQ keep its zero-fees promise (no cut of dues or winnings) while still offering instant bank deposits to all winners.',
        tags:     ['instant', 'payout speed', 'fast', 'how long', 'minutes', '1.5%', 'fee', 'stripe', 'zero fees'],
    },
    {
        id:       'dues-fees',
        category: 'dues-payouts',
        question: 'Does FiQ take a cut of dues or payouts?',
        answer:   'No. FiQ charges commissioners a flat annual plan fee — that\'s it. Every dollar your league collects in dues goes back out as payouts to winners. FiQ takes zero percentage of dues or winnings.\n\nThe Stripe instant payout fee (1.5%) is absorbed by FiQ\'s plan cost, not passed to commissioners or winners.',
        tags:     ['fees', 'cut', 'percentage', 'dues', 'payouts', 'zero fees', 'stripe', '1.5%'],
    },
    {
        id:       'future-dues',
        category: 'dues-payouts',
        question: 'Can I track dues for next season before it starts?',
        answer:   'Yes. FiQ supports Future Dues tracking so you can log who has already committed or paid for the upcoming season. Go to Commissioner Hub → Dues → Future Dues to set it up.',
        tags:     ['future', 'next season', 'dues', 'upcoming', 'commit'],
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

    // ── DSS & Member Profiles ────────────────────────────────────────────────
    {
        id:       'what-is-dss',
        category: 'dss',
        question: 'What is DSS?',
        answer:   'DSS (Dynasty Skill Score) measures your long-term dynasty performance using:\n• Roster strength\n• Draft efficiency\n• Trade impact\n• Lineup optimization\n• Season-over-season improvement\n\nIt is a holistic score designed to reflect dynasty skill, not just win totals.',
        tags:     ['dss', 'dynasty skill', 'score', 'members', 'tiers', 'dynasty'],
    },
    {
        id:       'how-dss-calculated',
        category: 'dss',
        question: 'How is DSS calculated?',
        answer:   'DSS blends multiple weighted components:\n• DTV-based roster value\n• Draft value added\n• Trade efficiency\n• Lineup decisions\n• Playoff performance\n• Consistency over time\n\nEach component updates automatically as your league syncs.',
        tags:     ['dss', 'dynasty skill', 'calculation', 'formula', 'how', 'score'],
    },
    {
        id:       'low-dss',
        category: 'dss',
        question: 'Why is my DSS low?',
        answer:   'Common reasons include:\n• Low roster value relative to league average\n• Negative draft value added\n• Trades that lost value\n• Inconsistent lineup optimization\n• Rebuilding roster strategy\n\nDSS improves as your roster strengthens and your decisions add value.',
        tags:     ['dss', 'low', 'improve', 'score', 'why'],
    },
    {
        id:       'improve-dss',
        category: 'dss',
        question: 'How do I improve my DSS?',
        answer:   'DSS improves as your dynasty decisions pay off over time:\n• Build roster DTV through smart drafting and trading\n• Add value in trades — target positive-DTV swaps\n• Set optimal lineups consistently\n• Make deep playoff runs\n• Improve season-over-season\n\nThere is no shortcut — the score reflects your cumulative dynasty track record.',
        tags:     ['dss', 'improve', 'increase', 'tips', 'score'],
    },

    // ── DTV & Player Values ──────────────────────────────────────────────────
    {
        id:       'what-is-dtv',
        category: 'dtv',
        question: 'What is DTV?',
        answer:   'DTV (Dynasty Trade Value) is FantasyiQ Trust\'s unified dynasty value score for every player. It reflects a player\'s perceived worth in dynasty trade markets and powers FiQ features such as:\n• Roster strength evaluation\n• Draft pick scoring\n• Trade balance calculations\n• Draft impact analysis\n• Positional value modeling\n\nDTV updates daily and adapts to market movement, positional scarcity, and league format.',
        tags:     ['dtv', 'dynasty', 'trade value', 'player values', 'roster'],
    },
    {
        id:       'dtv-formats',
        category: 'dtv',
        question: 'Does FiQ adjust values for Superflex vs 1QB?',
        answer:   'Yes. FiQ automatically adjusts DTV based on your league format:\n• Superflex leagues use Superflex-adjusted DTV\n• 1QB leagues use Standard DTV\n\nThis ensures all values, trade scores, and draft grades are aligned with your league type.',
        tags:     ['dtv', 'values', 'superflex', '1qb', 'format', 'external'],
    },
    {
        id:       'values-update-frequency',
        category: 'dtv',
        question: 'How often are player values updated?',
        answer:   'DTV updates daily to reflect changes in:\n• Player performance\n• Market sentiment\n• Positional scarcity\n• Depth chart movement\n• Injury impact\n• League-format adjustments\n\nUpdates are automatic and require no action from you.',
        tags:     ['values', 'update', 'frequency', 'daily', 'sync'],
    },

    // ── League Finder ────────────────────────────────────────────────────────
    {
        id:       'what-is-prs',
        category: 'leaguefinder',
        question: 'What is PRS?',
        answer:   'PRS (Player Reliability Score) is a 0–100 score in League Finder that measures how trustworthy and reliable a fantasy player is. It is built from:\n• Verified seasons — confirmed full seasons played\n• League retention — whether you stayed or left leagues\n• Engagement — lineup activity, trade responses, waiver pickups\n• Commissioner trust — approvals, endorsements, flags, or bans from past commissioners\n\nPRS has five tiers: Unproven (0–20), Developing (21–40), Reliable (41–60), Trusted (61–80), and Elite (81–100). It updates daily as new events are recorded.',
        tags:     ['prs', 'player reliability score', 'league finder', 'score', 'trust', 'tiers'],
    },
    {
        id:       'improve-prs',
        category: 'leaguefinder',
        question: 'How do I improve my PRS?',
        answer:   'PRS improves as you build a verified track record:\n• Complete full seasons in your leagues (each verified season adds points)\n• Stay in leagues year over year (retention events boost your score)\n• Set lineups consistently and respond to trades\n• Earn commissioner approvals or endorsements\n\nAvoiding drops, abandoning leagues, or commissioner flags is just as important — penalties reduce your score.',
        tags:     ['prs', 'player reliability score', 'improve', 'increase', 'tips', 'league finder'],
    },
    {
        id:       'what-is-leaguefinder',
        category: 'leaguefinder',
        question: 'What is League Finder?',
        answer:   'League Finder is FiQ\'s directory for finding and joining open fantasy leagues. Commissioners can list their leagues publicly with details like format, buy-in, and platform. Players can browse, apply to join, and read verified commissioner reviews before committing.',
        tags:     ['league finder', 'find', 'join', 'directory', 'open'],
    },
    {
        id:       'list-league-leaguefinder',
        category: 'leaguefinder',
        question: 'How do I list my league on League Finder?',
        answer:   'Go to League Finder → My Leagues and click "List a League." Fill in your league details — platform, format, buy-in, roster settings, and any notes for prospective members. Once published, your listing is visible to all FiQ users browsing for leagues.',
        tags:     ['list', 'league', 'publish', 'commissioner', 'league finder'],
    },
    {
        id:       'commissioner-profile',
        category: 'leaguefinder',
        question: 'What is a Commissioner Profile?',
        answer:   'Your Commissioner Profile is a public page on League Finder that shows your track record as a commissioner — leagues you\'ve run, verified player reviews, and your overall rating. It helps prospective members trust you before joining your league.',
        tags:     ['commissioner profile', 'rating', 'reviews', 'trust', 'league finder'],
    },
    {
        id:       'leaguefinder-reviews',
        category: 'leaguefinder',
        question: 'How do commissioner reviews work?',
        answer:   'After a season, league members can leave a verified review of their commissioner on League Finder. Reviews rate commissioners on fairness, communication, rule consistency, and league stability. Verified reviews (from members FiQ can confirm were in the league) carry more weight.',
        tags:     ['reviews', 'rating', 'commissioner', 'verified', 'season'],
    },
    {
        id:       'join-league-leaguefinder',
        category: 'leaguefinder',
        question: 'How do I apply to join a league on League Finder?',
        answer:   'Browse League Finder, find a league you\'re interested in, and click "Request to Join." The commissioner will receive your request and can approve or decline. You\'ll be notified either way.',
        tags:     ['join', 'apply', 'request', 'league finder', 'commissioner'],
    },

    // ── Calendar & Playoffs ──────────────────────────────────────────────────
    {
        id:       'set-playoff-weeks',
        category: 'calendar-playoffs',
        question: 'How do I set my playoff weeks?',
        answer:   'Open Commissioner Hub → Calendar Manager. At the top of the page, you\'ll see the Playoff Schedule section. Enter your Playoff Start Week (e.g. 15) and Championship Week (e.g. 17), then click Save. Sleeper leagues auto-populate these values when available; ESPN and other leagues must be set manually.',
        tags:     ['playoffs', 'calendar', 'commissioner', 'weeks', 'schedule'],
    },
    {
        id:       'wrong-phase',
        category: 'calendar-playoffs',
        question: 'Why does my league show the wrong season phase?',
        answer:   'Season phase is derived from your configured playoff weeks and the current NFL week. If phase detection is wrong: (1) check that Playoff Start Week and Championship Week are set correctly in Calendar Manager; (2) Sleeper leagues auto-populate these but you can override them; (3) if no weeks are configured, the system falls back to NFL defaults (Week 14 = Playoffs, Week 15+ = Championship).',
        tags:     ['phase', 'playoffs', 'season', 'wrong', 'regular season', 'detection'],
    },
    {
        id:       'auto-synced-playoffs',
        category: 'calendar-playoffs',
        question: 'What does "Auto-synced from Sleeper" mean on my playoff settings?',
        answer:   'When Sleeper provides playoff start week data for your league, FantasyiQ Trust automatically fills in your Playoff Start Week and Championship Week. The "Auto-synced from Sleeper" badge confirms the values came from Sleeper. You can override them manually at any time.',
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
        answer:   'Common causes:\n• Expired ESPN session — log into ESPN in the same browser, then re-enter your tokens on FiQ\n• Missing espn_s2 or SWID — follow the on-screen guide at Dashboard → Sync → ESPN\n• Private league access blocked\n• Wrong league ID\n\nIf you\'re still stuck, open the FiQ Assistant and describe the error — we\'ll walk you through it.',
        tags:     ['espn', 'sync', 'fail', 'credentials', 'error', 'swid', 'espn_s2'],
    },
    {
        id:       'unauthorized-error',
        category: 'troubleshooting',
        question: 'I see "Unauthorized" errors — what should I do?',
        answer:   'Unauthorized errors mean your session has expired. Sign out and sign back in. If the error persists on a specific league page, the league may belong to a different account — make sure you\'re signed in with the account that originally synced that league.',
        tags:     ['unauthorized', 'error', 'session', 'login', 'sign in'],
    },
    {
        id:       'notifications-not-working',
        category: 'troubleshooting',
        question: 'I\'m not receiving notifications or emails — why?',
        answer:   'Check the following:\n1. Go to Dashboard → Notifications → Preferences and confirm your notification settings are enabled\n2. Check your spam folder for FiQ emails\n3. Make sure the email on your account is correct (Dashboard → Account)\n\nIf in-app notifications aren\'t showing, try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R).',
        tags:     ['notifications', 'email', 'alerts', 'preferences', 'spam'],
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
