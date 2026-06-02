-- CreateTable: PrsHistoryImport — one per league (unique enforces write-once lock)
CREATE TABLE "PrsHistoryImport" (
    "id"            TEXT NOT NULL,
    "leagueId"      TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "memberCount"   INTEGER NOT NULL,
    "submittedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrsHistoryImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PrsHistoryImportEntry — audit row per member
CREATE TABLE "PrsHistoryImportEntry" (
    "id"               TEXT NOT NULL,
    "importId"         TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "completedSeasons" INTEGER NOT NULL,
    "returned"         BOOLEAN NOT NULL,
    "approved"         BOOLEAN NOT NULL,

    CONSTRAINT "PrsHistoryImportEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrsHistoryImport_leagueId_key" ON "PrsHistoryImport"("leagueId");
CREATE INDEX "PrsHistoryImport_submittedById_idx" ON "PrsHistoryImport"("submittedById");
CREATE INDEX "PrsHistoryImportEntry_importId_idx" ON "PrsHistoryImportEntry"("importId");
CREATE INDEX "PrsHistoryImportEntry_userId_idx" ON "PrsHistoryImportEntry"("userId");

-- AddForeignKey
ALTER TABLE "PrsHistoryImport" ADD CONSTRAINT "PrsHistoryImport_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "LFLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrsHistoryImport" ADD CONSTRAINT "PrsHistoryImport_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrsHistoryImportEntry" ADD CONSTRAINT "PrsHistoryImportEntry_importId_fkey"
    FOREIGN KEY ("importId") REFERENCES "PrsHistoryImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
