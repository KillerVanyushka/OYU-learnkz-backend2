CREATE TABLE "UserLectureProgress" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "lessonId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserLectureProgress_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserLectureProgress"
ADD CONSTRAINT "UserLectureProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserLectureProgress"
ADD CONSTRAINT "UserLectureProgress_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "UserLectureProgress_userId_lessonId_key"
ON "UserLectureProgress"("userId", "lessonId");

CREATE INDEX "UserLectureProgress_userId_createdAt_idx"
ON "UserLectureProgress"("userId", "createdAt");
