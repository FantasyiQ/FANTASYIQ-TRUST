-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PLAYER_PRO', 'PLAYER_ALL_PRO', 'PLAYER_ELITE', 'COMMISSIONER_PRO', 'COMMISSIONER_ALL_PRO', 'COMMISSIONER_ELITE');

-- CreateEnum
CREATE TYPE "LFJoinStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'PINNED');

-- CreateEnum
CREATE TYPE "DFSContestStatus" AS ENUM ('OPEN', 'LOCKED', 'FINAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "hashedPassword" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "sleeperUserId" TEXT,
    "espnS2" TEXT,
    "swid" TEXT,
    "yahooUserId" TEXT,
    "yahooAccessToken" TEXT,
    "yahooRefreshToken" TEXT,
    "yahooTokenExpiresAt" TIMESTAMP(3),
    "nflSid" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trustScore" INTEGER NOT NULL DEFAULT 0,
    "prsScore" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRecoveryEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueDbId" TEXT,
    "platform" TEXT NOT NULL,
    "errorType" TEXT NOT NULL DEFAULT 'unknown',
    "errorMsg" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncRecoveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurnRiskEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskTier" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "nudgeSent" BOOLEAN NOT NULL DEFAULT false,
    "nudgeSentAt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurnRiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPrediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "churnProbability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionProbability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "upgradeProbability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueName" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalRosters" INTEGER NOT NULL,
    "scoringType" TEXT,
    "leagueType" TEXT NOT NULL DEFAULT 'Redraft',
    "scoringSettings" JSONB,
    "avatar" TEXT,
    "rosterPositions" TEXT[],
    "sleeperUserId" TEXT,
    "standings" JSONB,
    "currentMatchup" JSONB,
    "assignedPlanId" TEXT,
    "assignedPlanType" TEXT,
    "draftStartTime" BIGINT,
    "draftStatus" TEXT,
    "draftType" TEXT,
    "playoffWeekStart" INTEGER,
    "champWeek" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'ok',
    "syncErrorCount" INTEGER NOT NULL DEFAULT 0,
    "syncLastError" TEXT,
    "syncLastErrorAt" TIMESTAMP(3),
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "healthTier" TEXT NOT NULL DEFAULT 'unknown',
    "healthSignals" JSONB,
    "healthCheckedAt" TIMESTAMP(3),
    "survivalProbability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueCalendarEvent" (
    "id" TEXT NOT NULL,
    "leagueDbId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "type" TEXT NOT NULL DEFAULT 'custom',
    "description" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'player',
    "leagueName" TEXT,
    "leagueSize" INTEGER,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedLeague" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueName" TEXT NOT NULL,
    "platform" TEXT,
    "leagueExtId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectedLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueDues" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "commissionerId" TEXT NOT NULL,
    "leagueName" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "buyInAmount" DOUBLE PRECISION NOT NULL,
    "teamCount" INTEGER NOT NULL,
    "collectedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "potTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'setup',
    "platform" TEXT,
    "externalLeagueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueDues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueWinner" (
    "id" TEXT NOT NULL,
    "leagueDuesId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "displayName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidOut" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueWinner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuesMember" (
    "id" TEXT NOT NULL,
    "leagueDuesId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "teamName" TEXT,
    "duesStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "stripePaymentId" TEXT,
    "stripeReceiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuesMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutSpot" (
    "id" TEXT NOT NULL,
    "leagueDuesId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PayoutSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutProposal" (
    "id" TEXT NOT NULL,
    "leagueDuesId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_commissioner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutProposalItem" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "payoutSpotId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripePaymentLinkId" TEXT,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaguePoll" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "question" TEXT NOT NULL DEFAULT 'Do you approve the proposed payout?',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaguePoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "vote" BOOLEAN NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueDocument" (
    "id" TEXT NOT NULL,
    "leagueDuesId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT,
    "leagueDuesId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FutureDuesObligation" (
    "id" TEXT NOT NULL,
    "leagueDuesId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FutureDuesObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sleeperLeagueId" TEXT NOT NULL,
    "leagueName" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SleeperPlayer" (
    "playerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "espnId" TEXT,
    "injuryStatus" TEXT,
    "injuryBodyPart" TEXT,
    "jerseyNumber" INTEGER,
    "height" TEXT,
    "weight" INTEGER,
    "birthDate" TEXT,
    "age" INTEGER,
    "yearsExp" INTEGER,
    "rookieYear" TEXT,
    "searchRank" INTEGER,
    "draftRound" INTEGER,
    "draftPick" INTEGER,
    "draftTeam" TEXT,
    "overallPick" INTEGER,
    "draftDay" INTEGER,
    "depthChartOrder" INTEGER,
    "depthChartPos" TEXT,
    "fortyTime" DOUBLE PRECISION,
    "verticalJump" DOUBLE PRECISION,
    "broadJump" DOUBLE PRECISION,
    "threeCone" DOUBLE PRECISION,
    "shuttle" DOUBLE PRECISION,
    "productionGamesPlayed" INTEGER,
    "productionAgeAtDraft" DOUBLE PRECISION,
    "productionBreakoutAge" DOUBLE PRECISION,
    "productionEarlyDeclare" BOOLEAN,
    "productionReceivingYardsPerTeamAttempt" DOUBLE PRECISION,
    "productionBestSeasonDominator" DOUBLE PRECISION,
    "productionCareerDominator" DOUBLE PRECISION,
    "productionTargetShare" DOUBLE PRECISION,
    "productionYardsPerRouteRun" DOUBLE PRECISION,
    "productionADot" DOUBLE PRECISION,
    "productionRushingYardsPerTeamAttempt" DOUBLE PRECISION,
    "productionRushingDominator" DOUBLE PRECISION,
    "productionReceptionsPerGame" DOUBLE PRECISION,
    "productionYardsPerRouteRunRB" DOUBLE PRECISION,
    "productionExplosiveRunRate" DOUBLE PRECISION,
    "productionAdjustedCompletionRate" DOUBLE PRECISION,
    "productionBigTimeThrowRate" DOUBLE PRECISION,
    "productionTurnoverWorthyPlayRate" DOUBLE PRECISION,
    "productionYardsPerAttempt" DOUBLE PRECISION,
    "productionRushingYardsPerGameQB" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SleeperPlayer_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "PlayerProjection" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "pointsPpr" DOUBLE PRECISION NOT NULL,
    "pointsStd" DOUBLE PRECISION NOT NULL,
    "pointsHalfPpr" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyCalcValue" (
    "id" TEXT NOT NULL,
    "fcId" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "team" TEXT,
    "age" DOUBLE PRECISION,
    "dynastyValue" INTEGER NOT NULL,
    "dynastyValueSf" INTEGER NOT NULL DEFAULT 0,
    "redraftValue" INTEGER NOT NULL,
    "redraftValueSf" INTEGER NOT NULL DEFAULT 0,
    "trend30Day" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyCalcValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PowerRankingSnapshot" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PowerRankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyCalcSnapshot" (
    "id" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "dynastyValue" INTEGER NOT NULL,
    "dynastyValueSf" INTEGER NOT NULL,
    "redraftValue" INTEGER NOT NULL,
    "redraftValueSf" INTEGER NOT NULL,
    "team" TEXT,
    "injuryStatus" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyCalcSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaguePayout" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaguePayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaguePayoutWinner" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,

    CONSTRAINT "LeaguePayoutWinner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LFCommissioner" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "platformHandles" JSONB NOT NULL,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "flagsCount" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "claimToken" TEXT,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LFCommissioner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LFLeague" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "scoring" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "buyIn" INTEGER,
    "payoutStructure" JSONB,
    "completedSeasons" INTEGER NOT NULL DEFAULT 0,
    "activityScore" INTEGER NOT NULL DEFAULT 0,
    "stabilityScore" INTEGER NOT NULL DEFAULT 0,
    "verifiedReviewsCount" INTEGER NOT NULL DEFAULT 0,
    "rankingScore" INTEGER NOT NULL DEFAULT 0,
    "commissionerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LFLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LFReview" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "commissionerId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "ratingOverall" INTEGER NOT NULL,
    "ratingFairness" INTEGER NOT NULL,
    "ratingComm" INTEGER NOT NULL,
    "ratingStability" INTEGER NOT NULL,
    "text" TEXT,
    "seasonYear" INTEGER NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "disputed" BOOLEAN NOT NULL DEFAULT false,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LFReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LFReviewVote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LFReviewVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LFReviewReply" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "commissionerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LFReviewReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LFJoinRequest" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LFJoinStatus" NOT NULL DEFAULT 'PENDING',
    "introMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LFJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LFLeagueSeason" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "champion" TEXT,
    "payoutSent" BOOLEAN NOT NULL DEFAULT false,
    "payoutDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LFLeagueSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DFSContest" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalLeagueId" TEXT NOT NULL,
    "sourceLeagueId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "status" "DFSContestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DFSContest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rookie_rankings_players" (
    "id" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "nflGrade" DOUBLE PRECISION NOT NULL,
    "fiqGrade" DOUBLE PRECISION NOT NULL,
    "eliteScore" DOUBLE PRECISION NOT NULL,
    "marketScore" DOUBLE PRECISION NOT NULL,
    "overallPick" INTEGER NOT NULL,
    "draftCap" DOUBLE PRECISION NOT NULL,
    "baseFiQScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "opportunityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualDepthOrder" INTEGER,
    "height" TEXT,
    "weight" INTEGER,
    "fortyTime" DOUBLE PRECISION,
    "fiqScore" DOUBLE PRECISION NOT NULL,
    "fiqTier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rookie_rankings_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DFSLineup" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entriesJson" JSONB NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DFSLineup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_sleeperUserId_key" ON "User"("sleeperUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_yahooUserId_key" ON "User"("yahooUserId");

-- CreateIndex
CREATE INDEX "FeatureUsageEvent_userId_idx" ON "FeatureUsageEvent"("userId");

-- CreateIndex
CREATE INDEX "FeatureUsageEvent_feature_idx" ON "FeatureUsageEvent"("feature");

-- CreateIndex
CREATE INDEX "FeatureUsageEvent_createdAt_idx" ON "FeatureUsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SyncRecoveryEvent_userId_idx" ON "SyncRecoveryEvent"("userId");

-- CreateIndex
CREATE INDEX "SyncRecoveryEvent_platform_resolved_idx" ON "SyncRecoveryEvent"("platform", "resolved");

-- CreateIndex
CREATE INDEX "SyncRecoveryEvent_leagueDbId_idx" ON "SyncRecoveryEvent"("leagueDbId");

-- CreateIndex
CREATE INDEX "SyncRecoveryEvent_createdAt_idx" ON "SyncRecoveryEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ChurnRiskEvent_userId_idx" ON "ChurnRiskEvent"("userId");

-- CreateIndex
CREATE INDEX "ChurnRiskEvent_riskTier_resolved_idx" ON "ChurnRiskEvent"("riskTier", "resolved");

-- CreateIndex
CREATE INDEX "ChurnRiskEvent_createdAt_idx" ON "ChurnRiskEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPrediction_userId_key" ON "UserPrediction"("userId");

-- CreateIndex
CREATE INDEX "UserPrediction_churnProbability_idx" ON "UserPrediction"("churnProbability");

-- CreateIndex
CREATE INDEX "UserPrediction_conversionProbability_idx" ON "UserPrediction"("conversionProbability");

-- CreateIndex
CREATE INDEX "UserPrediction_computedAt_idx" ON "UserPrediction"("computedAt");

-- CreateIndex
CREATE INDEX "League_userId_idx" ON "League"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "League_userId_platform_leagueId_key" ON "League"("userId", "platform", "leagueId");

-- CreateIndex
CREATE INDEX "LeagueCalendarEvent_leagueDbId_idx" ON "LeagueCalendarEvent"("leagueDbId");

-- CreateIndex
CREATE INDEX "LeagueCalendarEvent_date_idx" ON "LeagueCalendarEvent"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "ConnectedLeague_userId_idx" ON "ConnectedLeague"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueDues_subscriptionId_key" ON "LeagueDues"("subscriptionId");

-- CreateIndex
CREATE INDEX "LeagueDues_commissionerId_idx" ON "LeagueDues"("commissionerId");

-- CreateIndex
CREATE INDEX "LeagueWinner_leagueDuesId_idx" ON "LeagueWinner"("leagueDuesId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueWinner_leagueDuesId_rank_key" ON "LeagueWinner"("leagueDuesId", "rank");

-- CreateIndex
CREATE INDEX "DuesMember_leagueDuesId_idx" ON "DuesMember"("leagueDuesId");

-- CreateIndex
CREATE INDEX "DuesMember_userId_idx" ON "DuesMember"("userId");

-- CreateIndex
CREATE INDEX "PayoutSpot_leagueDuesId_idx" ON "PayoutSpot"("leagueDuesId");

-- CreateIndex
CREATE INDEX "PayoutProposal_leagueDuesId_idx" ON "PayoutProposal"("leagueDuesId");

-- CreateIndex
CREATE INDEX "PayoutProposalItem_proposalId_idx" ON "PayoutProposalItem"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaguePoll_proposalId_key" ON "LeaguePoll"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_memberId_key" ON "PollVote"("pollId", "memberId");

-- CreateIndex
CREATE INDEX "LeagueDocument_leagueDuesId_idx" ON "LeagueDocument"("leagueDuesId");

-- CreateIndex
CREATE INDEX "Announcement_leagueId_idx" ON "Announcement"("leagueId");

-- CreateIndex
CREATE INDEX "Announcement_leagueDuesId_idx" ON "Announcement"("leagueDuesId");

-- CreateIndex
CREATE INDEX "FutureDuesObligation_leagueDuesId_idx" ON "FutureDuesObligation"("leagueDuesId");

-- CreateIndex
CREATE INDEX "FutureDuesObligation_memberId_idx" ON "FutureDuesObligation"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "FutureDuesObligation_leagueDuesId_memberId_season_key" ON "FutureDuesObligation"("leagueDuesId", "memberId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueInvite_token_key" ON "LeagueInvite"("token");

-- CreateIndex
CREATE INDEX "LeagueInvite_sleeperLeagueId_idx" ON "LeagueInvite"("sleeperLeagueId");

-- CreateIndex
CREATE INDEX "PlayerProjection_season_week_idx" ON "PlayerProjection"("season", "week");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProjection_playerId_season_week_key" ON "PlayerProjection"("playerId", "season", "week");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyCalcValue_fcId_key" ON "FantasyCalcValue"("fcId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyCalcValue_nameLower_key" ON "FantasyCalcValue"("nameLower");

-- CreateIndex
CREATE INDEX "FantasyCalcValue_nameLower_idx" ON "FantasyCalcValue"("nameLower");

-- CreateIndex
CREATE UNIQUE INDEX "PowerRankingSnapshot_leagueId_week_key" ON "PowerRankingSnapshot"("leagueId", "week");

-- CreateIndex
CREATE INDEX "FantasyCalcSnapshot_nameLower_idx" ON "FantasyCalcSnapshot"("nameLower");

-- CreateIndex
CREATE INDEX "FantasyCalcSnapshot_takenAt_idx" ON "FantasyCalcSnapshot"("takenAt");

-- CreateIndex
CREATE INDEX "LeaguePayout_leagueId_idx" ON "LeaguePayout"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaguePayout_leagueId_rank_key" ON "LeaguePayout"("leagueId", "rank");

-- CreateIndex
CREATE INDEX "LeaguePayoutWinner_leagueId_idx" ON "LeaguePayoutWinner"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaguePayoutWinner_leagueId_rank_key" ON "LeaguePayoutWinner"("leagueId", "rank");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_userId_createdAt_idx" ON "Notification"("type", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_key" ON "NotificationPreference"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "LFCommissioner_ownerId_key" ON "LFCommissioner"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "LFCommissioner_claimToken_key" ON "LFCommissioner"("claimToken");

-- CreateIndex
CREATE INDEX "LFCommissioner_avgRating_idx" ON "LFCommissioner"("avgRating");

-- CreateIndex
CREATE INDEX "LFLeague_commissionerId_idx" ON "LFLeague"("commissionerId");

-- CreateIndex
CREATE INDEX "LFLeague_format_idx" ON "LFLeague"("format");

-- CreateIndex
CREATE INDEX "LFLeague_platform_idx" ON "LFLeague"("platform");

-- CreateIndex
CREATE INDEX "LFLeague_rankingScore_idx" ON "LFLeague"("rankingScore");

-- CreateIndex
CREATE INDEX "LFReview_leagueId_idx" ON "LFReview"("leagueId");

-- CreateIndex
CREATE INDEX "LFReview_commissionerId_idx" ON "LFReview"("commissionerId");

-- CreateIndex
CREATE INDEX "LFReview_reviewerId_idx" ON "LFReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "LFReview_leagueId_reviewerId_seasonYear_key" ON "LFReview"("leagueId", "reviewerId", "seasonYear");

-- CreateIndex
CREATE INDEX "LFReviewVote_reviewId_idx" ON "LFReviewVote"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "LFReviewVote_reviewId_voterId_key" ON "LFReviewVote"("reviewId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "LFReviewReply_reviewId_key" ON "LFReviewReply"("reviewId");

-- CreateIndex
CREATE INDEX "LFJoinRequest_leagueId_idx" ON "LFJoinRequest"("leagueId");

-- CreateIndex
CREATE INDEX "LFJoinRequest_userId_idx" ON "LFJoinRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LFJoinRequest_leagueId_userId_key" ON "LFJoinRequest"("leagueId", "userId");

-- CreateIndex
CREATE INDEX "LFLeagueSeason_leagueId_idx" ON "LFLeagueSeason"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LFLeagueSeason_leagueId_year_key" ON "LFLeagueSeason"("leagueId", "year");

-- CreateIndex
CREATE INDEX "DFSContest_externalLeagueId_idx" ON "DFSContest"("externalLeagueId");

-- CreateIndex
CREATE INDEX "DFSContest_status_idx" ON "DFSContest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DFSContest_platform_externalLeagueId_season_week_key" ON "DFSContest"("platform", "externalLeagueId", "season", "week");

-- CreateIndex
CREATE INDEX "rookie_rankings_players_season_position_idx" ON "rookie_rankings_players"("season", "position");

-- CreateIndex
CREATE UNIQUE INDEX "rookie_rankings_players_season_playerName_key" ON "rookie_rankings_players"("season", "playerName");

-- CreateIndex
CREATE INDEX "DFSLineup_contestId_idx" ON "DFSLineup"("contestId");

-- CreateIndex
CREATE INDEX "DFSLineup_userId_idx" ON "DFSLineup"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DFSLineup_contestId_userId_key" ON "DFSLineup"("contestId", "userId");

-- AddForeignKey
ALTER TABLE "FeatureUsageEvent" ADD CONSTRAINT "FeatureUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRecoveryEvent" ADD CONSTRAINT "SyncRecoveryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurnRiskEvent" ADD CONSTRAINT "ChurnRiskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrediction" ADD CONSTRAINT "UserPrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueCalendarEvent" ADD CONSTRAINT "LeagueCalendarEvent_leagueDbId_fkey" FOREIGN KEY ("leagueDbId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedLeague" ADD CONSTRAINT "ConnectedLeague_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueDues" ADD CONSTRAINT "LeagueDues_commissionerId_fkey" FOREIGN KEY ("commissionerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueDues" ADD CONSTRAINT "LeagueDues_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueWinner" ADD CONSTRAINT "LeagueWinner_leagueDuesId_fkey" FOREIGN KEY ("leagueDuesId") REFERENCES "LeagueDues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesMember" ADD CONSTRAINT "DuesMember_leagueDuesId_fkey" FOREIGN KEY ("leagueDuesId") REFERENCES "LeagueDues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesMember" ADD CONSTRAINT "DuesMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutSpot" ADD CONSTRAINT "PayoutSpot_leagueDuesId_fkey" FOREIGN KEY ("leagueDuesId") REFERENCES "LeagueDues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutProposal" ADD CONSTRAINT "PayoutProposal_leagueDuesId_fkey" FOREIGN KEY ("leagueDuesId") REFERENCES "LeagueDues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutProposalItem" ADD CONSTRAINT "PayoutProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "PayoutProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutProposalItem" ADD CONSTRAINT "PayoutProposalItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "DuesMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutProposalItem" ADD CONSTRAINT "PayoutProposalItem_payoutSpotId_fkey" FOREIGN KEY ("payoutSpotId") REFERENCES "PayoutSpot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePoll" ADD CONSTRAINT "LeaguePoll_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "PayoutProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "LeaguePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "DuesMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueDocument" ADD CONSTRAINT "LeagueDocument_leagueDuesId_fkey" FOREIGN KEY ("leagueDuesId") REFERENCES "LeagueDues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_leagueDuesId_fkey" FOREIGN KEY ("leagueDuesId") REFERENCES "LeagueDues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FutureDuesObligation" ADD CONSTRAINT "FutureDuesObligation_leagueDuesId_fkey" FOREIGN KEY ("leagueDuesId") REFERENCES "LeagueDues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FutureDuesObligation" ADD CONSTRAINT "FutureDuesObligation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "DuesMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueInvite" ADD CONSTRAINT "LeagueInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerProjection" ADD CONSTRAINT "PlayerProjection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "SleeperPlayer"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePayout" ADD CONSTRAINT "LeaguePayout_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePayoutWinner" ADD CONSTRAINT "LeaguePayoutWinner_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFCommissioner" ADD CONSTRAINT "LFCommissioner_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFLeague" ADD CONSTRAINT "LFLeague_commissionerId_fkey" FOREIGN KEY ("commissionerId") REFERENCES "LFCommissioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFReview" ADD CONSTRAINT "LFReview_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "LFLeague"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFReview" ADD CONSTRAINT "LFReview_commissionerId_fkey" FOREIGN KEY ("commissionerId") REFERENCES "LFCommissioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFReview" ADD CONSTRAINT "LFReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFReviewVote" ADD CONSTRAINT "LFReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "LFReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFReviewVote" ADD CONSTRAINT "LFReviewVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFReviewReply" ADD CONSTRAINT "LFReviewReply_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "LFReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFReviewReply" ADD CONSTRAINT "LFReviewReply_commissionerId_fkey" FOREIGN KEY ("commissionerId") REFERENCES "LFCommissioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFReviewReply" ADD CONSTRAINT "LFReviewReply_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFJoinRequest" ADD CONSTRAINT "LFJoinRequest_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "LFLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFJoinRequest" ADD CONSTRAINT "LFJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LFLeagueSeason" ADD CONSTRAINT "LFLeagueSeason_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "LFLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DFSContest" ADD CONSTRAINT "DFSContest_sourceLeagueId_fkey" FOREIGN KEY ("sourceLeagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DFSLineup" ADD CONSTRAINT "DFSLineup_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "DFSContest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DFSLineup" ADD CONSTRAINT "DFSLineup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

