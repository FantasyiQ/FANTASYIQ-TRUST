-- CronLog: audit trail for every cron execution
CREATE TABLE IF NOT EXISTS "cron_logs" (
    "id"          TEXT NOT NULL,
    "cron"        TEXT NOT NULL,
    "status"      TEXT NOT NULL,
    "durationMs"  INTEGER NOT NULL,
    "processed"   INTEGER,
    "errors"      INTEGER,
    "message"     TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cron_logs_cron_idx"      ON "cron_logs"("cron");
CREATE INDEX IF NOT EXISTS "cron_logs_status_idx"    ON "cron_logs"("status");
CREATE INDEX IF NOT EXISTS "cron_logs_createdAt_idx" ON "cron_logs"("createdAt");

-- EmailLog: outbound email tracking, updated by Resend webhook
CREATE TABLE IF NOT EXISTS "email_logs" (
    "id"        TEXT NOT NULL,
    "to"        TEXT NOT NULL,
    "subject"   TEXT NOT NULL,
    "type"      TEXT NOT NULL DEFAULT 'general',
    "resendId"  TEXT,
    "status"    TEXT NOT NULL DEFAULT 'sent',
    "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_logs_resendId_key" ON "email_logs"("resendId");
CREATE INDEX IF NOT EXISTS "email_logs_to_idx"        ON "email_logs"("to");
CREATE INDEX IF NOT EXISTS "email_logs_status_idx"    ON "email_logs"("status");
CREATE INDEX IF NOT EXISTS "email_logs_sentAt_idx"    ON "email_logs"("sentAt");
CREATE INDEX IF NOT EXISTS "email_logs_resendId_idx"  ON "email_logs"("resendId");
