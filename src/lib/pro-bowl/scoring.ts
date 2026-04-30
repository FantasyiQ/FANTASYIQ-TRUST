import { prisma } from '@/lib/prisma';
import type { LiveStats } from './stats';

interface ScoringConfig {
    scoringType: string;
    scoring:     Record<string, number>;
}

function computePoints(stats: Record<string, number>, scoring: Record<string, number>): number {
    let pts = 0;
    for (const key in scoring) {
        if (stats[key] !== undefined) {
            pts += stats[key] * scoring[key];
        }
    }
    return Math.round(pts * 100) / 100;
}

export async function scoreProBowlContest(contestId: string, liveStats: LiveStats): Promise<void> {
    const contest = await prisma.proBowlContest.findUnique({
        where:  { id: contestId },
        select: { endAt: true, scoringConfigJson: true },
    });
    if (!contest) return;

    // scoringConfigJson is { scoringType, scoring: Record<string,number> }
    const { scoring } = contest.scoringConfigJson as unknown as ScoringConfig;
    const isFinal     = new Date() >= contest.endAt;

    const entries = await prisma.proBowlEntry.findMany({
        where:   { contestId },
        include: { slots: true },
    });

    for (const entry of entries) {
        let total = 0;

        for (const slot of entry.slots) {
            const stats  = liveStats[slot.playerId] ?? {};
            const points = computePoints(stats, scoring);

            await prisma.proBowlEntrySlot.update({
                where: { id: slot.id },
                data:  { points },
            });

            total += points;
        }

        await prisma.proBowlEntry.update({
            where: { id: entry.id },
            data:  { totalPoints: total, isFinal },
        });
    }
}
