CREATE TABLE IF NOT EXISTS "LevelRewardClaim" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "level" "Level" NOT NULL,
  "reward" INTEGER NOT NULL DEFAULT 10,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LevelRewardClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LevelRewardClaim_userId_level_key"
ON "LevelRewardClaim"("userId", "level");

CREATE INDEX IF NOT EXISTS "LevelRewardClaim_userId_idx"
ON "LevelRewardClaim"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'LevelRewardClaim_userId_fkey'
      AND table_name = 'LevelRewardClaim'
  ) THEN
    ALTER TABLE "LevelRewardClaim"
    ADD CONSTRAINT "LevelRewardClaim_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
