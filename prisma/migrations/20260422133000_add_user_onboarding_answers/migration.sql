CREATE TABLE "UserOnboardingAnswer" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "goal" TEXT NOT NULL,
  "studyMinutesDaily" INTEGER NOT NULL,
  "currentLevel" TEXT NOT NULL,
  "learningStyle" TEXT NOT NULL,
  "focusArea" TEXT NOT NULL,
  "preferredPace" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserOnboardingAnswer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserOnboardingAnswer"
ADD CONSTRAINT "UserOnboardingAnswer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "UserOnboardingAnswer_userId_key"
ON "UserOnboardingAnswer"("userId");

CREATE INDEX "UserOnboardingAnswer_userId_createdAt_idx"
ON "UserOnboardingAnswer"("userId", "createdAt");
