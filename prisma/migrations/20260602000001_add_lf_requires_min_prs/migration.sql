-- AlterTable: add requiresMinPrs to LFLeague (nullable, no default = existing rows get NULL = open)
ALTER TABLE "LFLeague" ADD COLUMN "requiresMinPrs" INTEGER;
