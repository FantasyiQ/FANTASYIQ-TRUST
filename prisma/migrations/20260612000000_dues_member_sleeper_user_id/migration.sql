-- Add sleeperUserId to DuesMember so the pay page can auto-match a member
-- to their slot via Sleeper user_id without requiring email or display name equality.
ALTER TABLE "DuesMember" ADD COLUMN "sleeperUserId" TEXT;
CREATE INDEX "DuesMember_sleeperUserId_idx" ON "DuesMember"("sleeperUserId");
