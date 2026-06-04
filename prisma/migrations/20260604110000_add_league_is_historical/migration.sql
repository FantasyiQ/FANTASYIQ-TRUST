-- Add isHistorical flag to League.
-- Historical rows are written by the dss-history cron to store completed past-season
-- standings per dynasty franchise. They are exempt from deletion during re-sync so
-- DSS can aggregate performance across multiple seasons.
ALTER TABLE "League" ADD COLUMN "isHistorical" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "League_isHistorical_idx" ON "League"("isHistorical");
