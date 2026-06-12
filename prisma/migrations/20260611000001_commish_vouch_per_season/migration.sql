-- Change vouch uniqueness from per-league-per-season to per-season.
-- A commissioner vouches for a person once per season regardless of shared leagues.
-- Note: the old per-league unique index was already dropped by a prior partial migration run.

-- Deduplicate: keep the most recent row per (fromUserId, toUserId, season).
DELETE FROM "CommissionerVouch"
WHERE id NOT IN (
    SELECT DISTINCT ON ("fromUserId", "toUserId", "season") id
    FROM "CommissionerVouch"
    ORDER BY "fromUserId", "toUserId", "season", "createdAt" DESC
);

CREATE UNIQUE INDEX "CommissionerVouch_fromUserId_toUserId_season_key"
    ON "CommissionerVouch"("fromUserId", "toUserId", "season");
