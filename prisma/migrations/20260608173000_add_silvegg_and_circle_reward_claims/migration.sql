ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "silvEgg" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "CircleRewardClaim" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "level" "Level" NOT NULL,
  "groupIndex" INTEGER NOT NULL,
  "reward" INTEGER NOT NULL DEFAULT 5,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CircleRewardClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CircleRewardClaim_userId_level_groupIndex_key"
ON "CircleRewardClaim"("userId", "level", "groupIndex");

CREATE INDEX IF NOT EXISTS "CircleRewardClaim_userId_idx"
ON "CircleRewardClaim"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'CircleRewardClaim_userId_fkey'
      AND table_name = 'CircleRewardClaim'
  ) THEN
    ALTER TABLE "CircleRewardClaim"
    ADD CONSTRAINT "CircleRewardClaim_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
