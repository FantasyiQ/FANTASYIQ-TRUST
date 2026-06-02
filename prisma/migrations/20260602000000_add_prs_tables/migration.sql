-- CreateEnum
CREATE TYPE "PrsEventType" AS ENUM (
    'verified_season',
    'season_abandoned',
    'retention_stayed',
    'retention_left',
    'retention_removed',
    'lineup_set',
    'lineup_missed',
    'trade_response',
    'trade_ignored',
    'waiver_active',
    'commish_approval',
    'commish_endorsement',
    'commish_flag',
    'commish_ban',
    'veto_abuse',
    'collusion_flag',
    'tanking_flag',
    'toxicity_report',
    'rule_violation'
);

-- CreateTable
CREATE TABLE "PrsEvent" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "eventType"  "PrsEventType" NOT NULL,
    "eventValue" INTEGER,
    "eventDate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrsScore" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "seasonScore"       INTEGER NOT NULL DEFAULT 0,
    "retentionScore"    INTEGER NOT NULL DEFAULT 0,
    "engagementScore"   INTEGER NOT NULL DEFAULT 0,
    "commissionerTrust" INTEGER NOT NULL DEFAULT 0,
    "behaviorScore"     INTEGER NOT NULL DEFAULT 0,
    "prs"               INTEGER NOT NULL DEFAULT 0,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrsScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrsEvent_userId_idx" ON "PrsEvent"("userId");

-- CreateIndex
CREATE INDEX "PrsEvent_userId_eventType_idx" ON "PrsEvent"("userId", "eventType");

-- CreateIndex
CREATE INDEX "PrsEvent_eventDate_idx" ON "PrsEvent"("eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "PrsScore_userId_key" ON "PrsScore"("userId");

-- CreateIndex
CREATE INDEX "PrsScore_prs_idx" ON "PrsScore"("prs");

-- AddForeignKey
ALTER TABLE "PrsEvent" ADD CONSTRAINT "PrsEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrsScore" ADD CONSTRAINT "PrsScore_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
