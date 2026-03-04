-- CreateTable
CREATE TABLE "AlphabetLetter" (
    "id" SERIAL NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "uppercase" TEXT NOT NULL,
    "lowercase" TEXT NOT NULL,
    "pronunciationRu" TEXT,
    "pronunciationEn" TEXT,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "examples" JSONB,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlphabetLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlphabetLetter_orderIndex_idx" ON "AlphabetLetter"("orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AlphabetLetter_uppercase_lowercase_key" ON "AlphabetLetter"("uppercase", "lowercase");
