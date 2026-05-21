-- P2 SaaS hardening: webhook deduplication + DuesMember userId uniqueness

-- Prevent the same user from appearing twice in the same dues tracker
-- (NULLs are treated as distinct in PostgreSQL unique indexes, so
--  multiple un-linked/anonymous member rows are still allowed)
CREATE UNIQUE INDEX "DuesMember_leagueDuesId_userId_key"
    ON "DuesMember"("leagueDuesId", "userId");

-- Stripe webhook event deduplication table
-- Keyed on Stripe event ID so we return 200 immediately on replay
CREATE TABLE "ProcessedStripeEvent" (
    "id"          TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);
