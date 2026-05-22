// FantasyiQ Trust — Support Assistant v2 Engine

import { FAQ_ITEMS, type FAQItem } from './faqs';
import type { SupportContext, SupportPage, SupportPlatform, SupportSeasonPhase } from './SupportContextStore';

// ── Intent types ──────────────────────────────────────────────────────────────

export type Intent = 'draft-not-showing' | 'playoff-weeks' | 'prs' | 'none';

// ── Page → boosted categories ─────────────────────────────────────────────────

const PAGE_BOOST: Record<SupportPage, string[]> = {
    'draft-report':  ['draft-reports', 'dtv'],
    'members':       ['prs'],
    'calendar':      ['calendar-playoffs'],
    'commissioner':  ['commissioner-tools'],
    'league-sync':   ['league-sync'],
    'support':       [],
    'other':         [],
};

// ── Context hint text ─────────────────────────────────────────────────────────

const PHASE_LABELS: Record<SupportSeasonPhase, string> = {
    PRE_DRAFT:      'Pre-Draft',
    OFFSEASON:      'Offseason',
    REGULAR_SEASON: 'Regular Season',
    PLAYOFFS:       'Playoffs',
    CHAMPIONSHIP:   'Championship',
};

const PLATFORM_LABELS: Record<SupportPlatform, string> = {
    SLEEPER: 'Sleeper',
    ESPN:    'ESPN',
    OTHER:   '',
};

function buildLeagueTag(context: SupportContext): string {
    const parts: string[] = [];
    if (context.platform && context.platform !== 'OTHER') parts.push(PLATFORM_LABELS[context.platform]);
    if (context.seasonPhase) parts.push(PHASE_LABELS[context.seasonPhase]);
    return parts.join(' · ');
}

const PAGE_BASE_HINTS: Partial<Record<SupportPage, string>> = {
    'draft-report': 'Draft Report · Ask about grades, DTV, or Draft Identity.',
    'members':      'Members · Ask about DSS scores or member profiles.',
    'calendar':     'Calendar Manager · Ask about playoff weeks or season phase.',
    'commissioner': 'Commissioner Hub · Ask about dues, announcements, or settings.',
    'league-sync':  'League · Ask about syncing, roster data, or credentials.',
    'support':      'Support Center · Ask any question.',
};

export function getContextHint(context: SupportContext): string | null {
    const base = PAGE_BASE_HINTS[context.page];
    if (!base) return null;
    const tag = buildLeagueTag(context);
    return tag ? `${tag} · ${base}` : `You're on: ${base}`;
}

// ── Intent detection ──────────────────────────────────────────────────────────

export function detectIntent(query: string): Intent {
    const q = query.toLowerCase();

    if (
        (q.includes('draft') || q.includes('report')) &&
        (q.includes('not showing') || q.includes('missing') || q.includes('where') ||
         q.includes('blank') || q.includes('loading') || q.includes("can't see") || q.includes('cannot see'))
    ) {
        return 'draft-not-showing';
    }
    if (
        q.includes('playoff week') || q.includes('championship week') ||
        q.includes('season phase') || q.includes('set playoff') || q.includes('wrong phase') ||
        (q.includes('playoff') && (q.includes('set') || q.includes('configure') || q.includes('how')))
    ) {
        return 'playoff-weeks';
    }
    if (q.includes('dss') || q.includes('dynasty skill') || q.includes('performance rating')) {
        return 'prs';
    }

    return 'none';
}

// ── Context-aware FAQ match ───────────────────────────────────────────────────

