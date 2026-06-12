-- Commissioner Vouches: one vouch per commissioner per member per league per season.
-- vouchType: "endorsement" | "approval" | "flag"

CREATE TABLE "CommissionerVouch" (
    "id"         TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId"   TEXT NOT NULL,
    "leagueDbId" TEXT NOT NULL,
    "season"     TEXT NOT NULL,
    "vouchType"  TEXT NOT NULL,
    "note"       TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionerVouch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionerVouch_fromUserId_toUserId_leagueDbId_season_key"
    ON "CommissionerVouch"("fromUserId", "toUserId", "leagueDbId", "season");

CREATE INDEX "CommissionerVouch_toUserId_idx"   ON "CommissionerVouch"("toUserId");
CREATE INDEX "CommissionerVouch_fromUserId_idx" ON "CommissionerVouch"("fromUserId");

ALTER TABLE "CommissionerVouch"
    ADD CONSTRAINT "CommissionerVouch_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommissionerVouch"
    ADD CONSTRAINT "CommissionerVouch_toUserId_fkey"
    FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
