-- AlterTable
ALTER TABLE "User" ADD COLUMN     "streakCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakLastDay" TEXT;
