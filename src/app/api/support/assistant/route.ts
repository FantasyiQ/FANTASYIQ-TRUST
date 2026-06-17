import Anthropic from '@anthropic-ai/sdk';
import type { NextRequest } from 'next/server';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';
import { FAQ_ITEMS } from '@/lib/support/faqs';

const anthropic = new Anthropic();

const FAQ_REFERENCE = FAQ_ITEMS
    .map(f => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n---\n\n');

const BASE_SYSTEM = `You are the FiQ Support Assistant for FantasyiQ Trust (fantasyiqtrust.com) — a fantasy football platform for dynasty leagues, dues management, and commissioner tools.

Answer questions about FantasyiQ Trust concisely and helpfully. You are a floating chat widget inside the app.

Key product facts:
- Integrates with Sleeper, ESPN, Yahoo, and NFL Fantasy
- PRS = Player Reliability Score (0–100 score in League Finder measuring player trustworthiness). Tiers: Unproven 0–20, Developing 21–40, Reliable 41–60, Trusted 61–80, Elite 81–100. Built from verified seasons, league retention, lineup engagement, and commissioner trust. Updates daily.
- DSS = Dynasty Skill Score (measures long-term dynasty performance: roster strength, draft efficiency, trade impact, lineup optimization)
- DTV = Dynasty Trade Value (updates daily, Superflex vs 1QB adjusted)
- Always write "FiQ" — never "FIQ" or "fiq"
- My Roster tab: players grouped by position (QB→RB→WR→TE→K→DEF) sorted by DTV, with Starters/Bench/Taxi/IR slot summary cards
- League Documents: commissioner uploads bylaws/files (PDF, Word, Excel, images up to 10 MB); visible on league overview and member invite page
- Invite flow: members see league docs before signing up, then land on dues/pay page after joining
- Dues collection: FiQ tracks payment status only — money moves via Venmo/Cash App/Zelle between members, FiQ never touches dues money
- Payouts to winners: FiQ facilitates these via Stripe Connect. Flow: commissioner generates proposal → assigns winners → approves → each winner gets a unique "Claim Your Winnings" link → winner completes Stripe onboarding (name, last 4 SSN, bank account, ~5 min) → FiQ transfers funds automatically
- Payout speed: standard Stripe deposit = 2–5 business days. Commissioners can cover the 1.5% Stripe instant payout fee to pay winners within minutes. FantasyiQ Trust leagues offer instant payouts with the fee covered by the commissioner.
- Commissioner plans are per-league; Player plans are for personal analytics across all leagues
- Free account = League Finder access only; paid plan required for syncing, analytics, or commissioner tools
- Copy Invite Link is in the league header (not a separate menu)

Tone: Friendly, direct. Keep answers to 2–3 sentences unless the question genuinely needs more. If you don't know something, say so and point the user to /support. Never invent features.

FAQ reference — use this to answer accurately:

${FAQ_REFERENCE}`;

type MessageParam = { role: 'user' | 'assistant'; content: string };

interface RequestBody {
    messages: MessageParam[];
    context?: {
        page?:              string;
        platform?:          string;
        seasonPhase?:       string;
        playoffStartWeek?:  number;
        championshipWeek?:  number;
    };
}

export async function POST(req: NextRequest): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(req));
    if (rl.limited) return rl.response!;

    const { messages, context } = await req.json() as RequestBody;

    if (!messages?.length) {
        return Response.json({ error: 'messages required' }, { status: 400 });
    }

    const ctxParts: string[] = [];
    if (context?.page && context.page !== 'other')       ctxParts.push(`page: ${context.page}`);
    if (context?.platform && context.platform !== 'OTHER') ctxParts.push(`platform: ${context.platform}`);
    if (context?.seasonPhase)                            ctxParts.push(`phase: ${context.seasonPhase}`);
    if (context?.playoffStartWeek)                       ctxParts.push(`playoff start week: ${context.playoffStartWeek}`);
    if (context?.championshipWeek)                       ctxParts.push(`championship week: ${context.championshipWeek}`);

    const system = ctxParts.length
        ? `${BASE_SYSTEM}\n\nUser's current context: ${ctxParts.join(' | ')}`
        : BASE_SYSTEM;

    const sdkStream = anthropic.messages.stream({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system,
        messages,
    });

    const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
            const enc = new TextEncoder();
            try {
                for await (const event of sdkStream) {
                    if (
                        event.type === 'content_block_delta' &&
                        event.delta.type === 'text_delta'
                    ) {
                        controller.enqueue(enc.encode(event.delta.text));
                    }
                }
            } finally {
                controller.close();
            }
        },
        cancel() {
            sdkStream.abort();
        },
    });

    return new Response(readable, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}
