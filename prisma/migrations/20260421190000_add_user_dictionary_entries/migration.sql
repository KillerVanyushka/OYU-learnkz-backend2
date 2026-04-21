CREATE TABLE "UserDictionaryEntry" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "word" TEXT NOT NULL,
  "translationEn" TEXT,
  "translationRu" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserDictionaryEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserDictionaryEntry"
ADD CONSTRAINT "UserDictionaryEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "UserDictionaryEntry_userId_word_key"
ON "UserDictionaryEntry"("userId", "word");

CREATE INDEX "UserDictionaryEntry_userId_createdAt_idx"
ON "UserDictionaryEntry"("userId", "createdAt");
