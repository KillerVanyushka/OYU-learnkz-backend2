CREATE TABLE "BookReview" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "bookId" INTEGER NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE TABLE "AudioBookReview" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "audioBookId" INTEGER NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AudioBookReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AudioBookReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "BookReview_userId_bookId_key" ON "BookReview"("userId", "bookId");
CREATE INDEX "BookReview_bookId_createdAt_idx" ON "BookReview"("bookId", "createdAt");
CREATE UNIQUE INDEX "AudioBookReview_userId_audioBookId_key" ON "AudioBookReview"("userId", "audioBookId");
CREATE INDEX "AudioBookReview_audioBookId_createdAt_idx" ON "AudioBookReview"("audioBookId", "createdAt");

ALTER TABLE "BookReview" ADD CONSTRAINT "BookReview_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookReview" ADD CONSTRAINT "BookReview_bookId_fkey"
FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioBookReview" ADD CONSTRAINT "AudioBookReview_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioBookReview" ADD CONSTRAINT "AudioBookReview_audioBookId_fkey"
FOREIGN KEY ("audioBookId") REFERENCES "AudioBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;