-- Remove PLAYER_ELITEIQ from the SubscriptionTier enum.
-- No rows should have this value; the tier was never sold in live mode.

-- Clean up any partial type left by a previously failed attempt
DROP TYPE IF EXISTS "SubscriptionTier_new";

-- Step 1: Drop defaults so Postgres can alter the column type
ALTER TABLE "User" ALTER COLUMN "subscriptionTier" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "tier" DROP DEFAULT;

-- Step 2: Rebuild the enum without PLAYER_ELITEIQ
CREATE TYPE "SubscriptionTier_new" AS ENUM (
    'FREE',
    'PLAYER_PRO',
    'PLAYER_ALL_PRO',
    'PLAYER_ELITE',
    'COMMISSIONER_PRO',
    'COMMISSIONER_ALL_PRO',
    'COMMISSIONER_ELITE'
);

-- Step 3: Migrate columns to the new enum
ALTER TABLE "User"
    ALTER COLUMN "subscriptionTier"
    TYPE "SubscriptionTier_new"
    USING ("subscriptionTier"::text::"SubscriptionTier_new");

ALTER TABLE "Subscription"
    ALTER COLUMN "tier"
    TYPE "SubscriptionTier_new"
    USING ("tier"::text::"SubscriptionTier_new");

-- Step 4: Swap enum names
DROP TYPE "SubscriptionTier";
ALTER TYPE "SubscriptionTier_new" RENAME TO "SubscriptionTier";

-- Step 5: Restore defaults
ALTER TABLE "User" ALTER COLUMN "subscriptionTier" SET DEFAULT 'FREE'::"SubscriptionTier";
ALTER TABLE "Subscription" ALTER COLUMN "tier" SET DEFAULT 'FREE'::"SubscriptionTier";
