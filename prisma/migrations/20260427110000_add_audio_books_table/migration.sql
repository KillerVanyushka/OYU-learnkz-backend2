CREATE TABLE "AudioBook" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileKey" TEXT NOT NULL,
  "mimeType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AudioBook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AudioBook_title_key" ON "AudioBook"("title");
CREATE UNIQUE INDEX "AudioBook_fileKey_key" ON "AudioBook"("fileKey");
CREATE INDEX "AudioBook_title_idx" ON "AudioBook"("title");
CREATE INDEX "AudioBook_author_idx" ON "AudioBook"("author");
