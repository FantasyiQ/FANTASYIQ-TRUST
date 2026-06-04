-- Prevent duplicate ConnectedLeague rows for the same user + external league ID.
-- NULL leagueExtId values are exempt (Postgres allows multiple NULLs in a unique index).
CREATE UNIQUE INDEX "ConnectedLeague_userId_leagueExtId_key"
    ON "ConnectedLeague"("userId", "leagueExtId");
