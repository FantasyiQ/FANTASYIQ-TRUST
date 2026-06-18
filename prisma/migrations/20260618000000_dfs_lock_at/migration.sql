-- Add lockAt to DFSContest: first kickoff of the week
ALTER TABLE "DFSContest" ADD COLUMN "lockAt" TIMESTAMP(3);
