// Live NFL stats from external data provider.
// Keyed by the provider's PlayerID; values use Sleeper stat key names
// so they match scoringConfigJson.scoring directly.

export type LiveStats = Record<string, Record<string, number>>;

interface RawPlayer {
    PlayerID:             string | number;
    PassingYards:         number | null;
    PassingTouchdowns:    number | null;
    PassingInterceptions: number | null;
    RushingYards:         number | null;
    RushingTouchdowns:    number | null;
    ReceivingYards:       number | null;
    ReceivingTouchdowns:  number | null;
    Receptions:           number | null;
    FumblesLost:          number | null;
}

export async function fetchLiveStats(): Promise<LiveStats> {
    const res = await fetch(process.env.LIVE_STATS_URL!, {
        headers: { 'Ocp-Apim-Subscription-Key': process.env.LIVE_STATS_KEY! },
    });
    if (!res.ok) throw new Error(`Live stats fetch failed: ${res.status}`);

    const data = await res.json() as RawPlayer[];
    const map: LiveStats = {};

    for (const p of data) {
        // Keys must match scoringConfigJson.scoring (Sleeper format)
        map[String(p.PlayerID)] = {
            pass_yd:  p.PassingYards         ?? 0,
            pass_td:  p.PassingTouchdowns     ?? 0,
            int:      p.PassingInterceptions  ?? 0,
            rush_yd:  p.RushingYards          ?? 0,
            rush_td:  p.RushingTouchdowns     ?? 0,
            rec_yd:   p.ReceivingYards        ?? 0,
            rec_td:   p.ReceivingTouchdowns   ?? 0,
            rec:      p.Receptions            ?? 0,
            fum_lost: p.FumblesLost           ?? 0,
        };
    }

    return map;
}