export function findBestFAQMatchWithContext(query: string, context: SupportContext): FAQItem | null {
    // Build boosted category list: page-based + platform-based
    const boosted = new Set(PAGE_BOOST[context.page] ?? []);

    if (context.platform === 'ESPN') {
        boosted.add('league-sync');
        boosted.add('calendar-playoffs');
        boosted.add('troubleshooting');
    } else if (context.platform === 'SLEEPER') {
        boosted.add('league-sync');
        boosted.add('draft-reports');
    }

    const q = query.toLowerCase();
    const matches = FAQ_ITEMS.filter(item =>
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.tags?.some(t => t.toLowerCase().includes(q))
    );

    if (matches.length === 0) return null;

    // Promote boosted categories to front
    const front = matches.filter(i => boosted.has(i.category));
    const rest  = matches.filter(i => !boosted.has(i.category));

    return front[0] ?? rest[0];
}

// ── Intent handlers ───────────────────────────────────────────────────────────

function handleDraftNotShowing(ctx: SupportContext): { content: string; faq: FAQItem | null } {
    const parts: string[] = [
        'The FiQ Draft Report Card only appears for completed drafts.',
    ];

    if (ctx.seasonPhase === 'PRE_DRAFT') {
        parts.push("Your league is in Pre-Draft phase — the draft hasn't happened yet. The report will be available once the draft is complete.");
    } else if (ctx.platform === 'ESPN') {
        parts.push('Your league is on ESPN. Make sure the draft is complete on ESPN and then use the ↺ Refresh FiQ button to sync the latest data.');
    } else if (ctx.draftCompleted === false) {
        parts.push("Your draft doesn't appear to be marked complete yet in Sleeper. Confirm the draft is finished and try the ↺ Refresh FiQ button.");
    } else if (ctx.hasDraftReport === false && ctx.draftCompleted) {
        parts.push("Your draft is complete but we don't have a stored report yet. Try the ↺ Refresh FiQ button on the league page.");
    } else {
        parts.push('Check that: (1) your draft status is "complete" in Sleeper; (2) you\'ve synced recently using the ↺ Refresh FiQ button on the league page.');
    }

    return {
        content: parts.join('\n\n'),
        faq:     FAQ_ITEMS.find(f => f.id === 'draft-not-showing') ?? null,
    };
}

function handlePlayoffWeeks(ctx: SupportContext): { content: string; faq: FAQItem | null } {
    const pws = ctx.playoffStartWeek;
    const cw  = ctx.championshipWeek;

    if (pws && cw) {
        const extra = ctx.platform === 'ESPN'
            ? ' Since you\'re on ESPN, you set these manually and they won\'t auto-update.'
            : ' For Sleeper leagues these auto-populate — you can override them at any time.';
        return {
            content: `Your playoff schedule is configured: Playoffs start Week ${pws}, Championship is Week ${cw}.${extra} Update them in Commissioner Hub → Calendar Manager.`,
            faq:     FAQ_ITEMS.find(f => f.id === 'set-playoff-weeks') ?? null,
        };
    }

    if (ctx.platform === 'ESPN') {
        return {
            content: 'ESPN leagues require manual playoff week entry. Go to Commissioner Hub → Calendar Manager, enter your Playoff Start Week and Championship Week, and click Save.',
            faq:     FAQ_ITEMS.find(f => f.id === 'set-playoff-weeks') ?? null,
        };
    }
    return {
        content: 'Set your playoff weeks in Commissioner Hub → Calendar Manager. Enter Playoff Start Week and Championship Week, then click Save. Sleeper leagues auto-populate when available.',
        faq:     FAQ_ITEMS.find(f => f.id === 'set-playoff-weeks') ?? null,
    };
}

function handlePRS(ctx: SupportContext): { content: string; faq: FAQItem | null } {
    const suffix = ctx.hasPRS === false
        ? " Some members in your league don't have DSS scores yet — invite them to FantasyiQ Trust to unlock scores for the whole league."
        : '';
    return {
        content: `DSS (Dynasty Skill Score) measures your long-term dynasty performance — roster strength, draft efficiency, trade impact, lineup optimization, and season-over-season improvement. It reflects dynasty skill, not just win totals.${suffix}`,
        faq:     FAQ_ITEMS.find(f => f.id === 'what-is-prs') ?? null,
    };
}

