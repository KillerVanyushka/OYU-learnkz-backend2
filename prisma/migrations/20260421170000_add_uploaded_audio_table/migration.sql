CREATE TABLE "UploadedAudio" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "audioUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UploadedAudio_pkey" PRIMARY KEY ("id")
);
