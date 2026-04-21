CREATE TABLE "Book" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "pageCount" INTEGER NOT NULL,
  "author" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileKey" TEXT NOT NULL,
  "mimeType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Book_title_key" ON "Book"("title");
CREATE UNIQUE INDEX "Book_fileKey_key" ON "Book"("fileKey");
CREATE INDEX "Book_title_idx" ON "Book"("title");
CREATE INDEX "Book_author_idx" ON "Book"("author");