// ── Main reply generator ──────────────────────────────────────────────────────

export function generateAssistantReply(
    query:   string,
    context: SupportContext,
): { content: string; faq: FAQItem | null } {
    const intent = detectIntent(query);

    if (intent === 'draft-not-showing') return handleDraftNotShowing(context);
    if (intent === 'playoff-weeks')     return handlePlayoffWeeks(context);
    if (intent === 'prs')               return handlePRS(context);

    // Context-boosted FAQ match
    const match = findBestFAQMatchWithContext(query, context);
    if (match) {
        return { content: match.answer, faq: match };
    }

    // Keyword fallbacks
    const q = query.toLowerCase();

    if (q.includes('espn') || q.includes('credentials') || q.includes('swid')) {
        return {
            content: "ESPN leagues require espn_s2 and SWID cookies for private leagues. Find these in your browser's Dev Tools while logged into ESPN Fantasy.",
            faq:     FAQ_ITEMS.find(f => f.id === 'connect-espn') ?? null,
        };
    }
    if (q.includes('dtv') || q.includes('ktc') || q.includes('dynasty') || q.includes('trade value')) {
        // If the user is asking why DTV is empty and we know there's no draft report
        if (!context.hasDraftReport && (q.includes('empty') || q.includes('missing') || q.includes('zero') || q.includes("can't see") || q.includes('not showing'))) {
            return {
                content: 'DTV snapshots in the Draft Report only appear after a draft report is generated. Complete your draft and re-sync your league using the ↺ Refresh FiQ button.',
                faq:     FAQ_ITEMS.find(f => f.id === 'draft-not-showing') ?? null,
            };
        }
        return {
            content: "DTV (Dynasty Trade Value) is FantasyiQ Trust's unified dynasty value score. It powers roster evaluation, trade scoring, and draft analysis — and adjusts automatically for your league format (Superflex vs 1QB). Updates daily.",
            faq:     FAQ_ITEMS.find(f => f.id === 'what-is-dtv') ?? null,
        };
    }
    if (q.includes('phase') || q.includes('offseason') || q.includes('pre-draft') || q.includes('pre draft')) {
        if (context.seasonPhase === 'OFFSEASON') {
            return {
                content: "Your league is currently in Offseason — weekly projections, lineup tools, and matchup features are paused until the new season begins. Dues, roster values, and trade evaluator still work year-round.",
                faq:     FAQ_ITEMS.find(f => f.id === 'wrong-phase') ?? null,
            };
        }
        if (context.seasonPhase === 'PRE_DRAFT') {
            return {
                content: "Your league is in Pre-Draft phase — the season hasn't started yet. Set your draft date in Sleeper and configure playoff weeks in Calendar Manager to prepare.",
                faq:     FAQ_ITEMS.find(f => f.id === 'wrong-phase') ?? null,
            };
        }
    }
    if (q.includes('sync') || q.includes('refresh') || q.includes('update') || q.includes('stale')) {
        const extra = context.platform === 'ESPN'
            ? ' ESPN leagues use the ↺ Refresh FiQ button — make sure your espn_s2 and SWID cookies are up to date.'
            : '';
        return {
            content: `League data syncs hourly. Trigger a manual refresh from the league overview page using the ↺ Refresh FiQ button.${extra}`,
            faq:     FAQ_ITEMS.find(f => f.id === (context.platform === 'ESPN' ? 'espn-not-showing' : 'sync-frequency')) ?? null,
        };
    }
    if (q.includes('dues') || q.includes('payment') || q.includes('pay')) {
        return {
            content: 'Set up dues in Commissioner Hub → Dues Manager. FantasyiQ Trust never touches your money — payments go directly between members.',
            faq:     FAQ_ITEMS.find(f => f.id === 'setup-dues') ?? null,
        };
    }

    return {
        content: "I couldn't find a specific answer for that. Try searching the Support Center or browse by category — most common questions are covered there.",
        faq:     null,
    };
}
