-- Commissioner's own Stripe Connect Express account. Dues checkout sessions
-- route directly here going forward (transfer_data.destination) so the
-- commissioner holds true custody of their own league funds instead of
-- FiQ's pooled platform balance.
ALTER TABLE "User" ADD COLUMN "stripeConnectAccountId" TEXT;
CREATE UNIQUE INDEX "User_stripeConnectAccountId_key" ON "User"("stripeConnectAccountId");
