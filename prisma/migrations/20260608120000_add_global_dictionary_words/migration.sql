CREATE TABLE "DictionaryWord" (
  "id" SERIAL NOT NULL,
  "word" TEXT NOT NULL,
  "normalizedWord" TEXT NOT NULL,
  "translationEn" TEXT,
  "translationRu" TEXT,
  "transcription" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DictionaryWord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserDictionaryEntry"
ADD COLUMN "dictionaryWordId" INTEGER,
ADD COLUMN "normalizedWord" TEXT,
ADD COLUMN "transcription" TEXT;

UPDATE "UserDictionaryEntry"
SET "normalizedWord" = LOWER(BTRIM("word"))
WHERE "normalizedWord" IS NULL;

ALTER TABLE "UserDictionaryEntry"
ALTER COLUMN "normalizedWord" SET NOT NULL;

CREATE UNIQUE INDEX "DictionaryWord_normalizedWord_key"
ON "DictionaryWord"("normalizedWord");

CREATE INDEX "DictionaryWord_word_idx"
ON "DictionaryWord"("word");

CREATE INDEX "DictionaryWord_normalizedWord_idx"
ON "DictionaryWord"("normalizedWord");

DROP INDEX IF EXISTS "UserDictionaryEntry_userId_word_key";

CREATE UNIQUE INDEX "UserDictionaryEntry_userId_normalizedWord_key"
ON "UserDictionaryEntry"("userId", "normalizedWord");

CREATE INDEX "UserDictionaryEntry_dictionaryWordId_idx"
ON "UserDictionaryEntry"("dictionaryWordId");

ALTER TABLE "UserDictionaryEntry"
ADD CONSTRAINT "UserDictionaryEntry_dictionaryWordId_fkey"
FOREIGN KEY ("dictionaryWordId") REFERENCES "DictionaryWord"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
