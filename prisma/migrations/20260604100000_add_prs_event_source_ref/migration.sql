-- Add sourceRef to PrsEvent for cron-ingested event deduplication.
-- NULL values (manually-submitted events) are exempt from the uniqueness check.
ALTER TABLE "PrsEvent" ADD COLUMN "sourceRef" TEXT;

-- Partial unique index: only enforce uniqueness when sourceRef is set.
-- This allows multiple NULL rows (existing manual events) while preventing
-- duplicate cron writes for the same transaction / lineup check / season.
CREATE UNIQUE INDEX "PrsEvent_userId_eventType_sourceRef_key"
    ON "PrsEvent"("userId", "eventType", "sourceRef")
    WHERE "sourceRef" IS NOT NULL;

CREATE INDEX "PrsEvent_sourceRef_idx" ON "PrsEvent"("sourceRef");
