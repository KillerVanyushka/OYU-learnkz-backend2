CREATE TABLE "UserXpHistory" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "source" TEXT,
  "taskAttemptId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserXpHistory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserXpHistory"
ADD CONSTRAINT "UserXpHistory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserXpHistory"
ADD CONSTRAINT "UserXpHistory_taskAttemptId_fkey"
FOREIGN KEY ("taskAttemptId") REFERENCES "TaskAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "UserXpHistory_taskAttemptId_key"
ON "UserXpHistory"("taskAttemptId");

CREATE INDEX "UserXpHistory_userId_createdAt_idx"
ON "UserXpHistory"("userId", "createdAt");

CREATE INDEX "UserXpHistory_createdAt_idx"
ON "UserXpHistory"("createdAt");
