-- Add espnOwnerId to DuesMember so the pay page can auto-match a member
-- to their slot via ESPN owner SWID, mirroring sleeperUserId for Sleeper.
ALTER TABLE "DuesMember" ADD COLUMN "espnOwnerId" TEXT;
CREATE INDEX "DuesMember_espnOwnerId_idx" ON "DuesMember"("espnOwnerId");
