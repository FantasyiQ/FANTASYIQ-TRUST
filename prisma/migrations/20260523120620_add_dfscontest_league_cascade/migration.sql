-- DropForeignKey
ALTER TABLE "DFSContest" DROP CONSTRAINT "DFSContest_sourceLeagueId_fkey";

-- AddForeignKey
ALTER TABLE "DFSContest" ADD CONSTRAINT "DFSContest_sourceLeagueId_fkey" FOREIGN KEY ("sourceLeagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
